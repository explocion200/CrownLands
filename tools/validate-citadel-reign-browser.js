"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { openGuildBrowser } = require("./guild-browser-harness");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { minifyEstate } = require("./estate-delivery");
const artifacts = path.resolve(__dirname, "../release-artifacts/citadel-reign-ledger");

async function verifyRulerCrowns(p, { delivery, width, height }) {
  await p.evaluate(() => {
    reignQa.mapCities = state.cities;
    reignQa.mainCityId = state.mainCityId;
    state.mainCityId = "crown-qa-off-map-main";
    const cities = getPlayableBaseCitiesByRegion(getActiveMapRegionId()).filter(city => !isStronghold(city)).slice(0, 3).map(createNeutralCityFromBase);
    if (cities.length !== 3) throw Error("Crown fixture needs three regular cities");
    const bounds = getActiveMapBounds();
    state.cities = cities.map((city, index) => ({ ...city, isMainCity: false,
      x: bounds.left + bounds.width / 2 + (index - 1) * 180, y: bounds.top + bounds.height / 2,
      owner: index === 0 ? "player" : "enemy", ownerKind: "player",
      ownerUid: ["viewer", "current", "other"][index],
      ownerName: ["Viewer", "Current Ruler", "Other Ruler"][index],
    }));
    reignQa.crownCities = state.cities.map(city => city.id);
    selectedSourceId = null; selectedTargetId = null;
    zoom = 1;
    const city = state.cities[1];
    centerOnWorldPoint({ x: city.x, y: city.y - 60 });
    renderCities(true);
  });
  const inspect = () => p.evaluate(() => {
    const city = state.cities.find(c => c.ownerUid === getCrownCitadelHolderUid());
    const node = city && cityLayer.querySelector(`[data-city-id="${city.id}"]`);
    const crown = node?.querySelector(".citadel-city-crown");
    const box = crown?.getBoundingClientRect(), art = node?.querySelector(".city-castle")?.getBoundingClientRect();
    const label = crown?.parentElement;
    const next = label && [...label.children].find(child => child !== crown && child.checkVisibility())?.getBoundingClientRect();
    return {
      holder: getCrownCitadelHolderUid(),
      cityCount: cityLayer.querySelectorAll(".city-node").length, detail: mapDetailLevel,
      rulerVisible: Boolean(node?.querySelector(".city-ruler-row")?.checkVisibility()),
      marked: [...cityLayer.querySelectorAll(".citadel-city-crown")].map(c => c.closest("[data-city-id]").dataset.cityId),
      expected: city?.id, visible: Boolean(crown?.checkVisibility() && box?.width > 0 && box?.height > 0),
      aboveCity: Boolean(box && art && box.bottom <= art.top + 4),
      aboveLabel: Boolean(label?.classList.contains("city-label") && next && box.bottom <= next.top + 1),
      withinViewport: Boolean(box && box.x >= 0 && box.y >= 0 && box.right <= innerWidth && box.bottom <= innerHeight),
      hasIcon: Boolean(crown?.querySelector("img")?.complete && crown.querySelector("img").naturalWidth === 256),
      art: crown?.querySelector("img")?.getAttribute("src"),
      pointerEvents: crown && getComputedStyle(crown).pointerEvents,
    };
  });
  for (const [holder, far] of [["current", false], ["viewer", false], ["current", true], ["viewer", true]]) {
    await p.evaluate(({ holder, far }) => {
      zoom = far ? 0.5 : 1;
      const city = state.cities[holder === "viewer" ? 0 : 1];
      centerOnWorldPoint({ x: city.x, y: city.y - 60 });
      reignQa.subscriptions[0].handlers.onCitadel({ ...reignQa.snapshot, ownerUid: holder });
    }, { holder, far });
    await p.waitForFunction(() => !isCameraInteractionActive());
    await p.evaluate(() => Promise.all([...cityLayer.querySelectorAll(".citadel-city-crown img")].map(image => image.decode())));
    const result = await inspect();
    assert.equal(result.holder, holder);
    assert.equal(result.cityCount, 3, "Both former and new holders must remain rendered during handoff");
    assert.equal(result.detail, far ? "far" : "close");
    assert.equal(result.rulerVisible, !far, "The crown stays visible even when its ruler's name is collapsed");
    assert.deepEqual(result.marked, [result.expected], JSON.stringify(result));
    assert(result.visible && result.aboveCity && result.aboveLabel && result.withinViewport && result.hasIcon, JSON.stringify(result));
    assert.equal(result.pointerEvents, "none", "The crown must not intercept city input");
    assert.equal(result.art, "assets/icons/citadel-crown-r1.webp", "The holder must use the painted Citadel crown");
    await p.screenshot({ path: path.join(artifacts, `crown-${holder}-${far ? "far" : "close"}-${delivery}-${width}x${height}.png`) });
  }
  await p.evaluate(() => {
    // Selected foreign labels have separate markup; the crown must survive selection.
    selectedTargetId = reignQa.crownCities[1];
    reignQa.subscriptions[0].handlers.onCitadel(reignQa.snapshot);
  });
  const selected = await inspect();
  assert(selected.visible && selected.aboveLabel, JSON.stringify(selected));
  await p.evaluate(() => {
    reignQa.subscriptions[0].handlers.onCitadel({ ...reignQa.snapshot, ownerKind: "neutral", ownerUid: null });
    if (cityLayer.querySelector(".citadel-city-crown")) throw Error("Neutral Citadel retained a ruler crown");
    state.cities = reignQa.mapCities;
    state.mainCityId = reignQa.mainCityId;
    selectedTargetId = null;
    reignQa.subscriptions[0].handlers.onCitadel(reignQa.snapshot);
  });
}

