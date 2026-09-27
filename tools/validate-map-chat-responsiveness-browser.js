"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const server = createMapBenchmarkServer(), address = await server.listen();
  const output = path.resolve(__dirname, "../release-artifacts/map-chat-responsiveness");
  fs.mkdirSync(output, { recursive: true });
  let browser, client;
  const results = [], errors = [];
  try {
    const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
    assert(executable, "Set CHROME_PATH to Chromium.");
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const ready = async expression => {
      for (let i = 0; i < 400; i++) { if (await evaluate(expression)) return; await wait(100); }
      throw Error(`Fixture did not become ready: ${expression}`);
    };
    const screenshot = async name => {
      const shot = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(output, name), Buffer.from(shot.data, "base64"));
    };
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: height < 600 });
      await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&mapPickerInput=1" });
      await ready('document.documentElement?.dataset.crownlandsBenchmarkReady === "true"');
      const map = await evaluate(`(async () => {
        const original = getIslandMapGridLayout;
        let layouts = 0;
        getIslandMapGridLayout = (...args) => { layouts++; return original(...args); };
        try {
          const start = performance.now();
          showIslandSwitcherModal();
          const openMs = performance.now() - start, openingLayouts = layouts;
          await new Promise(resolve => setTimeout(resolve, 500));
          const picker = getIslandMapPickerElement(), controller = getIslandMapPickerCameraController(picker);
          const layout = picker._islandMapLayout, camera = controller.getCamera();
          const observer = new MutationObserver(() => {});
          observer.observe(picker, { attributes: true, childList: true, subtree: true });
          layouts = 0;
          const panStart = performance.now();
          for (let i = 0; i < 60; i++) controller.renderNow({ ...camera, x: camera.x - i });
          const panMs = performance.now() - panStart, panChanges = observer.takeRecords();
          for (let i = 0; i < 60; i++) controller.renderNow(controller.getCamera());
          const stationaryWrites = observer.takeRecords().length;
          const zoomStart = performance.now();
          for (let i = 0; i < 30; i++) { controller.zoomTo(camera.zoom * (1 + i * .002), 200, 100); controller.flush(); }
          const zoomMs = performance.now() - zoomStart, gestureLayouts = layouts;
          const trim = picker.querySelector('.has-clan-tower .island-map-feature-trim');
          const stroke = trim ? parseFloat(getComputedStyle(trim, '::before').borderLeftWidth) * controller.getCamera().zoom : 5;
          observer.disconnect();
          const cards = picker.querySelectorAll('[data-island-region]').length;
          modal.close(); showIslandSwitcherModal();
          const freshLayout = getIslandMapPickerElement()._islandMapLayout !== layout;
          const inactive = WORLD_REGIONS.find(region => !isWorldRegionRuntimeActive(region.id));
          let expanded = false;
          if (inactive) {
            applyCoreExpansionRealmState({coreExpansion:{activeRegionIds:[...ACTIVE_WORLD_REGION_IDS, inactive.id]}});
            expanded = getIslandMapPickerElement().querySelectorAll('[data-island-region]').length === cards + 1;
          }
          return { openMs, openingLayouts, panMs, zoomMs, gestureLayouts, stationaryWrites, cards, stroke,
            panWrites: panChanges.length, panOnlyTransforms: panChanges.every(change => change.target.classList.contains('island-map-canvas-frame') && change.attributeName === 'style'),
            freshLayout, expanded };
        } finally { getIslandMapGridLayout = original; }
      })()`);
      assert.equal(map.openingLayouts, 1, "Opening repeatedly rebuilt the entire world grid.");
      assert.equal(map.gestureLayouts, 0, "Camera input rebuilt stable world geometry.");
      assert(map.panWrites > 0 && map.panWrites <= 60 && map.panOnlyTransforms, "Panning must only translate the camera frame.");
      assert.equal(map.stationaryWrites, 0, "An unchanged camera mutated the picker.");
      assert(map.freshLayout && map.cards >= 25, "Reopening must refresh the realm layout.");
      assert(map.expanded, "A live region update did not refresh the open picker geometry.");
      assert(Math.abs(map.stroke - 5) < 1, "The Tower indicator lost its zoom-stable width.");
      await screenshot(`map-${width}.png`);

      await client.send("Page.navigate", { url: address.url + "/docs/visual-qa/chat/index.html?mode=full" });
      await ready("Boolean(window.CrownlandsChatVisualQa)");
      const chat = await evaluate(`(async () => {
        const check = (condition, message) => { if (!condition) throw Error(message); };
        const controller = CrownlandsChatVisualQa.controller;
        const input = document.getElementById('chatMessageInput'), button = document.getElementById('chatSendBtn'), form = document.getElementById('chatComposer');
        const listeners = new Map(), calls = [];
        const api = {
          subscribeChatMessages(options, handlers) { listeners.set(options.channel, handlers); handlers.onMessages([], { initial: true, hasMore: false }); return () => listeners.delete(options.channel); },
          sendChatMessage(payload) { return new Promise((resolve, reject) => calls.push({ payload, resolve, reject })); }
        };
        const start = (uid = 'qa-ruler') => { controller.dispose({resetSession:true}); controller.start({api,uid,clanId:'qa-clan'}); controller.setMode('full'); };
        const submit = text => { input.value = text; input.dispatchEvent(new Event('input')); form.dispatchEvent(new Event('submit', {cancelable:true})); return calls.at(-1); };
        const settle = () => new Promise(resolve => setTimeout(resolve, 0));
        const message = (id, text, channel = 'global') => ({id,text,channel,channelId:channel === 'clan' ? 'qa-clan' : 'global',senderUid:'qa-ruler',senderDisplayName:'QA Ruler',createdAtMs:Date.now(),status:'visible'});
        const confirm = (call, value, extras = {}) => call.resolve({ok:true,replayed:false,messageId:value.id,message:value,retryAfterMs:3000,...extras});
        const rows = id => document.querySelectorAll('[data-message-id="'+id+'"]');
        start();
        const first = submit('Confirmed from the send reply');
        check(button.disabled && button.textContent === 'Sending...' && !input.disabled, 'Pending send must lock submission while leaving drafting usable.');
        form.dispatchEvent(new Event('submit',{cancelable:true})); check(calls.length === 1,'Pending send was duplicated.');
        check(!rows('ack-only').length,'Message appeared before server confirmation.');
        input.value = 'Next draft'; input.dispatchEvent(new Event('input'));
        const accepted = message('ack-only', first.payload.text);
        confirm(first, accepted); await settle();
        check(rows(accepted.id).length === 1,'Confirmed message waited for realtime delivery.');
        check(input.value === 'Next draft','Confirmation erased a newer draft.');
        check(button.disabled && controller.diagnostics().cooldownRemainingMs > 2500,'Three-second cooldown changed.');
        listeners.get('global').onMessages([accepted],{changes:[{type:'added',message:accepted}]});
        check(rows(accepted.id).length === 1,'Realtime echo duplicated the confirmed row.');
        const edited = {...accepted,text:'Authoritative edit'};
        listeners.get('global').onMessages([edited],{changes:[{type:'modified',message:edited}]});
        check(rows(accepted.id)[0].textContent.includes(edited.text),'Realtime edit lost to acknowledgement.');
        listeners.get('global').onMessages([],{changes:[{type:'removed',message:edited}]});
        check(!rows(accepted.id).length,'Moderated message remained visible.');

        start(); const race = submit('Moderated before response'), removed = message('removed',race.payload.text);
        listeners.get('global').onMessages([removed],{changes:[{type:'added',message:removed}]});
        listeners.get('global').onMessages([],{changes:[{type:'removed',message:removed}]});
        confirm(race, removed); await settle(); check(!rows(removed.id).length,'Late confirmation resurrected a moderated message.');

        start(); const replay = submit('Old receipt'); confirm(replay,message('replay','Old receipt'),{replayed:true}); await settle();
        check(!rows('replay').length,'Replayed receipt restored old content.');
        start(); const legacy = submit('Compatible old backend'); legacy.resolve({ok:true,messageId:'legacy',retryAfterMs:3000}); await settle();
        check(input.value === '' && !rows('legacy').length,'Legacy backend reply compatibility failed.');

        start(); const denied = submit('Keep failed draft'); denied.reject(new Error('Permission denied')); await settle();
        check(input.value === 'Keep failed draft' && !button.disabled && document.getElementById('chatStatus').textContent === 'Permission denied','Failed send lost its draft or remained locked.');
        const limited = submit('Keep failed draft'); limited.reject({details:{retryAfterMs:1800}}); await settle();
        check(button.disabled && controller.diagnostics().cooldownRemainingMs > 1400,'Server cooldown rejection was bypassed.');

        start(); const old = submit('Previous account'); start('next-ruler'); const next = submit('New account draft');
        confirm(old,message('old-account','Previous account')); await settle();
        check(!rows('old-account').length && input.value === 'New account draft' && button.textContent === 'Sending...','Stale reply mutated the new account or unlocked its request.');
        next.reject(new Error('Fixture finished')); await settle();

        start(); input.value = 'Draft across reconnect'; controller.dispose(); controller.start({api,uid:'qa-ruler',clanId:'qa-clan'});
        check(input.value === 'Draft across reconnect','Transient reconnect discarded an unsent draft.');

        start(); document.querySelector('[data-chat-channel="clan"]').click();
        const clan = submit('Private clan draft'); controller.updateClan('another-clan'); input.value='New clan draft';
        confirm(clan,message('old-clan','Private clan draft','clan')); await settle();
        check(!rows('old-clan').length && input.value === 'New clan draft','Stale clan acknowledgement leaked or erased a draft.');

        start(); document.querySelector('[data-chat-channel="global"]').click();
        const inaccessible = submit('Subscription revoked'); listeners.get('global').onError(new Error('Permission denied'));
        confirm(inaccessible,message('inaccessible','Subscription revoked')); await settle();
        check(!rows('inaccessible').length,'Confirmation bypassed a subscription access failure.');
        start(); const final = submit('Confirmed messages now appear without waiting for the listener.');
        confirm(final,message('final',final.payload.text)); await settle();
        await new Promise(resolve => setTimeout(resolve, 200));
        const dialog = document.getElementById('chatDialog');
        check(dialog.open && controller.diagnostics().mode === 'full' && rows('final').length === 1, 'Final confirmed conversation was not open.');
        const rect = dialog.getBoundingClientRect();
        check(rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1, 'Chat escaped the viewport.');
        return {acknowledgementWithoutListener:true,duplicateGuard:true,editableDraft:true,cooldownPreserved:true,realtimeEditsAndRemoval:true,moderationRace:true,legacyReply:true,sessionAndClanGuards:true};
      })()`);
      await screenshot(`chat-${width}.png`);
      results.push({width,height,map,chat});
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output,"results.json"), JSON.stringify({results,errors},null,2));
    console.log(JSON.stringify(results,null,2));
    console.log("Validated map camera work and confirmed chat delivery at desktop and two landscape sizes.");
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (browser) {
      if (!await waitForProcessExit(browser.browserProcess)) { browser.browserProcess.kill(); await waitForProcessExit(browser.browserProcess); }
      await removeBrowserProfile(browser.profilePath);
    }
    await server.close();
  }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
