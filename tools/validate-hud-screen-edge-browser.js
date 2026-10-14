"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const output = path.resolve(__dirname, "../release-artifacts/hud-screen-edge");

function measure() {
  const rect = element => {
    const r = element.getBoundingClientRect();
    return { x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom };
  };
  const edges = [".profile-action-row", ".profile-resources", ".profile-gold", "#crownsBalance", "#combatTimers", "#logBtn"]
    .map(selector => ({ selector, ...rect(document.querySelector(selector)) }));
  const ids = ["profileBtn", "leaderboardBtn", "clanHudBtn", "dailyLoginRewardBtn", "innerCityHudBtn", "staminaButton", "fullscreenBtn", "logBtn", "inventoryBtn", "shopBtn", "cityListBtn", "islandSwitchBtn"];
  const controls = ids.map(id => {
    const element = document.getElementById(id), r = rect(element);
    return { id, ...r, hit:element.contains(document.elementFromPoint(r.x+r.width/2, r.y+r.height/2)) };
  });
  const overlap = (a,b) => Math.min(a.right,b.right)-Math.max(a.x,b.x)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1;
  const collisions = controls.flatMap((a,i) => controls.slice(i+1).filter(b => overlap(a,b)).map(b => [a.id,b.id]));
  return { width:innerWidth, height:innerHeight, fullscreen:!!document.fullscreenElement,
    coarse:matchMedia("(pointer:coarse)").matches, edges, controls, collisions };
}

