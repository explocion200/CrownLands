"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const root = path.resolve(__dirname, ".."), pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const assets = JSON.parse(fs.readFileSync(path.join(root, "docs/art-sources/report-actions/assets.json"), "utf8"));
async function main() {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Set CHROME_PATH to Chromium.");
  const server = createMapBenchmarkServer(), address = await server.listen();
  const output = path.join(root, "release-artifacts/report-artwork"); fs.mkdirSync(output, { recursive: true });
  let session, client; const errors = [], checks = [];
  try {
    session = await startBrowserSession(executable); client = await CdpClient.connect(session.targets.find(t => t.type === "page").webSocketDebuggerUrl);
    await client.send("Runtime.enable"); await client.send("Page.enable"); await client.send("Network.enable");
    client.on("Runtime.exceptionThrown", e => errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
    client.on("Network.responseReceived", e => { if (e.response.status >= 400 && /report-.*-ink-/.test(e.response.url)) errors.push(e.response.url); });
    const ev = async expression => { const r = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
    const ready = async expression => { for (let i = 0; i < 400; i++) { if (await ev(expression)) return; await pause(75); } throw Error("Timeout: " + expression); };
    const settled = () => ready("modal.open && [...modal.querySelector(':scope > .modal-card').getAnimations()].every(a => !a.pending && a.playState !== 'running')");
    const fixture = async file => { await ev(fs.readFileSync(path.join(root, file), "utf8")); await settled(); await ev("document.querySelectorAll('#reportsRuntimeControls,#detailRuntimeExample,#scoutRuntimeExample').forEach(e=>e.remove())"); };
    const shot = async name => fs.writeFileSync(path.join(output, name + ".png"), Buffer.from((await client.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
    const inspect = async (name, keys) => {
      await settled();
      const result = await ev(`(async()=>{
        const sources=[...modalBody.querySelectorAll('image')].map(e=>e.getAttribute('href'));
        const missing=${JSON.stringify(keys)}.filter(k=>!sources.includes(getReportIconArt(k)));
        const unique=[...new Set(sources.filter(s=>s?.includes('/report-')))];
        for(const src of unique){const img=new Image();img.src=src;await img.decode();if(img.naturalWidth!==384)throw Error('Invalid artwork '+src);}
        const card=modal.querySelector(':scope > .modal-card').getBoundingClientRect();
        const header=modalBody.querySelector('.window-header');
        const close=header?.querySelector('button[aria-label^="Close"]');
        const r=close?.getBoundingClientRect(),h=header?.getBoundingClientRect();
        return{missing,art:unique.length,width:card.width,height:card.height,inside:card.left>=-1&&card.top>=-1&&card.right<=innerWidth+1&&card.bottom<=innerHeight+1,
          closeInside:!r||(r.left>=h.left-1&&r.right<=h.right+1&&r.top>=h.top-1&&r.bottom<=h.bottom+1),fullscreen:!!document.fullscreenElement};
      })()`);
      assert.deepEqual(result.missing, [], name + " missing art"); assert(result.inside && result.closeInside, name + " clipped frame/close");
      checks.push({ name, ...result }); await shot(name);
    };
    for (const [label, width, height] of [["desktop",1440,900],["landscape",844,390],["compact",568,320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 1000 });
      await client.send("Emulation.setTouchEmulationEnabled", { enabled: width < 1000, maxTouchPoints: 1 });
      await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
      await ready("window.__CROWNLANDS_BENCHMARK__?.getStatus().status==='ready'");
      await ev("__CROWNLANDS_BENCHMARK__.closeModal();levelUpRewardQueue.length=0;activeLevelUpReward=null;pendingOfflineRewardsSummary=null;supportsRealmActivity=()=>true;");
      const identity = await ev(`(async()=>{const out={};for(const key of ['reports','attack','shield','scout']){const d=document.createElement('div');d.innerHTML=renderCrownlandsIcon(key);out[key]=d.querySelector('image')?.getAttribute('href');}out.hud=document.querySelector('#cl-icon-reports image')?.getAttribute('href');out.hudUse=document.querySelector('#logBtn use')?.getAttribute('href');for(const a of ${JSON.stringify(assets)}){const img=new Image();img.src=a.path;await img.decode();const c=document.createElement('canvas');c.width=c.height=384;const x=c.getContext('2d');x.drawImage(img,0,0);const d=x.getImageData(0,0,384,384).data;if(d[3]!==0||!d.some((v,i)=>i%4===3&&v>0))throw Error('Lost alpha '+a.name);}return out;})()`);
      for (const key of ["reports","attack","shield","scout"]) assert.equal(identity[key], assets.find(a=>a.name===(key==="shield"?"defense":key)).path);
      assert.equal(identity.hud, identity.reports); assert.equal(identity.hudUse, "#cl-icon-reports");
      for (const full of [false,true]) {
        if (full) await ev("document.documentElement.requestFullscreen()");
        const tag=label+(full?"-fullscreen":"-window");
        await fixture("docs/visual-qa/battle-reports-ledger/runtime-fixture.js");
        await inspect(tag+"-reports",["reports","attack","defense","scout","realm"]);
        for(const filter of ["attack","defense","scout","realm_activity","all"]) {
          await ev(`document.querySelector('[data-report-filter="${filter}"]').click()`); await settled();
          assert.equal(await ev("battleReportFilter"),filter);
        }
        await ev("battleReportFilter='realm_activity';onlineRealmActivityEvents=[];showLogModal({silentAudio:true})");
        await inspect(tag+"-realm",["realm"]);
        await fixture("docs/visual-qa/battle-report-detail/runtime-fixture.js");
        await inspect(tag+"-attack",["attack"]);
        await ev("showBattleReportDetail('detail-defeat')"); await inspect(tag+"-defense",["defense"]);
        await fixture("docs/visual-qa/scout-reports-ledger/runtime-fixture.js");
        await inspect(tag+"-scout",["scout","defense"]);
        await ev("__scoutRuntimeReview.show('scouted')"); await inspect(tag+"-disclosure",["scout","reports"]);
        const point=await ev("(()=>{const r=modalBody.querySelector('[data-scout-close]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()");
        if(width<1000){await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[point]});await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});}
        else {await client.send("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,...point});await client.send("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",clickCount:1,...point});}
        await ready("!modal.open"); if(full)await ev("document.exitFullscreen()");
      }
    }
    assert.deepEqual(errors,[]); fs.writeFileSync(path.join(output,"checks.json"),JSON.stringify({checks,errors},null,2));
    console.log(`Report artwork: ${checks.length} desktop/mobile/fullscreen views passed; shared icons, alpha, filters and close controls passed.`);
  } finally {
    if(client){await client.send("Browser.close").catch(()=>{});client.close();}
    if(session){await waitForProcessExit(session.browserProcess);await removeBrowserProfile(session.profilePath);} await server.close();
  }
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
