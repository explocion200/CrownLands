"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { openGuildBrowser } = require("./guild-browser-harness");
const { createServer } = require("./guild-production-preview");

(async () => {
  for (const built of [false, true]) {
    const server = createServer({ built });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const origin = "http://127.0.0.1:" + server.address().port;
    const out = path.resolve(__dirname, "../release-artifacts/guild-responsive-alignment/" + (built ? "built" : "source"));
    fs.mkdirSync(out, { recursive: true });
    const errors = []; let browser;
    try {
      for (const [width, height] of [[1440, 900], [1024, 768], [844, 390], [568, 320], [390, 844], [320, 568]]) {
        browser = await openGuildBrowser({ width, height, errors });
        const p = browser.page;
        await p.goto(origin + "/docs/visual-qa/guild-master/production.html?gameStyles=1");
        await p.waitForFunction(() => document.documentElement.dataset.guildProductionReady === "true");
        const control = (action, id) => p.locator('[data-guild="' + action + '"]' + (id ? '[data-id="' + id + '"]' : "")).first();
        const idle = () => p.waitForFunction(() => document.querySelector(".guild-body").getAttribute("aria-busy") === "false");
        const activate = async (action, id) => { await control(action, id)[width < 900 ? "tap" : "click"](); await idle(); };
        async function layout(name) {
          await p.locator(".guild-window img").evaluateAll(nodes => { nodes.forEach(n => n.loading = "eager"); return Promise.all(nodes.map(n => n.decode())); });
          const issues = await p.evaluate(() => {
            const d = document.querySelector(".guild-window"), body = d.querySelector(".guild-body"), failures = [];
            const rect = node => node.getBoundingClientRect();
            const fits = (inner, outer) => inner.left >= outer.left - 1 && inner.right <= outer.right + 1;
            const bounds = rect(d), visible = node => node.getClientRects().length;
            if (bounds.left < 0 || bounds.top < 0 || bounds.right > innerWidth + 1 || bounds.bottom > innerHeight + 1) failures.push("Dialog outside viewport");
            if (body.scrollWidth > body.clientWidth + 1) failures.push("Body scrolls horizontally");
            if (body.clientHeight < 95) failures.push("Chrome leaves too little reading space");
            for (const el of d.querySelectorAll("button,select,input,summary")) {
              if (!visible(el)) continue;
              const box = rect(el);
              if (el.type !== "checkbox" && box.height < 43.9) failures.push("Small target: " + el.textContent.slice(0,40));
              if (!el.closest("nav") && !fits(box, bounds)) failures.push("Control outside dialog: " + el.textContent.slice(0,40));
              if (el.closest("header,footer") && (box.top < bounds.top || box.bottom > bounds.bottom)) failures.push("Clipped fixed control");
            }
            const bar = d.querySelector("nav"), current = bar.querySelector("[aria-current=page]");
            if (current && !fits(rect(current), rect(bar))) failures.push("Selected room is clipped in navigation");
            const foot = d.querySelector("footer"), label = rect(foot.firstElementChild), actions = rect(foot.lastElementChild);
            if (label.right > actions.left + 1 && label.bottom > actions.top + 1) failures.push("Resources overlap footer actions");
            for (const toolbar of d.querySelectorAll(".guild-tools,.guild-saved")) {
              const controls = [...toolbar.children].map(el => rect(el.querySelector("select,input") || el));
              for (const [i, a] of controls.entries()) for (const b of controls.slice(i + 1)) {
                if (Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 20 && Math.abs(a.bottom - b.bottom) > 1) failures.push("Dropdown and button baselines differ");
              }
            }
            for (const grid of d.querySelectorAll(".guild-member-grid,.guild-rooms")) {
              const rows = new Map();
              for (const card of grid.children) {
                if (!card.matches("article")) continue;
                const box = rect(card), key = Math.round(box.top), entries = rows.get(key) || [];
                const stat = card.querySelector(".guild-stat"), action = card.querySelector(".guild-member-actions") || card.querySelector("button");
                entries.push({ stat: stat && rect(stat).top, action: action && rect(action).bottom }); rows.set(key, entries);
                for (const child of card.querySelectorAll("button,.guild-member-top,.guild-stat,.guild-room-ranks")) {
                  if (!fits(rect(child), box)) failures.push("Card content escapes its border");
                }
              }
              for (const entries of rows.values()) for (const key of ["stat", "action"]) {
                const values = entries.map(e => e[key]).filter(n => n !== null);
                if (values.length > 1 && Math.max(...values) - Math.min(...values) > 1) failures.push("Uneven card " + key + " rows");
              }
            }
            const aside = d.querySelector(".guild-planning>aside"), party = d.querySelector(".guild-planning>section");
            if (aside && rect(aside).height >= rect(party).height) failures.push("Outcome panel stretches with the roster");
            return failures;
          });
          assert.deepEqual(issues, [], `${built ? "built" : "source"} ${width}×${height} ${name}`);
          await p.screenshot({ path: path.join(out, `${width}-${height}-${name}.png`) });
        }
        await layout("hall");
        for (const tab of ["members", "contracts", "infirmary", "training", "archive", "improvements"]) {
          await activate("tab", tab); await layout(tab);
        }
        await activate("improve", "infirmary"); await layout("improvement-review");
        await p.locator(".guild-window footer>span").evaluate(el => { el.textContent = "Gold 9,999,999,999 · Food 99,999,999 · Guild Lv. 100"; });
        await layout("large-balances"); await activate("cancel");
        await activate("tab", "members");
        await activate("compare", "qa-champion-0"); await activate("compare", "qa-champion-1"); await layout("comparison");
        await p.locator(".guild-member summary").first().click(); await layout("expanded-history");
        await activate("tab", "contracts"); await activate("choose", "escort");
        await activate("toggleMember", "qa-champion-0"); await activate("toggleMember", "qa-champion-1");
        await p.waitForFunction(() => !document.querySelector('[data-guild="reviewMission"]').disabled);
        await layout("planning");
        await p.locator(".guild-member-top").first().scrollIntoViewIfNeeded(); await layout("party");
        await activate("reviewMission"); await layout("departure-review"); await activate("confirm");
        await p.evaluate(() => guildProductionPreview.advance(guildProductionPreview.snapshot().estate.guild.missions[0].durationMs + 100)); await idle();
        await activate("tab", "archive"); await activate("report");
        await activate("reportNext"); await activate("reportNext"); await layout("report-contributions");
        await activate("reportSkip"); await layout("report-rewards");
        await activate("tab", "hall"); await activate("tab", "recruits"); await layout("recruits");
        await activate("recruit"); await layout("recruitment-review"); await activate("cancel");
        await control("close").focus(); await p.keyboard.press("Enter");
        assert.equal(await p.locator(".guild-window[open]").count(), 0, "Keyboard close returns to estate");
        await browser.close(); browser = null;
        console.log(`Guild alignment passed ${built ? "built" : "source"} ${width}×${height}`);
      }
      assert.deepEqual(errors, [], "No missing assets or browser exceptions");
    } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
