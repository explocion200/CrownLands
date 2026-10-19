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
  const output = path.resolve(__dirname, "../release-artifacts/notification-badges"); fs.mkdirSync(output, { recursive: true });
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
    const shot = async name => fs.writeFileSync(path.join(output, name + ".png"), Buffer.from((await client.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
    const badge = async (selector, pseudo = null) => ev(`(() => {
      const node=document.querySelector(${JSON.stringify(selector)}); if(!node)return null;
      const s=getComputedStyle(node,${JSON.stringify(pseudo)}), r=node.getBoundingClientRect();
      return {text:${pseudo ? "s.content.replaceAll('\"','')" : "node.textContent"},width:parseFloat(s.width),height:parseFloat(s.height),color:s.color,background:s.backgroundColor,
        border:s.borderRadius,font:s.font,hidden:s.display==='none',fits:${pseudo ? "true" : "node.scrollWidth<=node.clientWidth+1"},left:r.left,top:r.top}; })()`);
    const circle = async (selector, text, pseudo = null) => {
      const b = await badge(selector, pseudo); assert(b && !b.hidden && b.fits, JSON.stringify({ selector, b }));
      assert.equal(b.text, text); assert.equal(b.width, 20); assert.equal(b.height, 20);
      assert.equal(b.color, "rgb(255, 255, 255)"); assert.equal(b.background, "rgb(114, 54, 58)"); assert.equal(b.border, "50%");
    };
    await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=2&hudOperations=both" });
    await wait('document.documentElement?.dataset.crownlandsBenchmarkReady === "true"');
    await ev(() => {
      __CROWNLANDS_BENCHMARK__.closeModal(); setAnimationModePreference("off");
      window.badgeQa = { handlers: {}, privateCount: 3 };
      badgeQa.api = { getServerNowMs: Date.now, isSignedIn: () => true,
        subscribeChatMessages(options, handlers) { badgeQa.handlers[options.channel] = handlers; handlers.onMessages([], { initial: true, hasMore: false }); return () => {}; },
        loadOlderChatMessages: async () => [],
        social: async input => {
          if (input.action === "status") return { enabled: true };
          if (input.action === "unread") return { count: badgeQa.privateCount, more: badgeQa.more };
          if (input.action === "list") return { rows: [{ id: "a".repeat(40), peerUid: "peer", unread: true, player: { uid: "peer", name: "Lady Elinor", clanTag: "CODE" } }] };
          return { players: [], serverNowMs: Date.now() };
        }, subscribeSocialSignals: () => () => {} };
      badgeQa.summary = { rewards: 1, quests: 3, achievements: 4, total: 8 };
      getCollectibleRewardAlertSummary = () => badgeQa.summary;
      getOnlineApi = () => badgeQa.api; getCurrentOnlineUid = () => "badge-player"; isOnlineWorldActive = () => true;
      getUnreadReportCount = () => 123;
    });
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      await ev(async () => {
        if (modal.open) modal.close(); profileScreen.classList.remove("open");
        CrownlandsSocial.stop(); const c = CrownlandsChat.init(); c.dispose({ resetSession: true });
        localStorage.removeItem("crownlands-chat-read:badge-player:global");
        badgeQa.privateCount = 3; badgeQa.more = false;
        c.start({ api: badgeQa.api, uid: "badge-player-" + innerWidth, clanId: "badge-clan" }); c.setMode("closed"); c.selectChannel("global", { focus: false });
        await CrownlandsSocial.start({ api: badgeQa.api, uid: "badge-player-" + innerWidth, flagRenderer: FlagRenderer });
        const message = (id, channel) => ({ id, senderUid: "peer", senderDisplayName: "Lady Elinor", text: "New dispatch", createdAtMs: Date.now() + 10, status: "visible", channel });
        badgeQa.handlers.global.onMessages([message("global-one", "global"), message("global-two", "global")], {});
        badgeQa.handlers.clan.onMessages([message("clan-one", "clan")], {});
        updateReportUnreadBadge(); renderDailyLoginRewardButton();
        state.clanId = "badge-clan"; state.clanName = "Crimson Watch"; state.clanRole = "leader";
        clanApplicationsScope = `${getOnlineRequestScope()}:${state.clanId}`;
        clanApplications = Array.from({ length: 2 }, (_, i) => ({ uid: "app-" + i, clanId: state.clanId, status: "pending" }));
        onlineClanRallies = [{ id: "rally", status: "forming" }]; lastClanHudSignature = ""; renderClanHudAccess();
      });
      await circle("#chatToggleUnread", "6");
      await circle("#reportUnreadBadge", "99+"); await circle("#dailyLoginRewardBadge", "8");
      await circle("#clanHudBtn", "3", "::before");
      for (const id of ["incomingAttackCount", "outgoingAttackCount"]) {
        const count = await ev(`document.getElementById(${JSON.stringify(id)}).textContent`);
        assert.match(count, /^[1-9][0-9]?(?:\+)?$/);
        await circle("#" + id, count);
        assert(await ev(`(() => { const n=document.getElementById(${JSON.stringify(id)}), r=n.getBoundingClientRect(), b=n.closest('button').getBoundingClientRect(); return r.left>=b.left&&r.right<=b.right&&r.top>=b.top&&r.bottom<=b.bottom; })()`), "Movement counter must fit its existing button");
      }
      assert.equal(await ev('document.querySelectorAll("#chatToggleBtn .notification-badge").length'), 1, "Chat sources must share one counter");
      const sizes = await ev(() => {
        const ids = ["chatToggleBtn", "dailyLoginRewardBtn", "clanHudBtn", "logBtn", "incomingAttackBtn", "outgoingAttackBtn"];
        const before = ids.map(id => { const r = document.getElementById(id).getBoundingClientRect(); return [r.width, r.height]; });
        const nodes = [...document.querySelectorAll(".notification-badge")]; nodes.forEach(n => n.style.setProperty("display", "none", "important"));
        const after = ids.map(id => { const r = document.getElementById(id).getBoundingClientRect(); return [r.width, r.height]; });
        nodes.forEach(n => n.style.removeProperty("display")); return { before, after };
      });
      assert.deepEqual(sizes.before, sizes.after, "Badges cannot enlarge HUD buttons");
      await shot("hud-" + width);
      await ev('CrownlandsChat.init().setMode("full"); CrownlandsSocial.open("messages")'); await delay(120);
      await circle("#socialMessagesTab .notification-badge", "3"); await circle(".social-conversation .social-unread", "1");
      await circle('#clanTab .chat-tab-unread', "1");
      await shot("messages-" + width);
      await ev('CrownlandsSocial.stop(); CrownlandsChat.init().selectChannel("clan"); CrownlandsChat.init().setMode("full")');
      assert((await badge("#chatToggleUnread")).hidden, "Reading both public channels and clearing private alerts clears HUD");
      await ev('CrownlandsChat.setPrivateUnread(125,true)'); await circle("#chatToggleUnread", "99+");
      await ev('CrownlandsChat.init().dispose({resetSession:true})'); assert((await badge("#chatToggleUnread")).hidden, "Account disposal clears private counts");
      await ev(() => {
        modal.className = "daily-login-reward-modal"; modalHeaderNav.innerHTML = renderDailyRewardModalTabs();
        modalHeaderNav.hidden = false; modalBody.innerHTML = "<p>Rewards ready to collect</p>"; modal.showModal();
      });
      await circle("#dailyRewardTabRewards .notification-badge", "1"); await circle("#dailyRewardTabQuests .notification-badge", "3"); await circle("#dailyRewardTabAchievements .notification-badge", "4");
      await shot("rewards-" + width);
      await ev(() => {
        badgeQa.savedSummary = badgeQa.summary; badgeQa.summary = { rewards: 0, quests: 0, achievements: 0, total: 0 };
        renderDailyLoginRewardButton(); modalHeaderNav.innerHTML = renderDailyRewardModalTabs();
      });
      assert((await badge("#dailyLoginRewardBadge")).hidden); assert.equal(await ev('modalHeaderNav.querySelectorAll(".notification-badge").length'), 0);
      await ev(() => {
        modal.close(); showProfileScreen(); showProfileView();
        CrownlandsPlayerProfileUI.update({ summary:getKingdomSummary(),xp:state.character.xp,xpRequired:getXpRequiredForLevel(state.character.level),completed:3,claimable:3,format:formatNumber });
      });
      await circle("#profileView .ready-count", "3");
      await circle("#clanTabBtn", "3", "::after");
      await shot("profile-" + width);
      await ev(() => {
        closeProfileScreen({force:true}); modal.className="clan-ledger-modal"; modalHeaderNav.hidden=true;
        clanMemberRewards={pendingGiftGoldMinutes:60}; modalBody.innerHTML=renderClanSectionNavigation(true); modal.showModal();
      });
      await circle('#clanSectionTabMembers .notification-badge', "2");
      await circle('#clanSectionTabWarroom .notification-badge', "1");
      await circle('#clanSectionTabRewards .notification-badge', "1");
      await ev('modalBody.innerHTML=renderClanSectionNavigation(false)');
      assert.equal(await ev('modalBody.querySelectorAll("#clanSectionTabMembers .notification-badge").length'), 0, "Ordinary member totals are not alerts");
      await ev(() => {
        modal.close(); state.reportsViewedAtMs=Date.now()-1000; reportsViewedPendingAtMs=0;
        battleReportFilter="all";
        state.battleReports=["attack","defense","scout"].map(type => ({id:"badge-report-"+type,type,outcome:type==="scout"?"scout":"victory",cityId:state.cities[0].id,cityName:"Oakfall",cityLevel:10,sentTroops:250,occurredAtMs:Date.now()}));
        showLogModal({silentAudio:true,markViewed:false});
      });
      assert.equal(await ev('modalBody.querySelectorAll(".report-row.new").length'), 3, "New report highlighting remains available");
      assert.equal(await ev('modalBody.querySelectorAll(".report-row .notification-badge, .report-row .new-tag").length'), 0, "Unread circles belong on Reports, not individual rows");
      await circle("#reportUnreadBadge", "99+");
      await shot("reports-" + width);
      await ev(() => {
        badgeQa.summary = badgeQa.savedSummary; modal.close();
        state.gold = 1e15; openInnerCastle(getMainCityReference().id);
        innerCastleEconomy = { snapshot: () => ({ estate: { levels: { treasury: 100, barracks: 100, gatehouse: 100, "royal-stables": 100 } } }), balances: () => ({}), now: Date.now, destroy() {}, visibilityChanged() {}, refresh: async () => {} };
        state.gear = COMMON_GEAR.createDefaultState();
        for (const building of Object.keys(COMMON_GEAR.BUILDINGS)) {
          const def = COMMON_GEAR.DEFINITIONS.find(d => d.buildingId === building && d.slot === "head" && d.rarity === "common");
          for (const suffix of ["a", "b"]) { const id = building + "-" + suffix; state.gear.instances[id] = COMMON_GEAR.normalizeInstance({ instanceId: id, gearKey: def.gearKey, level: 1, isNew: true }); }
        }
      });
      for (const building of ["treasury", "barracks", "gatehouse", "royal-stables"]) {
        await ev(`selectedCommonGearInstanceId=${JSON.stringify(building + "-a")};selectedCommonGearSlot='head';selectedCommonGearBagFilter='all';renderCommonGearBuilding(${JSON.stringify(building)});void 0`);
        await wait(`!!modal.querySelector('[data-${building}-officer]')`);
        await circle("#modal .tg-ready", "!");
        await circle("#modal .tg-item-mark .notification-badge", "2");
        assert(await ev('modalBody.scrollWidth<=modalBody.clientWidth+1'), "Gear badge caused horizontal overflow");
        await shot(building + "-" + width);
      }
      console.log(`Notification counts, shared HUD, clearing, circular styling and four officer panels passed at ${width}x${height}.`);
    }
    assert.deepEqual(errors, []);
  } finally {
    if (client) await client.send("Browser.close").catch(() => {});
    if (session) { await waitForProcessExit(session.browserProcess); await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
