"use strict";
(async()=>{
  if(location.hostname!=="127.0.0.1")throw Error("This fixture is loopback only.");
  const call=async(action,input={})=>{const response=await fetch("/guild-qa/"+action,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)});const value=await response.json();if(value.fixtureError)throw Error(value.fixtureError);return value;};
  let sample=await call("reset"),view;
  const api={getEstateState:()=>call("state"),getEstateQuote:input=>call("quote",input),commitEstateAction:input=>call("commit",input),getEstateChampions:()=>call("champions"),getGuildReports:(cursor,reportId)=>call("reports",{cursor,reportId})};
  const economy=CrownlandsEstateEconomy.create({scope:()=>"guild-production-qa",api:()=>api,visible:()=>true,gold:()=>sample.gold,gear:CROWNLANDS_COMMON_GEAR,apply:result=>{sample=result;},update:result=>view?.updateEstate(result.estate)});
  view=CrownlandsEstate.mount(document.querySelector("#modalBody"),{cityName:"Kingsmoor",estate:sample.estate,actions:CrownlandsEstateEconomy.mapActions(()=>"",economy),onBuilding:key=>economy.building(key),onUpgrade:key=>economy.upgrade(key)});
  document.querySelector("#modal").show();view.fit();await economy.refresh(true);economy.building("guild-master");
  window.guildProductionPreview={economy,view,api,snapshot:()=>economy.snapshot(),advance:async ms=>{await call("advance",{ms});await economy.refresh(true);}};
  document.documentElement.dataset.guildProductionReady="true";
})().catch(error=>{console.error(error);document.body.append(document.createTextNode(error.message));});
