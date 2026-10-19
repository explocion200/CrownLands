"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const executable = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && fs.existsSync(p));
  assert(executable, "Chromium required");
  const server = createMapBenchmarkServer(), address = await server.listen();
  const output = path.resolve(__dirname, "../release-artifacts/clan-action-notifications"); fs.mkdirSync(output, { recursive: true });
  let session, client; const errors = [];
  try {
    session = await startBrowserSession(executable);
    client = await CdpClient.connect(session.targets.find(t => t.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable"); await client.send("Runtime.enable");
    client.on("Runtime.exceptionThrown", e => errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
    const ev = async fn => {
      const r = await client.send("Runtime.evaluate", { expression: typeof fn === "function" ? `(${fn})()` : fn, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const wait = async expression => { for (let i = 0; i < 300; i++) { if (await ev(expression)) return; await delay(100); } throw Error("Timed out: " + expression); };
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
    await wait('document.documentElement?.dataset.crownlandsBenchmarkReady === "true"');
    await ev(() => {
      stopClanRealtimeSubscriptions({ clear: true }); __CROWNLANDS_BENCHMARK__.closeModal(); setAnimationModePreference("off");
      window.actionQa = { uid: "gift-member", now: Date.parse("2026-10-19T01:00:00Z"), reads: 0, failGift: false, deferGift: false, deferRead: false, allowRead: false,
        clan: { id: "action-clan", name: "Crimson Watch", tag: "CW", status: "active", shield: { ...CLAN_HERALDRY_CONFIG.DEFAULT_V2 } } };
      actionQa.members = [{ uid: actionQa.uid, displayName: "Lady Elinor", role: "member", status: "active" }, { uid: "peer", displayName: "Sir Alden", role: "leader", status: "active" }];
      actionQa.status = remaining => ({ clanId: state.clanId, utcDate: getUtcDateKeyAtMs(actionQa.now),
        treasury: { balance: 1000000, revision: 1, totalDonated: 1000000, totalSpent: 0 },
        allowance: { remaining, dailyCap: 1200000, donatedToday: 1200000 - remaining, locked: true, rawGoldPerHourSnapshot: 100000 } });
      actionQa.api = { isSignedIn: () => true,
        subscribeClanState: (id, h) => { actionQa.roster = h; h.onClan(actionQa.clan); h.onMembers(actionQa.members); return () => {}; },
        subscribeClanSocialState: (id, h) => { actionQa.social = h; return () => {}; },
        getClanTreasuryStatus: async () => { actionQa.reads++; if (!actionQa.allowRead) return null; if (actionQa.deferRead) return new Promise(resolve => { actionQa.resolveRead = resolve; }); return actionQa.status(500000); },
        donateClanTreasuryGold: async () => ({ ...actionQa.status(0), balance: 1500000, revision: 2, donated: 500000 }),
        sendClanGift: async () => {
          if (actionQa.failGift) throw Error("Planned gift refusal");
          if (actionQa.deferGift) return new Promise(resolve => { actionQa.resolveGift = resolve; });
          return { memberRewards: { lastGiftSentAtMs: actionQa.now }, recipientCount: 1, productionMinutes: 30 };
        } };
      getOnlineApi = () => actionQa.api; getCurrentOnlineUid = () => actionQa.uid; isOnlineWorldActive = () => true;
      getClanQuestServerNowMs = () => actionQa.now;
      state.clanId = actionQa.clan.id; state.clanRole = "member"; state.gold = 1000000;
      startClanRealtimeSubscriptions(actionQa.api, state.clanId); startClanSocialStateSubscription(actionQa.api, state.clanId);
      // Advance the real tick explicitly for deterministic boundary assertions.
      clearInterval(clanGiftCountdownTimer); clanGiftCountdownTimer = null;
      onlineClanRallies = []; clanApplications = []; activeProfileTab = "clan";
      profileScreen.classList.add("open", "clan-active"); profileScreen.setAttribute("aria-hidden", "false");
      profileView.hidden=true; skillsView.hidden=true; settingsView.hidden=true; flagEditorView.hidden=true; clanView.hidden=false;
      syncClanNavigationState(); activeClanMobileSection = "rewards"; activeClanRewardSection = "gifts";
    });
    const availability = async (gift, donate) => {
      assert.deepEqual(await ev("getClanActionAvailability()"), { gift, donate });
      await ev("refreshClanActionNotifications();renderClanHudAccess();renderClanView()");
      assert.equal(await ev("clanHudBtn.dataset.clanNotificationCount"), gift || donate ? "!" : "");
      assert.equal(await ev("clanTabBtn.dataset.clanNotificationCount"), gift || donate ? "!" : "");
    };
    await availability(false, false);
    await ev("actionQa.social.onMemberRewards(null)"); // Confirmed missing record means a first gift is available.
    await availability(true, false);
    await ev("actionQa.allowRead=true;loadClanTreasuryStatus({force:true})"); await availability(true, true);
    await ev("actionQa.roster.onMembers([actionQa.members[0]])"); await availability(false, true);
    await ev("actionQa.roster.onMembers([actionQa.members[0],{...actionQa.members[1],status:'removed'}])"); await availability(false, true);
    await ev("actionQa.roster.onMembers(actionQa.members);state.gold=0"); await availability(true, false);
    await ev("state.gold=1000000;applyClanTreasuryStatus(state.clanId,actionQa.status(0))"); await availability(true, false);
    await ev("applyClanTreasuryStatus(state.clanId,actionQa.status(500000));clanTreasuryActionInFlight=true"); await availability(true, false);
    await ev("clanTreasuryActionInFlight=false;actionQa.social.onMemberRewards({lastGiftSentAtMs:actionQa.now-CLAN_GIFT_COOLDOWN_MS+1})"); await availability(false, true);
    await ev("actionQa.now++;refreshClanActionNotifications();updateClanGiftCountdown()"); await availability(true, true);
    assert.equal(await ev("document.querySelector('[data-clan-action=send-gift]').disabled"), false);
    await ev("actionQa.social.onError(new Error('Planned unread snapshot'),'memberRewards')"); await availability(false, true);
    await ev("actionQa.social.onMemberRewards(null)"); await availability(true, true);
    await ev("actionQa.failGift=true;runClanSocialAction('send-gift')"); await availability(true, true);
    await ev("actionQa.failGift=false;runClanSocialAction('send-gift')"); await availability(false, true);
    await ev("actionQa.now+=CLAN_GIFT_COOLDOWN_MS"); await availability(true, true);

    // Expired daily allowance cannot claim donation readiness; refresh is deduplicated and bounded.
    await ev(() => {
      actionQa.now = Date.parse(getUtcDateKeyAtMs(actionQa.now) + "T00:00:00Z") + 86400000;
      actionQa.deferRead = true; actionQa.beforeReads = actionQa.reads;
      refreshClanActionNotifications(); refreshClanActionNotifications();
    });
    await availability(true, false);
    assert.equal(await ev("actionQa.reads-actionQa.beforeReads"), 1);
    await ev("actionQa.resolveRead(null);clanTreasuryRequest");
    await ev("refreshClanActionNotifications()"); assert.equal(await ev("actionQa.reads-actionQa.beforeReads"), 1);
    await ev("actionQa.now+=60000;refreshClanActionNotifications()"); assert.equal(await ev("actionQa.reads-actionQa.beforeReads"), 2);
    await ev("actionQa.resolveRead(actionQa.status(500000));clanTreasuryRequest"); await availability(true, true);
    await ev("actionQa.deferRead=false");

    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      for (const section of ["gifts", "treasury"]) {
        await ev(`activeClanMobileSection='rewards';activeClanRewardSection='${section}';renderClanView();toast.classList.remove('visible')`);
        await delay(100);
        const badges = await ev(() => [...clanContent.querySelectorAll(".clan-action-notice")].filter(n => n.getClientRects().length).map(n => {
          const s = getComputedStyle(n), r = n.getBoundingClientRect(), b = n.closest("button").getBoundingClientRect();
          return { text: n.textContent, width: r.width, height: r.height, color: s.color, background: s.backgroundColor,
            fits: r.left >= b.left && r.right <= b.right && r.top >= b.top && r.bottom <= b.bottom };
        }));
        assert(badges.length >= 2);
        for (const b of badges) assert.deepEqual(b, { text: "!", width: 20, height: 20, color: "rgb(255, 255, 255)", background: "rgb(114, 54, 58)", fits: true });
        const sizes = await ev(() => {
          const buttons = [...clanContent.querySelectorAll(".clan-action-notice-host")];
          const measure = () => buttons.map(n => { const r = n.getBoundingClientRect(); return [r.width, r.height]; });
          const before = measure(); clanContent.querySelectorAll(".clan-action-notice").forEach(n => { n.hidden = true; });
          const after = measure(); clanContent.querySelectorAll(".clan-action-notice").forEach(n => { n.hidden = false; });
          return { before, after };
        });
        assert.deepEqual(sizes.before, sizes.after, "Availability must not enlarge controls");
        fs.writeFileSync(path.join(output, `${section}-${width}.png`), Buffer.from((await client.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
      }
    }
    // Availability changes must preserve a focused Treasury donation draft.
    await ev(() => {
      const input = clanContent.querySelector("[data-clan-treasury-donation]"); input.value = "1234"; input.dispatchEvent(new Event("input")); input.focus();
      clanGiftActionInFlight = true; refreshClanActionNotifications();
    });
    assert.equal(await ev("document.activeElement.value"), "1234");
    await ev("clanGiftActionInFlight=false;refreshClanActionNotifications()");
    // Counts take precedence without losing the action explanation or child notices.
    await ev(() => {
      state.clanRole = "leader"; clanApplicationsScope = `${getOnlineRequestScope()}:${state.clanId}`;
      clanApplications = [{ uid: "app", clanId: state.clanId, status: "pending" }]; renderClanHudAccess();
    });
    assert.equal(await ev("clanHudBtn.dataset.clanNotificationCount"), "1");
    assert.match(await ev("clanHudBtn.getAttribute('aria-label')"), /Clan gift ready.*Clan Tower donation available/);
    await ev("state.clanRole='member';clanApplications=[]");
    // A previous account's snapshots/receipts cannot advertise availability in a replacement session.
    await ev(() => {
      actionQa.oldSocial = actionQa.social; actionQa.oldTreasuryScope = getClanTreasuryScope();
      actionQa.deferGift = true; actionQa.pendingGift = runClanSocialAction("send-gift");
    });
    await availability(false, true);
    await ev(() => {
      stopClanRealtimeSubscriptions({ clear: true }); actionQa.uid = "replacement"; onlineSessionGeneration++;
      actionQa.oldSocial.onMemberRewards({ lastGiftSentAtMs: 0 });
      applyClanTreasuryStatus(state.clanId, actionQa.status(500000), actionQa.oldTreasuryScope);
      actionQa.resolveGift({ memberRewards: { lastGiftSentAtMs: actionQa.now }, recipientCount: 1, productionMinutes: 30 });
      return actionQa.pendingGift;
    });
    await availability(false, false);
    assert.equal(await ev("clanMemberRewards"), null);
    assert.equal(await ev("clanTreasuryStatus"), null);
    assert.deepEqual(errors, []);
    console.log("Clan action badges: readiness, cooldown, donation limits, UTC rollover, scoped results, unchanged controls and desktop/landscape passed.");
  } finally {
    if (client) { try { await client.send("Browser.close"); } catch (_) {} client.close(); }
    if (session) { if (!await waitForProcessExit(session.browserProcess)) { session.browserProcess.kill(); await waitForProcessExit(session.browserProcess); } await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
