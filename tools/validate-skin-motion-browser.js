"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const { execFileSync } = require("node:child_process");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const baselineRef = process.argv.find(value => value.startsWith("--baseline-ref="))?.split("=")[1];
const baseline = !!baselineRef;
const root = path.resolve(__dirname, "..");
// Isolate the real skin renderer and game styles from the simulation/network loop.
// The separate Halloween browser suite checks integration with the live map DOM.
function fixtureHtml(url) {
  const source = file => baseline ? execFileSync("git", ["show", `${baselineRef}:${file}`], { cwd: root, encoding: "utf8" }) : fs.readFileSync(path.join(root, file), "utf8");
  const styles = [...source("index.html").matchAll(/<link rel="stylesheet" href="([^\"]+)"/g)]
    .map(match => match[1]).filter(href => !href.startsWith("http") && !href.startsWith("skins-ui.css"));
  return `<!doctype html><html><head><base href="${url}/">${styles.map(href => `<link rel="stylesheet" href="${href}">`).join("")}
    <style>${source("skins-ui.css")}</style></head><body><div id="profileScreen"></div><dialog id="modal"></dialog><div id="skinsView"></div><div id="cityLayer"></div>
    <script>${source("functions/cosmetics.js")}</script><script>
      function getCastleStage() { return 5; }
      function getCastleAsset() { return CrownlandsCosmetics.item("halloween_city").assets[5]; }
      function isStronghold() { return false; }
      function getCurrentOnlineUid() { return "skin-motion-fixture"; }
    </script><script>${source("skins-ui.js")}</script></body></html>`;
}
async function scene() {
  document.documentElement.dataset.animationMode = "full";
  getCurrentOnlineUid = () => "skin-motion-fixture"; cosmeticUid = getCurrentOnlineUid();
  cosmeticState = COSMETIC_CATALOG.normalize({ owned: { halloween_city: true }, equipped: { city: "halloween_city" } });
  const host = document.createElement("div"); host.id = "skinMotionFixture"; host.className = "map-frame";
  host.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;z-index:10000;background:#b7b26c;overflow:hidden";
  document.body.append(host);
  for (let n = 0; n < 60; n++) {
    const node = document.createElement("button"); node.className = "city-node player";
    const visible = n < 40, column = n % 10, row = Math.floor(n / 10) % 4;
    node.style.cssText = `position:absolute;left:${(column + .5) * innerWidth / 10 + (visible ? 0 : innerWidth * 2)}px;top:${(row + .6) * innerHeight / 4}px`;
    node.innerHTML = '<span class="city-castle stage-5"><img class="city-art" alt=""></span>';
    host.append(node);
    applyCosmeticCityNode(node, { id: `motion-${n}`, level: 100, owner: "player", ownerUid: cosmeticUid });
  }
  await Promise.all([...host.querySelectorAll("img")].map(image => image.decode()));
  await new Promise(resolve => setTimeout(resolve, 500));
  return { cities: host.children.length, visible: 40, offscreen: 20 };
}
async function main() {
  const server = createMapBenchmarkServer(), address = await server.listen(); let session, client;
  const results = [], errors = [], output = path.resolve(__dirname, "../release-artifacts/skin-motion"); fs.mkdirSync(output, { recursive: true });
  try {
    const browser = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
    assert(browser, "Chromium required"); session = await startBrowserSession(browser);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all([client.send("Runtime.enable"), client.send("Page.enable"), client.send("Performance.enable")]);
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const evaluate = async expression => { const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; };
    const metrics = async () => Object.fromEntries((await client.send("Performance.getMetrics")).metrics.map(metric => [metric.name, metric.value]));
    for (const [width, height] of [[1440, 900], [844, 390]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      await client.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      await client.send("Page.navigate", { url: address.url + "/__skin_motion_fixture__" });
      await delay(100);
      const { frameTree } = await client.send("Page.getFrameTree");
      await client.send("Page.setDocumentContent", { frameId: frameTree.frame.id, html: fixtureHtml(address.url) });
      for (let n = 0; n < 100 && !await evaluate("typeof applyCosmeticCityNode === 'function'"); n++) await delay(100);
      assert.equal(await evaluate("typeof applyCosmeticCityNode"), "function");
      const fixture = await evaluate(`(${scene.toString()})()`);
      await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      const before = await metrics();
      const frames = await evaluate(`new Promise(resolve=>{const times=[];let last=performance.now(),start=last;function frame(now){times.push(now-last);last=now;if(now-start<3000)requestAnimationFrame(frame);else resolve(times.slice(1).sort((a,b)=>a-b));}requestAnimationFrame(frame);})`);
      const after = await metrics();
      const active = await evaluate("skinMotionFixture.getAnimations({subtree:true}).filter(animation=>animation.playState==='running').length");
      const row = { width, height, ...fixture, cpuThrottle: 4, activeAnimations: active, frameP95Ms: frames[Math.floor(frames.length * .95)], taskMs: (after.TaskDuration - before.TaskDuration) * 1000, styleMs: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000, layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000 };
      results.push(row); console.log(JSON.stringify(row));
      if (!baseline) {
        assert(active > 0 && active <= (width <= 1000 ? 6 : 8) * 6, "Active map animations must stay within the city budget");
        assert.equal(await evaluate("[...skinMotionFixture.children].slice(40).reduce((n,node)=>n+node.getAnimations({subtree:true}).filter(a=>a.playState==='running').length,0)"), 0, "Offscreen cities must not animate");
      }
      await client.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      if (!baseline) {
        const running = "skinMotionFixture.getAnimations({subtree:true}).filter(a=>a.playState==='running').length";
        const settle = () => delay(250);
        for (const className of ["camera-moving", "zooming", "low-zoom", "crowded-map"]) {
          await evaluate(`skinMotionFixture.classList.add('${className}')`); await settle();
          assert.equal(await evaluate(running), 0, `${className} must stop decorative motion`);
          await evaluate(`skinMotionFixture.classList.remove('${className}')`); await settle();
        }
        for (const mode of ["off", "reduced"]) {
          await evaluate(`document.documentElement.dataset.animationMode='${mode}'`); await settle();
          assert.equal(await evaluate(running), 0, `${mode} preference must stop motion`);
        }
        await evaluate("document.documentElement.dataset.animationMode='full';profileScreen.classList.add('open')"); await settle();
        assert.equal(await evaluate(running), 0, "Profile must stop covered map animations");
        await evaluate("profileScreen.classList.remove('open');modal.showModal()"); await settle();
        assert.equal(await evaluate(running), 0, "Modal must stop covered map animations");
        await evaluate("modal.close()"); await settle();
        assert(await evaluate(running) > 0, "Motion must resume after closing overlays");
        // Simulate a pan: old visible cities leave and previously offscreen cities enter.
        await evaluate("[...skinMotionFixture.children].forEach((node,n)=>{node.style.left=(n<40 ? -innerWidth*2 : (n%10+.5)*innerWidth/10)+'px';})"); await settle();
        assert.equal(await evaluate("[...skinMotionFixture.children].slice(0,40).reduce((n,node)=>n+node.getAnimations({subtree:true}).filter(a=>a.playState==='running').length,0)"), 0, "Cities leaving the viewport must release their slots");
        assert(await evaluate(running) > 0, "Newly visible cities must receive animation slots");
        await evaluate("window.recycledSkinFixture=skinMotionFixture;skinMotionFixture.remove()"); await settle();
        await evaluate("document.body.append(recycledSkinFixture);[...skinMotionFixture.children].forEach((node,n)=>applyCosmeticCityNode(node,{id:'motion-'+n,level:100,owner:'player',ownerUid:cosmeticUid}))"); await settle();
        assert(await evaluate(running) > 0, "Recycled city nodes must be observed again after map removal");
        await evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))");
        assert.equal(await evaluate(running), 0, "Hidden page must stop animations without waiting for a frame");
        await evaluate("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));skinMotionFixture.remove()"); await settle();
      }
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, baseline ? "before.json" : "after.json"), JSON.stringify({ results, errors }, null, 2));
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (session) { await waitForProcessExit(session.browserProcess); await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