async function verifyAtlasCrown(p, { delivery, width, height }) {
  await p.evaluate(() => showIslandSwitcherModal());
  await p.waitForFunction(() => modalBody.querySelector(".citadel-crest"));
  const art = await p.evaluate(async () => {
    const crest = modalBody.querySelector(".citadel-crest"), src = crest.getAttribute("href");
    const image = new Image(); image.src = src; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparent = false, opaque = false;
    for (let i = 3; i < pixels.length; i += 4) { transparent ||= pixels[i] === 0; opaque ||= pixels[i] === 255; }
    const tile = crest.closest("[data-island-region]"), region = WORLD_REGIONS.find(r => r.id === tile.dataset.islandRegion);
    const picker = getIslandMapPickerElement(), position = getIslandMapPosition(region), scale = innerWidth < 600 ? 0.7 : 1;
    getIslandMapPickerCameraController(picker).renderNow({ x: picker.clientWidth / 2 - position.x * scale, y: picker.clientHeight / 2 - position.y * scale, zoom: scale });
    return { src, transparent, opaque, width: image.naturalWidth, height: image.naturalHeight, count: modalBody.querySelectorAll(".citadel-crest").length };
  });
  assert.equal(art.src, "assets/icons/citadel-crown-r1.webp");
  assert(art.transparent && art.opaque && art.width === 256 && art.height === 256 && art.count === 1, JSON.stringify(art));
  await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const layout = await p.evaluate(() => {
    const crown = modalBody.querySelector(".citadel-crest"), box = crown.getBoundingClientRect();
    const tile = crown.closest("[data-island-region]"), thumb = tile.querySelector(".island-map-thumb").getBoundingClientRect();
    return { visible: crown.checkVisibility(), pointer: getComputedStyle(crown).pointerEvents,
      inside: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight,
      aboveMap: box.top < thumb.top && box.bottom < thumb.top + thumb.height / 2,
      tileReceivesInput: document.elementFromPoint(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2)?.closest("[data-island-region]") === tile };
  });
  assert(layout.visible && layout.inside && layout.aboveMap && layout.tileReceivesInput, JSON.stringify(layout));
  assert.equal(layout.pointer, "none");
  await p.screenshot({ path: path.join(artifacts, `atlas-crown-${delivery}-${width}x${height}.png`) });
  await p.evaluate(() => window.__CROWNLANDS_BENCHMARK__.closeModal());
}

