"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
assert.doesNotMatch(fs.readFileSync(path.resolve(__dirname, "../skins-ui.css"), "utf8"),
  /\.halloween-city-bats\s*\*/,
  "A wildcard bat selector invalidates the entire map when camera/motion state changes");

async function checkCityArt() {
  const assert = (value, message) => { if (!value) throw Error(message); };
  modal.close(); closeProfileScreen();
  const C = COSMETIC_CATALOG, item = C.item("halloween_city");
  getCurrentOnlineUid = () => "halloween-art-owner";
  cosmeticUid = "halloween-art-owner";
  cosmeticState = C.equip(C.normalize({ owned: { halloween_city: true } }), "city", item.id);
  const onlineApi = getOnlineApi();
  getOnlineApi = () => ({ ...onlineApi, getCosmeticsState: async () => ({ state: cosmeticState, serverNowMs: Date.UTC(2026, 9, 15) }) });
  cosmeticError = ""; cosmeticOffset = Date.UTC(2026, 9, 15) - Date.now();
  const city = { ...state.cities.find(city => !isStronghold(city)), owner: "player", ownerUid: cosmeticUid };
  const host = document.createElement("div"); document.body.appendChild(host);
  const node = document.createElement("button");
  node.className = "city-node player castle-stage-1";
  node.style.cssText = "position:fixed;left:80px;top:150px";
  node.innerHTML = '<span class="city-castle stage-1"><img class="city-art" alt=""></span>';
  host.appendChild(node);
  const image = node.querySelector("img");
  const stages = [];
  for (const level of [1, 24, 25, 49, 50, 74, 75, 99, 100, 125]) {
    city.level = level; const stage = getCastleStage(level);
    applyCosmeticCityNode(node, city); await image.decode();
    assert(image.getAttribute("src") === item.assets[stage], `Wrong art at level ${level}`);
    assert(image.naturalWidth === 512, `Undecoded stage ${stage}`);
    assert(node.querySelectorAll(".halloween-bat").length === (stage >= 4 ? 3 : 2), "Wrong bat count");
    stages.push(stage);
  }
  const batLayer = node.querySelector(".halloween-city-bats");
  const observer = new MutationObserver(() => {}); observer.observe(node, { attributes: true, childList: true, subtree: true });
  for (let n = 0; n < 3; n++) applyCosmeticCityNode(node, city);
  assert(observer.takeRecords().length === 0, "Unchanged skin refresh rewrote the node or restarted bats"); observer.disconnect();
  assert(node.querySelector(".halloween-city-bats") === batLayer, "Bat layer was replaced");
  const originalMode = document.documentElement.dataset.animationMode;
  setAnimationModePreference("full");
  const flight = node.querySelector(".halloween-bat-flight"), wing = node.querySelector(".halloween-bat-wing");
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const before = [getComputedStyle(flight).transform, getComputedStyle(wing).transform];
  await new Promise(resolve => setTimeout(resolve, 240));
  assert(getComputedStyle(flight).transform !== before[0] && getComputedStyle(wing).transform !== before[1], "Flight or wingbeats frozen: " + JSON.stringify({before,after:[getComputedStyle(flight).transform,getComputedStyle(wing).transform],mode:document.documentElement.dataset.animationMode,animations:node.getAnimations({subtree:true}).map(a=>({state:a.playState,time:a.currentTime,name:a.animationName}))}));
  for (const mode of ["reduced", "off"]) {
    setAnimationModePreference(mode);
    assert(getComputedStyle(flight).animationPlayState === "paused" && getComputedStyle(wing).animationPlayState === "paused", `${mode} motion preference ignored`);
  }
  setAnimationModePreference(originalMode || "full");
  cosmeticState = C.equip(cosmeticState, "city", ""); applyCosmeticCityNode(node, city); await image.decode();
  assert(image.getAttribute("src") === getCastleAsset(5) && !node.querySelector(".halloween-city-bats"), "Default left the skin or bats behind");
  cosmeticOwnerAppearances.set("halloween-remote", { city: item.id });
  const remote = { ...city, owner: "enemy", ownerUid: "halloween-remote" };
  applyCosmeticCityNode(node, remote); await image.decode();
  assert(image.getAttribute("src") === item.assets[5], "Remote equipped owner did not render");
  cosmeticOwnerAppearances.set("halloween-remote", { city: "" }); applyCosmeticCityNode(node, remote);
  assert(image.getAttribute("src") === getCastleAsset(5), "Remote default did not remove skin");
  cosmeticState = C.equip(cosmeticState, "city", item.id);
  applyCosmeticCityNode(node, city);
  applyCosmeticCityNode(node, { ...city, owner: "enemy", ownerUid: "unskinned-captor" });
  assert(image.getAttribute("src") === getCastleAsset(5) && !node.querySelector(".halloween-city-bats"), "Captured city retained previous owner's appearance");
  applyCosmeticCityNode(node, city);
  const fail = image.onerror; assert(typeof fail === "function", "Missing art has no recovery"); fail();
  applyCosmeticCityNode(node, city); await image.decode();
  assert(image.getAttribute("src") === getCastleAsset(5) && !node.querySelector(".halloween-city-bats"), "Missing art did not fall back or retried forever");
  assert(cosmeticState.owned[item.id] && cosmeticState.equipped.city === item.id, "Art failure changed ownership");
  cosmeticFailedCityArt.clear();
  const stronghold = document.createElement("button"); stronghold.innerHTML = '<span class="stronghold-building"><img class="stronghold-art" src="unchanged.webp"></span>';
  applyCosmeticCityNode(stronghold, { ...city, kind: "stronghold" });
  assert(stronghold.querySelector("img").getAttribute("src") === "unchanged.webp" && !stronghold.dataset.citySkin && !stronghold.querySelector(".halloween-city-bats"), "Stronghold received regular city art");
  host.remove();
  // The real map renderer must resolve every owned city and each remote owner.
  const visibleIds = new Set([...cityLayer.querySelectorAll(".city-node")].map(node => node.dataset.cityId));
  const regular = state.cities.filter(city => !isStronghold(city) && visibleIds.has(city.id));
  assert(regular.length >= 10, "Fixture must supply ten visible regular cities");
  regular.slice(0, 5).forEach((city, index) => Object.assign(city, { owner: "player", ownerUid: cosmeticUid, level: [1, 25, 50, 75, 100][index] }));
  regular.slice(5, 10).forEach((city, index) => Object.assign(city, { owner: "enemy", ownerUid: "halloween-remote", level: [1, 25, 50, 75, 100][index] }));
  cosmeticOwnerAppearances.set("halloween-remote", { city: item.id });
  modal.close(); closeProfileScreen(); renderCities(true);
  const ownedNodes = [...cityLayer.querySelectorAll('.city-node[data-city-skin="halloween_city"]')];
  assert(ownedNodes.length >= 10, "The map did not update all owned and remote cities: " + JSON.stringify({ count: ownedNodes.length, fixtureCount: regular.length, uid: cosmeticUid, equipped: cosmeticState?.equipped }));
  await Promise.all(ownedNodes.map(node => node.querySelector(".city-art").decode()));
  assert(ownedNodes.every(node => node.querySelector(".halloween-city-bats")), "A skinned map city is missing bats");
  for (const city of regular.slice(0, 10)) {
    const rendered = cityLayer.querySelector(`[data-city-id="${city.id}"] .city-art`);
    assert(rendered?.getAttribute("src") === item.assets[getCastleStage(city.level)], "Map stage did not match owner level");
  }
  const originalProjection = getProjectedCityForInstantActions, pendingCity = regular[0];
  getProjectedCityForInstantActions = city => city.id === pendingCity.id ? { ...city, level: 25 } : originalProjection(city);
  renderCities(true);
  assert(cityLayer.querySelector(`[data-city-id="${pendingCity.id}"] .city-art`).getAttribute("src") === item.assets[2], "Pending upgrade must use its projected stage");
  getProjectedCityForInstantActions = originalProjection; renderCities(true);
  // Confirm the real map shows moving bats at a readable zoom, outside the
  // distant/crowded overview where decorative layers are intentionally hidden.
  setAnimationModePreference("full");
  setZoomAroundPoint(1.6, innerWidth / 2, innerHeight / 2); centerOnCity(regular[4].id);
  await new Promise(resolve => setTimeout(resolve, 1000)); renderCities(true);
  const closeupBat = cityLayer.querySelector(`[data-city-id="${regular[4].id}"] .halloween-bat`);
  assert(closeupBat?.getBoundingClientRect().width >= 10, "Map bats must be visible at city zoom");
  assert(getComputedStyle(closeupBat.parentElement).animationPlayState === "running", "Map bats did not resume after camera movement");
  for (const guard of ["camera-moving", "zooming"]) {
    mapFrame.classList.add(guard);
    try {
      for (const animated of closeupBat.closest(".halloween-city-bats").querySelectorAll(".halloween-bat-flight,.halloween-bat-wing")) {
        assert(getComputedStyle(animated).animationPlayState === "paused", `${guard} did not pause a bat animation`);
        assert(getComputedStyle(animated).willChange === "auto", `${guard} retained an animated bat layer`);
      }
    } finally { mapFrame.classList.remove(guard); }
  }
  assert(getComputedStyle(closeupBat.parentElement).animationPlayState === "running", "Map bats did not resume after CSS camera guards");
  return { stages, mapCities: ownedNodes.length, motion: "full/reduced/off passed", fallback: "passed", ownership: "own/remote/capture/default passed" };
}

