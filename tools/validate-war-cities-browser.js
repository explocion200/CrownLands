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
  const artifacts = path.resolve(__dirname, "../release-artifacts/war-cities");
  const server = createMapBenchmarkServer(), address = await server.listen();
  let session, client;
  const measurements = [], errors = [];
  let touch = false;
  try {
    fs.mkdirSync(artifacts, {recursive:true});
    const response = await fetch(address.url + '/__benchmark__/?scenario=A&visualMarches=0');
    const html = await response.text(); assert(html.includes('/__benchmark__/mock-firebase.js'));
    fs.writeFileSync(path.join(artifacts,'preview.html'),html.replace('<head>', '<head><base href="/">').replace('</body>','<script src="/docs/visual-qa/clan-overview/runtime-fixture.js"></script><script src="/docs/visual-qa/war-room-responsive/runtime-fixture.js"></script></body>'));
    const url = address.url + '/release-artifacts/war-cities/preview.html?section=warroom';
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
      await evaluate('Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{})))');
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

    for (const [width,height] of [[1440,900],[844,390],[568,320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      touch = width < 1000;
      await client.send('Emulation.setTouchEmulationEnabled', {enabled:touch,maxTouchPoints:1});
      await client.send("Page.navigate", { url });
      await ready('document.documentElement?.dataset.warReady === "true"');
      await evaluate('Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{})))');
      await evaluate(`(() => {
        window.warCityQA={calls:[],reject:false,held:false,resolve:null,rows:Array.from({length:8},(_,i)=>({
          key:String(i).repeat(64),lossEventId:'loss'+i,cityName:['Oakwatch Meadows','Stoneford','Ravenhill'][i%3],
          originalOwnerName:'Elowen Vale',captorName:'Blackthorn',currentOwnerName:i?'Blackthorn':'Aldric',
          status:i?'lost':'recovered',canReturn:!i,location:{targetType:'city',targetId:warQA.source.id,regionId:getCityRegionId(warQA.source)}}))};
        const api=getOnlineApi();getOnlineApi=()=>({...api,clanWarCities:async input=>{
          warCityQA.calls.push(input);
          if(warCityQA.held) await new Promise(resolve=>warCityQA.resolve=resolve);
          if(warCityQA.reject) throw Error('Connection unavailable. Retry.');
          if(input.action==='return'){warCityQA.rows=warCityQA.rows.filter(e=>e.key!==input.key);return {ok:true};}
          return {version:1,clanId:state.clanId,entries:warCityQA.rows,nextCursor:''};
        }});
      })()`);
      await click('[data-clan-section="warcities"]');
      await ready('clanWarCitiesView.loaded && !clanWarCitiesView.busy');
      const measurement = await evaluate(`(() => {
        const p=document.querySelector('#clanWarcitiesPanel'), r=p.getBoundingClientRect(), list=p.querySelector('.war-cities-list').getBoundingClientRect();
        const buttons=[...document.querySelectorAll('.clan-section-nav button'),...p.querySelectorAll('article:first-child button')];
        return {width:innerWidth,height:innerHeight,overflow:p.scrollWidth>p.clientWidth+1,listHeight:list.height,
          buttonsVisible:buttons.every(b=>{const x=b.getBoundingClientRect();return x.height>=44&&x.left>=0&&x.right<=innerWidth&&x.top>=0&&x.bottom<=innerHeight;}),inside:r.bottom<=innerHeight};
      })()`);
      measurements.push(measurement); assert(measurement.buttonsVisible && !measurement.overflow && measurement.inside && measurement.listHeight>85,JSON.stringify(measurement));
      assert.equal(await evaluate('document.querySelectorAll(".clan-section-nav button").length'),5);
      await shot(`war-cities-${width}.png`);
      await evaluate(`(() => {const list=document.querySelector('.war-cities-list');list.scrollTop=100;const button=list.querySelectorAll('[data-clan-action="war-city-location"]')[2];button.focus({preventScroll:true});renderClanView();})()`);
      assert.equal(await evaluate('document.querySelector(".war-cities-list").scrollTop'),100);
      assert.equal(await evaluate('document.activeElement.dataset.warCityKey'),'2'.repeat(64));
      await evaluate('document.querySelector(".war-cities-list").scrollTop=0');
      await click('[data-clan-action="war-city-return"]');
      assert(await evaluate('modal.open && modalBody.textContent.includes("Your troops travel")'));
      await click('[data-clan-ledger-confirm="cancel"]');
      assert.equal(await evaluate('warCityQA.calls.filter(c=>c.action==="return").length'),0);
      await click('[data-clan-action="war-city-return"]');
      await click('[data-clan-ledger-confirm="accept"]');
      await ready('!clanWarCitiesView.busy');
      assert.equal(await evaluate('warCityQA.calls.filter(c=>c.action==="return").length'),1);
      assert.equal(await evaluate('document.querySelectorAll("[data-clan-action=war-city-return]").length'),0);
      await evaluate('warCityQA.reject=true');
      await click('[data-clan-action="war-cities-refresh"]');
      await ready('clanWarCitiesView.error');
      assert.equal(await evaluate('document.querySelectorAll(".war-cities-list article").length'),0);
      await evaluate('warCityQA.reject=false');
      await click('[data-clan-action="war-cities-refresh"]'); await ready('clanWarCitiesView.loaded && !clanWarCitiesView.busy');
      // Identity changes must discard a response already in flight.
      await evaluate('warCityQA.held=true; void loadClanWarCities()');
      await ready('!!warCityQA.resolve');
      await evaluate('state.clanId="different-clan";renderClanView();warCityQA.resolve()');
      await ready('clanWarCitiesView.entries.length===0');
      console.log(`War Cities layout, touch actions, confirmation, retry and stale-response guards passed at ${width}x${height}`);
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
