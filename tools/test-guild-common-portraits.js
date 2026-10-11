"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const context={window:{},crypto:require("node:crypto").webcrypto};vm.createContext(context);
for(const file of ["common-portraits.js","game-fixture.js"])vm.runInContext(fs.readFileSync(path.join(__dirname,"../docs/visual-qa/guild-master",file),"utf8"),context);
const M=context.window.GuildReviewModel,pool=context.window.GuildCommonPortraits,state=M.initial();
assert.equal(pool.length,21);assert.equal(new Set(pool.map(p=>p.id)).size,21);
for(const type of Object.keys(M.types))assert.equal(pool.filter(p=>p.type===type).length,3);
for(const member of [...state.members,...state.offers]){
  if(member.rarity!=="Common"){assert.equal(M.commonPortraitFor(member),null);continue;}
  const chosen=pool.find(p=>p.id===member.portraitId);assert(chosen&&chosen.type===member.type);
  assert.equal(M.commonPortraitFor({...member,id:"hired-"+member.id,name:"A renamed member"}),chosen.id,"Recruitment and renaming retain the chosen face");
}
assert.notEqual(state.offers[0].portraitId,state.offers[1].portraitId,"Same-type offers have distinct faces");
const legacy={id:"old-common-member",name:"Legacy",type:"medic",rarity:"Common"};
assert.equal(M.commonPortraitFor(legacy),M.commonPortraitFor(structuredClone(legacy)),"Old local samples resolve consistently");
assert(pool.some(p=>p.id===M.commonPortraitFor({...legacy,portraitId:"common-guard-01"})&&p.type==="medic"),"Wrong-specialty portrait cannot leak into a member");
assert.equal(M.commonPortraitFor({...legacy,rarity:"Rare"}),null,"Other rarity artwork remains unchanged");
console.log("PASS Guild Common portraits: 21 distinct assets, three per specialty, stable offers/recruits/legacy samples, other rarities preserved.");