(async () => {
  const server = createMapBenchmarkServer(), address = await server.listen();
  let session, client;
  const output = path.resolve(__dirname, "../release-artifacts/halloween-city-skin"); fs.mkdirSync(output, { recursive: true });
  const errors = [], results = [];
  try {
    const browser = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
    assert(browser, "Chromium required"); session = await startBrowserSession(browser);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all([client.send("Runtime.enable"), client.send("Page.enable")]);
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    for (const [width, height] of [[1440, 900], [844, 390]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
      for (let n = 0; n < 400 && !await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status === 'ready'"); n++) await pause(100);
      assert.equal(await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status"), "ready");
      results.push({ width, height, ...await evaluate(`(${checkCityArt.toString()})()`) });
      const image = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(output, `map-${width}x${height}.png`), Buffer.from(image.data, "base64"));
      const preview = await evaluate(`(async () => {
        cosmeticCategory="city"; cosmeticSelected="halloween_city"; openMySkins();
        await document.querySelector('.skin-detail [data-skin-preview-art]').decode();
        await Promise.all(profileScreen.getAnimations({subtree:true}).filter(animation=>animation.effect.getTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{})));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        for(let n=0;n<30 && !document.querySelector('.skin-detail .halloween-city-bats[data-skin-motion=active]');n++) await new Promise(resolve=>setTimeout(resolve,50));
        const bats=[...document.querySelectorAll('.skin-detail .halloween-bat')];
        return bats.map(bat=>({width:bat.getBoundingClientRect().width,height:bat.getBoundingClientRect().height,display:getComputedStyle(bat).display,fill:getComputedStyle(bat).fill}));
      })()`);
      assert(preview.length === 3 && preview.every(bat => bat.width > 0 && bat.height > 0 && bat.display !== "none"), JSON.stringify(preview));
      assert(await evaluate("document.querySelector('.skin-detail').getAnimations({subtree:true}).some(a=>a.playState==='running')"), "Selected preview must animate");
      assert.equal(await evaluate("document.querySelector('.skins-grid').getAnimations({subtree:true}).filter(a=>a.playState==='running').length"), 0, "Collection thumbnails must remain static");
      assert.equal(await evaluate("cityLayer.getAnimations({subtree:true}).filter(a=>a.animationName?.startsWith('halloweenBat') && a.playState==='running').length"), 0, "Map bats must stop behind Profile");
      const profileImage = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(output, `profile-${width}x${height}.png`), Buffer.from(profileImage.data, "base64"));
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, "validation.json"), JSON.stringify({ results, errors }, null, 2));
    console.log("Halloween city skin passed: all stage boundaries, visible motion, stable nodes, defaults, capture, remote owners, missing-art recovery and strongholds at desktop/landscape sizes.");
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (session) { await waitForProcessExit(session.browserProcess); await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
