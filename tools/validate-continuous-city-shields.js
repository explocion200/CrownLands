"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const {LiveReader}=require("../local-backend/world/reader");
const {Timestamp}=require("../local-backend/values");
const source=fs.readFileSync(require.resolve("../functions/index.js"),"utf8");
function extract(name){const start=source.indexOf(`function ${name}(`),body=source.indexOf(") {",start)+2;assert(start>=0);let depth=0;
 for(let i=body;i<source.length;i++){if(source[i]==="{")depth++;if(source[i]==="}")depth--;if(!depth)return source.slice(start,i+1);}throw Error(name);}
const scope={Date,FORTIFICATION_STATE_VERSION:1,safeNumber:(v,f=0)=>Number.isFinite(Number(v))?Number(v):f,safeString:v=>String(v||""),
 clamp:(v,a,b)=>Math.min(b,Math.max(a,v)),clampInt:(v,a,b)=>Math.min(b,Math.max(a,Math.floor(Number(v)||0))),
 timestampToMs:v=>typeof v?.toMillis==="function"?v.toMillis():Number(v)||0,
 isStronghold:c=>c.kind==="stronghold"||!!c.strongholdType,getOwnerUid:c=>c.ownerUid||""};
vm.createContext(scope);vm.runInContext(["normalizeFortificationState","getFortificationIntegrityBpsAt","getShieldExpiresAtMs","isCityShielded"].map(extract).join("\n"),scope);
let now=1800000000000;const reader=new LiveReader({pool:{},clock:()=>now});
const section={id:"test-section",templateId:"test-section",name:"Test",x:0,y:0,width:1448,height:1086,gameBounds:{left:0,top:0,width:1448,height:1086}};
const base={x:724,y:543,level:100,ownerUid:"test-owner",ownerName:"Test owner",ownerShieldExpiresAtMs:now+120000};
let cases=0;
for(const version of [undefined,0,1,2])for(const integrityBps of [undefined,null,0,5000,9999,9999.9,10000,"bad"])
 for(const repairOffset of [-1,0,1,60000])for(const elapsed of [0,60000,120000]){
  now=1800000000000+elapsed;const data={...base,fortificationState:{version,integrityBps,lastDamagedAtMs:1800000000000-60000,repairAtMs:1800000000000+repairOffset}};
  const dto=reader.object("city","cities",data,section);
  assert.equal(dto.peaceShieldExpiresAtMs>now,scope.isCityShielded(data,"viewer",now),JSON.stringify({version,integrityBps,repairOffset,elapsed}));cases++;
 }
now=1800000000000;
for(const extra of [{ownerUid:""},{ownerUid:null},{ownerShieldExpiresAtMs:now},{ownerShieldExpiresAtMs:0},{kind:"stronghold"},{strongholdType:"gold"}])assert.equal(reader.object("city","cities",{...base,...extra},section).peaceShieldExpiresAtMs,0);
for(const collection of ["camps","holdingTowers","marauders"]){const dto=reader.object("objective",collection,{...base,status:"active"},section);assert(!Object.hasOwn(dto,"peaceShieldExpiresAtMs"));}
const dto=reader.object("city","cities",{...base,ownerShieldExpiresAtMs:Timestamp.fromMillis(base.ownerShieldExpiresAtMs),inventory:{secret:true},fortificationState:{version:1,integrityBps:5000,repairAtMs:Timestamp.fromMillis(now-1),lastArmyId:"secret"}},section);
assert.equal(dto.peaceShieldExpiresAtMs,base.ownerShieldExpiresAtMs);assert(!/inventory|fortificationState|lastArmyId|secret/.test(JSON.stringify(dto)));
assert(!Object.hasOwn(dto,"troops"));
console.log(`Continuous city shields: ${cases} authoritative-rule parity cases, timestamp conversion, expiry, repair, objective exclusions and narrow public fields passed.`);
