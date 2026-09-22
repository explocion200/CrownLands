"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const artifacts = path.resolve(__dirname, "../release-artifacts/clan-tower-orders");

async function main() {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Set CHROME_PATH to Chromium.");
  fs.mkdirSync(artifacts, { recursive: true });
  const server = createMapBenchmarkServer(), address = await server.listen();
  let browser, client;
  const errors = [];
  try {
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all(["Page.enable", "Runtime.enable"].map(method => client.send(method)));
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const ready = async expression => {
      for (let i = 0; i < 240; i++) { if (await evaluate(expression)) return; await delay(50); }
      throw Error(`Timed out: ${expression}`);
    };
    const close = async () => { await evaluate("if(modal.open) modal.close()"); await delay(60); };
    await client.send("Page.navigate", { url: `${address.url}/__benchmark__/?scenario=A&visualMarches=0` });
    await ready('window.__CROWNLANDS_BENCHMARK__?.getStatus().status === "ready"');
    await delay(300);
    await evaluate(`(async () => {
      if (modal.open) modal.close();
      await ensureRegionDefinitionLoaded(HOLDING_TOWER_DEFINITIONS[0].regionId);
      centerOnRegion(HOLDING_TOWER_DEFINITIONS[0].regionId); renderAll();
      const api = getOnlineApi();
      const tower = HOLDING_TOWER_UI.createQaSnapshot(getHoldingTowerVisual(HOLDING_TOWER_DEFINITIONS[0].id), 'owner');
      tower.ownershipRevision = 0;
      state.clanId = tower.clanId;
      const city = playerCities().find(city => city.troops > 0);
      const enemy = state.cities.find(city => city.owner === 'neutral' && !isStronghold(city) && !isProtectedMainCity(city));
      await ensureRegionDefinitionLoaded(getCityRegionId(city));
      await ensureRegionDefinitionLoaded(getCityRegionId(enemy));
      window.towerOrderQa = { tower, city, enemy, scout: null, orders: [], pendingRoutes: [], fail: false };
      getOwnedRegularCityCountForDisplay = () => 1;
      getScoutReportForTarget = () => towerOrderQa.scout;
      supportsAuthoritativeArmyRoutes = () => false;
      // Deterministic worker output exercises preview completion and cancellation;
      // travel/combat calculations and all order handlers remain the game implementation.
      findRouteAsync = (source, target) => new Promise(resolve => towerOrderQa.pendingRoutes.push({ source, target, resolve }));
      getOnlineApi = () => ({ ...api,
        getHoldingTowerState: async () => ({ worldActive: true, towers: [towerOrderQa.tower] }),
        subscribeHoldingTowerState: () => () => {},
        sendHoldingTowerArmyOrder: async payload => {
          towerOrderQa.orders.push(payload);
          if (towerOrderQa.fail) throw Error('Fixture dispatch rejected');
          return new Promise(resolve => { towerOrderQa.finishSend = resolve; });
        }
      });
      towerOrderQa.open = mode => {
        if (modal.open) modal.close();
        clearSelection(false);
        ensureHoldingTowerMapSubscriptions();
        holdingTowerSnapshots.set(tower.id, { ...tower });
        const candidate = mode === 'attack-from' ? enemy : city;
        if (mode === 'reinforce') {
          showHoldingTowerOrderComposer(tower, mode, candidate);
          modal.showModal(); updateHoldingTowerOrderAvailability();
        } else {
          beginHoldingTowerSendMode(tower);
          selectedTargetId = candidate.id;
          showTroopSliderModal(getTroopOrderSourceById(tower.id), candidate);
        }
        toast.classList.remove('visible');
      };
      towerOrderQa.setAmount = amount => {
        const input = modalBody.querySelector('[data-tower-order-troops]');
        if (!input) throw Error('Tower order did not open: '+JSON.stringify({title:modalTitle.textContent,toast:toast.textContent,source:selectedSourceId,context:holdingTowerSendContext,target:selectedTargetId,snapshot:holdingTowerSnapshots.get(towerOrderQa.tower.id),sourceValue:getTroopOrderSourceById(towerOrderQa.tower.id),html:modalBody.innerHTML.slice(0,250)}));
        input.value = String(amount); input.dispatchEvent(new Event('input', {bubbles:true}));
      };
    })()`);
    for (const [width, height] of [[1440,900], [844,390], [568,320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: height < 600 });
      for (const mode of ["attack-from", "withdraw", "reinforce"]) {
        await close();
        await evaluate(`towerOrderQa.scout = null; towerOrderQa.open(${JSON.stringify(mode)}); towerOrderQa.setAmount(1003)`);
        await evaluate(`(() => {
          const {source,target,resolve}=towerOrderQa.pendingRoutes.at(-1);
          resolve({points:[{x:source.x,y:source.y},{x:target.x,y:target.y}],length:1000});
        })()`);
        const snapshot = await evaluate(`(() => {
          const form = modalBody.querySelector('[data-tower-order-form]');
          const input = form.querySelector('input[type=range]');
          const expectedMax = ${mode === "reinforce"} ? towerOrderQa.city.troops : towerOrderQa.tower.ownStationedTroops;
          const columns = form.querySelector('.order-columns');
          return { kind: form.dataset.orderKind, amount: form.querySelector('#troopSliderAmount').textContent,
            max: Number(input.max), expectedMax, powerRows: form.querySelectorAll('.power-source').length,
            power: form.querySelector('#troopOrderPower header strong')?.textContent,
            expectedPower: formatMarchesNumber(Math.floor(1003 * getAttackPower(1,'player'))),
            remaining: form.querySelector('#troopSliderRemaining').textContent,
            expectedRemaining: formatMarchesNumber(expectedMax - 1003),
            transfer: columns.classList.contains('transfer-layout'), attack: columns.classList.contains('attack-layout'),
            preview: form.querySelector('#troopSliderPreview').textContent,
            expectedArrival: formatMarchesNumber(1003 + (${mode === "reinforce"} ? towerOrderQa.tower.ownStationedTroops : towerOrderQa.city.troops)),
            swift: !!form.querySelector('#swiftMarchLaunchToggle'),
            overflow: form.scrollWidth > form.clientWidth + 1,
            scrollable: ['auto','scroll'].includes(getComputedStyle(form.querySelector('.order-body')).overflowY)
          };
        })()`);
        assert.equal(snapshot.amount, "1,003");
        assert.equal(snapshot.max, snapshot.expectedMax, "Tower order used another player's garrison.");
        assert.equal(snapshot.remaining, snapshot.expectedRemaining);
        assert.equal(snapshot.kind, mode === "attack-from" ? "attack" : "transfer");
        assert.equal(snapshot.attack, mode === "attack-from");
        assert.equal(snapshot.transfer, mode !== "attack-from");
        assert.equal(snapshot.powerRows, mode === "attack-from" ? 3 : 0);
        if (mode === "attack-from") {
          assert.equal(snapshot.power, snapshot.expectedPower);
          assert.match(snapshot.preview, /Garrison unknown/);
          assert.match(snapshot.preview, /Scout report required/);
        } else assert(snapshot.preview.includes(snapshot.expectedArrival), "Arrival must use personal troops at the destination.");
        assert.match(snapshot.preview, /Travel bonus[\s\S]*Travel time[\s\S]*Estimated/);
        assert.equal(snapshot.swift, false, "Tower dispatch does not support a Swift March launch item.");
        if (snapshot.overflow) {
          const shot=await client.send("Page.captureScreenshot",{format:"png"});
          fs.writeFileSync(path.join(artifacts,`overflow-${mode}-${width}.png`),Buffer.from(shot.data,"base64"));
        }
        assert.equal(snapshot.overflow, false, `${mode} overflows at ${width}`);
        assert(snapshot.scrollable, "Short screens need access to all order details.");
        await evaluate("modalBody.querySelector('.order-body').scrollTop = 0");
        await delay(80);
        const shot = await client.send("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(path.join(artifacts, `${mode}-${width}.png`), Buffer.from(shot.data, "base64"));
        const control = await evaluate(`(() => {
          const b=modalBody.querySelector('#troopSliderConfirm'),r=b.getBoundingClientRect();
          return {x:r.left+r.width/2,y:r.top+r.height/2,height:r.height,hit:b.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))};
        })()`);
        assert(control.hit && control.height >= 44, "Dispatch must be visible and tappable without scrolling.");
        // Keyboard changes must drive both the amount and all dependent details.
        await evaluate("modalBody.querySelector('input[type=range]').focus()");
        await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "End", code: "End", windowsVirtualKeyCode: 35 });
        await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "End", code: "End", windowsVirtualKeyCode: 35 });
        assert.equal(await evaluate("Number(modalBody.querySelector('input[type=range]').value)"), snapshot.expectedMax);
        assert.equal(await evaluate("modalBody.querySelector('#troopSliderRemaining').textContent"), "0");
        await evaluate("towerOrderQa.setAmount(1003)");
      }
      // The city panel still uses the same columns, authoritative-ready route and forecast renderer.
      for (const attack of [false, true]) {
        await close();
        const cityView = await evaluate(`(() => {
          modal.close(); clearSelection(false);
          const source=towerOrderQa.city, target=${attack} ? towerOrderQa.enemy : {...source,id:'fixture-destination',troops:321};
          selectedTroopAmount=1003;
          const route={points:[{x:source.x,y:source.y},{x:target.x,y:target.y}],length:100,previewStatus:'local'};
          showTroopSliderModalWithRoute(source,target,route,{orderKind:${attack ? "'attack'" : "'transfer'"}});
          return {kind:modalBody.querySelector('.troop-slider-panel').dataset.orderKind,preview:modalBody.querySelector('#troopSliderPreview').textContent,
            disabled:modalBody.querySelector('#troopSliderConfirm').disabled,power:!!modalBody.querySelector('#troopOrderPower')};
        })()`);
        assert.equal(cityView.kind, attack ? "attack" : "transfer");
        assert.equal(cityView.power, attack);
        assert.equal(cityView.disabled, false);
        assert.match(cityView.preview, attack ? /Garrison unknown/ : /1,324 troops/);
      }
      console.log(`Clan Tower/city order parity passed at ${width}x${height}: layout, slider, power, private counts, travel and reachable dispatch.`);
    }
    // Scout data, rather than visible city troop fields, supplies enemy intelligence.
    await close();
    await evaluate(`towerOrderQa.scout={troops:71,totalDefense:4321,siegeCombatVersion:SIEGE_COMBAT_VERSION};towerOrderQa.open('attack-from')`);
    assert.match(await evaluate("modalBody.querySelector('#troopSliderPreview').textContent"), /Scouted[\s\S]*Forecast at scout time/);
    await evaluate("towerOrderQa.scout=null;updateScoutReportLifecycle()");
    assert.match(await evaluate("modalBody.querySelector('#troopSliderPreview').textContent"), /Garrison unknown/);
    // Late worker output cannot repaint a replacement city dialog.
    await close();
    const stale = await evaluate(`(() => {
      modal.close();modalBody.innerHTML='<p id="replacement">Another dialog</p>';modal.showModal();
      towerOrderQa.pendingRoutes.forEach(({resolve})=>resolve({points:[{x:0,y:0},{x:1,y:1}],length:1}));
      return towerOrderQa.pendingRoutes.length;
    })()`);
    assert(stale > 0);
    await delay(50);
    assert.equal(await evaluate("modalBody.textContent"), "Another dialog");
    // Realtime ownership and personal-garrison changes cannot dispatch invalid orders.
    await close();
    await evaluate("towerOrderQa.open('withdraw');towerOrderQa.setAmount(1003)");
    for (const patch of [{ ownStationedTroops: 37 }, { ownerMember: false }, { ownershipRevision: 999 }, { permissions: {} }]) {
      await evaluate(`holdingTowerSnapshots.set(towerOrderQa.tower.id,{...towerOrderQa.tower,...${JSON.stringify(patch)}});updateHoldingTowerOrderAvailability()`);
      if (patch.ownStationedTroops) assert.equal(await evaluate("Number(modalBody.querySelector('input[type=range]').max)"),37);
      else assert.equal(await evaluate("modalBody.querySelector('#troopSliderConfirm').disabled"),true);
    }
    await close();
    await evaluate("towerOrderQa.open('withdraw');towerOrderQa.setAmount(1003);towerOrderQa.fail=true;modalBody.querySelector('[data-tower-order-form]').requestSubmit()");
    await ready("!holdingTowerActionsInFlight.size");
    assert.equal(await evaluate("modal.open"),true,"Failed dispatch must preserve the order for retry.");
    assert.equal(await evaluate("Number(modalBody.querySelector('input[type=range]').value)"),1003);
    await evaluate("towerOrderQa.fail=false;modalBody.querySelector('[data-tower-order-form]').requestSubmit();modalBody.querySelector('[data-tower-order-form]').requestSubmit()");
    assert.equal(await evaluate("towerOrderQa.orders.length"),2,"Double submit sent duplicate troops.");
    const payload=await evaluate("towerOrderQa.orders.at(-1)");
    assert.equal(payload.sourceType,"tower");assert.equal(payload.targetType,"city");assert.equal(payload.army.troops,1003);assert.equal(payload.army.kind,"transfer");
    await evaluate("towerOrderQa.finishSend({ok:true})");
    await ready("!modal.open");
    assert.deepEqual(errors,[]);
    console.log("Tower order scout disclosure, stale-route cancellation, ownership changes, failed-send retry and duplicate-submit protection passed.");
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (browser) { if (!await waitForProcessExit(browser.browserProcess)) { browser.browserProcess.kill(); await waitForProcessExit(browser.browserProcess); } await removeBrowserProfile(browser.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode=1; });
