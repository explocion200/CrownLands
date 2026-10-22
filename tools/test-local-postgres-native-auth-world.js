"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { chromium } = require("playwright");
const { createGameplayPilot } = require("./map-benchmark/seamless/gameplay-pilot");
const { createAuthenticatedNativeHarness } = require("./map-benchmark/seamless/native-auth-harness");
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const production=process.argv.includes("--production");
  const pilot = await createGameplayPilot({productionRouting:production}); let harness, browser, world;
  const output = path.resolve("release-artifacts/"+(production?"continuous-production":"continuous-native-auth")); fs.mkdirSync(output, { recursive: true });
  const browserErrors = [], blocked = [], pages = [], results = [];
  try {
    if(production){
      const deployment=require("./map-benchmark/seamless/production-test-policy").productionTestPolicy(pilot.store);
      world=require("../local-backend/world/service").createWorldService({store:pilot.store,readPool:pilot.reader.pool,deployment,directory:path.join(output,"terrain"),enabled:true});
      await world.prepare(pilot.players[0].uid);
      await pilot.routing.close();Object.defineProperties(pilot.routing,Object.getOwnPropertyDescriptors(world.routing));
    }
    harness = await createAuthenticatedNativeHarness(pilot,{productionWorld:world});
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
    console.log("Authenticated world browser:",browser.version());
    for (let i = 0; i < 2; i++) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
      if(production)await context.addInitScript(()=>Object.defineProperty(window,"nativeContinuousWorld",{get:()=>window.CrownlandsContinuousWorld}));
      await context.addCookies(harness.cookies(i));
      await context.route("**/*", async route => {
        const request = route.request();
        if (!request.url().startsWith("https://playcrownlands.com/")) blocked.push(request.url());
        try { await route.fulfill(await harness.request(request.url(), request.method(), await request.allHeaders(), request.postDataBuffer())); }
        catch (error) { browserErrors.push("harness: " + error.message); await route.abort(); }
      });
      const page = await context.newPage(); pages.push(page);
      page.on("pageerror", error => browserErrors.push(error.stack || error.message));
      await page.goto(harness.url);
      await page.getByRole("button", { name: "Keep analytics off" }).click();
      await page.waitForFunction(() => !document.getElementById("enterKingdomBtn")?.disabled);
      await page.locator("#enterKingdomBtn").click();
      await page.waitForFunction(() => !!window.nativeContinuousWorld && !isMapInteractionBlocked(), null, { timeout: 90000 });
    }
    const page = pages[0], [source, target] = pilot.pair;
    const select = async (p, city) => {
      const section = pilot.reader.sections.get(city.regionId);
      await p.evaluate(({ x, y }) => nativeContinuousWorld.view.view(x, y), { x: section.x + 724, y: section.y + 543 });
      // Programmatic camera changes are applied on the next frame. Let its
      // area window update before checking freshness or selecting an object
      // that happened to remain cached from the preceding viewport.
      await p.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
      await p.waitForFunction(({ key, region }) => {
        const v = nativeContinuousWorld.view, f = v.snapshot().feed;
        return f.ids.includes(region) && !f.pending && !f.failed && !!v.getObject(key);
      }, { key: `${city.regionId}:${city.id}`, region: city.regionId });
      // A previous selection/resize can leave the camera at maximum zoom.
      // Center the actual object before selecting: region-center navigation
      // alone can place it offscreen, where native deselection is intentional.
      await p.evaluate(key => {const v=nativeContinuousWorld.view;v.focus(v.getObject(key));v.select(key);}, `${city.regionId}:${city.id}`);
      await p.waitForFunction(() => !nativeContinuousWorld.bridge.running);
      await p.evaluate(()=>new Promise(requestAnimationFrame));
    };
    await select(page, source);
    if(production)await require("./check-continuous-city-stages")(page,pilot,source,output);
    if(production){
      // Native Location/Home commands can target an area that has been evicted.
      // Wait for its authoritative display position without overriding a later
      // manual drag when the area response is slow.
      const from=pilot.reader.sections.get(source.regionId);
      const far=[...pilot.reader.sections.values()].sort((a,b)=>Math.hypot(b.x-from.x,b.y-from.y)-Math.hypot(a.x-from.x,a.y-from.y))[0];
      const navigate=()=>page.evaluate(async region=>{
        if(!await switchOnlineIsland(region))throw Error("Fixture region unavailable");
        const city=state.cities.find(c=>getCityRegionId(c)===region&&!isStronghold(c));
        if(!city)throw Error("Fixture city unavailable");centerOnCity(city.id);return region+":"+city.id;
      },far.id);
      const centered=key=>page.waitForFunction(key=>{
        const v=nativeContinuousWorld.view,o=v.getObject(key);if(!o)return false;
        const {camera,size}=v.snapshot(),expected=SeamlessModel.forWorld(v.scene).clamp({...camera,x:o.x,y:o.y},size);
        return Math.hypot(camera.x-expected.x,camera.y-expected.y)<1;
      },key);
      assert(!await page.evaluate(id=>nativeContinuousWorld.view.snapshot().feed.ids.includes(id),far.id));
      const farKey=await navigate();await centered(farKey);
      await page.locator("#mainCityReturnBtn").click();
      await page.waitForFunction(()=>getActiveMapRegionId()===getMainCityRegionId()&&!isMapInteractionBlocked());
      await centered(await page.evaluate(()=>getMainCityRegionId()+":"+state.mainCityId));
      const originalRead=harness.worldData.read;let release,waiting=false;
      const held=new Promise(resolve=>{release=resolve;});
      harness.worldData.read=async(...args)=>{if(args[1]==="areas"&&args[2].ids.includes(far.id)){waiting=true;await held;}return originalRead(...args);};
      try{
        await navigate();for(let n=0;n<100&&!waiting;n++)await sleep(20);assert(waiting,"Delayed remote area was not requested");
        const viewport=await page.locator("#continuous-game-surface #viewport").boundingBox();
        await page.mouse.move(viewport.x+viewport.width/2,viewport.y+viewport.height/2);
        await page.mouse.down();await page.mouse.move(viewport.x+viewport.width/2+90,viewport.y+viewport.height/2+30,{steps:8});await page.mouse.up();
        const moved=await page.evaluate(()=>nativeContinuousWorld.view.snapshot().camera);release();
        await page.waitForFunction(key=>!!nativeContinuousWorld.view.getObject(key)&&!nativeContinuousWorld.view.snapshot().feed.pending,farKey);
        const after=await page.evaluate(()=>nativeContinuousWorld.view.snapshot().camera);
        assert(Math.hypot(moved.x-after.x,moved.y-after.y)<1,"A delayed Location response overrode manual panning");
      }finally{release();harness.worldData.read=originalRead;}
      await select(page,source);
    }
    if(production){
      const ui=await page.evaluate(key=>{
        const root=nativeContinuousWorld.root,node=[...root.querySelectorAll("[data-key]")].find(n=>n.dataset.key===key);
        return {banner:!!node?.querySelector(".player-city-banner"),level:node?.querySelector(".city-label-level")?.textContent,
          troops:node?.querySelector(".city-army-count")?.textContent,tag:!!node?.querySelector(".tag"),
          cameraPanel:getComputedStyle(root.querySelector("header")).display,statusHidden:root.querySelector("footer").hidden};
      },source.regionId+":"+source.id);
      assert(ui.banner&&ui.level&&ui.troops,"Original own-city banner must show level and authorized troops");
      assert(!ui.tag&&ui.cameraPanel==="none"&&ui.statusHidden,"Prototype presentation must not replace the normal HUD");
    }
    if(production)await require("./check-continuous-zoom-limit")(page,source,select,output);
    if(production)await require("./check-continuous-map-ui")(page,source,select,output);
    if(production)await require("./check-continuous-map-power")(page,source,select,output);
    await page.locator("#continuous-game-actions .wheel-send").click();
    await select(page, target);
    await page.waitForFunction(() => !!document.querySelector("#troopSliderConfirm") && !document.querySelector("#troopSliderConfirm").disabled);
    await page.locator("#troopAmountSlider").fill("2000");
    await page.locator("#troopAmountSlider").dispatchEvent("input");
    await page.locator("#troopSliderConfirm").click();
    const march = await (async () => { for (let n = 0; n < 100; n++) { const snap = await pilot.store.collection("armies").where("ownerUid", "==", pilot.players[0].uid).where("status", "==", "active").get(); const m = snap.docs.find(d => d.data().fromId === source.id && d.data().toId === target.id); if (m) return { id: m.id, ...m.data() }; await sleep(100); } throw Error("Native attack not saved"); })();
    await page.waitForFunction(key => !!nativeContinuousWorld.view.getObject(key), "march:" + march.id);
    const before = await page.evaluate(key => nativeContinuousWorld.view.snapshot().marches.find(m => m.key === key).position, "march:" + march.id);
    await sleep(1200);
    const after = await page.evaluate(key => nativeContinuousWorld.view.snapshot().marches.find(m => m.key === key).position, "march:" + march.id);
    assert(Math.hypot(before.x - after.x, before.y - after.y) > 0, "Accepted real march did not move");
    if(production)await require("./check-continuous-marches").march(page,march,output);
    else {
    await page.evaluate(key => nativeContinuousWorld.view.select(key), "march:" + march.id);
    await page.locator("#continuous-game-surface #follow").click();
    await page.waitForFunction(key => nativeContinuousWorld.view.snapshot().following === key, "march:" + march.id);
    const viewport = await page.locator("#continuous-game-surface #viewport").boundingBox();
    await page.mouse.move(viewport.x + viewport.width / 2, viewport.y + viewport.height / 2);
    await page.mouse.down(); await page.mouse.move(viewport.x + viewport.width / 2 + 80, viewport.y + viewport.height / 2 + 25, { steps: 8 }); await page.mouse.up();
    assert.equal(await page.evaluate(() => nativeContinuousWorld.view.snapshot().following), null);
    }
    await select(pages[1], source);
    const visible = await Promise.all(pages.map(p => p.evaluate(key => nativeContinuousWorld.view.getObject(key), source.regionId + ":" + source.id)));
    if(production){
      const foreign=await pages[1].evaluate(key=>{
        const root=nativeContinuousWorld.root,node=[...root.querySelectorAll("[data-key]")].find(n=>n.dataset.key===key);
        return {banner:!!node?.querySelector(".foreign-selected-banner"),text:node?.querySelector(".foreign-garrison")?.textContent};
      },source.regionId+":"+source.id);
      assert(foreign.banner&&foreign.text==="? troops","Restored foreign banner must not disclose private counts");
    }
    if(production){
      await pages[1].waitForFunction(key=>!!nativeContinuousWorld.view.getObject(key),"march:"+march.id);
      const privacy=await pages[1].evaluate(key=>{
        const v=nativeContinuousWorld.view,m=v.getObject(key);v.focus(m.position);
        return {visibility:m.troopVisibility,hasCount:Object.hasOwn(m,"troops")};
      },"march:"+march.id);
      assert.equal(privacy.visibility,"estimate");assert.equal(privacy.hasCount,false);
      await pages[1].waitForFunction(key=>{
        const root=nativeContinuousWorld.root,node=[...root.querySelectorAll(".troop")].find(n=>n.dataset.key===key);
        const m=nativeContinuousWorld.view.getObject(key);
        return node&&node.querySelector(".army-token-count").textContent===m.troopEstimateLabel&&root.querySelector(`[data-march-key="${key}"]`);
      },"march:"+march.id);
    }
    if(production)assert(await pages[1].evaluate(key=>{
      const node=document.createElement("div"),m=nativeContinuousWorld.view.getObject(key);
      SeamlessAppearance.render(node,{...m,missionKind:"transfer",troopVisibility:"hidden",troops:987654321});
      return node.querySelector(".army-token-count").hidden&&!node.textContent.includes("987654321")&&!node.getAttribute("aria-label").includes("987654321");
    },"march:"+march.id),"Hidden transfers cannot reveal a supplied count");
    assert.equal(visible[0].troopVisibility, "exact"); assert.equal(visible[1].troopVisibility, "hidden"); assert(!Object.hasOwn(visible[1], "troops"));
    // Recall uses the actual activity-panel button and recovery journal.
    await page.evaluate(() => showOutgoingAttacksModal());
    await page.locator(`[data-recall-horn="${march.id}"]`).click();
    await page.waitForFunction(key => nativeContinuousWorld.view.getObject(key)?.returning, "march:" + march.id);
    assert((await pilot.store.doc("armies/" + march.id).get()).data().returning);
    await page.evaluate(() => modal.close());
    if(production){
      // Pickups remain ordinary authoritative claims, rendered on the new
      // camera rather than left inside the hidden legacy terrain layer.
      await select(page,source);
      await require("./check-continuous-pickup-repair")(page,pilot,source);
      for(const type of ["gold","troops","crowns"]){
        const bonus=await page.evaluate(type=>({id:"world-pickup-"+type,type,regionId:getActiveMapRegionId(),...createHarvestBonusPoint(getActiveMapRegionId()),createdAtMs:Date.now()}),type);
        assert(Number.isFinite(bonus.x)&&Number.isFinite(bonus.y));
        await pilot.store.doc("players/"+pilot.players[0].uid).update({harvestBonuses:[bonus],harvestNextSpawnAtMs:Date.now()+3600000});
        await page.evaluate(async()=>applyServerEconomyResult(await getOnlineApi().collectEconomy(),{renderCities:false}));
        const button=page.locator(`#continuous-world-pickups [data-harvest-bonus-id="${bonus.id}"]`);
        await button.waitFor({state:"attached"});
        await button.evaluate(node=>CrownlandsContinuousWorld.view.focus(node.worldPoint));
        await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
        await require("./check-continuous-marches").pickup(page,bonus,output);
        // The existing pickup pulses continuously. Use an ordinary pointer
        // click at its center instead of waiting for animation-free geometry.
        const box=await button.boundingBox();assert(box);
        await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
        await page.waitForFunction(id=>!getAllActiveHarvestBonuses().some(b=>b.id===id),bonus.id);
        assert(!(await pilot.store.doc("players/"+pilot.players[0].uid).get()).data().harvestBonuses.some(b=>b.id===bonus.id));
      }
      await page.evaluate(()=>nativeContinuousWorld.view.home());
    }
    // A temporary feed failure must remove actionable stale controls, while
    // leaving the camera usable. Recovery uses the same cookie/session.
    await select(page, source);
    const worldRead = harness.worldData.read;
    harness.worldData.read = async (...args) => {
      if (args[1] === "areas") throw Object.assign(Error("Fixture area outage"), { status: 503 });
      return worldRead(...args);
    };
    await page.waitForFunction(() => nativeContinuousWorld.view.snapshot().feed.failed);
    assert.equal(await page.locator("#continuous-game-actions button").count(), 0);
    assert.equal(await page.evaluate(() => nativeContinuousWorld.bridge.selected), null);
    harness.worldData.read = worldRead;
    await page.evaluate(() => nativeContinuousWorld.view.refresh());
    await page.waitForFunction(() => !nativeContinuousWorld.view.snapshot().feed.failed);
    // Use the existing public/private NPC shapes. The normal NPC buttons must
    // keep spawn identity, authoritative route preview and stamina enforcement.
    const crypto = require("node:crypto"), rules = require("../functions/marauder-rules");
    const npcRegion = require("../assets/worlds/core-expansion-v1/region-catalog.json").regions.find(r =>
      pilot.reader.sections.has(r.id) && rules.slots(r).some(s => s.classification === "solo"));
    const slot = rules.slots(npcRegion).find(s => s.classification === "solo");
    const npcIsland = `islands/${pilot.identity.worldId}--${pilot.identity.realmShardId}--${npcRegion.id}`;
    const npcSource = (await pilot.store.collection(npcIsland + "/cities").get()).docs.find(d => !d.data().ownerUid);
    await npcSource.ref.update({ ownerUid: pilot.players[0].uid, ownerKind: "player", ownerName: "Pilot Rowan", troops: 50000, troopFloat: 50000 });
    const npc = { ...pilot.identity,
      id: "marauder_" + crypto.createHash("sha256").update(npcRegion.id).digest("hex").slice(0, 12) + "_" + String(slot.slot).padStart(2, "0"),
      spawnId: crypto.randomUUID(), name: "Native test Marauder", regionId: npcRegion.id,
      x: npcSource.data().x + 120, y: npcSource.data().y, level: slot.min, classification: "solo", targetType: "marauder",
      status: "active", slot: slot.slot, balanceVersion: 1, ownerKind: "neutral", ownerUid: "", respawnAtMs: 0 };
    await pilot.store.doc(`marauderPopulation/${pilot.identity.resetGeneration}--${pilot.identity.realmShardId}`).set({ enabled: true });
    await pilot.store.doc(`${npcIsland}/marauders/${npc.id}`).set(npc);
    await pilot.store.doc(`${npcIsland}/marauderCombat/${npc.id}`).set({ ...npc, troops: 100 });
    await select(page, { id: npcSource.id, regionId: npc.regionId });
    await page.waitForFunction(id => !!getMarauderById(id), npc.id);
    await select(page, npc);
    await page.locator("#continuous-game-actions .wheel-info").click();
    await page.waitForFunction(() => modal.open && modalTitle.textContent === "Native test Marauder");
    await page.evaluate(() => modal.close());
    await select(page, npc);
    await page.locator("#continuous-game-actions .wheel-attack").click();
    await page.waitForFunction(() => !!document.querySelector("#troopSliderConfirm") && !document.querySelector("#troopSliderConfirm").disabled);
    await page.locator("#troopAmountSlider").fill("1000"); await page.locator("#troopAmountSlider").dispatchEvent("input");
    await page.locator("#troopSliderConfirm").click();
    let hunt;
    for (let n = 0; n < 100 && !hunt; n++) {
      hunt = (await pilot.store.collection("armies").where("ownerUid", "==", pilot.players[0].uid).where("targetSpawnId", "==", npc.spawnId).get()).docs[0];
      if (!hunt) await sleep(100);
    }
    assert(hunt, "Native NPC attack did not retain the current spawn identity");
    await page.waitForFunction(() => !sendMode && !modal.open);
    if(production)await require("./check-continuous-npc-timers")(page,pilot,output);
    // Qualified bulk candidates must cross a section edge through the normal
    // two-step HUD controls, rather than silently using the old local radius.
    await select(page, source);
    await page.locator("#continuous-game-actions .wheel-scout-nearby").click();
    await page.waitForFunction(id => scoutNearbySourceId === id, source.id);
    await page.locator("#continuous-game-actions .wheel-scout-nearby").click();
    await page.waitForFunction(() => !pendingBulkOrderAction && !scoutNearbySourceId);
    const scouts = await pilot.store.collection("armies").where("ownerUid", "==", pilot.players[0].uid).where("kind", "==", "scout").get();
    assert(scouts.docs.some(d => d.data().toId === target.id && d.data().targetRegionId === target.regionId), "Native bulk scouts omitted adjacent section");
    await pilot.cityRef(target).update({ ownerUid: pilot.players[0].uid, ownerKind: "player", ownerName: "Pilot Rowan", troops: 200, troopFloat: 200 });
    await select(page, source);
    await page.locator("#continuous-game-actions .wheel-regroup").click();
    await page.waitForFunction(id => regroupSourceId === id, source.id);
    await page.locator("#continuous-game-actions .wheel-regroup").click();
    await page.waitForFunction(() => !pendingBulkOrderAction && !regroupSourceId);
    const regroups = await pilot.store.collection("armies").where("ownerUid", "==", pilot.players[0].uid).where("kind", "==", "transfer").get();
    assert(regroups.docs.some(d => d.data().fromId === target.id && d.data().sourceRegionId === target.regionId), "Native regroup omitted adjacent section");
    // Remaining command matrix uses the same real, cookie-authenticated normal
    // client transport. These are transport/handler tests, not UI-click claims.
    const call = (i, name, data) => pages[i].evaluate(async ({ name, data }) => {
      try { return { value: await getOnlineApi()[name](data) }; }
      catch (error) { return { error: error.code, message: error.message }; }
    }, { name, data });
    let sequence = 0;
    const order = (from, to, kind) => { const id = `native_auth_${++sequence}`; return { armyId: id, sourceRegionId: from.regionId, targetRegionId: to.regionId,
      army: { id, fromId: from.id, toId: to.id, sourceRegionId: from.regionId, targetRegionId: to.regionId, kind, troops: 10, requestedTroops: 10 } }; };
    const ok = async (i, name, data) => { const r = await call(i, name, data); assert(!r.error, name + ": " + JSON.stringify(r)); return r.value; };
    const settle = async id => { await pilot.store.doc("armies/" + id).update({ arrivesAtMs: Date.now() - 1000 }); await pilot.settle(); };
    const ally = pilot.assignments.find(([,p]) => p.uid === pilot.players[1].uid)[0];
    const support = await ok(0, "sendArmyOrder", order(source, ally, "reinforce"));
    await settle(support.movement.id);
    const stationed = (await pilot.store.collection("reinforcements").where("ownerUid", "==", pilot.players[0].uid).where("status", "==", "stationed").get()).docs[0];
    assert(stationed); await ok(0, "returnClanReinforcement", { reinforcementId: stationed.id });
    const objectiveMap = require("../functions/core-expansion-world-layout.json").maps.find(m => m.objectives.length);
    const objective = { ...objectiveMap.objectives[0], regionId: objectiveMap.id };
    for (const mode of ["cancel", "launch"]) {
      const leader = order(source, objective, "attack"); leader.rallyId = leader.armyId;
      const rally = await ok(0, "createClanRally", leader);
      const join = { ...order(ally, source, "rally_join"), clanId: "pilot-clan", rallyId: rally.rally.id };
      const joined = await ok(1, "joinClanRally", join);
      if (joined.movement?.id) await settle(joined.movement.id);
      const identity = { clanId: "pilot-clan", rallyId: rally.rally.id };
      assert.equal((await call(1, "launchClanRally", identity)).error, "functions/permission-denied");
      if (mode === "cancel") { await ok(1, "withdrawClanRallyContribution", identity); await ok(0, "cancelClanRally", identity); }
      else await ok(0, "launchClanRally", identity);
    }
    // A temporarily unavailable route worker must allow the same order ID to
    // be retried without duplicate troop deductions or a second march.
    const transfer = order(source, target, "transfer"), calculate = pilot.routing.calculate;
    const troopsBefore = (await pilot.cityRef(source).get()).data().troops;
    pilot.routing.calculate = async () => { throw Object.assign(Error("Test worker busy"), { code: "unavailable" }); };
    try { assert.equal((await call(0, "sendArmyOrder", transfer)).error, "functions/unavailable"); }
    finally { pilot.routing.calculate = calculate; }
    assert.equal((await pilot.cityRef(source).get()).data().troops, troopsBefore);
    const accepted = await ok(0, "sendArmyOrder", transfer);
    assert.equal((await ok(0, "sendArmyOrder", transfer)).movement.id, accepted.movement.id);
    // Every special map target keeps its normal information/control surface.
    // The tower is deliberately unmaterialized in the fixture database.
    const inspected = [];
    for (const kind of ["camp", "stronghold", "citadel", "tower"]) {
      const object = [...pilot.reader.artObjects.values()].find(o => o.kind === kind);
      assert(object, "Missing current catalog " + kind);
      await ok(0, "ensureMainIsland", { regionId: object.sectionId });
      await select(page, { id: object.id, regionId: object.sectionId });
      const expectedName = await page.evaluate(key => nativeContinuousWorld.view.getObject(key).name, object.sectionId + ":" + object.id);
      const info = kind === "tower" ? "[data-clan-tower-map-action=info]" : ".camp-info-action";
      await page.locator("#continuous-game-actions " + info).click();
      await page.waitForFunction(() => modal.open && modalBody.textContent.length > 30, null, { timeout: 5000 });
      assert((await page.locator("#modal").innerText()).includes(expectedName), "Wrong information panel for " + kind);
      inspected.push(kind); await page.evaluate(() => modal.close());
    }
    if(production){
      const objectives=["camp","stronghold","citadel","tower"].map(kind=>{
        const o=[...pilot.reader.artObjects.values()].find(o=>o.kind===kind);return {id:o.id,regionId:o.sectionId};
      });
      await require("./check-continuous-control-scale")(page,[source,ally,...objectives],select,output);
    }
    if(production)await require("./check-world-spacing-browser")(page,pilot,output);
    await page.bringToFront();
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      await page.setViewportSize({ width, height });
      const cdp = await page.context().newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: width < 1000 ? 4 : 1 });
      await page.evaluate(() => { modal.close(); clearSelection(false); nativeContinuousWorld.view.resetMetrics(); });
      await sleep(1200); await page.evaluate(() => nativeContinuousWorld.view.resetMetrics());
      for (let n = 0; n < 80; n++) { await page.evaluate(n => { const v = nativeContinuousWorld.view, s = v.snapshot(); v.view(s.camera.x + Math.sin(n) * 20, s.camera.y + Math.cos(n) * 10); }, n); await sleep(25); }
      const sample = await page.evaluate(() => nativeContinuousWorld.view.snapshot()), times = sample.frameTimes.sort((a,b) => a-b);
      results.push({ width, height, fps: 1000 / (times.reduce((a,b)=>a+b,0)/times.length), p95: times[Math.floor(times.length*.95)], workP95: [...sample.workTimes].sort((a,b)=>a-b)[Math.floor(sample.workTimes.length*.95)], assets: sample.assets, feed: sample.feed });
      assert(sample.assets.full <= 4); assert(sample.assets.peakRequests <= 2);
      await page.screenshot({ path: path.join(output, `authenticated-${width}.png`) }); await cdp.detach();
      if(production){
        await select(page,source);
        await page.evaluate(key=>{const v=nativeContinuousWorld.view,o=v.getObject(key);v.focus(o);},source.regionId+":"+source.id);
        await sleep(250);
        await page.screenshot({path:path.join(output,`restored-ui-${width}.png`)});
      }
    }
    if(production){
      // Catalog growth automatically replaces the reader and client scene.
      // Keep the camera's section-local point rather than the old atlas origin.
      await select(page,source);
      await page.evaluate(()=>{const v=nativeContinuousWorld.view,c=v.snapshot().camera;v.view(c.x+77,c.y+39,c.zoom);});
      const before=await page.evaluate(()=>{const v=nativeContinuousWorld.view,c=v.snapshot().camera,s=v.scene.sections.find(s=>c.x>=s.x&&c.x<s.x+s.width&&c.y>=s.y&&c.y<s.y+s.height);return {id:s.id,x:c.x-s.x,y:c.y-s.y,zoom:c.zoom,selected:v.snapshot().selected,revision:CROWNLANDS_WORLD_SESSION.revision};});
      const expansionPath=`realmGenerations/${pilot.identity.resetGeneration}/expansion/current`,expansion=(await pilot.store.doc(expansionPath).get()).data();
      const growth=require("./world-travel-test-fixtures").createTravelFixture(88).activeRegionIds.find(id=>!expansion.activeRegionIds.includes(id));
      await pilot.store.doc(expansionPath).update({activeRegionIds:[...expansion.activeRegionIds,growth]});
      await world.prepare(pilot.players[0].uid);
      await page.waitForFunction(({growth,revision})=>window.CrownlandsContinuousWorld?.view.scene.sections.some(s=>s.id===growth)&&window.CROWNLANDS_WORLD_SESSION?.revision!==revision&&window.CROWNLANDS_WORLD_SESSION?.revision,{growth,revision:before.revision},{timeout:60000});
      await page.waitForFunction(key=>window.CrownlandsContinuousWorld?.view.snapshot().selected===key,before.selected);
      const after=await page.evaluate(id=>{const v=CrownlandsContinuousWorld.view,c=v.snapshot().camera,s=v.scene.sections.find(s=>s.id===id);return {x:c.x-s.x,y:c.y-s.y,zoom:c.zoom};},before.id);
      for(const key of ["x","y","zoom"])assert(Math.abs(before[key]-after[key])<1e-6,"Catalog refresh moved camera "+key+": "+before[key]+" -> "+after[key]);
    }
    // Permission changes clear exact counts and stale native action menus.
    await select(page, source);
    await pilot.cityRef(source).update({ ownerUid: pilot.players[1].uid, ownerName: "Pilot Alder" });
    await page.waitForFunction(key => nativeContinuousWorld.view.getObject(key)?.troopVisibility === "hidden", source.regionId + ":" + source.id);
    assert.equal(await page.evaluate(key => Object.hasOwn(nativeContinuousWorld.view.getObject(key), "troops"), source.regionId + ":" + source.id), false);
    assert.equal((await call(0, "sendArmyOrder", order(source, target, "transfer"))).error, "functions/permission-denied");
    if(production){
      // Force the sign-out ordering: an already scheduled render can run after
      // player state is cleared, before the continuous camera is disposed.
      const children=await page.evaluate(()=>{
        const saved=state,node=document.createElement("span");
        try{
          state=null;
          for(const kind of ["castle","camp","troop"])SeamlessAppearance.render(node,{key:"logout-check",kind,ownerUid:"other",ownerClanId:"other-clan"});
          return node.childElementCount;
        }finally{state=saved;}
      });
      assert.equal(children,0,"A sign-out frame must not render stale player banners");
    }
    await harness.auth.signOut(harness.sessions[0].token);
    await page.waitForFunction(() => !window.nativeContinuousWorld || nativeContinuousWorld.view.snapshot().feed.authExpired);
    assert.equal(browserErrors.length, 0, JSON.stringify(browserErrors)); assert.equal(blocked.length, 0, JSON.stringify(blocked));
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify({ results, inspected, errors: browserErrors, external: blocked, calls: harness.calls.map(c => ({ name: c.name, ms: c.ms })) }, null, 2));
    console.log(JSON.stringify({ results, calls: harness.calls.length }));
  } catch (error) {
    for (const p of pages) console.error("Native UI state", await p.evaluate(() => window.nativeContinuousWorld && ({
      native: nativeContinuousWorld.snapshot(), bridge: { selected: nativeContinuousWorld.bridge.selected, error: nativeContinuousWorld.bridge.error },
      selected: nativeContinuousWorld.view.snapshot().selected, feed: nativeContinuousWorld.view.snapshot().feed,
      actions: document.querySelector("#continuous-game-actions")?.innerHTML,
      source: selectedSourceId && cityById(selectedSourceId)?.owner,
    })).catch(() => null));
    for (const [i,p] of pages.entries()) { await p.screenshot({ path: path.join(output, `failure-${i}.png`) }).catch(()=>{}); console.error((await p.locator("body").innerText()).slice(-2000)); }
    console.error(JSON.stringify({ browserErrors, blocked, backendErrors: harness?.errors.map(({name,code,status,path})=>({name,code,status,path})), lastRequests: harness?.requests.slice(-12) })); throw error;
  } finally { await browser?.close(); await harness?.close(); await world?.close(); await pilot.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
