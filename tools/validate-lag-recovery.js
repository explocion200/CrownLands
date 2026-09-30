"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../game.js"), "utf8");
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
function extract(name) {
  const match = new RegExp(`(?:async )?function ${name}\\(`).exec(source); assert(match, name);
  const remaining = source.slice(match.index + match[0].length);
  const next = /\n(?:async )?function \w+\(/.exec(remaining);
  return source.slice(match.index, match.index + match[0].length + (next ? next.index : remaining.length));
}
function context() {
  const actions=[], timers=new Map(); let timerId=0;
  const c={ console:{warn:()=>{}}, GAME_SERVER_ID:"test", GAME_SERVER_HEARTBEAT_TIMEOUT_MS:15000,
    LOGIN_SEASON_STATUS_TIMEOUT_MS:5000, APP_BUILD_ID:"current", gameServerHeartbeatGeneration:0,
    gameServerHeartbeatInFlight:false, scope:"ruler:world:session", signedIn:true, state:{online:{}},
    gameServerAutoEnter:true, verifiedRealmInfo:{}, onlineLastError:"", onlineStatusDetail:{textContent:""},
    modal:{open:false}, crownlandsAudio:null, setupScreen:{classList:{add:()=>actions.push("entry")}},
    window:{setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)},
    hasActiveGameServerSlot:()=>true, isWaitingForGameServerSlot:()=>false,
    getOnlineSessionRequestScope:()=>c.scope, getOnlineApi:()=>api,
    applyGameServerMembership:()=>actions.push("membership"),
    fetchDeployedBuildId:async()=>"current", handleDeployedUpdate:async id=>actions.push("update:"+id),
    clearInstantEconomyActions:()=>actions.push("clear-actions"),
    stopGameServerMembershipWatcher:()=>{c.gameServerHeartbeatGeneration++; actions.push("stop-heartbeat");},
    disconnectOnlineWorld:()=>actions.push("disconnect"), clearSelection:()=>{},closeProfileScreen:()=>{},
    setSetupLoading:()=>{}, updateOnlineUi:()=>{}, showToast:()=>{},
    loginPresentationGeneration:1,loginPresentationSequence:{generation:1},
    isLoginPresentationSequenceActive:s=>s===c.loginPresentationSequence&&s.generation===c.loginPresentationGeneration,
    advanceLoginPresentationSequence:()=>actions.push("advance"),refreshDailyMissionStatus:()=>{},refreshSeasonalAchievementStatus:()=>{},
    refreshDailyLoginRewardStatus:async()=>({eligible:true}),resolveLoginPresentationDailyPhase:()=>actions.push("daily-ready"),
  };
  const api={ isSignedIn:()=>c.signedIn, heartbeatGameServer:async()=>{throw Object.assign(Error("old release"),{code:"functions/failed-precondition"});}, getSeasonRewardStatus:async()=>null };
  vm.createContext(c);
  for(const name of ["withTimeout","isRealmAdmissionCompatibilityError","heartbeatGameServerMembership","recoverGameServerCompatibility","startLoginPresentationDailyRefresh"]) vm.runInContext(extract(name),c);
  return {c,api,actions,timers};
}
async function main() {
  const update=context(), build=deferred(); update.c.fetchDeployedBuildId=()=>build.promise;
  const attempt=update.c.heartbeatGameServerMembership(); await tick();
  assert.equal(await update.c.heartbeatGameServerMembership(),false,"Recovery must coalesce repeated heartbeat attempts.");
  build.resolve("new-build"); await attempt;
  assert.deepEqual(update.actions,["update:new-build"]);assert.equal(update.c.gameServerHeartbeatInFlight,false);

  for(const failure of ["same-build","network-error","hung-check"]) {
    const f=context();
    if(failure==="network-error")f.c.fetchDeployedBuildId=async()=>{throw Error("offline");};
    if(failure==="hung-check")f.c.fetchDeployedBuildId=()=>new Promise(()=>{});
    const pending=f.c.heartbeatGameServerMembership(); await tick();
    if(failure==="hung-check"){const timeout=[...f.timers.values()].find(t=>t.ms===10000);assert(timeout);timeout.fn();}
    await pending;
    assert(f.actions.includes("entry")&&f.actions.includes("stop-heartbeat"),failure+" must end rejected background polling and offer verified re-entry.");
    assert.equal(f.c.state,null); assert.equal(f.c.verifiedRealmInfo,null);assert.equal(f.c.gameServerAutoEnter,false);
    assert.match(f.c.onlineStatusDetail.textContent,/Enter your kingdom again/);
  }
  for(const stage of ["heartbeat","update-check"]) {
    const f=context(), late=deferred();
    if(stage==="heartbeat")f.api.heartbeatGameServer=()=>late.promise;
    else f.c.fetchDeployedBuildId=()=>late.promise;
    const pending=f.c.heartbeatGameServerMembership();await tick();f.c.scope="replacement-session";
    if(stage==="heartbeat")late.reject(Object.assign(Error("old release"),{code:"functions/failed-precondition"}));else late.resolve("new-build");
    await pending;assert.deepEqual(f.actions,[],"A stale "+stage+" cannot disconnect/reload another session.");
  }
  const transient=context(); transient.api.heartbeatGameServer=async()=>{throw Object.assign(Error("temporary"),{code:"functions/unavailable"});};
  await transient.c.heartbeatGameServerMembership();assert.deepEqual(transient.actions,[]);
  assert.equal(transient.c.gameServerHeartbeatInFlight,false);

  const polling=context();
  Object.assign(polling.c,{updateCheckInFlight:false,deployedUpdateAvailableBuildId:"",deployedUpdateNoticeShown:false,document:{visibilityState:"visible"}});
  vm.runInContext(extract("checkForDeployedUpdate"),polling.c);
  polling.c.fetchDeployedBuildId=()=>new Promise(()=>{});
  const check=polling.c.checkForDeployedUpdate();await tick();
  [...polling.timers.values()].find(t=>t.ms===10000).fn();
  assert.equal(await check,false);assert.equal(polling.c.updateCheckInFlight,false,"A hung fetch permanently disabled update checks.");
  polling.c.fetchDeployedBuildId=async()=>"new-build";
  assert.equal(await polling.c.checkForDeployedUpdate(),true);
  assert.deepEqual(polling.actions,["update:new-build"]);

  for(const stage of ["registration","worker-update","ready"]) {
    const f=context();let reloads=0,messages=0;
    Object.assign(f.c,{state:null,URL,UPDATE_RELOAD_PAUSE_MS:650,deployedUpdateReloadInProgress:false,
      deployedUpdateAvailableBuildId:"",deployedUpdateNoticeShown:false,setMapSwitchLoading:()=>{}});
    f.c.console.info=()=>{};
    f.c.window.location={href:"https://playcrownlands.com/play/",replace:url=>{assert.equal(new URL(url).searchParams.get("build"),"new-build");reloads++;}};
    f.c.navigator={serviceWorker:{getRegistration:()=>stage==="registration"?new Promise(()=>{}):Promise.resolve({
      update:()=>stage==="worker-update"?new Promise(()=>{}):Promise.resolve(),waiting:{postMessage:()=>messages++}
    })}};
    vm.runInContext(extract("handleDeployedUpdate"),f.c);
    const updating=f.c.handleDeployedUpdate("new-build");await tick();
    await f.c.handleDeployedUpdate("new-build");
    if(stage!=="ready"){[...f.timers.values()].find(t=>t.ms===3000).fn();await tick();}
    [...f.timers.values()].find(t=>t.ms===650).fn();await updating;
    assert.equal(reloads,1,"A stalled "+stage+" must not block or duplicate the update reload.");
    assert.equal(messages,stage==="ready"?1:0);
  }

  const login=context(), reward=deferred();login.api.getSeasonRewardStatus=()=>reward.promise;
  login.c.startLoginPresentationDailyRefresh();await tick();
  assert(login.actions.includes("daily-ready"));assert.equal(login.c.loginPresentationSequence.seasonResolved,undefined);
  const timeout=[...login.timers.values()].find(t=>t.ms===5000);assert(timeout);timeout.fn();await tick();
  assert.equal(login.c.loginPresentationSequence.seasonResolved,true);assert.equal(login.c.loginPresentationSequence.seasonStatus.loadFailed,true,"A timed-out lookup must retain a retryable season pop-up.");
  const count=login.actions.length;reward.resolve({award:{claimed:false}});await tick();assert.equal(login.actions.length,count,"Late rewards must not reopen login dialogs.");
  const replaced=context(), old=deferred();replaced.api.getSeasonRewardStatus=()=>old.promise;
  replaced.c.startLoginPresentationDailyRefresh();await tick();replaced.c.loginPresentationGeneration=2;replaced.c.loginPresentationSequence={generation:2};
  old.resolve({award:{claimed:false}});await tick();assert.equal(replaced.c.loginPresentationSequence.seasonResolved,undefined);
  const synchronous=context();synchronous.api.getSeasonRewardStatus=()=>{throw Error("adapter failure");};
  synchronous.c.startLoginPresentationDailyRefresh();await tick();assert.equal(synchronous.c.loginPresentationSequence.seasonResolved,true);
  assert.equal(synchronous.c.loginPresentationSequence.seasonStatus.loadFailed,true,"Lookup errors must not masquerade as no rewards.");
  const rejected=context();rejected.api.getSeasonRewardStatus=async()=>{throw Error("temporary rewards outage");};
  rejected.c.startLoginPresentationDailyRefresh();await tick();assert.equal(rejected.c.loginPresentationSequence.seasonStatus.loadFailed,true);
  console.log("Lag recovery: update/re-entry, bounded waits, duplicate/stale sessions, transient failures and late reward responses passed.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
