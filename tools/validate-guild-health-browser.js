"use strict";

const assert = require("node:assert/strict");
const { openGuildBrowser } = require("./guild-browser-harness");
const { createServer } = require("./guild-production-preview");
const measureOnly = process.argv.includes("--measure-only");

async function main() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const errors = [];
  let browser;
  try {
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      browser = await openGuildBrowser({ width, height, errors });
      const p = browser.page;
      await p.goto(`http://127.0.0.1:${server.address().port}/docs/visual-qa/guild-master/production.html`);
      await p.waitForFunction(() => document.documentElement.dataset.guildProductionReady === "true");
      await p.evaluate(() => {
        const snapshot = structuredClone(guildProductionPreview.snapshot());
        guildProductionPreview.economy.destroy();
        window.health = { snapshot, pending: [], applied: [] };
        health.guild = CrownlandsGuildUI.create({
          snapshot: () => health.snapshot, current: () => true,
          now: () => health.snapshot.serverNowMs, balances: () => health.snapshot.estate.stock,
          gold: () => health.snapshot.gold, refresh: async () => {},
          accept: response => { health.snapshot = response; health.guild.update(); },
          api: { getEstateQuote: input => new Promise(resolve => health.pending.push({ input, resolve })) },
        });
        health.guild.open("members");
      });
      const measurements = await p.evaluate(() => {
        const dialog = document.querySelector(".guild-window"), member = dialog.querySelector(".guild-member");
        const details = member.querySelector("details"), control = member.querySelector("button");
        details.open = true; control.focus();
        const body = dialog.querySelector(".guild-body"); body.scrollTop = 200;
        const scroll = body.scrollTop, observer = new MutationObserver(() => {});
        observer.observe(dialog, { subtree: true, attributes: true, childList: true, characterData: true });
        const start = performance.now();
        for (let i = 0; i < 20; i++) {
          health.snapshot = structuredClone(health.snapshot);
          health.guild.update();
        }
        const result = { mutations: observer.takeRecords().length, ms: performance.now() - start,
          sameMember: member === dialog.querySelector(".guild-member"), detailsOpen: dialog.querySelector("details").open,
          sameFocus: document.activeElement === control, sameScroll: body.scrollTop === scroll };
        observer.disconnect();
        health.snapshot.champions["qa-champion-0"].name = "Updated member";
        health.guild.update();
        result.changedName = dialog.querySelector(".guild-member h3").textContent;
        return result;
      });
      console.log(JSON.stringify({ width, height, ...measurements }));
      if (!measureOnly) {
        assert.equal(measurements.mutations, 0, "Unchanged Guild snapshots must not replace or mutate controls");
        assert(measurements.sameMember && measurements.detailsOpen && measurements.sameFocus && measurements.sameScroll);
      }
      assert.equal(measurements.changedName, "Updated member", "Changed snapshots must still paint");

      const countdown = await p.evaluate(() => {
        health.snapshot.estate.guild.missions.push({ id: "clock", missionName: "Timer check",
          completesAtMs: health.snapshot.serverNowMs + 20000, championIds: ["qa-champion-0"] });
        health.guild.open("hall");
        const node = document.querySelector("[data-guild-deadline]"), observer = new MutationObserver(() => {});
        observer.observe(node, { subtree: true, childList: true, characterData: true });
        for (let i = 0; i < 20; i++) health.guild.tick();
        const writes = observer.takeRecords().length;
        health.snapshot.serverNowMs += 1000; health.guild.tick();
        const advanced = node.textContent === "19 sec remaining";
        observer.disconnect(); health.snapshot.estate.guild.missions = [];
        return { writes, advanced };
      });
      if (!measureOnly) assert.equal(countdown.writes, 0, "Unchanged countdowns must not repeat DOM writes");
      assert(countdown.advanced, "Countdowns must advance without replacing their nodes");

      const control = (action, id) => p.locator(`.guild-window [data-guild="${action}"]${id ? `[data-id="${id}"]` : ""}`).first();
      await control("tab", "contracts").click();
      await control("choose", "introduction").click();
      await control("toggleMember", "qa-champion-0").click();
      await p.waitForFunction(() => health.pending.length === 1);
      await control("tab", "contracts").click();
      await control("choose", "escort").click();
      await p.evaluate(async () => {
        const request = health.pending.shift();
        const response = await guildProductionPreview.api.getEstateQuote(request.input);
        request.resolve(response);
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      const staleForecast = await control("reviewMission").isDisabled();
      console.log(JSON.stringify({ width, staleForecastRejected: staleForecast }));
      if (!measureOnly) assert(staleForecast, "An old mission forecast cannot enable departure for a new empty party");

      await control("tab", "members").click();
      await control("roster", "qa-champion-0").click();
      await p.waitForFunction(() => health.pending.length === 1);
      await control("close").click();
      await p.evaluate(() => health.guild.open("hall"));
      await p.evaluate(async () => {
        const request = health.pending.shift();
        request.resolve(await guildProductionPreview.api.getEstateQuote(request.input));
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      const staleReview = await control("confirm").count();
      console.log(JSON.stringify({ width, staleReviewRejected: staleReview === 0 }));
      if (!measureOnly) assert.equal(staleReview, 0, "Closing a quote request must not replace a newly opened Guild screen");

      await p.evaluate(async () => {
        document.querySelector(".guild-window").close();
        health.guild.open("members");
        await new Promise(resolve => setTimeout(resolve, 50));
      });
      assert.equal(await p.locator(".guild-window[open] .guild-member").count(), 7, "A queued close cannot tear down a reopened screen");

      const snapshots = await p.evaluate(async () => {
        health.guild.destroy();
        const initial = structuredClone(health.snapshot);
        initial.estate.revision = 10;
        let next = initial;
        const economy = CrownlandsEstateEconomy.create({ scope: () => "health-test", visible: () => false,
          api: () => ({ getEstateState: async () => structuredClone(next) }),
          apply: result => health.applied.push(result.estate.revision), gold: () => next.gold });
        await new Promise(resolve => setTimeout(resolve, 0));
        next = structuredClone(initial); next.estate.revision = 12; next.serverNowMs += 1000;
        next.estate.stock.food = 333; await economy.refresh();
        const fresh = economy.snapshot();
        next = structuredClone(initial); await economy.refresh();
        const lowerRevisionRejected = economy.snapshot() === fresh;
        next = structuredClone(fresh); next.serverNowMs -= 500; next.estate.stock.food = 111;
        await economy.refresh();
        const olderClockRejected = economy.snapshot() === fresh;
        next = structuredClone(fresh); next.serverNowMs += 500; next.estate.stock.food = 444;
        await economy.refresh();
        const newerClockAccepted = economy.snapshot().estate.stock.food === 444;
        economy.destroy();
        return { lowerRevisionRejected, olderClockRejected, newerClockAccepted, applied: health.applied };
      });
      console.log(JSON.stringify({ width, snapshots }));
      if (!measureOnly) {
        assert(snapshots.lowerRevisionRejected && snapshots.olderClockRejected && snapshots.newerClockAccepted);
        assert.equal(snapshots.applied.filter(revision => revision === 10).length, 1, "Stale results cannot reach external balance consumers");
      }
      await browser.close(); browser = null;
    }
    assert.deepEqual(errors, []);
    console.log(measureOnly ? "Guild health baseline measured." : "Guild health passed: stable refreshes, changed content, stale quotes and monotonic estate snapshots at three viewports.");
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
