"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");

const root = path.resolve(__dirname, "..");
const measureOnly = process.argv.includes("--measure-only");
const files = new Set(["inner-city-estate.js", "inner-city-estate.css", "estate-economy-ui.js", "action-buttons.css"]);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "A Chromium browser is required.");
  const server = http.createServer((request, response) => {
    const file = new URL(request.url, "http://127.0.0.1").pathname.slice(1);
    if (!file) {
      response.writeHead(200, { "content-type": "text/html", "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'" });
      response.end('<!doctype html><html><head><link rel="stylesheet" href="inner-city-estate.css"><link rel="stylesheet" href="action-buttons.css"></head><body style="margin:0"><div id="fixture" style="width:100vw;height:100vh"></div><script src="inner-city-estate.js"></script><script src="estate-economy-ui.js"></script></body></html>');
    } else if (files.has(file) || /^assets\/inner-city-estate\/[a-z0-9-]+\.webp$/.test(file)) {
      response.writeHead(200, { "content-type": file.endsWith(".js") ? "application/javascript" : file.endsWith(".css") ? "text/css" : "image/webp" });
      response.end(fs.readFileSync(path.join(root, file)));
    } else response.writeHead(404).end();
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let session, client;
  const errors = [];
  try {
    session = await startBrowserSession(executable);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    for (const viewport of [{ width:1440, height:900 }, { width:844, height:390 }]) {
      await client.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor:1, mobile:false });
      await client.send("Page.navigate", { url:`http://127.0.0.1:${server.address().port}/` });
      for (let i = 0; i < 100 && !await evaluate("!!window.CrownlandsEstateEconomy"); i++) await delay(50);
      await evaluate(`(() => {
        const host = document.getElementById('fixture');
        window.qaBalances = Object.fromEntries(CrownlandsEstate.resources.map(r => [r.key, 12345]));
        window.qaEstate = { levels:Object.fromEntries(CrownlandsEstate.buildings.map(b => [b.key, 1])), jobs:[] };
        window.qaNow = 1000000;
        window.qaView = CrownlandsEstate.mount(host, {
          estate:qaEstate, getResources:()=>qaBalances, now:()=>qaNow,
          onBuilding:()=>{}, onUpgrade:()=>{},
          actions:CrownlandsEstateEconomy.mapActions(()=>'<svg aria-hidden="true"></svg>', null),
        });
        qaView.select('treasury');
      })()`);
      await delay(100);
      const measurements = await evaluate(`(() => {
        const host = document.getElementById('fixture');
        const observer = new MutationObserver(()=>{});
        observer.observe(host, { subtree:true, childList:true, attributes:true, characterData:true });
        let start = performance.now();
        for (let i=0; i<20; i++) qaView.updateResources();
        const resource = { mutations:observer.takeRecords().length, ms:performance.now()-start };
        const detail = host.querySelector('[data-estate-detail-copy] h3');
        start = performance.now();
        for (let i=0; i<20; i++) qaView.updateEstate(structuredClone(qaEstate));
        const snapshot = { mutations:observer.takeRecords().length, ms:performance.now()-start,
          sameDetail:detail===host.querySelector('[data-estate-detail-copy] h3') };
        observer.disconnect();
        return {resource, snapshot};
      })()`);
      console.log(JSON.stringify({ viewport, ...measurements }));
      if (!measureOnly) {
        assert.equal(measurements.resource.mutations, 0, "Unchanged resource/timer refreshes must not mutate the DOM.");
        assert.equal(measurements.snapshot.mutations, 0, "Unchanged authoritative snapshots must not repaint the estate.");
        assert(measurements.snapshot.sameDetail, "An unchanged snapshot must preserve detail nodes.");
      }
      const changed = await evaluate(`(() => {
        const host = document.getElementById('fixture');
        qaBalances.gold = 12346; qaView.updateResources();
        const gold = host.querySelector('[data-estate-resource="gold"]');
        qaEstate.jobs = [{building:'treasury', status:'running', target:2, durationMs:10000, completesAtMs:qaNow+10000}];
        qaView.updateEstate(structuredClone(qaEstate));
        const timer = host.querySelector('[data-estate-construction="treasury"]');
        const running = timer.getAttribute('aria-valuenow')==='0' && host.querySelector('[data-estate-site="treasury"]').dataset.siteState==='constructing';
        qaNow += 5000; qaView.updateResources();
        const progress = timer.getAttribute('aria-valuenow');
        const stableObserver = new MutationObserver(()=>{});
        stableObserver.observe(host,{subtree:true,attributes:true,childList:true,characterData:true});
        for(let i=0;i<10;i++)qaView.updateResources();
        const runningWrites=stableObserver.takeRecords().length;stableObserver.disconnect();
        // A replaced receipt with unchanged level/state still updates its timing.
        qaEstate.jobs[0].completesAtMs += 2000; qaView.updateEstate(structuredClone(qaEstate));
        const correctedProgress = timer.getAttribute('aria-valuenow');
        qaNow = qaEstate.jobs[0].completesAtMs; qaView.updateResources();
        const finishing = timer.getAttribute('aria-valuetext').includes('Waiting for completion confirmation');
        const awaitingConfirmation = host.querySelector('[data-estate-site="treasury"]').dataset.siteState==='constructing';
        qaEstate.jobs=[]; qaEstate.levels.treasury=2; qaView.updateEstate(structuredClone(qaEstate));
        const completed = timer.hidden && host.querySelector('[data-estate-nameplate="treasury"] small').textContent.includes('2');
        qaEstate.levels.mine=0; qaView.updateEstate(structuredClone(qaEstate));
        const unbuilt = host.querySelector('[data-estate-directory-building="mine"]').textContent.includes('Not built')
          && host.querySelector('[data-estate-enter="mine"]').disabled;
        const label = gold.getAttribute('aria-label');
        const camera = qaView.snapshot();
        qaView.destroy();
        const observer = new MutationObserver(()=>{});observer.observe(host,{subtree:true,attributes:true,childList:true});
        qaView.updateResources();qaView.updateEstate(qaEstate);
        const disposedWrites=observer.takeRecords().length;observer.disconnect();
        return {label,running,progress,runningWrites,correctedProgress,finishing,awaitingConfirmation,completed,unbuilt,camera,disposedWrites};
      })()`);
      assert.equal(changed.label, "Gold: 12,346");
      assert(changed.running && changed.finishing && changed.awaitingConfirmation && changed.completed && changed.unbuilt, JSON.stringify(changed));
      assert.equal(changed.progress, "50");
      assert.equal(changed.correctedProgress, "30");
      if(!measureOnly)assert.equal(changed.runningWrites, 0, "A frozen construction clock must not repeat timer DOM writes.");
      assert.equal(changed.disposedWrites, 0);
    }
    assert.deepEqual(errors, []);
    console.log(measureOnly ? "Estate refresh baseline measured; changed-state checks passed." : "Estate refresh checks passed: unchanged DOM, exact balances, replacement receipts, construction progress/completion, unbuilt controls and teardown at desktop/landscape sizes.");
  } finally {
    if (client) { await client.send("Browser.close").catch(()=>{}); client.close(); }
    if (session) {
      if (!await waitForProcessExit(session.browserProcess)) { session.browserProcess.kill(); await waitForProcessExit(session.browserProcess); }
      await removeBrowserProfile(session.profilePath);
    }
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
