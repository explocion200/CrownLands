"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Set CHROME_PATH to Chromium.");
  const server = createMapBenchmarkServer(), address = await server.listen();
  const artifacts = path.resolve(__dirname, "../release-artifacts/clan-notifications");
  fs.mkdirSync(artifacts, { recursive: true });
  let session, client;
  const errors = [];
  try {
    session = await startBrowserSession(executable);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all(["Page.enable", "Runtime.enable"].map(method => client.send(method)));
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const evaluate = async fn => {
      const expression = typeof fn === "function" ? "(" + fn.toString() + ")()" : fn;
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const ready = async expression => {
      for (let attempt = 0; attempt < 240; attempt++) {
        if (await evaluate(expression)) return;
        await delay(100);
      }
      throw Error("Timed out: " + expression);
    };
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
    await ready('document.documentElement?.dataset.crownlandsBenchmarkReady === "true"');
    await evaluate(async () => {
      stopClanRealtimeSubscriptions({clear:true});
      window.clanQa = {
        clan:{id:"clan-badge-qa",name:"Crimson Watch",tag:"CW",status:"active",heraldryRevision:1,shield:{...CLAN_HERALDRY_CONFIG.DEFAULT_V2}},
        applications:[], subscriptions:[], reviews:[], rejectReview:false, rejectSave:false
      };
      state.clanId=clanQa.clan.id;state.clanRole="leader";state.character.level=20;
      const api=getOnlineApi();
      clanQa.api={...api,isSignedIn:()=>true,loadPlayerProfile:async()=>null,
        subscribeClanState:(id,handlers)=>{clanQa.clanHandlers=handlers;handlers.onClan(clanQa.clan);return ()=>{};},
        subscribeClanApplications:(id,handlers)=>{clanQa.subscriptions.push({id,handlers});return ()=>{};},
        subscribeClanRallies:(id,handlers)=>{clanQa.rallyHandlers=handlers;return ()=>{};},
        subscribeClanSocialState:undefined,subscribeClanTreasury:undefined,getClanTreasuryStatus:undefined,
        reviewClanApplication:async payload=>{
          clanQa.reviews.push(payload);if(clanQa.rejectReview)throw Error("Fixture review refused");
          clanQa.applications=clanQa.applications.filter(item=>item.uid!==payload.applicantUid);
          clanQa.subscriptions.at(-1).handlers.onApplications(clanQa.applications);return {ok:true};
        },
        updateClanProfile:async ({shield})=>{
          if(clanQa.rejectSave)throw Error("Fixture save refused");
          clanQa.clan={...clanQa.clan,heraldryRevision:clanQa.clan.heraldryRevision+1,shield};
          return {ok:true,clan:clanQa.clan};
        },
        getHoldingTowerState:async ({towerId})=>({worldActive:true,towers:[{...HOLDING_TOWER_UI.createQaSnapshot(getHoldingTowerVisual(towerId),"owner"),clanId:clanQa.clan.id,clanName:clanQa.clan.name,clanEmblem:CLAN_HERALDRY_CONFIG.DEFAULT_V2}]}),
        subscribeHoldingTowerState:()=>()=>{},getClanTowerShop:undefined
      };
      getOnlineApi=()=>clanQa.api;
      clanQa.emit=rows=>{clanQa.applications=rows;clanQa.subscriptions.at(-1).handlers.onApplications(rows);};
      clanQa.pending=uid=>({id:uid,uid,displayName:uid,clanId:state.clanId,status:"pending"});
      await refreshClanState({silent:true,skipProfileLoad:true});
    });
    const badge = () => evaluate(() => ({
      applications:clanHudBtn.dataset.applicationCount||"",total:clanHudBtn.dataset.clanNotificationCount||"",
      shown:clanHudBtn.classList.contains("has-clan-notifications"),label:clanHudBtn.getAttribute("aria-label"),
      tab:clanTabBtn.dataset.clanNotificationCount||""
    }));
    const checkBadge = async (applications, total = applications) => {
      const actual = await badge();
      assert.equal(actual.applications, applications ? String(applications) : "");
      assert.equal(actual.total, total ? String(total) : "");
      assert.equal(actual.tab, actual.total);
      assert.equal(actual.shown, total > 0);
      if (applications) assert.match(actual.label, new RegExp(applications + " pending application"));
    };
    await checkBadge(0);
    assert.equal(await evaluate("clanQa.subscriptions.length"), 1, "Startup must subscribe without opening the clan menu.");
    await evaluate("clanQa.emit([clanQa.pending('Applicant One'),clanQa.pending('Applicant Two')])");
    await checkBadge(2);
    await evaluate("showProfileClan({force:true});setClanMobileSection('members')");
    await ready("!clanUiLoading");
    await checkBadge(2);
    assert.equal(await evaluate("clanQa.subscriptions.length"), 1, "Reading the inbox must reuse its listener.");
    await evaluate("clanQa.rejectReview=true;runClanAction('reject',{applicantUid:'Applicant One',accept:false})");
    await checkBadge(2);
    await evaluate("clanQa.rejectReview=false;runClanAction('accept',{applicantUid:'Applicant One',accept:true})");
    await checkBadge(1);
    await evaluate("runClanAction('reject',{applicantUid:'Applicant Two',accept:false})");
    await checkBadge(0);

    await evaluate("clanQa.emit([clanQa.pending('Applicant One')]);clanQa.rallyHandlers.onRallies([{id:'rally-qa',status:'forming'}])");
    await checkBadge(1, 2);
    assert.match((await badge()).label, /1 active rally/);
    await evaluate("clanQa.emit([])");
    await checkBadge(0, 1);
    await evaluate("clanQa.rallyHandlers.onRallies([]);clanQa.emit([clanQa.pending('Applicant One')]);clanQa.oldHandlers=clanQa.subscriptions.at(-1).handlers;stopClanRealtimeSubscriptions({clear:false})");
    await checkBadge(1);
    await evaluate("refreshClanState({silent:true,skipProfileLoad:true})");
    await checkBadge(1);
    await evaluate("clanQa.oldHandlers.onApplications([])");
    await checkBadge(1);
    await evaluate("clanQa.subscriptions.at(-1).handlers.onError(new Error('Fixture temporary network failure'))");
    await checkBadge(1);
    await evaluate("state.clanRole='member';refreshClanState({silent:true,skipProfileLoad:true})");
    await checkBadge(0);
    await evaluate("clanQa.subscriptions.at(-1).handlers.onApplications([clanQa.pending('Old callback')])");
    await checkBadge(0);
    await evaluate("state.clanRole='officer';refreshClanState({silent:true,skipProfileLoad:true})");
    await evaluate("clanQa.emit([clanQa.pending('Officer inbox'),{...clanQa.pending('Reviewed'),status:'accepted'},{...clanQa.pending('Other clan'),clanId:'other'}])");
    await checkBadge(1);
    await evaluate("clanQa.uidGetter=getCurrentOnlineUid;getCurrentOnlineUid=()=>'another-account';renderClanHudAccess();clanQa.subscriptions.at(-1).handlers.onApplications([clanQa.pending('Wrong account')])");
    await checkBadge(0);
    assert.equal(await evaluate("clanApplications.some(row=>row.uid==='Wrong account')"), false);
    await evaluate("getCurrentOnlineUid=clanQa.uidGetter;renderClanHudAccess()");
    await checkBadge(1);
    await evaluate("clanQa.oldHandlers=clanQa.subscriptions.at(-1).handlers;state.clanId='other';renderClanHudAccess();clanQa.oldHandlers.onApplications([clanQa.pending('Wrong clan')])");
    await checkBadge(0);
    assert.equal(await evaluate("clanApplications.some(row=>row.uid==='Wrong clan')"), false, "Old clan callbacks may not alter the new clan inbox.");
    await evaluate("state.clanId=clanQa.clan.id;stopClanApplicationSubscription({clear:true});startClanApplicationSubscription(clanQa.api,state.clanId);clanQa.oldHandlers=clanQa.subscriptions.at(-1).handlers;onlineSessionGeneration+=1;clanQa.oldHandlers.onApplications([clanQa.pending('Old account')])");
    await checkBadge(0);

    // Fallback loading must repaint, and discard a load completed after demotion.
    await evaluate(async () => {
      stopClanApplicationSubscription({clear:true});
      clanQa.subscribe=clanQa.api.subscribeClanApplications;
      clanQa.api.subscribeClanApplications=undefined;
      clanQa.api.loadClanApplications=async()=>[clanQa.pending("Fallback inbox")];
      await refreshClanState({silent:true,skipProfileLoad:true});
    });
    await checkBadge(1);
    await evaluate("clanQa.api.loadClanApplications=()=>new Promise(resolve=>clanQa.resolveApplications=resolve);clanQa.pendingRefresh=refreshClanState({silent:true,skipProfileLoad:true});void 0");
    await ready("typeof clanQa.resolveApplications==='function'");
    await evaluate("state.clanRole='member';clanQa.resolveApplications([clanQa.pending('Late fallback')]);clanQa.pendingRefresh");
    await checkBadge(0);
    assert.equal(await evaluate("clanApplications.some(row=>row.uid==='Late fallback')"), false);
    await evaluate(async () => {
      clanQa.api.subscribeClanApplications=clanQa.subscribe;state.clanRole="leader";
      await refreshClanState({silent:true,skipProfileLoad:true});
      clanQa.emit([clanQa.pending("Applicant One"),clanQa.pending("Applicant Two")]);
      profileScreen.classList.remove("open");activeProfileTab="profile";
      const visual=HOLDING_TOWER_DEFINITIONS[0];clanQa.towerId=visual.id;
      await ensureRegionDefinitionLoaded(visual.regionId);zoom=1;centerOnRegion(visual.regionId);
      const result=await clanQa.api.getHoldingTowerState({towerId:visual.id});
      holdingTowerSnapshots.set(visual.id,result.towers[0]);applyHoldingTowerClanSnapshot(visual.id,clanQa.clan.id,clanQa.clan);
      clanQa.oldClan={...clanQa.clan};
      clanShieldEditorOpen=true;clanShieldUnresolvedFields=[];
      clanShieldDraft={...clanQa.clan.shield,shape:"kite",division:"quartered",charge:"wolf",secondaryCharge:"eagle",chargeLayout:"chief",primary:"#24445f",secondary:"#eee1bd",chargeColor:"#d8bd78",secondaryChargeColor:"#7a2638",trim:"riveted",finish:"battleworn"};
      clanQa.draft={...clanShieldDraft};clanQa.before=clanHudIcon.innerHTML;renderClanView();renderCities(true);
    });
    assert.equal(await evaluate("clanHudIcon.innerHTML===clanQa.before"), true, "Unpublished drafts changed the HUD.");
    assert.equal(await evaluate("getHoldingTowerClanIdentity(holdingTowerSnapshots.get(clanQa.towerId)).emblem.chargeLayout"), "center", "Unpublished drafts changed the Tower.");
    assert.equal(await evaluate(() => {
      const preview=document.createElement("div");preview.innerHTML=renderClanShieldEditor(clanQa.draft);
      const full=preview.querySelector(".clan-shield-preview-full .clan-heraldry-v2");
      const map=preview.querySelector(".clan-shield-micro-preview .clan-heraldry-v2");
      return full?.querySelector("svg").innerHTML===map?.querySelector("svg").innerHTML && full?.getAttribute("style")===map?.getAttribute("style");
    }), true, "The editor's map-size preview changed the composition.");
    await evaluate("clanQa.rejectSave=true;saveClanShieldEditor()");
    assert.equal(await evaluate("clanHudIcon.innerHTML===clanQa.before"), true, "A failed save changed the flag.");
    await evaluate("clanQa.rejectSave=false;saveClanShieldEditor()");
    const verifyFlags = async () => {
      const matches = await evaluate(() => {
        const comparable=node=>({svg:node.querySelector("svg").innerHTML,style:node.getAttribute("style")});
        const expected=document.createElement("div");expected.innerHTML=renderClanHeraldry(clanQa.draft,{size:"editor",variant:"full"});
        const design=JSON.stringify(comparable(expected.firstElementChild));
        const nodes=[clanHudIcon.firstElementChild,profileClanShield.firstElementChild,cityLayer.querySelector('[data-holding-tower-id="'+clanQa.towerId+'"] .holding-tower-clan-banner .clan-heraldry-v2')];
        if(modal.open) {
          const flags=modalBody.querySelectorAll(".window-header .clan-flag>.clan-heraldry-v2,.controller .clan-flag>.clan-heraldry-v2");
          if(flags.length!==2)return false;
          nodes.push(...flags);
        }
        return nodes.every(node=>node?.dataset.heraldryVariant==="full"&&JSON.stringify(comparable(node))===design);
      });
      assert(matches, "Saved editor composition/colours/finish differ from published clan or Tower flags.");
    };
    await verifyFlags();
    await evaluate("clanQa.clanHandlers.onClan(clanQa.oldClan);applyHoldingTowerClanSnapshot(clanQa.towerId,clanQa.clan.id,clanQa.oldClan)");
    await verifyFlags();
    for (const viewport of [{width:1440,height:900},{width:844,height:390},{width:568,height:320}]) {
      await client.send("Emulation.setDeviceMetricsOverride", {...viewport,deviceScaleFactor:1,mobile:false});
      await evaluate(() => {
        if(modal.open)modal.close();profileScreen.classList.remove("open");
        const tower=getHoldingTowerVisual(clanQa.towerId);zoom=innerHeight<560?.5:1;
        centerOnRegion(tower.regionId);centerOnWorldPoint({x:tower.x,y:tower.y-140},tower.regionId);
        toast.classList.remove("visible");renderAll();
      });
      await delay(200);
      await checkBadge(2);
      await verifyFlags();
      const bounds = await evaluate(() => {
        const r=clanHudBtn.getBoundingClientRect(),badge=getComputedStyle(clanHudBtn,"::before");
        return {visible:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,hit:clanHudBtn.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),width:r.width,height:r.height,content:badge.content,display:badge.display};
      });
      assert(bounds.visible && bounds.hit, JSON.stringify(bounds));
      assert(bounds.width>=44 && bounds.height>=44, "Clan icon lost its touch target.");
      assert.match(bounds.content, /2/);
      assert.notEqual(bounds.display, "none");
      const shot=await client.send("Page.captureScreenshot",{format:"png"});
      fs.writeFileSync(path.join(artifacts,"clan-badge-map-"+viewport.width+".png"),Buffer.from(shot.data,"base64"));
      await evaluate("openHoldingTower(clanQa.towerId)");
      await verifyFlags();
      await evaluate(() => Promise.all(document.getAnimations().filter(animation=>Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation=>animation.finished.catch(()=>{}))));
      const details=await client.send("Page.captureScreenshot",{format:"png"});
      fs.writeFileSync(path.join(artifacts,"saved-flag-details-"+viewport.width+".png"),Buffer.from(details.data,"base64"));
      await evaluate("modal.close()");
      console.log("Clan badge and exact saved flags passed at "+viewport.width+"x"+viewport.height+".");
    }
    // Legacy designs still pass through their frozen renderer, including small HUD flags.
    assert.equal(await evaluate(() => {
      clanSnapshot={...clanQa.clan,shield:CLAN_HERALDRY_CONFIG.DEFAULT_V1};renderClanHudAccess();
      const expected=document.createElement("div");
      expected.innerHTML=renderClanHeraldry(CLAN_HERALDRY_CONFIG.DEFAULT_V1,{size:"small",instance:"hud",label:clanSnapshot.name+" clan shield"});
      return clanHudIcon.innerHTML===expected.innerHTML;
    }), true);
    await evaluate("stopClanRealtimeSubscriptions({clear:true});state.clanId='';renderClanHudAccess()");
    await checkBadge(0);
    assert.deepEqual(errors, []);
    console.log("Clan notification lifecycle, role/session guards, reconnect, review failure, saved-heraldry revision and legacy compatibility passed.");
  } finally {
    if (client) {await client.send("Browser.close").catch(()=>{});client.close();}
    if (session) {if (!await waitForProcessExit(session.browserProcess)) {session.browserProcess.kill();await waitForProcessExit(session.browserProcess);} await removeBrowserProfile(session.profilePath);}
    await server.close();
  }
}
if (require.main === module) main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
module.exports = {run:main};
