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
      throw Error(`Timeout: ${expression}; ${errors.join("\n")}; ${await evaluate('JSON.stringify({tab:activeProfileTab,section:activeClanMobileSection,open:profileScreen.classList.contains("open"),clan:state.clanId,snapshot:clanSnapshot?.id,view:clanWarCitiesView})')}`);
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
        window.warCityQA={calls:[],orders:[],reject:false,held:false,resolve:null,rows:Array.from({length:8},(_,i)=>({
          key:String(i).repeat(64),lossEventId:'loss'+i,cityName:['Oakwatch Meadows','Stoneford','Ravenhill'][i%3],
          originalOwnerName:'Elowen Vale',captorName:'Blackthorn',currentOwnerName:'Blackthorn',
          status:'lost',canReturn:false,location:{targetType:'city',targetId:warQA.source.id,regionId:getCityRegionId(warQA.source)}}))};
        const api=getOnlineApi();getOnlineApi=()=>({...api,sendArmyOrder:async input=>{warCityQA.orders.push(input);throw Error('Location must not dispatch troops');},clanWarCities:async input=>{
          const clanId=state.clanId;
          warCityQA.calls.push(input);
          if(warCityQA.held) await new Promise(resolve=>warCityQA.resolve=resolve);
          if(warCityQA.reject) throw Error('Connection unavailable. Retry.');
          if(input.action==='return'){warCityQA.rows=warCityQA.rows.filter(e=>e.key!==input.key);return {ok:true};}
          if(input.action==='log') return {version:1,logVersion:1,clanId,...(warCityQA.logPages?.[input.cursor||''] || {entries:[],nextCursor:''})};
          return {version:1,logVersion:warCityQA.oldServer?undefined:1,clanId,...(warCityQA.pages?.[input.cursor||''] || {entries:warCityQA.rows,nextCursor:''})};
        }});
      })()`);
      // The notification must arrive before visiting Lost Holdings; no board/HUD polling is needed on the map.
      await evaluate('renderClanView()');
      await ready('hasClanWarCitiesNotice() && !clanWarCitiesView.busy');
      assert.equal(await evaluate('activeClanMobileSection'), 'warroom');
      assert.equal(await evaluate('clanWarCitiesView.loaded'), false);
      assert.equal(await evaluate('document.querySelector("[data-clan-section=warcities] .notification-badge").textContent'), '!');
      const firstReadCount=await evaluate('warCityQA.calls.length');
      await evaluate('window.noticeTimer=clanWarCitiesTimer;for(let i=0;i<5;i++)renderClanView()');
      assert.equal(await evaluate('warCityQA.calls.length'),firstReadCount);
      assert(await evaluate('noticeTimer===clanWarCitiesTimer'));
      await click('[data-clan-section="warcities"]');
      await ready('clanWarCitiesView.loaded && !clanWarCitiesView.busy');
      assert.equal(await evaluate('document.querySelector("[data-clan-section=warcities] span:last-of-type").textContent.trim()'), 'Lost Holdings');
      assert(await evaluate(`(() => {
        const t=document.querySelector('[data-clan-section="warcities"]'),b=t.querySelector('.notification-badge');
        const r=b.getBoundingClientRect(),p=t.getBoundingClientRect(),style=getComputedStyle(b);
        return b.textContent==='!' && r.width===20 && r.height===20 && r.right<=p.right && r.left>=p.left
          && style.color==='rgb(255, 255, 255)' && style.backgroundColor==='rgb(114, 54, 58)'
          && t.getAttribute('aria-label').includes('cities to recover or return');
      })()`), 'Lost Holdings uses the shared accessible notification inside its tab');
      assert.equal(await evaluate('document.querySelector("#clanWarcitiesPanel h3").textContent'), 'Lost Holdings');
      assert.equal(await evaluate('document.querySelectorAll("[data-clan-action=war-city-return]").length'), 0);
      // Recovery is observed on the open tab, without navigating or manually refreshing.
      await evaluate('Object.assign(warCityQA.rows[0],{status:"recovered",canReturn:true,currentOwnerName:"Aldric"});Object.assign(warCityQA.rows[1],{status:"recovered",currentOwnerName:"Rowan"})');
      await ready('document.querySelectorAll("[data-clan-action=war-city-return]").length===1');
      assert(await evaluate(`(() => {
        const b=document.querySelector('[data-clan-action="war-city-return"]'), row=b.closest('article'), l=row.querySelector('[data-clan-action="war-city-location"]');
        const r=b.getBoundingClientRect(), p=l.getBoundingClientRect();
        return activeClanMobileSection==='warcities' && b.dataset.warCityKey==='0'.repeat(64)
          && row.textContent.includes('Oakwatch Meadows') && row.textContent.includes('Recovered')
          && p.right<=r.left && Math.abs(p.y+p.height/2-r.y-r.height/2)<1
          && p.width===44 && p.height===44 && l.getAttribute('aria-label').includes('Oakwatch')
          && getComputedStyle(l,'::after').backgroundImage.includes('location-map-flag-192x192-cf45708cfe0c.webp');
      })()`), 'Recovery controls must use the shared location icon on the same city row');
      const measurement = await evaluate(`(() => {
        const p=document.querySelector('#clanWarcitiesPanel'), r=p.getBoundingClientRect(), list=p.querySelector('.war-cities-list').getBoundingClientRect();
        const buttons=[...document.querySelectorAll('.clan-section-nav button'),...p.querySelectorAll('article:first-child button')];
        return {width:innerWidth,height:innerHeight,overflow:p.scrollWidth>p.clientWidth+1,listHeight:list.height,
          buttonsVisible:buttons.every(b=>{const x=b.getBoundingClientRect();return x.height>=44&&x.left>=0&&x.right<=innerWidth&&x.top>=0&&x.bottom<=innerHeight;}),inside:r.bottom<=innerHeight};
      })()`);
      measurements.push(measurement); assert(measurement.buttonsVisible && !measurement.overflow && measurement.inside && measurement.listHeight>85,JSON.stringify(measurement));
      assert.equal(await evaluate('document.querySelectorAll(".clan-section-nav button").length'),5);
      await shot(`war-cities-${width}.png`);
      const frame = await evaluate('JSON.stringify(profileScreen.getBoundingClientRect().toJSON())');
      await evaluate(`warCityQA.logPages={
        '':{entries:Array.from({length:8},(_,i)=>({kind:['returned','recovered','lost'][i%3],occurredAtMs:Date.UTC(2026,9,23,14,30)-i*60000,
          text:['Aldric chose to return Oakwatch Meadows to Elowen Vale.','Rowan recovered Stoneford from Blackthorn for Elowen Vale.','Elowen Vale lost Ravenhill to Blackthorn.'][i%3]})),nextCursor:'older'},
        older:{entries:[{kind:'lost',occurredAtMs:Date.UTC(2026,9,22),text:'<img src=x onerror=alert(1)> lost a city.'}],nextCursor:''}}`);
      await click('[data-clan-action="war-cities-log"]');
      await ready('clanWarCitiesView.showLog && clanWarCitiesView.log.loaded && !clanWarCitiesView.busy');
      assert.equal(await evaluate('document.querySelectorAll(".war-city-event").length'),8);
      assert.equal(await evaluate('JSON.stringify(profileScreen.getBoundingClientRect().toJSON())'),frame,'Log resized the Clan window');
      assert(await evaluate('hasClanWarCitiesNotice()'), 'Reading history dismissed the action notice');
      assert.equal(await evaluate('clanWarCitiesView.entries.length'),8,'Log replaced the holdings page');
      assert(await evaluate(`(() => {const p=document.querySelector('#clanWarcitiesPanel');return p.scrollWidth<=p.clientWidth+1 && p.querySelector('.war-cities-list').clientHeight>85 && [...p.querySelectorAll('button')].every(b=>{const r=b.getBoundingClientRect();return r.height>=44 && r.left>=0 && r.right<=innerWidth && r.bottom<=innerHeight})})()`));
      await shot(`war-cities-log-${width}.png`);
      await click('[data-clan-action="war-cities-next"]');
      await ready('clanWarCitiesView.log.cursor==="older" && !clanWarCitiesView.busy');
      assert.equal(await evaluate('document.querySelector(".war-city-event span").textContent'),'<img src=x onerror=alert(1)> lost a city.');
      assert.equal(await evaluate('document.querySelector(".war-city-event img")'),null,'Log text interpreted markup');
      await click('[data-clan-action="war-cities-first"]');
      await ready('!clanWarCitiesView.log.cursor && !clanWarCitiesView.busy');
      await evaluate('document.querySelector(".war-cities-list").scrollTop=90;window.logScroll=document.querySelector(".war-cities-list").scrollTop;renderClanView()');
      assert.equal(await evaluate('document.querySelector(".war-cities-list").scrollTop'),await evaluate('logScroll'));
      await evaluate('warCityQA.reject=true');
      await click('[data-clan-action="war-cities-refresh"]');
      await ready('!!clanWarCitiesView.log.error && !clanWarCitiesView.busy');
      assert.equal(await evaluate('document.querySelectorAll(".war-city-event").length'),0,'Failed log read retains private history');
      assert(await evaluate('document.querySelector("#clanWarcitiesPanel [role=status]").textContent.includes("Retry")'));
      await evaluate('warCityQA.reject=false;warCityQA.logPages=null');
      await click('[data-clan-action="war-cities-refresh"]');
      await ready('clanWarCitiesView.log.loaded && !clanWarCitiesView.busy');
      assert(await evaluate('document.querySelector(".war-cities-list").textContent.includes("No events recorded yet")'));
      await click('[data-clan-action="war-cities-log"]');
      await ready('!clanWarCitiesView.showLog && clanWarCitiesView.loaded && !clanWarCitiesView.busy');
      assert(await evaluate('document.querySelector(".war-cities-list").textContent.includes("Awaiting return decision")'));
      await evaluate('warCityQA.oldServer=true');
      await click('[data-clan-action="war-cities-refresh"]');await ready('!clanWarCitiesView.busy');
      assert.equal(await evaluate('document.querySelector("[data-clan-action=war-cities-log]").disabled'),true,'Log enabled against unsupported backend');
      await evaluate('warCityQA.oldServer=false');
      await click('[data-clan-action="war-cities-refresh"]');await ready('!clanWarCitiesView.busy');

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
      assert.equal(await evaluate('hasClanWarCitiesNotice()'),false);
      await evaluate('warCityQA.reject=false');
      await click('[data-clan-action="war-cities-refresh"]'); await ready('clanWarCitiesView.loaded && !clanWarCitiesView.busy');
      // Opening a location clears an armed order and cannot send troops.
      await evaluate('sendMode=true;selectedTargetId="armed-target";scoutNearbySourceId="armed-source";regroupSourceId="armed-source"');
      await click('[data-clan-action="war-city-location"]');
      await ready('!sendMode && !profileScreen.classList.contains("open")');
      assert(await evaluate('selectedTargetId===null && scoutNearbySourceId===null && regroupSourceId===null'));
      assert.equal(await evaluate('warCityQA.orders.length'),0);
      await evaluate('profileScreen.classList.add("open");showProfileClan({force:true})');
      await click('[data-clan-section="warcities"]');
      await ready('clanWarCitiesView.loaded && !clanWarCitiesView.busy');
      // Backgrounding the phone suspends requests, but returning must resume them.
      if (width === 844) {
        await evaluate('Object.defineProperty(document,"hidden",{configurable:true,value:true})');
        const count = await evaluate('warCityQA.calls.length');
        await delay(5200);
        assert.equal(await evaluate('warCityQA.calls.length'), count);
        assert(await evaluate('!!clanWarCitiesTimer'), 'Backgrounding lost the refresh timer');
        await evaluate('delete document.hidden');
        await ready(`warCityQA.calls.length > ${count} && !clanWarCitiesView.busy`);
        await click('[data-clan-section="warroom"]');
        const noticeCount = await evaluate('warCityQA.calls.length');
        await evaluate('clanWarCitiesView.noticeCheckedAtMs=0');
        await ready(`warCityQA.calls.length > ${noticeCount} && !clanWarCitiesView.busy`);
        await evaluate('closeProfileScreen({force:true})');
        const closedCount = await evaluate('warCityQA.calls.length');
        await delay(5200);
        assert.equal(await evaluate('warCityQA.calls.length'), closedCount, 'Closed Clan window kept requesting data');
        assert.equal(await evaluate('clanWarCitiesTimer'), null);
        await evaluate('profileScreen.classList.add("open");showProfileClan({force:true})');
        await click('[data-clan-section="warcities"]');
        await ready('clanWarCitiesView.loaded && !clanWarCitiesView.busy');
      }
      // Availability stays after reading, includes a return for this member, and clears when resolved.
      await click('[data-clan-section="warroom"]');
      await evaluate('warCityQA.rows=[{...warCityQA.rows[0],status:"recovered",canReturn:true}];clanWarCitiesView.noticeCheckedAtMs=0;pollClanWarCities()');
      await ready('!clanWarCitiesView.busy');
      assert.equal(await evaluate('hasClanWarCitiesNotice()'),true);
      await evaluate('warCityQA.rows[0].canReturn=false;clanWarCitiesView.noticeCheckedAtMs=0;pollClanWarCities()');
      await ready('!clanWarCitiesView.busy');
      assert.equal(await evaluate('hasClanWarCitiesNotice()'),false, 'Another owner’s return is not this member’s action');
      await evaluate('warCityQA.rows[0].canReturn=true');
      await click('[data-clan-section="warcities"]');
      await ready('clanWarCitiesView.loaded && !clanWarCitiesView.busy');
      await click('[data-clan-action="war-city-return"]');
      await click('[data-clan-ledger-confirm="accept"]');
      await ready('!clanWarCitiesView.busy');
      assert.equal(await evaluate('hasClanWarCitiesNotice()'),false,'Returning the last eligible city kept its notice');
      await click('[data-clan-section="warroom"]');
      // Filtered/non-actionable first pages cannot hide a later lost city. One request per polling tick.
      await evaluate('warCityQA.pages={"":{entries:[],nextCursor:"a".repeat(64)},["a".repeat(64)]:{entries:[{...warCityQA.rows[0],status:"lost"}],nextCursor:""}};resetClanWarCities();clanWarCitiesView.cursor="b".repeat(64);pollClanWarCities()');
      await ready('!clanWarCitiesView.busy && !!clanWarCitiesView.noticeCursor');
      const pageCount=await evaluate('warCityQA.calls.length');
      assert.equal(await evaluate('hasClanWarCitiesNotice()'),false);
      await evaluate('pollClanWarCities()');
      await ready('!clanWarCitiesView.busy');
      assert.equal(await evaluate('warCityQA.calls.length'),pageCount+1);
      assert.equal(await evaluate('hasClanWarCitiesNotice()'),true);
      assert.equal(await evaluate('clanWarCitiesView.cursor'),'b'.repeat(64),'Notification changed the visible page');
      await evaluate('warCityQA.pages=null;warCityQA.rows=[];clanWarCitiesView.noticeCheckedAtMs=0;pollClanWarCities()');
      await ready('!clanWarCitiesView.busy');
      assert.equal(await evaluate('document.querySelector("[data-clan-section=warcities] .notification-badge")'),null);
      // Failed background checks hide stale availability and do not trigger a request loop.
      await evaluate('warCityQA.reject=true;clanWarCitiesView.noticeAvailable=true;clanWarCitiesView.noticeCheckedAtMs=0;pollClanWarCities()');
      await ready('!clanWarCitiesView.busy');
      assert.equal(await evaluate('hasClanWarCitiesNotice()'),false);
      const failedCount=await evaluate('warCityQA.calls.length');
      await evaluate('for(let i=0;i<5;i++){renderClanView();pollClanWarCities()}');
      assert.equal(await evaluate('warCityQA.calls.length'),failedCount);
      // Identity changes must discard an old clan's notification response already in flight.
      await evaluate('warCityQA.reject=false;warCityQA.held=true;warCityQA.rows=[{status:"lost"}];clanWarCitiesView.noticeCheckedAtMs=0;pollClanWarCities()');
      await ready('!!warCityQA.resolve');
      await evaluate('state.clanId="different-clan";renderClanView();warCityQA.resolve()');
      await ready('clanWarCitiesView.entries.length===0 && !clanWarCitiesView.busy');
      assert.equal(await evaluate('hasClanWarCitiesNotice()'),false);
      await evaluate('warCityQA.held=false;warCityQA.rows=[];state.clanId=clanSnapshot.id;resetClanWarCities();renderClanView();setClanMobileSection("warcities")');
      await ready('clanWarCitiesView.loaded && !clanWarCitiesView.busy');
      await evaluate('warCityQA.held=true;warCityQA.resolve=null;warCityQA.logPages={"":{entries:[{text:"Private old clan history",occurredAtMs:Date.now()}],nextCursor:""}}');
      await click('[data-clan-action="war-cities-log"]');await ready('!!warCityQA.resolve');
      await evaluate('state.clanId="new-clan";renderClanView();warCityQA.resolve()');
      await ready('!clanWarCitiesView.busy');
      assert.equal(await evaluate('clanWarCitiesView.log.entries.length'),0,'Old clan log response leaked');
      assert(!(await evaluate('clanContent.textContent')).includes('Private old clan history'));
      console.log(`Lost Holdings notification, pagination, layout, actions, retry and scope guards passed at ${width}x${height}`);
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
