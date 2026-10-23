"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForBrowserTargets, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main(built = false) {
  const executable = [process.env.CHROME_PATH, "/usr/bin/chromium", "/usr/bin/google-chrome"].find(file => file && fs.existsSync(file));
  assert(executable, "Set CHROME_PATH to Chromium");
  const artifacts = path.resolve(__dirname, "../release-artifacts/war-room-responsive");
  const server = createMapBenchmarkServer(), address = await server.listen();
  let session, client;
  const measurements = [], errors = [];
  let touch = false;
  try {
    fs.mkdirSync(artifacts, {recursive:true});
    const response = await fetch(address.url + '/__benchmark__/?scenario=A&visualMarches=0');
    const html = await response.text(); assert(html.includes('/__benchmark__/mock-firebase.js'));
    fs.writeFileSync(path.join(artifacts,'preview.html'),html.replace('<head>', '<head><base href="/">').replace('</body>','<script src="/docs/visual-qa/clan-overview/runtime-fixture.js"></script><script src="/docs/visual-qa/war-room-responsive/runtime-fixture.js"></script></body>'));
    const url = address.url + '/release-artifacts/war-room-responsive/preview.html?section=warroom';
    session = await startBrowserSession(executable, {
      waitForTargets: (process, url) => waitForBrowserTargets(process, url, { retryDelayMs: 100,
        fetchTargets: async endpoint => { const targets = await (await fetch(endpoint)).json();
          if (!targets.some(target => target.type === 'page')) throw Error('Initial page is still opening');
          return targets;
        },
      }),
    });
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all(["Page.enable", "Runtime.enable", "Network.enable"].map(method => client.send(method)));
    if (built) {
      const delivered = {};
      for (const file of ['game.js', 'modal-ui.js', 'clan-ledger-ui.css']) {
        delivered[file] = fs.readFileSync(path.resolve(__dirname, '../dist', file), 'utf8');
        assert.equal(delivered[file], fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n'), 'Stale built asset: ' + file);
      }
      // Match the loopback server's fixture instrumentation around delivered game code.
      delivered['game.js'] = delivered['game.js'].replace('registerCrownlandsServiceWorker();', '/* Fixture: no service worker. */')
        + ['injected-runtime.js', 'pickup-qa-runtime.js', 'ledgers-qa-runtime.js', 'estate-qa-runtime.js']
          .map(file => fs.readFileSync(path.join(__dirname, 'map-benchmark', file), 'utf8')).join('');
      client.on('Fetch.requestPaused', event => {
        const file = new URL(event.request.url).pathname.split('/').at(-1);
        client.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 200,
          responseHeaders: [{name: 'Content-Type', value: file.endsWith('.css') ? 'text/css' : 'text/javascript'}],
          body: Buffer.from(delivered[file]).toString('base64') }).catch(error => errors.push(error.message));
      });
      await client.send('Fetch.enable', {patterns: Object.keys(delivered).map(file => ({urlPattern: '*' + file + '*'}))});
    }
    await client.send("Network.setBlockedURLs", { urls: ["https://*", "http://*.googleapis.com/*"] });
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const ready = async expression => {
      for (let attempt = 0; attempt < 240; attempt++) { if (await evaluate(expression)) return; await delay(100); }
      throw Error(`Timeout: ${expression}; ${errors.join("\n")}`);
    };
    const click = async selector => {
      const point = await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,height:r.height,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}; })()`);
      assert(point.hit, `Obstructed control: ${selector}`);
      assert(point.height >= 43.99, `${selector} touch target: ${point.height}`);
      if (touch) {
        await client.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x:point.x,y:point.y}]});
        await client.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
        return;
      }
      await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", buttons: 1, clickCount: 1 });
      await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", buttons: 0, clickCount: 1 });
    };
    const shot = async name => {
      await evaluate('toast.classList.remove("visible")');
      const { data } = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(artifacts, built ? name.replace('.png', '-built.png') : name), Buffer.from(data, "base64"));
    };
    for (const [width,height] of [[844,390],[568,320],[1440,900]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      touch = width < 1000;
      await client.send('Emulation.setTouchEmulationEnabled', {enabled:touch,maxTouchPoints:1});
      await client.send("Page.navigate", { url });
      await ready('document.documentElement?.dataset.warReady === "true" && document.querySelector("link[data-optional-ui-style=clan]")?.dataset.ready === "true"');
      await evaluate('Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{})))');
      const measurement = await evaluate(`(() => {
        const panel=document.querySelector('#clanWarroomPanel'), roster=panel.querySelector('.war-roster'), r=roster.getBoundingClientRect(), f=panel.querySelector('.war-actions').getBoundingClientRect();
        const rows=[...roster.querySelectorAll('tbody tr')].map(e=>e.getBoundingClientRect());
        return {width:innerWidth,height:innerHeight,rosterHeight:r.height,visibleRows:rows.filter(e=>e.top>=r.top && e.bottom<=r.bottom+1).length,overflow:panel.scrollWidth>panel.clientWidth+1,footerInside:f.bottom<=innerHeight && f.top>=r.bottom-1};
      })()`);
      await shot(`boss-${width}.png`);
      assert(!measurement.overflow && measurement.footerInside, JSON.stringify(measurement));
      assert(measurement.visibleRows >= (width === 568 ? 3 : 5), JSON.stringify(measurement));
      assert(await evaluate('document.querySelector(".war-roster").textContent.includes("22,000,000")'));
      measurements.push(measurement);
      await click('[data-war-sheet="details"]');
      assert(await evaluate('!document.querySelector(".war-sheet[aria-label=\\"Rally details\\"]").hidden'));
      await evaluate('document.querySelector("[data-boss-readiness]").scrollIntoView({block:"center"})');
      await click('[data-boss-readiness]');
      await ready('warQA.calls.includes("readiness") && document.querySelector(".boss-readiness").textContent.includes("Readiness at last check")');
      assert(await evaluate('clanWarroomSheet === "details" && !!document.querySelector("[data-rally-action=assembly]")'));
      await shot(`details-${width}.png`);
      await click('.war-sheet:not([hidden]) [data-war-sheet=""]');
      assert(await evaluate('document.activeElement.dataset.warSheet === "details"'));
      await click('[data-war-sheet="rallies"]');
      assert.equal(await evaluate('document.querySelectorAll(".rally-picker button").length'),5);
      await click('[data-clan-rally="war-fixture-1"]');
      assert.equal(await evaluate('document.querySelectorAll(".war-roster tbody tr").length'),20);
      await shot(`crowded-${width}.png`);
      await evaluate('document.querySelector(".war-roster").scrollTop=10000;document.querySelector(".war-roster tbody tr:last-child .player-name-link").focus({preventScroll:true});warQA.scroll=document.querySelector(".war-roster").scrollTop;warQA.focus=document.activeElement.dataset.playerProfileUid;renderClanView()');
      assert(await evaluate('document.querySelector(".war-roster").scrollTop === warQA.scroll && document.activeElement.dataset.playerProfileUid===warQA.focus && selectedClanRallyId==="war-fixture-1"'));
      assert(await evaluate('(() => {const e=document.querySelector(".war-actions [data-rally-action=launch]"),r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})()'));
      await click('[data-rally-action="launch"]');
      assert.equal(await evaluate('warQA.calls.filter(c=>c==="launch").length'),0);
      await ready('modal.open && !!modalBody.querySelector("[data-rally-confirm=cancel]")');
      await evaluate('modalBody.querySelector("[data-rally-confirm=cancel]").click()');
      assert.equal(await evaluate('warQA.calls.filter(c=>c==="launch").length'),0);
      await click('[data-rally-action="launch"]');
      await evaluate('warQA.held=true;modalBody.querySelector("[data-rally-confirm=accept]").click()');
      await ready('warQA.calls.includes("launch") && !!warQA.resolve');
      assert(await evaluate('[...document.querySelectorAll(".war-actions button")].every(b=>b.disabled)'));
      await evaluate('warQA.resolve()');await ready('onlineClanRallies.find(r=>r.id==="war-fixture-1").status==="launched"');
      assert.equal(await evaluate('warQA.calls.filter(c=>c==="launch").length'),1);
      // A Clan Leader managing someone else's rally keeps contribution controls.
      await evaluate(`(() => {
        const rally=onlineClanRallies.find(r=>r.id===selectedClanRallyId);rally.status='forming';rally.leaderUid='war-member-2';
        rally.participants=rally.participants.filter(p=>p.uid!==getCurrentOnlineUid()).slice(0,4);
        state.clanRole='leader';clanWarroomSheet='';renderClanView();
      })()`);
      assert.deepEqual(await evaluate('[...document.querySelectorAll(".war-actions button")].map(b=>b.dataset.rallyAction)'), ['join','launch','cancel']);
      assert(await evaluate(` [...document.querySelectorAll('.war-actions button')].every(e=>{const r=e.getBoundingClientRect();return r.height>=44&&r.left>=0&&r.right<=innerWidth&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})`));
      await shot(`leader-controls-${width}.png`);
      await evaluate('state.clanRole="member";renderClanView()');
      assert.deepEqual(await evaluate('[...document.querySelectorAll(".war-actions button")].map(b=>b.dataset.rallyAction)'), ['join']);
      await evaluate('onlineClanRallies.find(r=>r.id===selectedClanRallyId).participants.push({uid:getCurrentOnlineUid(),ownerName:"Aldric",status:"assembled",troops:100});renderClanView()');
      assert.deepEqual(await evaluate('[...document.querySelectorAll(".war-actions button")].map(b=>b.dataset.rallyAction)'), ['withdraw']);
      // Current roster changes must not strand a hidden/removed rally's details.
      await click('[data-war-sheet="details"]');
      await evaluate('onlineClanRallies=onlineClanRallies.filter(r=>r.id!==selectedClanRallyId);renderClanView()');
      assert(await evaluate('selectedClanRallyId===onlineClanRallies[0].id && clanWarroomSheet==="" && !document.querySelector(".war-participants").hidden'));
      await evaluate('onlineClanRallies=[];renderClanView()');
      assert(await evaluate('document.querySelector("#clanWarroomPanel").textContent.includes("No active rallies") && !document.querySelector(".war-roster")'));
      console.log(`War Room roster, selection, details, refresh and guarded launch passed at ${width}x${height}`);
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(artifacts, built ? "measurements-built.json" : "measurements.json"), JSON.stringify({built,measurements},null,2)+"\n");
  } finally {
    if (client) { await client.send("Browser.close").catch(()=>{}); client.close(); }
    if (session) { if (!await waitForProcessExit(session.browserProcess)) { session.browserProcess.kill(); await waitForProcessExit(session.browserProcess); } await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().then(() => main(true)).catch(error => { console.error(error.stack || error); process.exitCode=1; });
