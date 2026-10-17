"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const executable = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Chromium required");
  const server = createMapBenchmarkServer(), address = await server.listen(), artifacts = path.resolve(__dirname, "../release-artifacts/social");
  fs.mkdirSync(artifacts, { recursive: true }); let browser, client;
  const errors = [], layouts = [];
  try {
    browser = await startBrowserSession(executable); client = await CdpClient.connect(browser.targets.find(t => t.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable"); await client.send("Runtime.enable");
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const ev = async fn => { const response = await client.send("Runtime.evaluate", { expression: typeof fn === "function" ? `(${fn})()` : fn, awaitPromise: true, returnByValue: true }); if (response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text); return response.result.value; };
    await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
    for (let i = 0; i < 300 && !await ev('document.documentElement?.dataset.crownlandsBenchmarkReady === "true"'); i++) await delay(100);
    assert(await ev('document.documentElement?.dataset.crownlandsBenchmarkReady === "true"'));
    await ev(async () => {
      __CROWNLANDS_BENCHMARK__.closeModal();
      window.socialQa = { calls: [], messages: [{ id: "b".repeat(40), sequence: 1, senderUid: "bob", senderDisplayName: "Bob", text: "A private message <img src=x onerror=alert(1)> — welcome to the realm.", createdAtMs: Date.now(), expiresAtMs: Date.now() + 90 * 86400000 }], unread: 1 };
      const player = { uid: "bob", name: "Bob of Stoneward", flag: { primary: "#336633", secondary: "#eee1b9", pattern: "solid", symbol: "crown" } };
      socialQa.api = { social: async input => {
        socialQa.calls.push(input);
        const base = { serverNowMs: Date.now() };
        if (input.action === "status") return { ...base, enabled: true, privateAlerts: Boolean(socialQa.privateAlerts) };
        if (input.action === "preference") { socialQa.privateAlerts = input.enabled; return { privateAlerts: input.enabled }; }
        if (input.action === "unread") return { count: socialQa.unread };
        if (input.action === "list") return { ...base, rows: input.kind === "blocked" ? [] : [{ id: "a".repeat(40), peerUid: "bob", player, friend: "friends", status: "accepted", unread: socialQa.unread, lastMessageAtMs: Date.now() }], next: null };
        if (input.action === "presence") return { ...base, players: [{ uid: "bob", online: true, expiresAtMs: Date.now() + 180000 }] };
        if (input.action === "history") return { ...base, player, relation: { id: "a".repeat(40), friend: "friends", conversation: "accepted", canSend: true }, messages: socialQa.messages, next: null };
        if (input.action === "read") { socialQa.unread = 0; return { ok: true }; }
        if (input.action === "send") { socialQa.messages.push({ id: "c".repeat(40), sequence: 2, senderUid: "alice", senderDisplayName: "Alice", text: input.text, createdAtMs: Date.now(), expiresAtMs: Date.now() + 90 * 86400000 }); return { ok: true }; }
        return { ok: true };
      }, subscribeSocialSignals: callback => { socialQa.signal = callback; return () => {}; }, registerPushNotifications: async () => ({}), enablePushNotifications: async options => { socialQa.alertCategory = options.category; return { enabled: true }; }, disablePushNotifications: async options => { socialQa.disabledCategory = options.category; }, getNotificationPermission: () => "default", translateChatMessages: async () => ({ translations: [{ id: "b".repeat(40), text: "Translated fixture" }] }) };
      await CrownlandsSocial.start({ api: socialQa.api, uid: "alice", flagRenderer: FlagRenderer }); CrownlandsSocial.open("friends");
    });
    await delay(150);
    assert((await ev('document.querySelector(".social-list").innerText')).includes("Online"));
    assert(await ev('Boolean(document.querySelector(".social-flag svg"))'), "Player flags use the shared renderer");
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      await ev('CrownlandsSocial.open("friends")'); await delay(100);
      await client.send("Page.captureScreenshot", { format: "png" }).then(shot => fs.writeFileSync(path.join(artifacts, "friends-" + width + ".png"), Buffer.from(shot.data, "base64")));
      await ev('Array.from(document.querySelectorAll(".social-list button")).find(b=>b.textContent==="Message").click()'); await delay(120);
      const layout = await ev(() => {
        const d = document.getElementById("chatDialog").getBoundingClientRect(), log = document.querySelector(".social-log").getBoundingClientRect(), form = document.querySelector(".social-compose").getBoundingClientRect();
        return { dialog: { x: d.x, y: d.y, width: d.width, height: d.height }, logHeight: log.height, composerInside: form.bottom <= d.bottom && form.left >= d.left && form.right <= d.right,
          overflow: document.getElementById("socialPanel").scrollWidth > document.getElementById("socialPanel").clientWidth + 1, injectedImage: Boolean(document.querySelector(".social-message img")), text: document.querySelector(".social-message p").textContent };
      });
      layouts.push({ width, height, ...layout });
      await client.send("Page.captureScreenshot", { format: "png" }).then(shot => fs.writeFileSync(path.join(artifacts, "messages-" + width + ".png"), Buffer.from(shot.data, "base64")));
      assert(layout.composerInside && layout.logHeight >= 40 && !layout.overflow && !layout.injectedImage, JSON.stringify(layout));
      assert(layout.text.includes("<img"));
    }
    await ev('document.querySelector(".social-compose textarea").value="Hello privately";document.querySelector(".social-compose").dispatchEvent(new Event("submit",{cancelable:true}))'); await delay(150);
    assert.equal(await ev('socialQa.calls.filter(c=>c.action==="send").length'), 1);
    assert((await ev('document.querySelector(".social-log").innerText')).includes("Hello privately"));
    assert.equal(await ev('document.querySelector(".social-compose textarea").value'), "");
    assert.equal(await ev('document.querySelector(".social-compose textarea").disabled'), false);
    await ev('document.querySelector(".social-message-menu").open=true;Array.from(document.querySelectorAll(".social-message button")).find(b=>b.textContent==="Translate").click()'); await delay(80);
    assert((await ev('document.querySelector(".social-log").innerText')).includes("Translated fixture"));
    await ev(() => {
      CrownlandsSocial.open("messages");
      Object.defineProperty(document, "fullscreenElement", { configurable: true, value: document.documentElement });
      document.exitFullscreen = async () => { socialQa.exitedFullscreen = true; };
      [...document.querySelectorAll("#socialToolbar button")].find(b => b.textContent === "Private alerts: Off").click();
    }); await delay(100);
    assert(await ev('socialQa.exitedFullscreen && socialQa.alertCategory === "private" && document.getElementById("socialToolbar").textContent.includes("Private alerts: On")'));
    await ev('[...document.querySelectorAll("#socialToolbar button")].find(b => b.textContent === "Private alerts: On").click()'); await delay(100);
    assert.equal(await ev('socialQa.disabledCategory'), "private");
    await ev('document.getElementById("globalTab").click()');
    assert.equal(await ev('document.getElementById("socialPanel").hidden'), true);
    await ev('CrownlandsSocial.stop()');
    assert.equal(await ev('document.querySelector(".social-thread").textContent'), "");
    assert.equal(await ev('document.getElementById("socialFriendsTab").hidden'), true);
    await ev(async () => {
      socialQa.privateAlerts = true; socialQa.alertCategory = "";
      await CrownlandsSocial.start({ api: socialQa.api, uid: "alice", flagRenderer: FlagRenderer }); CrownlandsSocial.open("messages");
    }); await delay(80);
    assert(await ev('document.getElementById("socialToolbar").textContent.includes("Enable private alerts here") && !document.getElementById("socialToolbar").textContent.includes("Private alerts: On")'));
    await ev('[...document.querySelectorAll("#socialToolbar button")].find(b=>b.textContent==="Enable private alerts here").click()'); await delay(100);
    assert(await ev('socialQa.alertCategory === "private" && socialQa.privateAlerts && document.getElementById("socialToolbar").textContent.includes("Private alerts: On")'));
    await ev(async () => {
      CrownlandsSocial.stop(); socialQa.api.getNotificationPermission = () => "granted";
      socialQa.api.registerPushNotifications = async () => { throw Error("Synthetic expired token"); };
      await CrownlandsSocial.start({ api: socialQa.api, uid: "alice", flagRenderer: FlagRenderer }); CrownlandsSocial.open("messages");
    }); await delay(80);
    assert(await ev('document.getElementById("socialToolbar").textContent.includes("Enable private alerts here")'));
    await ev('[...document.querySelectorAll("#socialToolbar button")].find(b=>b.textContent==="Turn private alerts off").click()'); await delay(100);
    assert(await ev('!socialQa.privateAlerts && socialQa.disabledCategory === "private" && document.getElementById("socialToolbar").textContent.includes("Private alerts: Off")'));
    await ev('CrownlandsSocial.stop()');
    await ev(async () => {
      socialQa.api.enablePushNotifications = () => new Promise(resolve => { socialQa.finishPermission = resolve; });
      await CrownlandsSocial.start({ api: socialQa.api, uid: "alice", flagRenderer: FlagRenderer }); CrownlandsSocial.open("messages");
      socialQa.preferencesBeforeSwitch = socialQa.calls.filter(c => c.action === "preference").length;
      [...document.querySelectorAll("#socialToolbar button")].find(b=>b.textContent==="Private alerts: Off").click();
      CrownlandsSocial.stop(); socialQa.finishPermission({ enabled: true });
    }); await delay(100);
    assert(await ev('socialQa.calls.filter(c=>c.action==="preference").length === socialQa.preferencesBeforeSwitch'), "A late permission response cannot change the next account's preference");
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(artifacts, "results.json"), JSON.stringify({ passed: true, layouts }, null, 2));
    console.log("Social browser interaction, text safety, account cleanup and responsive layout checks passed.");
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (browser) { if (!await waitForProcessExit(browser.browserProcess)) { browser.browserProcess.kill(); await waitForProcessExit(browser.browserProcess); } await removeBrowserProfile(browser.profilePath); } await server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
