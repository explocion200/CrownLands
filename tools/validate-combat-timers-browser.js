"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const artifacts = path.resolve(__dirname, "../release-artifacts/combat-timers");
async function main() {
  const browser = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(browser, "Set CHROME_PATH to a Chromium browser.");
  fs.mkdirSync(artifacts, { recursive: true });
  const server = createMapBenchmarkServer(), address = await server.listen();
  let session, client;
  const errors = [], results = [];
  try {
    session = await startBrowserSession(browser);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all([client.send("Page.enable"), client.send("Runtime.enable")]);
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails?.exception?.description || event.exceptionDetails?.text));
    const evaluate = async (fn, arg) => {
      const result = await client.send("Runtime.evaluate", { expression: `(${fn.toString()})(${JSON.stringify(arg ?? null)})`, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
    for (let i = 0; i < 240 && !await evaluate(() => window.__CROWNLANDS_BENCHMARK__?.getStatus().status === "ready"); i++) await wait(250);
    assert.equal(await evaluate(() => window.__CROWNLANDS_BENCHMARK__?.getStatus().status), "ready");
    // Only the loopback game fixture receives synthetic snapshots; no production calls.
    await evaluate(() => {
      window.__CROWNLANDS_BENCHMARK__.closeModal();
      pendingOfflineRewardsSummary = null;
      getCurrentOnlineUid = () => "combat-viewer";
      window.combatFixtureNow = getClanQuestServerNowMs();
      window.combatFixture = { uid: "combat-viewer", shieldExpiresAtMs: combatFixtureNow + 900_000,
        retaliation: Array.from({ length: 12 }, (_, i) => ({ id: `capture-${i}`, cityId: `city-${i}`, cityName: i === 0 ? "Stoneward Keep" : `Captured city ${i + 1}`,
          regionId: "Northgate March", status: "available", capturedAtMs: combatFixtureNow - 10_000, expiresAtMs: combatFixtureNow + 300_000 + i * 30_000 })) };
      onlineCombatAuthorization = structuredClone(combatFixture);
      renderCombatTimers();
    });
    for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "landscape", width: 844, height: 390 }, { name: "small-landscape", width: 568, height: 320 }]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false });
      const chatClear = await evaluate(() => {
        document.querySelector("#combatTimers details").open = false;
        const a = document.getElementById("combatTimers").getBoundingClientRect(), b = document.getElementById("chatToggleBtn").getBoundingClientRect();
        return a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom;
      });
      assert(chatClear, `Combat timers overlap Chat at ${viewport.name}`);
      await evaluate(() => { document.querySelector("#combatTimers details").open = true; renderCombatTimers(); });
      await wait(150);
      const layout = await evaluate(() => {
        const timers = document.getElementById("combatTimers"), gold = document.querySelector(".profile-gold");
        const r = timers.getBoundingClientRect(), g = gold.getBoundingClientRect();
        const panel = timers.querySelector(".retaliation-list-panel"), p = panel.getBoundingClientRect();
        const chat=document.getElementById("quickChat"),c=chat.getBoundingClientRect();
        return { belowGold: r.top >= g.bottom, width: r.width,height:r.height, bounds: { x: r.x, y: r.y, bottom: r.bottom },
          chatBounds:{x:c.x,y:c.y,width:c.width,height:c.height},panelBounds:{x:p.x,y:p.y,width:p.width,height:p.height},
          chatClear:chat.hidden||p.right<=c.left||p.left>=c.right||p.bottom<=c.top||p.top>=c.bottom,
          listVisible: p.left >= 0 && p.right <= innerWidth && p.top >= 0 && p.bottom <= innerHeight,
          scrollable: panel.scrollHeight > panel.clientHeight, count: timers.querySelectorAll("li").length, locations:timers.querySelectorAll(".retaliation-location").length,text: timers.innerText,
          listOnTop: panel.contains(document.elementFromPoint(p.left + 15, p.bottom - 15)) };
      });
      assert(layout.belowGold && layout.width <= 156 && layout.height<=48 && layout.listVisible && layout.scrollable && layout.listOnTop, JSON.stringify({ viewport, layout }));
      assert.equal(layout.count, 12);
      assert.equal(layout.locations,12);
      assert(layout.chatClear,"City list must not cover mini chat: "+JSON.stringify({viewport,layout}));
      assert.match(layout.text, /12 Active/);
      const shot = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(artifacts, viewport.name + ".png"), Buffer.from(shot.data, "base64"));
      results.push({ viewport, layout });
    }
    const navigation = await evaluate(async () => {
      const element=document.getElementById("combatTimers"),ui=CrownlandsCombatTimersUI;
      const snapshot=structuredClone(combatFixture),before=JSON.stringify(snapshot),calls=[];
      let resolve,success=false;
      const navigate=(cityId,regionId)=>{calls.push([cityId,regionId]);return new Promise(done=>{resolve=done;});};
      ui.render(element,snapshot,combatFixtureNow,navigate);
      const list=element.querySelector(".retaliation-list-panel");
      const last=element.querySelector("li:last-child button");
      last.scrollIntoView({block:"nearest"});
      const r=last.getBoundingClientRect(),p=list.getBoundingClientRect();
      const reachable=r.top>=p.top&&r.bottom<=p.bottom&&last.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
      last.focus();last.click();element.querySelector("li button").click();
      const duplicateBlocked=calls.length===1&&last.disabled;
      resolve(false);await Promise.resolve();await Promise.resolve();
      const failureRetainsList=element.querySelector("details").open&&!last.disabled&&element.textContent.includes("Reconnect and try again");
      last.click();resolve(true);await Promise.resolve();await Promise.resolve();
      success=!element.querySelector("details").open;
      const permissionPreserved=JSON.stringify(snapshot)===before&&ui.activeRecords(snapshot.retaliation,combatFixtureNow).length===12;
      ui.render(element,snapshot,combatFixtureNow+900_001,navigate);
      element.querySelector("[data-retaliation-location]")?.click();
      const expiredIgnored=calls.length===2;
      ui.render(element,{},combatFixtureNow,navigate);
      const signedOutIgnored=element.querySelectorAll("[data-retaliation-location]").length===0;
      // Exercise the real game callback on a loaded fixture city as well.
      const target=state.cities[0],originalSelect=selectCity,originalRegion=getActiveMapRegionId;
      // The benchmark uses synthetic cities independently of its backdrop.
      getActiveMapRegionId=()=>getCityRegionId(target);
      let selected="";
      selectCity=id=>{selected=id;};
      onlineCombatAuthorization={uid:"combat-viewer",retaliation:[{id:"real-map",cityId:target.id,cityName:target.name,regionId:getCityRegionId(target),status:"available",expiresAtMs:getClanQuestServerNowMs()+60_000}]};
      renderCombatTimers();
      element.querySelector("details").open=true;
      element.querySelector("[data-retaliation-location]").click();
      await Promise.resolve();await Promise.resolve();
      selectCity=originalSelect;
      getActiveMapRegionId=originalRegion;
      const runtimeWired=selected===target.id&&!element.querySelector("details").open;
      return {reachable,duplicateBlocked,failureRetainsList,success,permissionPreserved,expiredIgnored,signedOutIgnored,runtimeWired,calls};
    });
    assert(Object.entries(navigation).filter(([key])=>key!=="calls").every(([,value])=>value),JSON.stringify(navigation));
    assert.deepEqual(navigation.calls,[["city-11","Northgate March"],["city-11","Northgate March"]],"Map uses the selected record's exact immutable city and map.");
    const states = await evaluate(() => {
      const element = document.getElementById("combatTimers"), ui = CrownlandsCombatTimersUI;
      const single = { ...combatFixture, retaliation: [combatFixture.retaliation[0]] };
      ui.render(element, single, combatFixtureNow);
      const one = element.querySelector("summary").textContent;
      const title = element.querySelector("summary").title;
      ui.render(element, single, combatFixtureNow + 300_001);
      const retaliationExpired = element.querySelector("details").hidden;
      ui.render(element, single, combatFixtureNow + 900_001);
      const allExpired = element.hidden;
      ui.render(element, {}, combatFixtureNow);
      const signedOut = element.hidden;
      // Reconstruct the view from the same server timestamps, at a later time.
      ui.render(element, JSON.parse(JSON.stringify(combatFixture)), combatFixtureNow + 30_000);
      const reconstructed = element.querySelector("[data-shield-cooldown] strong").textContent;
      const reboundCount = element.querySelectorAll("li").length;
      return { one, title, retaliationExpired, allExpired, signedOut, reconstructed, reboundCount };
    });
    assert.match(states.one, /05:00/);
    assert.match(states.title, /Stoneward Keep/);
    assert(states.retaliationExpired && states.allExpired && states.signedOut);
    assert.equal(states.reconstructed, "14:30");
    assert.equal(states.reboundCount, 12);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(artifacts, "verification.json"), JSON.stringify({ results, navigation, states, errors }, null, 2));
    console.log("Combat timers browser passed: under Gold, all 12 records, scrolling at three supported sizes, single-city label, independent expiry, account clearing and timestamp reconstruction.");
  } finally {
    if (client) await client.send("Browser.close").catch(() => {});
    if (session) { await waitForProcessExit(session.browserProcess); await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
