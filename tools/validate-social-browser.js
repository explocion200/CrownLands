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
    const click = async selector => {
      const point = await ev(`(() => { const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return ${selector === ".social-conversation" ? "{x:r.right-3,y:r.bottom-3}" : "{x:r.x+r.width/2,y:r.y+r.height/2}"}; })()`);
      await client.send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
      await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
      await delay(100);
    };
    await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
    for (let i = 0; i < 300 && !await ev('document.documentElement?.dataset.crownlandsBenchmarkReady === "true"'); i++) await delay(100);
    assert(await ev('document.documentElement?.dataset.crownlandsBenchmarkReady === "true"'));
    await ev(async () => {
      __CROWNLANDS_BENCHMARK__.closeModal();
      window.socialQa = { calls: [], messages: [{ id: "b".repeat(40), sequence: 1, senderUid: "bob", senderDisplayName: "Bob", text: "A private message <img src=x onerror=alert(1)> — welcome to the realm.", createdAtMs: Date.now(), expiresAtMs: Date.now() + 90 * 86400000 }], unread: 1 };
      socialQa.profileOpens = 0;
      addEventListener("crownlands:chat-player-profile", () => socialQa.profileOpens++);
      socialQa.messages.push(...Array.from({ length: 19 }, (_, i) => ({ id: "fixture-" + i, sequence: i + 2, senderUid: i % 2 ? "alice" : "bob", senderDisplayName: i % 2 ? "Alice" : "Bob", text: "Private conversation line " + (i + 2) + ": the north road is clear. Meet at the castle after your troops return.", createdAtMs: Date.now() + i, expiresAtMs: Date.now() + 90 * 86400000 })));
      const player = { uid: "bob", name: "Bob of Stoneward", clanTag: "CODE", flag: { primary: "#336633", secondary: "#eee1b9", pattern: "solid", symbol: "crown" } };
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
        if (input.action === "send") { socialQa.messages.push({ id: "c".repeat(40), sequence: socialQa.messages.length + 1, senderUid: "alice", senderDisplayName: "Alice", text: input.text, createdAtMs: Date.now(), expiresAtMs: Date.now() + 90 * 86400000 }); return { ok: true }; }
        return { ok: true };
      }, subscribeSocialSignals: callback => { socialQa.signal = callback; return () => {}; }, registerPushNotifications: async () => ({}), enablePushNotifications: async options => { socialQa.alertCategory = options.category; return { enabled: true }; }, disablePushNotifications: async options => { socialQa.disabledCategory = options.category; }, getNotificationPermission: () => "default", translateChatMessages: async () => ({ translations: [{ id: "b".repeat(40), text: "Translated fixture" }] }) };
      const globalChat = CrownlandsChat.init(); globalChat.dispose({ resetSession: true });
      globalChat.start({ uid: "alice", clanId: "fixture-clan", api: {
        getServerNowMs: () => Date.now(),
        subscribeChatMessages(options, handlers) { queueMicrotask(() => handlers.onMessages([{ id: "global-density", senderUid: "bob", senderDisplayName: "Bob", text: "Meet at the castle.", createdAtMs: Date.now(), status: "visible", channel: options.channel }], { initial: true, hasMore: false })); return () => {}; },
        loadOlderChatMessages: async () => []
      } }); globalChat.setMode("full");
      await CrownlandsSocial.start({ api: socialQa.api, uid: "alice", flagRenderer: FlagRenderer }); CrownlandsSocial.open("friends");
    });
    await delay(150);
    assert((await ev('document.querySelector(".social-list").innerText')).includes("Online"));
    assert(await ev('Boolean(document.querySelector(".social-flag svg"))'), "Player flags use the shared renderer");
    for (const [width, height] of [[1440, 900], [1280, 590], [1024, 480], [932, 430], [844, 390], [568, 320], [390, 360], [390, 844]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      let sharedShell;
      for (const channel of ["global", "clan", "messages", "friends", "global"]) {
        const selector = channel === "global" || channel === "clan" ? `[data-chat-channel="${channel}"]` : channel === "messages" ? "#socialMessagesTab" : "#socialFriendsTab";
        await ev(`document.querySelector(${JSON.stringify(selector)}).click()`); await delay(100);
        const shell = await ev(() => {
          const measure = element => {
            const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, font: style.font, padding: style.padding };
          };
          return { frame: measure(document.getElementById("chatDialog")), header: measure(document.querySelector(".chat-header")), title: measure(document.getElementById("chatTitle")), tabs: [...document.querySelectorAll(".chat-tabs button")].map(measure) };
        });
        if (!sharedShell) sharedShell = shell;
        assert.deepEqual(shell, sharedShell, `Chat frame, header and all four tabs must stay the same on ${channel} at ${width}x${height}`);
        assert(shell.tabs.every(tab => tab.height >= 44 && tab.x >= shell.frame.x && tab.x + tab.width <= shell.frame.x + shell.frame.width), "Every chat tab must remain visible and tappable");
        if (channel === "friends" || channel === "messages") {
          const typography = await ev(() => {
            const body = getComputedStyle(document.querySelector(".social-panel")), globalBody = getComputedStyle(document.querySelector(".chat-message-text"));
            const name = getComputedStyle(document.querySelector(".social-player strong")), globalName = getComputedStyle(document.querySelector(".chat-message-sender"));
            return { body: body.fontSize, globalBody: globalBody.fontSize, name: name.font, globalName: globalName.font };
          });
          assert.equal(typography.body, typography.globalBody, "Social content must match Global/Clan text size");
          assert.equal(typography.name, typography.globalName, "Social player names must match Global/Clan typography");
        }
      }
      await ev('CrownlandsSocial.open("friends")'); await delay(100);
      await client.send("Page.captureScreenshot", { format: "png" }).then(shot => fs.writeFileSync(path.join(artifacts, "friends-" + width + ".png"), Buffer.from(shot.data, "base64")));
      await ev('Array.from(document.querySelectorAll(".social-list button")).find(b=>b.textContent==="Message").click()'); await delay(120);
      await ev('socialQa.unread=1;CrownlandsSocial.open("messages")'); await delay(100);
      assert(await ev('document.querySelector("button.social-conversation") && !document.querySelector(".social-conversation button,.social-conversation a") && ![...document.querySelectorAll(".social-list button")].some(b=>b.textContent==="Open")'), "Conversation must be one native button, without nested profile actions or Open");
      assert(await ev('document.querySelector(".social-conversation").getBoundingClientRect().height <= 80'), "Conversation list row is not compact");
      await client.send("Page.captureScreenshot", { format: "png" }).then(shot => fs.writeFileSync(path.join(artifacts, `conversations-${width}x${height}.png`), Buffer.from(shot.data, "base64")));
      await click(".social-conversation .social-player strong");
      const layout = await ev(() => {
        const d = document.getElementById("chatDialog").getBoundingClientRect(), log = document.querySelector(".social-log").getBoundingClientRect(), form = document.querySelector(".social-compose").getBoundingClientRect();
        return { dialog: { x: d.x, y: d.y, width: d.width, height: d.height }, logHeight: log.height, composerInside: form.bottom <= d.bottom && form.left >= d.left && form.right <= d.right,
          overflow: document.getElementById("socialPanel").scrollWidth > document.getElementById("socialPanel").clientWidth + 1, injectedImage: Boolean(document.querySelector(".social-message img")), text: document.querySelector(".social-message p").textContent,
          sidebar: document.querySelector(".social-list").getBoundingClientRect().width, threadWidth: document.querySelector(".social-thread").getBoundingClientRect().width, workspaceWidth: document.querySelector(".social-workspace").clientWidth,
          textSize: parseFloat(getComputedStyle(document.querySelector(".social-message p")).fontSize), globalTextSize: parseFloat(getComputedStyle(document.querySelector("#chatMessageList .chat-message-text")).fontSize), inputSize: parseFloat(getComputedStyle(document.querySelector(".social-compose textarea")).fontSize),
          scrollable: document.querySelector(".social-log").scrollHeight > log.height,
          latestVisible: document.querySelector(".social-log").scrollTop + log.height >= document.querySelector(".social-log").scrollHeight - 2,
          targets: [...document.querySelectorAll(".social-thread-heading button,.social-compose button")].every(button => button.getBoundingClientRect().height >= 44) };
      });
      layouts.push({ width, height, ...layout });
      await client.send("Page.captureScreenshot", { format: "png" }).then(shot => fs.writeFileSync(path.join(artifacts, `messages-${width}x${height}.png`), Buffer.from(shot.data, "base64")));
      const minHistoryHeight = height <= 360 ? 90 : height <= 480 ? 140 : height <= 600 ? 240 : 350;
      assert(layout.composerInside && layout.logHeight >= minHistoryHeight && !layout.overflow && !layout.injectedImage && layout.targets && layout.textSize === layout.globalTextSize && layout.textSize >= 12 && layout.inputSize >= 16 && layout.scrollable && layout.latestVisible, JSON.stringify({ width, height, ...layout }));
      if (width <= 900 || height <= 600) assert(layout.sidebar === 0 && layout.threadWidth >= layout.workspaceWidth - 1, "Phone/short-window thread must use the full width");
      else assert(layout.sidebar <= 240 && layout.threadWidth > layout.workspaceWidth * .74, "Desktop sidebar takes too much conversation space");
      assert(layout.text.includes("<img"));
      await ev('socialQa.savedMessages=socialQa.messages;socialQa.messages=socialQa.messages.slice(0,1);CrownlandsSocial.open("messages")'); await delay(100);
      await click(".social-conversation");
      const singleMessageHeight = await ev('document.querySelector(".social-log").getBoundingClientRect().height');
      assert(singleMessageHeight >= minHistoryHeight, "A short conversation collapsed the history at " + width + "x" + height + ": " + singleMessageHeight);
      layouts.at(-1).singleMessageHeight = singleMessageHeight;
      await client.send("Page.captureScreenshot", { format: "png" }).then(shot => fs.writeFileSync(path.join(artifacts, `short-conversation-${width}x${height}.png`), Buffer.from(shot.data, "base64")));
      await ev(() => {
        const base = socialQa.savedMessages[0];
        socialQa.messages = [
          { ...base, text: "Meet at the castle." },
          { ...base, id: "long-name", senderDisplayName: "StonewardWithoutAnySpaces", text: "Ready when you are." },
          { ...base, id: "long-text", text: "W".repeat(120) },
          { ...base, id: "multiline", text: "First line\nSecond line\nمرحبا من القلعة" }
        ];
        CrownlandsSocial.open("messages");
      }); await delay(100); await click(".social-conversation");
      const compact = await ev(() => {
        const rows = [...document.querySelectorAll(".social-message")];
        const firstLine = node => { const range = document.createRange(); range.selectNodeContents(node); return range.getClientRects()[0]; };
        const globalRow = getComputedStyle(document.querySelector("#chatMessageList .chat-message")), privateRow = getComputedStyle(rows[0]);
        const globalText = getComputedStyle(document.querySelector("#chatMessageList .chat-message-text")), privateText = getComputedStyle(rows[0].querySelector("p"));
        return { shortHeight: rows[0].getBoundingClientRect().height,
          inline: rows.every(row => { const name = row.querySelector("strong"), text = row.querySelector(":scope>p"); return Math.abs(firstLine(name).top - firstLine(text).top) < 4 && name.getBoundingClientRect().right <= text.getBoundingClientRect().left; }),
          globalDensity: privateText.fontSize === globalText.fontSize && privateText.lineHeight === globalText.lineHeight && parseFloat(privateRow.paddingTop) <= parseFloat(globalRow.paddingTop) && rows[0].getBoundingClientRect().height <= 25 + parseFloat(globalRow.paddingTop) + parseFloat(globalRow.paddingBottom),
          contained: rows.every(row => { const text = row.querySelector(":scope>p"), time = row.querySelector("time").getBoundingClientRect(), menu = row.querySelector("summary").getBoundingClientRect(); return row.scrollWidth <= row.clientWidth && text.scrollWidth <= text.clientWidth && time.left >= text.getBoundingClientRect().right && menu.left >= time.right && Math.abs(menu.top - time.top) < 1; }),
          menuTargets: rows.every(row => row.querySelector("summary").getBoundingClientRect().width >= 24 && row.querySelector("summary").getBoundingClientRect().height >= 24),
          fullTimestamp: rows.every((row, index) => { const time = row.querySelector("time"), expected = socialQa.messages[index].createdAtMs; return Date.parse(time.dateTime) === expected && time.title.includes(String(new Date(expected).getFullYear())) && time.getAttribute("aria-label") === time.title; }),
          multiline: rows[3].querySelector("p").innerText.includes("\n") && rows[3].querySelector("p").dir === "auto" };
      });
      assert(compact.shortHeight <= 39 && compact.globalDensity && compact.inline && compact.contained && compact.menuTargets && compact.fullTimestamp && compact.multiline, JSON.stringify({ width, height, compact }));
      layouts.at(-1).compact = compact;
      await ev('document.querySelector(".social-log").scrollTop=0');
      await client.send("Page.captureScreenshot", { format: "png" }).then(shot => fs.writeFileSync(path.join(artifacts, `inline-messages-${width}x${height}.png`), Buffer.from(shot.data, "base64")));
      await click(".social-message-menu summary");
      assert(await ev('document.querySelector(".social-message-menu").open'), "Message menu must open using its visible target");
      await ev('[...document.querySelectorAll(".social-message:first-child button")].find(b=>b.textContent==="Report").click()');
      assert(await ev(() => {
        const row = document.querySelector(".social-message"), r = row.getBoundingClientRect(), menu = row.querySelector(".social-row-actions").getBoundingClientRect(), report = row.querySelector(".social-report").getBoundingClientRect(), text = row.querySelector(":scope>p").getBoundingClientRect();
        return menu.top >= text.bottom && menu.top >= row.querySelector("summary").getBoundingClientRect().bottom && report.top >= menu.bottom && report.left >= r.left && report.right <= r.right && row.scrollWidth <= row.clientWidth;
      }), "Expanded message actions/report must follow the text without clipping or overlap");
      await ev('[...document.querySelectorAll(".social-report button")].find(b=>b.textContent==="Cancel").click()');
      await click(".social-message-menu summary");
      assert(await ev('!document.querySelector(".social-message-menu").open && !document.querySelector(".social-report")'), "Message controls must close without leaving extra space");
      await ev('socialQa.messages=socialQa.savedMessages');
    }
    for (const selector of [".social-conversation .social-flag", ".social-conversation .social-player small", ".social-conversation .social-contact-meta", ".social-conversation .social-unread", ".social-conversation"]) {
      await ev('socialQa.unread=1;CrownlandsSocial.open("messages")'); await delay(100); await click(selector);
      assert(await ev('!document.querySelector(".social-thread").hidden && CrownlandsSocial.diagnostics().conversationId === "a".repeat(40)'));
    }
    for (const key of ["Enter", " "]) {
      await ev('CrownlandsSocial.open("messages")'); await delay(100);
      await ev('document.querySelector(".social-conversation").focus()');
      assert(await ev('document.activeElement.matches(".social-conversation")'));
      await client.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key === "Enter" ? "Enter" : "Space", windowsVirtualKeyCode: key === "Enter" ? 13 : 32, text: key === "Enter" ? "\r" : " " });
      await client.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key === "Enter" ? "Enter" : "Space", windowsVirtualKeyCode: key === "Enter" ? 13 : 32 }); await delay(100);
      assert(await ev('!document.querySelector(".social-thread").hidden'), "Keyboard activation must open the conversation: " + JSON.stringify(key));
    }
    assert.equal(await ev('socialQa.profileOpens'), 0, "Conversation-row clicks opened a player profile");
    await click(".social-thread-heading button");
    assert(await ev('document.querySelector(".social-thread").hidden && document.querySelector(".social-list").getBoundingClientRect().width > 0'), "Back must restore the list on phones");
    await ev('[...document.querySelectorAll("#socialToolbar button")].find(b=>b.textContent==="Requests").click()'); await delay(100);
    await click(".social-conversation .social-player strong");
    assert.equal(await ev('socialQa.profileOpens'), 0, "A message-request row opened a profile");
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
    assert(await ev('document.querySelector(".composer-panel").getBoundingClientRect().height > 0 && document.getElementById("chatHistory").getBoundingClientRect().height > 100'), "Returning to Global must restore its history and composer");
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
