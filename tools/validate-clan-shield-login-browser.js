"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const executable = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && fs.existsSync(p));
  assert(executable, "Chromium is required");
  const server = createMapBenchmarkServer(), address = await server.listen();
  const artifacts = path.resolve(__dirname, "../release-artifacts/clan-shield-login");
  fs.mkdirSync(artifacts, { recursive: true });
  let browser, client;
  const errors = [], writes = [], layouts = [];
  try {
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(t => t.type === "page").webSocketDebuggerUrl);
    for (const domain of ["Page", "Runtime", "Network"]) await client.send(domain + ".enable");
    client.on("Runtime.exceptionThrown", e => errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
    client.on("Network.requestWillBeSent", e => { if (!["GET", "HEAD"].includes(e.request.method)) writes.push(e.request.method); });
    const ev = async expression => {
      const r = await client.send("Runtime.evaluate", { expression: typeof expression === "function" ? "(" + expression + ")()" : expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const ready = async () => {
      for (let i = 0; i < 300; i++) {
        if (await ev('document.documentElement?.dataset.crownlandsBenchmarkReady === "true"')) return;
        await delay(100);
      }
      throw Error("Fixture did not load");
    };
    const reload = async () => {
      const loaded = new Promise(resolve => { const off = client.on("Page.loadEventFired", () => { off(); resolve(); }); });
      await client.send("Page.reload", { ignoreCache: true }); await loaded; await ready();
    };
    const setup = () => ev(() => {
      __CROWNLANDS_BENCHMARK__.closeModal();
      stopClanRealtimeSubscriptions({ clear: true });
      window.shieldQa = {
        uid: "shield-login-account", subscriptions: [],
        clan: { id: "shield-login-clan", name: "Amber Watch", tag: "AW", status: "active", heraldryRevision: 4,
          shield: { ...CLAN_HERALDRY_CONFIG.DEFAULT_V2, charge: "wolf", primary: "#24445f", trim: "riveted" } },
      };
      shieldQa.api = { isSignedIn: () => true, getUser: () => ({ uid: shieldQa.uid }),
        subscribeClanState: (id, handlers) => { shieldQa.subscriptions.push(handlers); return () => {}; },
      };
      getOnlineApi = () => shieldQa.api;
      state.clanId = shieldQa.clan.id; state.clanName = shieldQa.clan.name; state.clanTag = shieldQa.clan.tag; state.clanRole = "member";
      shieldQa.latest = () => shieldQa.subscriptions.at(-1);
      shieldQa.paint = () => { renderClanHudAccess(); renderProfileClanAffiliation(); };
      startClanRealtimeSubscriptions(shieldQa.api, state.clanId); shieldQa.paint();
    });
    const markup = () => ev("({hud:clanHudIcon.innerHTML,profile:profileClanShield.innerHTML,busy:clanHudBtn.getAttribute('aria-busy')})");
    const emit = () => ev("shieldQa.latest().onClan(shieldQa.clan)");
    const shot = async name => fs.writeFileSync(path.join(artifacts, name + ".png"), Buffer.from((await client.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
    await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
    await ready(); await setup();
    assert.deepEqual(await markup(), { hud: "", profile: "", busy: "true" }, "Cold login must wait for actual heraldry, not invent a default");
    await emit(); const saved = await markup();
    assert(saved.hud.includes("clan-heraldry-v2") && saved.profile.includes("clan-heraldry-v2"));
    assert.equal(saved.busy, "false");
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      await ev("shieldQa.old = shieldQa.latest(); stopClanRealtimeSubscriptions({clear:false}); startClanRealtimeSubscriptions(shieldQa.api,state.clanId); shieldQa.paint()");
      assert.deepEqual(await markup(), saved, "Reconnect replaced confirmed heraldry before fresh data arrived");
      await ev("shieldQa.old.onClan(null); shieldQa.old.onMembers([{uid:'stale-member'}]); shieldQa.paint()");
      assert.deepEqual(await markup(), saved, "Retired callbacks must not clear the preview");
      assert.equal(await ev("clanMembers.some(m=>m.uid==='stale-member')"), false);
      await delay(1100);
      assert.deepEqual(await markup(), saved, "Delayed clan load flashed a different shield");
      const layout = await ev(() => {
        const r = clanHudBtn.getBoundingClientRect(), s = clanHudIcon.firstElementChild.getBoundingClientRect();
        return { width: r.width, height: r.height, inside: r.x >= 0 && r.right <= innerWidth && r.y >= 0 && r.bottom <= innerHeight,
          shieldFits: s.x >= r.x && s.right <= r.right && s.y >= r.y && s.bottom <= r.y + r.height * .75,
          label: clanHudBtn.getAttribute("aria-label"), hit: clanHudBtn.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) };
      });
      assert(layout.width >= 44 && layout.height >= 44 && layout.inside && layout.shieldFits && layout.hit, JSON.stringify(layout));
      assert.match(layout.label, /Amber Watch/); layouts.push({ width, height, ...layout });
      await shot("reconnect-" + width); await emit();
    }
    // A real page reload resets all JS state while preserving browser storage.
    await reload(); await setup();
    assert.deepEqual(await markup(), saved, "Returning login must immediately restore its scoped visual preview");
    assert.equal(await ev("clanSnapshot"), null, "Visual preview must not become authoritative clan state");
    await ev("shieldQa.uid='another-account';shieldQa.paint()");
    assert.equal((await markup()).hud, "", "Another account inherited the previous account's preview");
    await ev("shieldQa.latest().onClan(shieldQa.clan);shieldQa.paint()");
    assert.equal(await ev("clanSnapshot"), null, "Old session callback crossed accounts");
    await ev("shieldQa.uid='shield-login-account';shieldQa.paint()");
    assert.deepEqual(await markup(), saved);
    await ev("shieldQa.scope=getOnlineRequestScope;getOnlineRequestScope=()=>shieldQa.scope()+':different-realm';shieldQa.paint()");
    assert.equal((await markup()).hud, "", "Preview crossed realm/shard scope");
    await ev("getOnlineRequestScope=shieldQa.scope;state.clanId='other-clan';shieldQa.paint()");
    assert.equal((await markup()).hud, "", "Preview crossed clans");
    await ev("state.clanId=shieldQa.clan.id;shieldQa.paint();shieldQa.clan={...shieldQa.clan,heraldryRevision:5,shield:{...shieldQa.clan.shield,charge:'eagle',primary:'#7a2638'}}");
    await emit(); const updated = await markup(); assert.notEqual(updated.hud, saved.hud, "Fresh heraldry must replace the cached design");
    await ev("shieldQa.latest().onClan(null);shieldQa.paint()");
    assert.equal((await markup()).hud, "", "Confirmed clan removal retained stale heraldry");
    await reload(); await setup();
    assert.equal((await markup()).hud, "", "Removed clan preview survived a reload");
    await ev("state.clanId='';shieldQa.paint()");
    assert.equal(await ev("clanHudBtn.getAttribute('aria-label')"), "Find a clan");
    assert.equal(await ev("profileClanAffiliation.hidden"), true);
    // Corrupt or unavailable storage must neither break login nor show another design.
    await ev("localStorage.setItem('crownlands-clan-shield-preview-v1','{bad json')");
    await reload(); await setup();
    assert.equal((await markup()).hud, "");
    await ev("shieldQa.setItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw Error('Fixture storage unavailable')}");
    await emit();
    await ev("stopClanRealtimeSubscriptions({clear:true});shieldQa.paint()");
    assert.deepEqual(await markup(), saved, "Blocked storage must preserve the in-memory shield across reconnects");
    await ev("Storage.prototype.setItem=shieldQa.setItem");
    // Clients using the one-shot fallback must reject loads from an old clan.
    await ev(() => {
      shieldQa.api.subscribeClanState = undefined;
      shieldQa.api.loadClan = () => new Promise(resolve => { shieldQa.resolveClan = resolve; });
      shieldQa.api.loadClanMembers = async () => [];
      shieldQa.pending = refreshClanState({ silent: true, skipProfileLoad: true });
    });
    await ev("state.clanId='changed-during-load';shieldQa.resolveClan(shieldQa.clan);shieldQa.pending");
    assert.equal(await ev("clanSnapshot"), null);
    assert.equal((await markup()).hud, "");
    await ev("state.clanId=shieldQa.clan.id;shieldQa.api.loadClan=async()=>shieldQa.clan;refreshClanState({silent:true,skipProfileLoad:true})");
    assert.deepEqual(await markup(), saved, "Fallback must display the confirmed shield");
    await ev("shieldQa.api.loadClan=async()=>({...shieldQa.clan,status:'disbanded'});refreshClanState({silent:true,skipProfileLoad:true})");
    assert.equal((await markup()).hud, "", "Fallback must clear a retired clan's preview");
    assert.deepEqual(errors, []); assert.deepEqual(writes, [], "Visual checks may not send real game writes");
    fs.writeFileSync(path.join(artifacts, "checks.json"), JSON.stringify({ passed: true, layouts, coldLogin: true, reload: true, reconnect: true, scopeIsolation: true, staleCallbacks: true, freshEdits: true, removedClan: true, storageFailure: true }, null, 2));
    console.log("Clan shield login: delayed/repeated reconnect, real reload, account/realm/clan isolation, stale callbacks, edits, removal, storage failure and desktop/landscape layout passed.");
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (browser) { if (!await waitForProcessExit(browser.browserProcess)) { browser.browserProcess.kill(); await waitForProcessExit(browser.browserProcess); } await removeBrowserProfile(browser.profilePath); }
    await server.close();
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
