"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const luminance = rgb => rgb.reduce((sum, value, i) => {
  const s = value / 255; return sum + (s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i];
}, 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);

async function navigationChecks() {
  const source = fs.readFileSync(path.join(__dirname, "../game.js"), "utf8");
  const body = source.slice(source.indexOf("async function focusSharedChatLocation("), source.indexOf("\nfunction queueOnlineIdentityRepair"));
  assert(body.startsWith("async function focusSharedChatLocation("));
  const calls = [], location = { kind: "city", id: "castle", regionId: "destination", x: 100, y: 200, name: "Castle", mapName: "Map" };
  let activeMap = "source", scope = "alice", target = { ...location }, failed = false;
  const c = { Error, Number, setTimeout: () => {}, zoom: 1, sendMode: true, selectedSourceId: "armed",
    getOnlineSessionRequestScope: () => scope, getActiveMapRegionId: () => activeMap,
    getChatController: () => ({ minimizeForLocation: () => calls.push("minimize") }),
    modal: { open: true, close: () => calls.push("close") },
    switchOnlineIsland: async region => { calls.push("switch"); if (failed) return false; activeMap = region; return true; },
    cityById: () => target, getCampTargetById: () => target, getMarauderById: () => target, getHoldingTowerVisual: () => target,
    selectCity: () => { assert.equal(c.sendMode, false); assert.equal(c.selectedSourceId, null); calls.push("select"); },
    selectRewardCamp: () => calls.push("camp"), selectMarauder: () => calls.push("marauder"), selectClanTowerOnMap: async () => calls.push("tower"),
    renderSelectionChangeNow: () => calls.push("clear"), centerOnWorldPoint: () => { calls.push("center"); return true; },
    worldToMapPoint: p => p, document: { createElement: () => ({ setAttribute() {}, style: {} }) },
    cityLayer: { append: () => calls.push("highlight") }, showToast: () => calls.push("toast"),
  };
  vm.createContext(c); vm.runInContext(body, c);
  await c.focusSharedChatLocation(location);
  assert.deepEqual(calls, ["minimize", "close", "switch", "select", "center", "highlight", "toast"]);
  target = { ...location, x: 900 }; calls.length = 0;
  await c.focusSharedChatLocation(location); assert(!calls.includes("select"), "Navigation followed a relocated target from a stale map cache");
  failed = true; activeMap = "source"; await assert.rejects(c.focusSharedChatLocation(location), /Could not open/);
  c.switchOnlineIsland = async () => { scope = "bob"; return true; }; calls.length = 0;
  await c.focusSharedChatLocation(location); assert(!calls.includes("center"), "Late map switch affected the replacement account");
}