async function main() {
  const root = path.resolve(__dirname, "..");
  for (const file of ["game.js", "kingdom-ledgers-ui.js", "styles.css", "interface-theme.css"])
    assert.equal(fs.readFileSync(path.join(root, "dist", file), "utf8"), fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n"), `Production crown consumer must match source: ${file}`);
  const crownAsset = "assets/icons/citadel-crown-r1.webp";
  assert.deepEqual(fs.readFileSync(path.join(root, "dist", crownAsset)), fs.readFileSync(path.join(root, crownAsset)), "Production crown bytes must match the reviewed art");
  assert(fs.statSync(path.join(root, crownAsset)).size < 32 * 1024, "A small map crown must remain below 32 KiB");
  const delivered = fs.readFileSync(path.join(root, "dist/stronghold-details-ui.js"), "utf8");
  assert.equal(delivered, minifyEstate(fs.readFileSync(path.join(root, "stronghold-details-ui.js"), "utf8")), "Build the current production client before validating the delivered Citadel UI");
  fs.mkdirSync(artifacts, { recursive: true });
  const server = createMapBenchmarkServer(), address = await server.listen();
  const errors = [];
  let browser;
  try {
    const cases = ["source", "built"].flatMap(delivery => [[1440, 900], [844, 390], [568, 320]].map(([width, height]) => ({ delivery, width, height })));
    for (const { delivery, width, height } of cases) {
      browser = await openGuildBrowser({ width, height, errors });
      const p = browser.page;
      await p.goto(`${address.url}/__benchmark__/?scenario=D&visualMarches=0`);
      await p.waitForFunction(() => window.__CROWNLANDS_BENCHMARK__?.getStatus().status === "ready");
      if (delivery === "built") await p.evaluate(() => new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "/dist/stronghold-details-ui.js";
        script.onload = resolve; script.onerror = () => reject(Error("Delivered Stronghold UI failed to load"));
        document.head.append(script);
      }));
      await p.evaluate(() => {
        window.__CROWNLANDS_BENCHMARK__.closeModal();
        clearOnlineCrownCitadelWatcher();
        window.reignQa = { pending: [], subscriptions: [], now: Date.now() };
        getCurrentOnlineUid = () => "viewer";
        const api = { ...getOnlineApi(), isSignedIn: () => true,
          loadPublicPlayerProfile: async uid => ({ uid, playerName: "Past Ruler Profile", kingPower: 1000 }),
          subscribeCrownCitadel: (island, id, handlers) => {
            const subscription = { island, id, handlers, stopped: false };
            reignQa.subscriptions.push(subscription);
            return () => { subscription.stopped = true; };
          },
          loadCrownCitadelReignLeaderboard: (limit, holder) => new Promise((resolve, reject) => reignQa.pending.push({ limit, holder, resolve, reject })),
        };
        getOnlineApi = () => api;
        subscribeOnlineCrownCitadel();
      });
      await p.waitForFunction(() => reignQa.subscriptions.length === 1);
      const subscription = await p.evaluate(() => {
        const s = reignQa.subscriptions[0];
        return { id: s.id, island: s.island, expectedIsland: getOnlineIslandId("core-v2-crown-citadel-p0-p0") };
      });
      assert.equal(subscription.id, "core-v2-crown-citadel-p0-p0_crown_stronghold", "Live watcher must use the Core Citadel definition");
      assert.equal(subscription.island, subscription.expectedIsland, "Live watcher must use the current realm's Citadel map");
      await p.evaluate(() => {
        Date.now = () => reignQa.now;
        const snapshot = { ...onlineCrownCitadelBase, ownerKind: "player", ownerUid: "current", ownerName: "Current Ruler", lastCapturedAtMs: reignQa.now - 1000 };
        reignQa.snapshot = snapshot;
        const before = state.cities.length;
        reignQa.subscriptions[0].handlers.onCitadel(snapshot);
        if (state.cities.length !== before || state.cities.some(isCrownCitadel)) throw Error("Cross-map Citadel snapshot polluted the active map");
        if (getCrownCitadelHolderUid() !== "current" || !cityOwnerHoldsCrownCitadel({ ownerUid: "current", kind: "city" })) throw Error("Current ruler and city crown were not reconciled");
      });
      await verifyRulerCrowns(p, { delivery, width, height });
      await verifyAtlasCrown(p, { delivery, width, height });
      await p.evaluate(() => {
        const snapshot = reignQa.snapshot;
        state.online.activeRegionId = snapshot.regionId;
        state.activeRegionId = snapshot.regionId;
        state.cities = getPlayableBaseCitiesByRegion(snapshot.regionId).map(createNeutralCityFromBase);
        reconcileOnlineCrownCitadelSnapshot(snapshot);
        showCityInfoModal(snapshot.id);
      });
      await p.locator("#citadelReignsTab").click();
      await p.waitForFunction(() => reignQa.pending.length === 1);
      assert.equal(await p.evaluate(() => reignQa.pending[0].holder), "current");
      assert.match(await p.locator("[data-citadel-reign-panel]").textContent(), /Loading/);
      await p.evaluate(async () => {
        reignQa.entries = [
          { playerId: "previous", playerName: "Previous Ruler", totalHeldMs: 4000 },
          { playerId: "current", playerName: "Current Ruler", totalHeldMs: 2000 },
          ...Array.from({ length: 98 }, (_, i) => ({ playerId: `past-${i}`, playerName: `Past Ruler ${i}`, totalHeldMs: 900 - i })),
        ];
        reignQa.pending.shift().resolve(reignQa.entries);
        await crownCitadelReignRequest.promise;
      });
      assert.equal(await p.locator(".citadel-reign-row").count(), 100);
      assert.equal(await p.locator(".citadel-reign-row").first().getAttribute("data-citadel-reign-player"), "previous");
      const ticking = await p.evaluate(() => {
        const list = modalBody.querySelector(".citadel-reign-list");
        const row = list.querySelector('[data-citadel-reign-player="current"]');
        const link = row.querySelector("[data-player-profile-uid]"); link.focus();
        const score = row.querySelector("[data-citadel-reign-score]");
        updateVisibleCityDynamicText();
        const observer = new MutationObserver(() => {});
        observer.observe(list, { childList: true, subtree: true, characterData: true });
        for (let i = 0; i < 5; i++) updateVisibleCityDynamicText();
        const unchangedWrites = observer.takeRecords().length;
        observer.disconnect();
        reignQa.now += 2000; updateVisibleCityDynamicText();
        return { unchangedWrites, sameRow: row === list.firstElementChild, rank: row.querySelector(".citadel-reign-rank").textContent,
          sameFocus: document.activeElement === link, score: score.textContent, expected: formatDuration(5) };
      });
      assert.equal(ticking.unchangedWrites, 0, "Unchanged scores must not rewrite the ledger");
      assert(ticking.sameRow && ticking.sameFocus && ticking.rank === "#1", JSON.stringify(ticking));
      assert.equal(ticking.score, ticking.expected, "Live score includes all previous completed reigns");
      await p.screenshot({ path: path.join(artifacts, `ledger-${delivery}-${width}x${height}.png`) });
      const layout = await p.evaluate(() => {
        const r = modal.getBoundingClientRect(), panel = modalBody.querySelector("[data-citadel-reign-panel]");
        return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, overflow: panel.scrollWidth > panel.clientWidth + 1 };
      });
      assert(layout.x >= 0 && layout.y >= 0 && layout.right <= width + 1 && layout.bottom <= height + 1 && !layout.overflow, JSON.stringify(layout));
      await p.locator(".citadel-reign-row").last().scrollIntoViewIfNeeded();
      assert.match(await p.locator(".citadel-reign-row").last().textContent(), /#100/);
      await p.locator(".citadel-reign-row [data-player-profile-uid]").last().click();
      await p.waitForFunction(() => modalBody.textContent.includes("Past Ruler Profile"));
      await p.evaluate(() => showCityInfoModal(reignQa.snapshot.id));
      await p.locator("#citadelReignsTab").click();

      const race = await p.evaluate(async () => {
        void refreshCrownCitadelReignPanel({ force: true });
        const obsolete = reignQa.pending.shift(), oldPromise = crownCitadelReignRequest.promise;
        reignQa.snapshot = { ...reignQa.snapshot, ownerUid: "next", ownerName: "Next Ruler", lastCapturedAtMs: reignQa.now };
        reignQa.subscriptions[0].handlers.onCitadel(reignQa.snapshot);
        const fresh = reignQa.pending.shift(), freshRequest = crownCitadelReignRequest;
        if (!fresh || fresh.holder !== "next") throw Error("A capture must fetch the new holder immediately");
        obsolete.resolve([{ playerId: "obsolete", totalHeldMs: 999999 }]);
        await oldPromise;
        const staleIgnored = !crownCitadelReignCache.length && crownCitadelReignRequest === freshRequest;
        fresh.resolve([{ playerId: "current", totalHeldMs: 5000 }, { playerId: "next", totalHeldMs: 2000 }]);
        await freshRequest.promise;
        return { staleIgnored, current: getCrownCitadelHolderUid(), currentRows: modalBody.querySelectorAll(".citadel-reign-row.current").length };
      });
      assert(race.staleIgnored && race.current === "next" && race.currentRows === 1, JSON.stringify(race));
      const boundary = await p.evaluate(() => {
        crownCitadelReignCache = Array.from({ length: 100 }, (_, i) => ({ playerId: `rank-${i}`, playerName: `Rank ${i}`, totalHeldMs: 100000 + i }));
        crownCitadelReignCache.push({ playerId: "next", playerName: "Next Ruler", totalHeldMs: 99000 });
        const panel = modalBody.querySelector("[data-citadel-reign-panel]");
        panel.innerHTML = crownCitadelReignLeaderboardMarkup(crownCitadelReignCache);
        const outside = !panel.querySelector(".citadel-reign-row.current");
        reignQa.now += 2000; updateVisibleCityDynamicText();
        return { outside, enters: panel.querySelector(".citadel-reign-row.current .citadel-reign-rank")?.textContent, count: panel.querySelectorAll(".citadel-reign-row").length };
      });
      assert(boundary.outside && boundary.enters === "#1" && boundary.count === 100, JSON.stringify(boundary));
      await p.evaluate(async () => {
        void refreshCrownCitadelReignPanel({ force: true });
        const request = crownCitadelReignRequest;
        reignQa.pending.shift().reject(Error("Synthetic unavailable ledger"));
        await request.promise;
      });
      assert.match(await p.locator("[data-citadel-reign-panel]").textContent(), /could not be loaded/);
      // An explicit tab retry must load again after an error, even if older rows were cached.
      await p.locator("#citadelReignsTab").click();
      await p.waitForFunction(() => reignQa.pending.length === 1);
      await p.evaluate(async () => {
        const request = crownCitadelReignRequest;
        reignQa.pending.shift().resolve([]); await request.promise;
        reignQa.subscriptions[0].handlers.onCitadel({ ...reignQa.snapshot, ownerKind: "neutral", ownerUid: null });
        if (getCrownCitadelHeldSinceMs() !== 0) throw Error("Neutral Citadel retained a running reign timer");
        if (reignQa.pending.length) { const p = crownCitadelReignRequest.promise; reignQa.pending.shift().resolve([]); await p; }
      });
      assert.match(await p.locator("[data-citadel-reign-panel]").textContent(), /No ruler has held/);
      await p.locator("#citadelOverviewTab").click();
      assert.match(await p.locator('[data-holding-field="reign"]').textContent(), /Unclaimed/);
      await p.evaluate(async () => {
        const subscription = reignQa.subscriptions[0];
        subscription.handlers.onCitadel({ ...reignQa.snapshot, ownerUid: "viewer", ownerName: "Viewer" });
        if (!onlineOwnedCitiesCache.some(c => c.id === reignQa.snapshot.id)) throw Error("Own Citadel missing from owned-city cache");
        subscription.handlers.onCitadel(reignQa.snapshot);
        if (onlineOwnedCitiesCache.some(c => c.id === reignQa.snapshot.id)) throw Error("Lost Citadel retained in owned-city cache");
        void refreshCrownCitadelReignPanel({ force: true });
        const obsolete = reignQa.pending.shift(), oldRequest = crownCitadelReignRequest;
        clearOnlineCrownCitadelWatcher();
        onlineSessionGeneration += 1;
        obsolete.reject(Error("Previous session failure")); await oldRequest.promise;
        if (crownCitadelReignCache.length || crownCitadelReignRequest) throw Error("Old session changed ledger state");
        subscription.handlers.onCitadel(reignQa.snapshot);
        if (onlineCrownCitadelLoaded || !subscription.stopped) throw Error("A retired watcher updated the Citadel");
        const ensure = ensureRegionDefinitionLoaded;
        let finish;
        ensureRegionDefinitionLoaded = () => new Promise(resolve => { finish = resolve; });
        subscribeOnlineCrownCitadel();
        clearOnlineCrownCitadelWatcher();
        finish(); await Promise.resolve(); await Promise.resolve();
        ensureRegionDefinitionLoaded = ensure;
        if (onlineCrownCitadelBase || reignQa.subscriptions.length !== 1) throw Error("Cancelled initialization started a listener");
      });
      console.log(JSON.stringify({ delivery, width, height, currentCitadelSubscription: true, rulerCrowns: true, liveRanks: true, staleReads: true, retry: true, neutralTimer: true, layout }));
      await browser.close(); browser = null;
    }
    // The isolated map fixture does not serve the public /play/ update probe.
    assert.deepEqual(errors.filter(error => !/^404 http:\/\/127\.0\.0\.1:\d+\/play\/\?updateCheck=\d+$/.test(error)), [], "Citadel browser errors");
  } finally { if (browser) await browser.close(); await server.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
