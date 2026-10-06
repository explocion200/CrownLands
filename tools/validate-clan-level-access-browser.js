"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Set CHROME_PATH to Chromium.");
  const server = createMapBenchmarkServer(), address = await server.listen();
  const artifacts = path.resolve(__dirname, "../release-artifacts/clan-level-access");
  fs.mkdirSync(artifacts, { recursive: true });
  let session, client;
  const errors = [];
  try {
    session = await startBrowserSession(executable);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all([client.send("Page.enable"), client.send("Runtime.enable")]);
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression: typeof expression === "function" ? `(${expression.toString()})()` : expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const ready = async expression => {
      for (let attempt = 0; attempt < 400; attempt++) {
        if (await evaluate(expression)) return;
        await delay(100);
      }
      throw Error("Timed out: " + expression);
    };
    const screenshot = async label => {
      await delay(150);
      const shot = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(artifacts, label + ".png"), Buffer.from(shot.data, "base64"));
    };
    for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 568, height: 320 }]) {
      await client.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1, mobile: false });
      await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
      await ready("window.__CROWNLANDS_BENCHMARK__?.getStatus().status === 'ready'");
      await evaluate(async () => {
        __CROWNLANDS_BENCHMARK__.closeModal();
        await Promise.all(["clan", "treasury"].map(loadOptionalUiStyle));
        const script = document.createElement("script");
        script.src = "docs/visual-qa/clan-overview/runtime-fixture.js";
        document.body.append(script);
      });
      await ready("document.documentElement.dataset.clanRuntimeReady === 'true'");
      await evaluate(() => {
        window.levelQa = { memberClan: clanSnapshot, calls: [] };
        const api = getOnlineApi();
        const record = (method, payload) => { levelQa.calls.push({ method, payload }); return { ok: true }; };
        getOnlineApi = () => ({ ...api,
          joinOpenClan: async payload => record("joinOpenClan", payload),
          applyToClan: async payload => { state.pendingClanApplicationId = payload.clanId; return record("applyToClan", payload); },
          createClan: async payload => ({ ...record("createClan", payload), clan: { tag: payload.tag }, gold: state.gold - 100000 }),
        });
        stopClanRealtimeSubscriptions({ clear: false });
        state.clanId = ""; state.clanRole = ""; clanSnapshot = null;
        state.pendingClanApplicationId = ""; state.clanJoinCooldownUntilMs = 0;
        clanUiLoading = false;
      });
      for (const level of [1, 9, 10, 257]) {
        await evaluate(`state.character.level=${level};profileScreen.classList.remove('open');renderClanHudAccess();clanHudBtn.click()`);
        const discovery = await evaluate(() => ({
          label: clanHudBtn.getAttribute("aria-label"), open: profileScreen.classList.contains("open"),
          join: !!clanContent.querySelector('[data-clan-action="join"]:not(:disabled)'),
          apply: !!clanContent.querySelector('[data-clan-action="apply"]:not(:disabled)'),
          full: clanContent.querySelector('[data-clan-id="review-search-4"][data-clan-action="apply"]').disabled,
        }));
        assert.deepEqual(discovery, { label: "Find a clan", open: true, join: true, apply: true, full: true });
        if (level === 1) await screenshot(`discover-${viewport.width}`);
        await evaluate("clanContent.querySelector('#clanBrowserTabCreate').click()");
        assert.equal(await evaluate("clanContent.querySelector('[data-clan-form=\"create\"] button[type=\"submit\"]').disabled"), false);
      }
      await evaluate("state.character.level=1;clanContent.querySelector('#clanBrowserTabDiscover').click();clanContent.querySelector('[data-clan-action=\"join\"]').click()");
      await ready("!clanUiLoading && levelQa.calls.length === 1");
      await evaluate("clanContent.querySelector('[data-clan-action=\"apply\"]').click()");
      await ready("!clanUiLoading && levelQa.calls.length === 2");
      assert.equal(await evaluate("!!clanContent.querySelector('[data-clan-action=\"cancel-application\"]')"), true);
      assert.equal(await evaluate("clanContent.querySelector('[data-clan-action=\"join\"]').disabled"), true);
      await evaluate(() => {
        state.pendingClanApplicationId = ""; renderClanView();
        clanContent.querySelector("#clanBrowserTabCreate").click();
        const form = clanContent.querySelector('[data-clan-form="create"]');
        form.elements.name.value = "New Rulers"; form.elements.tag.value = "NEW";
        form.requestSubmit();
      });
      await ready("levelQa.calls.length === 3");
      assert.deepEqual(await evaluate("levelQa.calls.map(call=>call.method)"), ["joinOpenClan", "applyToClan", "createClan"]);
      await screenshot(`create-${viewport.width}`);
      await evaluate("state.clanJoinCooldownUntilMs=Date.now()+3600000;renderClanView()");
      assert.equal(await evaluate("[...clanContent.querySelectorAll('[data-clan-action=\"join\"],[data-clan-action=\"apply\"],[data-clan-form=\"create\"] button[type=\"submit\"]')].every(button=>button.disabled)"), true);
      await evaluate(() => {
        state.clanJoinCooldownUntilMs = 0;
        state.clanId = levelQa.memberClan.id; state.clanRole = "member"; clanSnapshot = levelQa.memberClan;
        renderClanHudAccess(); renderClanView();
      });
      assert.match(await evaluate("clanHudBtn.getAttribute('aria-label')"), /Open \[STAG\]/);
      assert.equal(await evaluate("!!clanContent.querySelector('#clanSectionTabOverview')"), true);
      const bounds = await evaluate(() => {
        const r = profileScreen.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: innerWidth, height: innerHeight };
      });
      assert(bounds.left >= -1 && bounds.top >= -1 && bounds.right <= bounds.width + 1 && bounds.bottom <= bounds.height + 1, JSON.stringify(bounds));
      await screenshot(`member-${viewport.width}`);
      console.log(`Clan discovery, creation, join/apply dispatch and Level 1 member access passed at ${viewport.width}x${viewport.height}; Levels 1, 9, 10 and 257 retain capacity, application and cooldown restrictions.`);
    }
    assert.deepEqual(errors, [], "Unexpected browser errors.");
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (session) {
      if (!await waitForProcessExit(session.browserProcess)) { session.browserProcess.kill(); await waitForProcessExit(session.browserProcess); }
      await removeBrowserProfile(session.profilePath);
    }
    await server.close();
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