(async () => {
  await navigationChecks();
  const executable = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Chromium required");
  const server = createMapBenchmarkServer(), address = await server.listen(), artifacts = path.resolve(__dirname, "../release-artifacts/chat-locations");
  fs.mkdirSync(artifacts, { recursive: true });
  let browser, client; const errors = [], layouts = [];
  try {
    browser = await startBrowserSession(executable); client = await CdpClient.connect(browser.targets.find(t => t.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable"); await client.send("Runtime.enable"); await client.send("DOM.enable"); await client.send("CSS.enable");
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const ev = async fn => {
      const response = await client.send("Runtime.evaluate", { expression: typeof fn === "function" ? `(${fn})()` : fn, awaitPromise: true, returnByValue: true });
      if (response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
      return response.result.value;
    };
    const checkPaint = async (selector, mini = false) => {
      const doc = await client.send("DOM.getDocument");
      const { nodeId } = await client.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector });
      assert(nodeId, selector);
      for (const pseudo of [[], ["hover"], ["focus-visible"]]) {
        await client.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: pseudo });
        const paint = await ev(`(() => {
          const link = document.querySelector(${JSON.stringify(selector)}), s = getComputedStyle(link);
          return { color: s.color, children: [...link.querySelectorAll("strong,small")].map(n => getComputedStyle(n).color),
            image: s.backgroundImage, background: s.backgroundColor, shadow: s.boxShadow, textShadow: s.textShadow, opacity: s.opacity };
        })()`);
        const ink = mini ? "rgb(244, 230, 197)" : "rgb(53, 43, 32)";
        assert.equal(paint.color, ink); assert(paint.children.every(c => c === ink), "Child text lost its readable ink");
        assert.equal(paint.image, "none"); assert.equal(paint.background, "rgba(0, 0, 0, 0)");
        assert.equal(paint.shadow, "none"); assert.equal(paint.textShadow, "none"); assert.equal(paint.opacity, "1");
        // Mini-chat's darkest gradient layer is 72% opaque; use its lightest
        // possible result over a white map as the conservative contrast bound.
        assert(contrast(paint.color.match(/\d+/g).map(Number), mini ? [107, 95, 88] : [237, 225, 194]) >= 4.5);
      }
      await client.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] });
      await ev(`document.querySelector(${JSON.stringify(selector)}).disabled = true`);
      const disabled = await ev(`(() => { const s = getComputedStyle(document.querySelector(${JSON.stringify(selector)}));
        return [s.opacity, s.backgroundImage, s.backgroundColor, s.color]; })()`);
      assert.deepEqual(disabled, ["1", "none", "rgba(0, 0, 0, 0)", mini ? "rgb(244, 230, 197)" : "rgb(53, 43, 32)"]);
      await ev(`document.querySelector(${JSON.stringify(selector)}).disabled = false`);
    };
    await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
    for (let i = 0; i < 300 && !await ev('document.documentElement?.dataset.crownlandsBenchmarkReady === "true"'); i++) await delay(100);
    assert(await ev('document.documentElement?.dataset.crownlandsBenchmarkReady === "true"'));
    await ev(async () => {
      __CROWNLANDS_BENCHMARK__.closeModal();
      window.locationQa = { calls: [], navigations: [], toasts: [], clan: "qa-clan", result: "available", failedSend: false };
      const q = locationQa;
      q.location = { version: 1, kind: "marauder", id: "marauder_123456789abc_01", regionId: "qa-map", spawnId: "spawn-a", name: "Marauder Lv. 40", mapName: "Southhaven", label: "Marauder" };
      q.player = { uid: "bob", name: "Bob", clanTag: "TEST", flag: {} };
      q.api = {
        getServerNowMs: () => Date.now(),
        sendChatMessage: async input => {
          q.calls.push(input);
          if (input.action === "resolveLocation") {
            if (q.defer) return new Promise(resolve => { q.resolve = resolve; });
            return { status: q.result, location: q.location };
          }
          if (q.failedSend) throw Error("Network unavailable. Retry.");
          return { ok: true, messageId: "a".repeat(40) };
        },
        social: async input => {
          q.calls.push(input);
          if (input.action === "status") return { enabled: true };
          if (input.action === "unread") return { count: 0 };
          if (input.action === "list") {
            if (q.contactsError) throw Error("Contacts unavailable. Retry.");
            const bob = { id: "c".repeat(40), peerUid: "bob", player: q.player, status: "accepted" };
            if (!q.largeContacts || input.kind !== "friends") return { rows: [bob], next: null };
            return input.cursor ? { rows: [{ ...bob, peerUid: "last", player: { name: "Last contact" } }], next: null }
              : { rows: [bob, ...Array.from({ length: 19 }, (_, i) => ({ ...bob, peerUid: "contact-" + i,
                player: { name: i === 0 ? "<b>A very long ruler name for a narrow landscape screen</b>" : "Ruler " + (i + 2) } }))], next: { at: 1, id: "a".repeat(40) } };
          }
          if (input.action === "history") return { relation: { id: "c".repeat(40), peerUid: "bob", canSend: true, conversation: "accepted" }, player: q.player,
            messages: [{ id: "d".repeat(40), sequence: 1, senderUid: "bob", senderDisplayName: "Bob", text: "Meet here", location: q.location, createdAtMs: Date.now(), expiresAtMs: Date.now() + 86400000 }] };
          if (input.action === "resolveLocation") return { status: q.result, location: q.location };
          return { ok: true };
        },
        subscribeSocialSignals: () => () => {},
        subscribeChatMessages: (options, handlers) => {
          queueMicrotask(() => handlers.onMessages(Array.from({ length: 24 }, (_, i) => ({ id: i.toString(16).padStart(40, "a"), senderUid: "bob", senderDisplayName: "Bob",
            text: i % 2 ? "Meet here." : "", location: i === 0 ? undefined : q.location, createdAtMs: Date.now() - (24 - i) * 1000,
            status: "visible", channel: options.channel, channelId: options.channel === "clan" ? "qa-clan" : "global" })), { initial: true, hasMore: false }));
          return () => {};
        }, loadOlderChatMessages: async () => [],
      };
      const chat = CrownlandsChat.init(); chat.dispose(); chat.start({ api: q.api, uid: "alice", clanId: "qa-clan" }); chat.setMode("full");
      CrownlandsChatLocations.start({ uid: "alice", api: q.api, getClanId: () => q.clan,
        onToast: text => q.toasts.push(text), navigate: async location => { q.navigations.push(location); chat.minimizeForLocation(); } });
      await CrownlandsSocial.start({ api: q.api, uid: "alice", flagRenderer: FlagRenderer });
    });
    await delay(150);
    await ev(() => {
      CrownlandsChat.init().setMode("closed");
      showCityInfoModal(playerCities()[0].id);
    }); await delay(150);
    assert(await ev('Boolean(document.querySelector("#modal [data-share-location]"))'), "The city details panel has no share entry");
    await ev('document.querySelector("#modal [data-share-location]").click()');
    assert(await ev('Boolean(document.querySelector(".chat-location-share[open]"))'));
    await ev(() => { document.querySelector(".chat-location-share").close(); __CROWNLANDS_BENCHMARK__.closeModal(); CrownlandsChat.init().setMode("full"); });
    assert.equal(await ev('locationQa.calls.filter(c => c.action === "resolveLocation").length'), 0, "Rendering history resolved targets eagerly");
    for (const [width, height] of [[1440, 900], [844, 390], [736, 414], [568, 320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      await ev(() => { CrownlandsChat.init().setMode("full"); document.querySelector('[data-chat-channel="global"]').click(); });
      await delay(80);
      const layout = await ev(() => {
        const row = document.querySelectorAll(".chat-message")[2], link = row.querySelector(".chat-location-link"), text = row.querySelector(".chat-message-text");
        const b = link.getBoundingClientRect(), list = document.getElementById("chatMessages") || row.parentElement, l = list.getBoundingClientRect();
        return { font: getComputedStyle(link).fontSize, textFont: getComputedStyle(text).fontSize, rowHeight: row.getBoundingClientRect().height,
          within: b.left >= l.left && b.right <= l.right + 1, overflow: list.scrollWidth > list.clientWidth + 1, links: row.querySelectorAll(".chat-location-link").length };
      });
      assert.equal(layout.font, layout.textFont); assert(layout.within && !layout.overflow); assert.equal(layout.links, 1); assert(layout.rowHeight < 60, "Compact shared location became a large card"); layouts.push({ width, height, ...layout });
      await checkPaint(".chat-message .chat-location-link");
      await client.send("Page.captureScreenshot", { format: "png" }).then(result => fs.writeFileSync(path.join(artifacts, `chat-readable-${width}.png`), Buffer.from(result.data, "base64")));
      await ev('document.querySelector(\'[data-chat-channel="clan"]\').click()'); await delay(50);
      await checkPaint(".chat-message .chat-location-link");
      await ev('CrownlandsChat.init().setMode("quick")'); await delay(50);
      await checkPaint("#quickChat .chat-location-link", true);
      await ev(() => { CrownlandsChat.init().setMode("full"); document.querySelector('[data-chat-channel="global"]').click(); });
      await ev(() => CrownlandsChatLocations.open(locationQa.location));
      await delay(50);
      const share = await ev(() => { const d = document.querySelector(".chat-location-share"), r = d.getBoundingClientRect(); return { inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, overflow: d.scrollWidth > d.clientWidth + 1,
        label: getComputedStyle(d.querySelector("label")).color, selected: getComputedStyle(d.querySelector('[aria-pressed="true"]')).backgroundColor,
        unselected: getComputedStyle(d.querySelector('[aria-pressed="false"]')).backgroundColor }; });
      assert(share.inside && !share.overflow);
      assert.equal(share.label, "rgb(60, 52, 36)"); assert.notEqual(share.selected, share.unselected, "Destination selection must be visible");
      await client.send("Page.captureScreenshot", { format: "png" }).then(result => fs.writeFileSync(path.join(artifacts, `share-${width}.png`), Buffer.from(result.data, "base64")));
      await ev(() => { locationQa.largeContacts = true; document.querySelector('[data-channel="private"]').click(); }); await delay(60);
      assert.equal(await ev('document.querySelectorAll(".chat-location-contact-list input").length'), 20, "Friends/conversations must deduplicate");
      assert.equal(await ev('document.querySelectorAll(".chat-location-share select").length'), 0, "Recipient selection must not open a native popup");
      assert.equal(await ev('document.querySelectorAll(".chat-location-recipient b").length'), 0, "Recipient names must remain inert text");
      assert.equal(await ev('document.querySelectorAll(".chat-location-recipient input:checked").length'), 0, "A recipient must be explicitly chosen");
      const fullscreenBefore = await ev('Boolean(document.fullscreenElement)');
      const point = await ev(() => {
        const label = document.querySelector(".chat-location-recipient"); label.scrollIntoView({ block: "nearest" });
        const r = label.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      if (height < 600) {
        await client.send("Emulation.setTouchEmulationEnabled", { enabled: true });
        await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...point, id: 1 }] });
        await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await client.send("Emulation.setTouchEmulationEnabled", { enabled: false });
      } else {
        await client.send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
        await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
      }
      assert.equal(await ev('document.querySelector(".chat-location-recipient input:checked")?.value'), "bob", "Tapping the name row must select it");
      assert.equal(await ev('Boolean(document.fullscreenElement)'), fullscreenBefore, "Recipient taps must not trigger fullscreen entry over the dialog");
      await ev('document.querySelector(".chat-location-recipients button").click()'); await delay(60);
      assert.equal(await ev('document.querySelectorAll(".chat-location-contact-list input").length'), 21);
      assert.equal(await ev('document.querySelector(".chat-location-recipient input:checked").value'), "bob", "Pagination lost selection");
      await delay(120);
      const pickerLayout = await ev(() => {
        const d = document.querySelector(".chat-location-share"), list = d.querySelector(".chat-location-contact-list"),
          button = d.querySelector('button[type="submit"]'), b = button.getBoundingClientRect(),
          footer = d.querySelector("footer").getBoundingClientRect(), r = d.getBoundingClientRect();
        return { scrolls: list.scrollHeight > list.clientHeight, overflow: d.scrollWidth > d.clientWidth,
          modal: d.matches(":modal") && r.width > 0,
          footerHit: button.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)),
          rowHeight: list.querySelector("label").getBoundingClientRect().height,
          radioHeight: list.querySelector("input").getBoundingClientRect().height,
          footerVisible: footer.top >= r.top && footer.bottom <= r.bottom && footer.bottom <= innerHeight,
          selectedVisible: Boolean(d.querySelector(".chat-location-recipient.is-selected")) };
      });
      assert(pickerLayout.modal && pickerLayout.footerHit && pickerLayout.scrolls && !pickerLayout.overflow && pickerLayout.footerVisible && pickerLayout.selectedVisible, JSON.stringify(pickerLayout));
      assert(pickerLayout.rowHeight <= 40 && pickerLayout.radioHeight <= 18, "Recipient rows inherited oversized input styling");
      await client.send("Page.captureScreenshot", { format: "png" }).then(result => fs.writeFileSync(path.join(artifacts, `recipients-${width}.png`), Buffer.from(result.data, "base64")));
      await ev('document.querySelector(".chat-location-share").close()');
    }
    await ev(() => { locationQa.largeContacts = false; CrownlandsChatLocations.open(locationQa.location); locationQa.contactsError = true; document.querySelector('[data-channel="private"]').click(); }); await delay(60);
    assert((await ev('document.querySelector(".chat-location-recipients small").textContent')).includes("unavailable"));
    await ev(() => { locationQa.contactsError = false; document.querySelector(".chat-location-recipients button").click(); }); await delay(60);
    await ev('document.querySelector(".chat-location-recipient input").focus()');
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
    assert.equal(await ev('document.querySelector(".chat-location-recipient input:checked")?.value'), "bob", "Keyboard selection failed");
    await ev('document.querySelector(".chat-location-share").close()');
    await ev(() => {
      const list = document.getElementById("chatMessageList"); list.scrollTop = 0;
      document.getElementById("chatMessageInput").value = "Unsent global draft";
      locationQa.top = list.scrollTop;
      document.querySelector(".chat-message .chat-location-link").click();
    }); await delay(80);
    await ev('CrownlandsChat.init().setMode("full")'); await delay(80);
    assert(await ev('document.getElementById("chatMessageList").scrollTop === locationQa.top'));
    assert.equal(await ev('document.getElementById("chatMessageInput").value'), "Unsent global draft");
    // Failed sends retain the request identity; changing destination changes it.
    await ev(() => {
      locationQa.failedSend = true; CrownlandsChatLocations.open(locationQa.location);
      document.querySelector(".chat-location-share textarea").value = "Meet at the boss";
      document.querySelector(".chat-location-share form").requestSubmit();
    }); await delay(80);
    assert((await ev('document.querySelector(".chat-location-status").textContent')).includes("Network"));
    await ev(() => { locationQa.failedSend = false; document.querySelector(".chat-location-share form").requestSubmit(); }); await delay(80);
    assert(await ev(() => { const sent = locationQa.calls.filter(c => c.location); return sent.length === 2 && sent[0].requestId === sent[1].requestId && !("name" in sent[0].location); }));
    await ev(() => { CrownlandsChatLocations.open(locationQa.location); document.querySelector('[data-channel="private"]').click(); }); await delay(80);
    await ev('document.querySelector(".chat-location-share form").requestSubmit()');
    assert((await ev('document.querySelector(".chat-location-status").textContent')).includes("Choose who"));
    await ev(() => { document.querySelector(".chat-location-recipient").click(); document.querySelector(".chat-location-share form").requestSubmit(); }); await delay(80);
    assert(await ev('locationQa.calls.some(c => c.action === "send" && c.peerUid === "bob" && c.location && c.text === "")'));
    await ev(() => { CrownlandsChatLocations.open(locationQa.location); document.querySelector('[data-channel="clan"]').click(); locationQa.clan = "changed"; document.querySelector(".chat-location-share form").requestSubmit(); });
    assert((await ev('document.querySelector(".chat-location-status").textContent')).includes("clan changed"));
    await ev('document.querySelector(".chat-location-share").close()');

    await ev(() => { CrownlandsSocial.open("messages"); }); await delay(80);
    await ev('document.querySelector(".social-conversation").click()'); await delay(80);
    await checkPaint(".social-message .chat-location-link");
    await ev(() => { document.querySelector(".social-compose textarea").value = "Unsent private draft"; document.querySelector(".social-message .chat-location-link").click(); }); await delay(80);
    assert(await ev('locationQa.calls.some(c => c.action === "resolveLocation" && c.conversationId === "c".repeat(40))'));
    await ev('CrownlandsChat.init().setMode("full")'); await delay(100);
    assert.equal(await ev('document.querySelector(".social-compose textarea").value'), "Unsent private draft");
    assert.equal(await ev('CrownlandsSocial.diagnostics().conversationId'), "c".repeat(40));
    for (const status of ["moved", "old-season", "unavailable"]) {
      const before = await ev('locationQa.navigations.length');
      await ev(`locationQa.result = ${JSON.stringify(status)}; document.querySelector(".social-message .chat-location-link").click()`);
      await delay(50); assert.equal(await ev('locationQa.navigations.length'), before);
    }
    await ev(() => {
      document.querySelector('[data-chat-channel="global"]').click(); locationQa.defer = true;
      document.querySelector(".chat-message .chat-location-link").click();
    }); await delay(50);
    const before = await ev('locationQa.navigations.length');
    await ev(() => { CrownlandsChatLocations.stop(); locationQa.resolve({ status: "available", location: locationQa.location }); }); await delay(50);
    assert.equal(await ev('locationQa.navigations.length'), before);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(artifacts, "results.json"), JSON.stringify({ passed: true, layouts }, null, 2));
    console.log("Location sharing browser: compact desktop/landscape rows, picker, recipient, retries, stale session, safe navigation and private draft preservation passed.");
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (browser) { if (!await waitForProcessExit(browser.browserProcess)) { browser.browserProcess.kill(); await waitForProcessExit(browser.browserProcess); } await removeBrowserProfile(browser.profilePath); }
    await server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
