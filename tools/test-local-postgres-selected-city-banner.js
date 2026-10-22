"use strict";
// Exercise the published continuous renderer with fictional accounts only.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { chromium } = require("playwright");
const { createGameplayPilot } = require("./map-benchmark/seamless/gameplay-pilot");
const { createAuthenticatedNativeHarness } = require("./map-benchmark/seamless/native-auth-harness");
(async () => {
  const pilot = await createGameplayPilot({ productionRouting: true });
  const output = path.resolve("release-artifacts/selected-city-banner"); fs.mkdirSync(output, { recursive: true });
  let world, harness, browser, page;
  const errors = [], results = [];
  try {
    const city = pilot.pair[1], key = `${city.regionId}:${city.id}`;
    await pilot.cityRef(city).update({ level: 111, name: "Greybrook", ownerUid: pilot.players[1].uid, ownerKind: "player", ownerName: "Pilot Alder" });
    const deployment = require("./map-benchmark/seamless/production-test-policy").productionTestPolicy(pilot.store);
    world = require("../local-backend/world/service").createWorldService({ store: pilot.store, readPool: pilot.reader.pool, deployment, directory: path.join(output, "terrain"), enabled: true });
    await world.prepare(pilot.players[0].uid);
    harness = await createAuthenticatedNativeHarness(pilot, { productionWorld: world });
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
    const context = await browser.newContext({ viewport: { width: 844, height: 390 }, serviceWorkers: "block", hasTouch: true });
    await context.addCookies(harness.cookies(0));
    await context.route("**/*", async route => {
      const request = route.request();
      try { await route.fulfill(await harness.request(request.url(), request.method(), await request.allHeaders(), request.postDataBuffer())); }
      catch (error) { errors.push(error.message); await route.abort(); }
    });
    page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
    await page.goto(harness.url);
    await page.getByRole("button", { name: "Keep analytics off" }).click();
    await page.waitForFunction(() => !document.getElementById("enterKingdomBtn")?.disabled);
    await page.locator("#enterKingdomBtn").click();
    await page.waitForFunction(() => !!window.CrownlandsContinuousWorld && !isMapInteractionBlocked(), null, { timeout: 90000 });
    const section = pilot.reader.sections.get(city.regionId);
    await page.evaluate(section => CrownlandsContinuousWorld.view.view(section.x + 724, section.y + 543), section);
    await page.waitForFunction(key => {
      const v = CrownlandsContinuousWorld.view, f = v.snapshot().feed;
      return !f.pending && !f.failed && v.getObject(key)?.level === 111;
    }, key);
    const marker = page.locator(`#continuous-game-surface .castle[data-key="${key}"]`);
    const frames = () => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    const measure = () => marker.evaluate(node => {
      const banner = node.querySelector('.city-label'), flag = banner.querySelector('.city-owner-flag'), level = banner.querySelector('.city-label-level,.foreign-selected-level');
      const f = flag.getBoundingClientRect(), l = level.getBoundingClientRect(), holder = flag.parentElement.getBoundingClientRect();
      return { shared: flag.parentElement === level.parentElement, below: l.top >= f.bottom - .5,
        centered: Math.abs((f.left + f.right - l.left - l.right) / 2) < .5,
        contained: l.bottom <= holder.bottom + .5 && l.left >= holder.left - .5 && l.right <= holder.right + .5,
        level: level.textContent, flagWidth: f.width, flagHeight: f.height,
        zoom: CrownlandsContinuousWorld.view.snapshot().camera.zoom,
        localFlagWidth: flag.offsetWidth, localFlagHeight: flag.offsetHeight,
        selected: !!node.querySelector('.foreign-selected-banner'), troops: node.querySelector('.foreign-garrison')?.textContent,
        visible: getComputedStyle(node.querySelector('.map-banner')).visibility !== 'hidden',
        color: getComputedStyle(flag.parentElement).backgroundColor };
    });
    for (const [width, height] of [[844, 390], [568, 320], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      for (const edge of ["home", "max"]) {
        await page.evaluate(({key,edge}) => {
          if (modal.open) modal.close();
          clearSelection(false); const v = CrownlandsContinuousWorld.view, o = v.getObject(key); v.clear();
          v.view(o.x, o.y, SeamlessModel.forWorld(v.scene).limits(v.snapshot().size)[edge]);
        }, { key, edge });
        await frames();
        const before = await measure();
        assert(before.shared && before.below && before.centered && before.contained, "Unselected flag/level fixture invalid");
        if (width < 1000) await marker.tap(); else await marker.click();
        await page.waitForFunction(key => CrownlandsContinuousWorld.view.selectedKey === key && !CrownlandsContinuousWorld.bridge.running, key);
        await frames();
        const selected = await measure();
        await page.screenshot({ path: path.join(output, `selected-${width}-${edge}.png`) });
        assert(selected.selected && selected.shared && selected.below && selected.centered && selected.contained && selected.visible,
          "Selected city level must remain below its flag inside one banner: " + JSON.stringify(selected));
        assert.equal(selected.level, "111"); assert.equal(selected.troops, "? troops", "Selection must not reveal enemy troops");
        assert.equal(selected.color, before.color, "Selection changed the relationship color");
        // A tiny castle tap deliberately zooms in before showing its controls.
        // The banner's dimensions in map coordinates must remain unchanged.
        assert.equal(selected.localFlagWidth, before.localFlagWidth); assert.equal(selected.localFlagHeight, before.localFlagHeight);
        assert(Math.abs(selected.flagWidth / selected.zoom - before.flagWidth / before.zoom) < .5, "Selection resized the flag independently of camera zoom");
        await page.evaluate(() => clearSelection(false)); await frames();
        const after = await measure(); assert(!after.selected && after.shared && after.below && after.centered);
        results.push({width,height,edge,before,selected,after});
      }
      // Same renderer/classes for neutral, clan, main-city and strength bands.
      const variants = await marker.evaluate(node => {
        const base = CrownlandsContinuousWorld.view.getObject(node.dataset.key), samples = [];
        const savedClan = state.clanId; state.clanId = 'banner-fixture-clan';
        try {
          for (const variant of ['neutral','ally','main','protected','in-range','overpowering']) {
            const item = {...base, key:'banner-'+variant, level:125,
              ownerUid:variant==='neutral'?'':base.ownerUid,
              ownerClanId:variant==='ally'?state.clanId:'', isMainCity:variant==='main', ownerFlag:state.flag,
              troopVisibility:variant==='ally'?'exact':'hidden', troops:987654321,
              peaceShieldExpiresAtMs:Date.now()+60000};
            const mount=document.createElement('button'); mount.className='object castle';
            mount.style.cssText=node.style.cssText; node.parentNode.append(mount);
            try {
              SeamlessAppearance.render(mount,item,{selected:true});
              if(['protected','in-range','overpowering'].includes(variant)){
                for(const value of ['unknown','protected','in-range','overpowering'])mount.classList.remove('enemy-power-'+value);
                mount.classList.add('enemy-power-'+variant);
              }
              const flag=mount.querySelector('.city-owner-flag'), level=mount.querySelector('.city-label-level,.foreign-selected-level');
              const f=flag.getBoundingClientRect(), l=level.getBoundingClientRect();
              samples.push({variant,shared:flag.parentElement===level.parentElement,below:l.top>=f.bottom-.5,level:level.textContent,
                troops:mount.querySelector('.foreign-garrison').textContent,shield:!!mount.querySelector('.city-shield-field'),color:getComputedStyle(flag.parentElement).backgroundColor});
            } finally {mount.remove();}
          }
        } finally {state.clanId=savedClan;}
        return samples;
      });
      for (const v of variants) {assert(v.shared && v.below); assert.equal(v.level,'125'); assert.equal(v.troops,v.variant==='ally'?'988M troops':'? troops'); assert.equal(v.shield,v.variant!=='neutral');}
      assert.equal(variants.find(v=>v.variant==='protected').color,'rgb(201, 120, 111)');
      assert.equal(variants.find(v=>v.variant==='in-range').color,'rgb(179, 38, 30)');
      assert.equal(variants.find(v=>v.variant==='overpowering').color,'rgb(75, 20, 24)');
      results.push({width,height,variants}); console.log(`Selected flag attachment, mouse/touch, privacy and color checks passed at ${width}x${height}.`);
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(results,null,2)+'\n');
  } finally {await browser?.close(); await harness?.close(); await world?.close(); await pilot.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
