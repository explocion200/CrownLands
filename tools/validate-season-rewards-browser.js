"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const R = require("../functions/season-rewards");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const server = createMapBenchmarkServer(), address = await server.listen();
  const executable = [process.env.CHROME_PATH,"C:/Program Files/Google/Chrome/Application/chrome.exe","/usr/bin/google-chrome","/usr/bin/chromium"].find(file=>file&&fs.existsSync(file));
  assert(executable,"Chromium is required");
  const out = path.resolve(__dirname,"../release-artifacts/season-rewards"); fs.mkdirSync(out,{recursive:true});
  const errors=[]; let session,client;
  try {
    session=await startBrowserSession(executable);
    client=await CdpClient.connect(session.targets.find(target=>target.type==="page").webSocketDebuggerUrl);
    await client.send("Runtime.enable"); await client.send("Page.enable");
    client.on("Runtime.exceptionThrown",event=>errors.push(event.exceptionDetails?.exception?.description||event.exceptionDetails?.text));
    const evaluate=async expression=>{const result=await client.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
    const ready=async expression=>{for(let i=0;i<240;i++){if(await evaluate(expression))return;await wait(125);}throw Error("Timed out: "+expression);};
    for(const [width,height] of [[1366,820],[844,390],[568,320]]) {
      await client.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:false});
      await evaluate('delete document.documentElement.dataset.ledgerQa');
      await client.send("Page.navigate",{url:address.url+"/__benchmark__/?scenario=A&visualMarches=0&ledgerUi=players"});
      await ready('document.documentElement?.dataset.ledgerQa==="ready"');
      const info=R.seasonInfo("realm-2026-09");
      const award=R.buildAwards(info,{players:[{uid:"winner",rank:1,kingPower:100}],glory:[{uid:"winner",rank:1,pvpKills:99}],clans:[{id:"house",rank:1,name:"House"}]},new Map([["house",["winner"]]]))[0];
      await evaluate(`window.seasonFixture=${JSON.stringify({...info,status:"ready",version:1,tiers:R.TIERS,award,participated:true,pendingSeasons:[],serverTimeMs:info.endsAtMs+1000})};
        window.seasonClaims=0; window.seasonMode='ready'; RESET_GENERATION='realm-2026-10';
        window.CrownlandsOnline.getSeasonRewardStatus=async payload=>{
          if(window.seasonMode==='error')throw Error('Synthetic rewards outage');
          if(window.seasonMode==='pending')return {...seasonFixture,status:'finalizing',award:null};
          if(payload?.seasonId==='realm-2026-10')return {...seasonFixture,seasonId:'realm-2026-10',status:'open',award:null,endsAtMs:Date.now()+3600000,serverTimeMs:Date.now(),projected:{players:{rank:1,kingPower:100},glory:{rank:12,pvpKills:5},clans:{rank:1}},clanEligible:true,decorations:{}};
          return structuredClone(seasonFixture);
        };
        window.CrownlandsOnline.claimSeasonRewards=async payload=>{window.seasonClaims++;await new Promise(resolve=>setTimeout(resolve,150));seasonFixture.award.claimed=true;seasonFixture.award.receipt={claimedAtMs:Date.now(),seasonId:payload.seasonId};return {ok:true,gear:{commonGearBoxes:19,uncommonGearBoxes:5}};};
        window.seasonHistoryCalls=0;
        window.CrownlandsOnline.getSeasonLeaderboard=async()=>{window.seasonHistoryCalls++;throw Error('History belongs on the website');};
        showLeaderboardModal(); document.getElementById('seasonRewardsInfoBtn').click();`);
      await ready("document.querySelectorAll('.season-table tbody tr').length===7");
      assert(await evaluate("document.querySelector('.season-projection').textContent.includes('2')"));
      assert(await evaluate("document.querySelector('.season-rules').textContent.includes('19 Common + 5 Uncommon')"));
      assert.equal(await evaluate("document.querySelector('.season-projection h3').textContent"),"Potential reward");
      assert.equal(await evaluate("document.querySelector('[data-season-select]')===null && document.querySelector('[data-season-history]')===null"),true,"Current season view must not browse prior standings");
      assert.deepEqual(await evaluate("(()=>{const a=document.querySelector('.season-archive-link');return {href:a.href,target:a.target,noopener:a.rel.includes('noopener')};})()"),{href:"https://playcrownlands.com/season-rankings.html",target:"_blank",noopener:true});
      await evaluate("Promise.all(modal.getAnimations({subtree:true}).filter(a=>a.effect.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))");
      const fits=await evaluate(`(()=>{const p=document.querySelector('.season-panel'),s=document.querySelector('.season-scroll'),f=document.querySelector('.season-footer'),b=f.getBoundingClientRect();return {horizontal:p.scrollWidth<=p.clientWidth+1,scroll:s.scrollHeight>s.clientHeight,footer:b.bottom<=innerHeight+1,table:s.querySelector('table').scrollWidth<=s.clientWidth};})()`);
      await client.send("Page.captureScreenshot",{format:"png"}).then(result=>fs.writeFileSync(path.join(out,`info-${width}.png`),Buffer.from(result.data,"base64")));
      assert(fits.horizontal&&fits.scroll&&fits.footer&&fits.table,`${width} layout: ${JSON.stringify(fits)}`);
      await evaluate("document.querySelector('[data-season-results]').click()");
      await ready("document.querySelectorAll('.season-award-rows article').length===3");
      assert.equal(await evaluate("document.querySelectorAll('.season-medal').length"),3);
      assert.deepEqual(await evaluate("Array.from(document.querySelector('[data-season-select]').options).map(o=>o.value)"),["realm-2026-09"],"Reward receipts retain prior seasons without a current-season option");
      await client.send("Page.captureScreenshot",{format:"png"}).then(result=>fs.writeFileSync(path.join(out,`results-${width}.png`),Buffer.from(result.data,"base64")));
      await evaluate("document.querySelector('[data-season-claim]').click(); document.querySelector('[data-season-claim]').click()");
      await ready("document.querySelector('.season-claimed')!==null");
      assert.equal(await evaluate("window.seasonClaims"),1);
      assert.equal(await evaluate("state.gear.commonGearBoxes"),19);
      assert.equal(await evaluate("window.seasonHistoryCalls"),0,"The game must not fetch archived standings");
      await evaluate("document.querySelector('[data-season-back]').click();showSeasonRewardsPanel({view:'results',seasonId:'realm-2026-09',login:true})");
      await ready("document.querySelector('[data-season-back]')?.textContent==='Later'");
      await evaluate("document.querySelector('[data-season-back]').click()");
      assert.equal(await evaluate("modal.open"),false);
      await evaluate(`window.CrownlandsOnline.getSeasonHonors=async({kind})=>({serverTimeMs:seasonFixture.serverTimeMs,honors:seasonFixture.award.honors.filter(h=>kind==='player'||h.board==='clans')});
        window.CrownlandsOnline.loadPublicPlayerProfile=async()=>({uid:'winner',playerName:'Season champion',kingPower:100,cityCount:2,flag:state.flag});
        showPublicPlayerProfile('winner');`);
      await ready("document.querySelector('.public-profile-flag .season-decoration-mark')!==null");
      assert.equal(await evaluate("document.querySelector('.public-profile-flag .season-decoration-mark').textContent"),"♛","Equal personal places must prefer Kingdom");
      assert.equal(await evaluate("document.querySelectorAll('.season-medal b').length"),3,"All active first-place titles use server time despite a wrong client clock");
      await client.send("Page.captureScreenshot",{format:"png"}).then(result=>fs.writeFileSync(path.join(out,`player-honors-${width}.png`),Buffer.from(result.data,"base64")));
      await evaluate(`window.CrownlandsOnline.loadClan=async()=>({id:'house',name:'House',tag:'WIN',status:'active',memberCount:1,totalKingPower:100});
        window.CrownlandsOnline.loadClanMembers=async()=>[];showPublicClanDetails('house');`);
      await ready("document.querySelector('.public-clan-identity .season-decoration-mark')!==null");
      assert.equal(await evaluate("document.querySelector('.public-clan-identity .season-decoration-mark').namespaceURI"),"http://www.w3.org/1999/xhtml");
      await client.send("Page.captureScreenshot",{format:"png"}).then(result=>fs.writeFileSync(path.join(out,`clan-honors-${width}.png`),Buffer.from(result.data,"base64")));
      assert.equal(await evaluate("CrownlandsSeasonRewards.bestDecoration(seasonFixture.award.honors,'player',seasonFixture.honorsExpireAtMs)===undefined"),true);
      await evaluate("modal.close()");
      // A deployed contract mismatch must leave an actionable entry screen at
      // every supported size instead of silently retrying rejected heartbeats.
      await evaluate(`window.CrownlandsOnline.heartbeatGameServer=async()=>{throw Object.assign(new Error('Synthetic release mismatch'),{code:'functions/failed-precondition'});};
        fetchDeployedBuildId=async()=>APP_BUILD_ID;
        heartbeatGameServerMembership();`);
      assert.equal(await evaluate("setupScreen.classList.contains('visible') && state === null && gameServerHeartbeatIntervalId === 0"),true);
      assert.equal(await evaluate("onlineStatusDetail.textContent.includes('Enter your kingdom again')"),true);
      await client.send("Page.captureScreenshot",{format:"png"}).then(result=>fs.writeFileSync(path.join(out,`reconnect-${width}.png`),Buffer.from(result.data,"base64")));
    }
    await evaluate('delete document.documentElement.dataset.ledgerQa');
    await client.send("Page.navigate",{url:address.url+"/__benchmark__/?scenario=A&visualMarches=0&ledgerUi=players"});
    await ready('document.documentElement?.dataset.ledgerQa==="ready"');
    await evaluate(`window.seasonFixture=${JSON.stringify({...R.seasonInfo("realm-2026-09"),status:"ready",pendingSeasons:[]})};
      window.CrownlandsOnline.getSeasonRewardStatus=async()=>{if(window.seasonMode==='error')throw Error('Synthetic rewards outage');return {...seasonFixture,status:'finalizing',award:null};};`);
    await evaluate("window.seasonMode='pending';showSeasonRewardsPanel({view:'results',seasonId:'realm-2026-09'})");
    await ready("document.querySelector('.season-empty')?.textContent.includes('being finalized')");
    assert.equal(await evaluate("document.querySelector('[data-season-claim]')===null"),true);
    await evaluate("window.seasonMode='error';document.querySelector('[data-season-retry]').click()");
    await ready("document.querySelector('.season-empty')?.textContent.includes('unavailable')");
    // A response to a dismissed panel must never overwrite another dialog.
    await evaluate("window.CrownlandsOnline.getSeasonRewardStatus=()=>new Promise(resolve=>window.resolveSeason=resolve);showSeasonRewardsPanel({view:'results',seasonId:'realm-2026-09'});modal.close();showLeaderboardModal();window.resolveSeason(seasonFixture)");
    await wait(100);assert.equal(await evaluate("modal.classList.contains('leaderboard-modal') && !document.querySelector('.season-panel')"),true);
    assert.deepEqual(errors,[]);
    console.log("Season reward browser passed desktop/mobile layouts, current projection, website archive link, private reward receipts, single claim, gear refresh, honors, login dismissal, pending/error and stale-response guards.");
  } finally {
    if(client)await client.send("Browser.close").catch(()=>{});
    if(session){await waitForProcessExit(session.browserProcess);await removeBrowserProfile(session.profilePath);}
    await server.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