async function main() {
  fs.mkdirSync(output, { recursive:true });
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && fs.existsSync(p));
  assert(executable, "Chromium required");
  const server = createMapBenchmarkServer(), address = await server.listen();
  let browser, client;
  const records = [], errors = [], failedAssets = [];
  try {
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(t => t.type === "page").webSocketDebuggerUrl);
    await Promise.all(["Page.enable", "Runtime.enable", "Network.enable"].map(method => client.send(method)));
    client.on("Runtime.exceptionThrown", e => errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
    client.on("Network.responseReceived", e => {
      if (e.response.status >= 400 && ["Image", "Stylesheet", "Script"].includes(e.type)) failedAssets.push(e.response.url);
    });
    const ev = async expression => {
      const r = await client.send("Runtime.evaluate", { expression, awaitPromise:true, returnByValue:true });
      if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const wait = async expression => {
      for (let i=0;i<400;i++) { if (await ev(expression)) return; await pause(50); }
      throw Error("Timeout: " + expression + " " + JSON.stringify(errors));
    };
    const press = async (id, touch) => {
      const point = await ev(`(()=>{const r=document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      if (touch) {
        await client.send("Input.dispatchTouchEvent", { type:"touchStart", touchPoints:[point] });
        await client.send("Input.dispatchTouchEvent", { type:"touchEnd", touchPoints:[] });
      } else {
        await client.send("Input.dispatchMouseEvent", { type:"mousePressed", button:"left", clickCount:1, ...point });
        await client.send("Input.dispatchMouseEvent", { type:"mouseReleased", button:"left", clickCount:1, ...point });
      }
    };
    await client.send("Emulation.setDeviceMetricsOverride", { width:1440, height:800, deviceScaleFactor:1, mobile:false });
    await client.send("Page.navigate", { url:address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
    await client.send("Page.bringToFront");
    await wait("document.documentElement?.dataset.crownlandsBenchmarkReady==='true'");
    await ev(`__CROWNLANDS_BENCHMARK__.closeModal();
      levelUpRewardQueue.length=0;activeLevelUpReward=null;pendingOfflineRewardsSummary=null;
      const autoKey=getDailyLoginRewardAutoOpenKey();if(autoKey)localStorage.setItem(autoKey,'1');
      onlineCombatAuthorization={uid:getCurrentOnlineUid(),shieldExpiresAtMs:getClanQuestServerNowMs()+900000,retaliation:[]};renderCombatTimers();
      toast.classList.remove('visible');`);
    const cases = [
      { name:"desktop", mobile:false, window:[1440,800], full:[1920,1080], left:0, right:0 },
      { name:"landscape", mobile:true, window:[844,350], full:[844,390], left:0, right:0 },
      { name:"landscape-left", mobile:true, window:[844,350], full:[844,390], left:36, right:0 },
      { name:"compact-left", mobile:true, window:[568,280], full:[568,320], left:44, right:0 },
      { name:"landscape-right", mobile:true, window:[844,350], full:[844,390], left:0, right:44 },
      { name:"fullscreen-cutout", mobile:true, window:[844,350], full:[844,390], left:0, right:0, fullLeft:36 },
    ];
    for (const test of cases) {
      await client.send("Emulation.setTouchEmulationEnabled", { enabled:test.mobile });
      // Real CSS env() values, including a cutout that changes on fullscreen entry.
      for (const mode of ["windowed", "fullscreen", "restored"]) {
        if (mode !== "windowed") {
          await press("fullscreenBtn", test.mobile);
          await wait(mode === "fullscreen" ? "!!document.fullscreenElement" : "!document.fullscreenElement");
        }
        const [width,height] = mode === "fullscreen" ? test.full : test.window;
        const safeArea = { left:mode === "fullscreen" ? test.fullLeft ?? test.left : test.left, right:test.right };
        await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor:1, mobile:test.mobile });
        await client.send("Emulation.setSafeAreaInsetsOverride", { insets:{ ...safeArea, top:0, bottom:0 } });
        await pause(250);
        await ev("__CROWNLANDS_BENCHMARK__.setVisualZoom(1);toast.classList.remove('visible')");
        const layout = await ev(`(${measure})()`), label = test.name + "-" + mode;
        assert.equal(layout.fullscreen, mode === "fullscreen", label);
        assert.equal(layout.coarse, test.mobile, label);
        const report = layout.edges.at(-1);
        assert.equal(report.x, 12, "Reports moved: " + label);
        for (const edge of layout.edges) assert(Math.abs(edge.x-report.x)<.1, "HUD edge mismatch: " + label + " " + JSON.stringify(layout.edges));
        assert(layout.controls.every(r => r.hit && r.width>0 && r.height>0 && r.x>=0 && r.y>=0 && r.right<=width+1 && r.bottom<=height+1), "Unreachable control: " + label + " " + JSON.stringify(layout.controls));
        assert.deepEqual(layout.collisions, [], "HUD overlap: " + label);
        await ev("__CROWNLANDS_BENCHMARK__.setVisualZoom(2.2)");
        assert.deepEqual(await ev(`(${measure})()`), layout, "Map zoom shifts HUD: " + label);
        fs.writeFileSync(path.join(output,label+".png"), Buffer.from((await client.send("Page.captureScreenshot", { format:"png" })).data,"base64"));
        // Pointer/touch delivery reaches the existing controls after each transition.
        await press("profileBtn", test.mobile);
        await wait("document.getElementById('profileScreen').classList.contains('open')");
        await ev("document.getElementById('profileCloseBtn').click()");
        await press("logBtn", test.mobile); await wait("modal.open");
        await ev("__CROWNLANDS_BENCHMARK__.closeModal()");
        await pause(100);
        records.push({ name:test.name, mode, safeArea, ...layout });
      }
    }
    assert.deepEqual(errors, []); assert.deepEqual(failedAssets, []);
    fs.writeFileSync(path.join(output,"checks.json"), JSON.stringify({ passed:true, records, errors, failedAssets },null,2));
    console.log(`Validated ${records.length} HUD layouts with native fullscreen entry/exit, desktop/mobile resizing, safe-area insets, map zoom and mouse/touch actions.`);
  } finally {
    if (client) { await client.send("Browser.close").catch(()=>{}); client.close(); }
    if (browser) {
      if (!await waitForProcessExit(browser.browserProcess)) { browser.browserProcess.kill(); await waitForProcessExit(browser.browserProcess); }
      await removeBrowserProfile(browser.profilePath);
    }
    await server.close();
  }
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode=1; });
