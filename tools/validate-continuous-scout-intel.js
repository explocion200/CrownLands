"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const now=1700000000000,sandbox={window:{},document:{},state:{scoutReports:{},gameSeconds:100},
  getScoutReportRemainingSeconds:(r,t)=>Math.max(0,Math.ceil((r.expiresAtMs-t)/1000))};
vm.runInNewContext(fs.readFileSync("world/appearance.js","utf8"),sandbox);
const read=sandbox.window.SeamlessAppearance.scoutReport;
const city={id:"city-1",sectionId:"section-a",kind:"castle",ownerUid:"defender",troopVisibility:"hidden"};
const report={targetType:"city",cityId:city.id,regionId:city.sectionId,ownerUid:city.ownerUid,troops:12345,expiresAtMs:now+600000};
assert.equal(read(city,now),null);
sandbox.state.scoutReports[city.id]=report;
assert.equal(read(city,now),report);
assert.equal(read(city,report.expiresAtMs-1),report);
assert.equal(read(city,report.expiresAtMs),null,"Intelligence must expire at its original deadline");
for(const change of [{id:"other"},{sectionId:"section-b"},{ownerUid:"captor"},{ownerUid:""},
  ...["troop","npc","camp","tower","tower-building","scenery"].map(kind=>({kind}))]){
  assert.equal(read({...city,...change},now),null,JSON.stringify(change));
}
for(const change of [{targetType:"marauder"},{cityId:"other"},{troops:NaN},{troops:undefined}]){
  sandbox.state.scoutReports[city.id]={...report,...change};assert.equal(read(city,now),null);
}
// Existing private profile snapshots omit optional location/target metadata.
// Their keys are canonical city IDs in the already authenticated realm scope.
const legacy={ownerUid:city.ownerUid,troops:0,expiresAtMs:report.expiresAtMs};
sandbox.state.scoutReports[city.id]=legacy;assert.equal(read(city,now),legacy,"Zero is valid intelligence");
for(const kind of ["stronghold","citadel"])assert.equal(read({...city,kind},now),legacy);
const fresh={...report,troops:9876};sandbox.state.scoutReports[city.id]=fresh;
assert.equal(read(city,now),fresh,"Replacement cannot retain a cached snapshot");
sandbox.state.scoutReports={};assert.equal(read(city,now),null,"Account/realm reset must revoke presentation");
sandbox.state=null;assert.equal(read(city,now),null,"Sign-out must be safe before renderer disposal");
assert.deepEqual(city,{id:"city-1",sectionId:"section-a",kind:"castle",ownerUid:"defender",troopVisibility:"hidden"});
console.log("Continuous scout intelligence: original expiry, target/owner/type isolation, zero troops, legacy profile compatibility, replacement and session clearing passed.");
