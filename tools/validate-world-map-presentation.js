"use strict";
const assert=require("node:assert/strict");
const {LiveReader}=require("../local-backend/world/reader");
const reader=Object.assign(Object.create(LiveReader.prototype),{artObjects:new Map()});
const section={id:"stoneward",templateId:"stoneward",name:"Stoneward",x:0,y:0,width:1448,height:1086,gameBounds:{left:0,top:0,width:1448,height:1086}};
const source={x:200,y:300,name:"Example",level:95,ownerUid:"owner",ownerName:"Example ruler",ownerClanId:"clan",ownerClanTag:"CODE",isMainCity:true,
  troops:987654321,currentGarrison:987654321,requestedTroops:987654321,gold:12345,gear:{private:true},campType:"troops",classification:"boss"};
for(const collection of ["cities","camps","marauders","holdingTowers"]){
  const dto=reader.object("test",collection,source,section);
  assert.equal(dto.level,95);assert.equal(dto.ownerClanTag,"CODE");assert.equal(dto.ownerUid,"owner");
  assert.equal(dto.troopVisibility,"hidden");
  for(const key of ["troops","currentGarrison","requestedTroops","gold","gear"])assert(!Object.hasOwn(dto,key),key+" leaked into a public banner");
}
const own=reader.object("test","cities",source,section,"owner"),other=reader.object("test","cities",source,section,"other");
assert.equal(own.troops,987654321);assert.equal(own.troopVisibility,"exact");assert(!Object.hasOwn(other,"troops"));
assert.equal(reader.object("test","cities",{...source,level:NaN,campType:"../private"},section).level,1);
assert.equal(reader.object("test","camps",{...source,campType:"../private"},section).campType,null);
console.log("Public map presentation metadata preserves private garrison filtering.");
