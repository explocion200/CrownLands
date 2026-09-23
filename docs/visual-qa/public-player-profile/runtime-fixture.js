/* Local sample data; actual production render and navigation handlers. */
(async function(){
  "use strict";
  if(!["127.0.0.1","localhost"].includes(location.hostname)||!window.__CROWNLANDS_BENCHMARK__)throw Error("Local mock game required.");
  const api=getOnlineApi(),originalSwitch=switchOnlineIsland;
  const catalog=await fetch("/functions/core-expansion-region-catalog.json").then(r=>r.json());
  const region=catalog.regions.find(r=>r.lifecycle==="active"&&r.permanentCore&&r.id!==getActiveMapRegionId()&&r.purpose==="core_support")||catalog.regions.find(r=>r.lifecycle==="active"&&r.permanentCore&&r.id!==getActiveMapRegionId());
  const definition=await fetch("/"+region.regionDefinitionPath).then(r=>r.json());
  const target=definition.cities.find(c=>!c.strongholdType)||definition.cities[0];
  let sample="standard",raw=null;
  const clan={id:"review-greywatch",name:"The Greywatch",tag:"OAK",status:"active",memberCount:18,totalKingPower:3824000,admissionMode:"approval",description:"Wardens of the northern roads.",shield:null};
  getOnlineApi=()=>({...api,isSignedIn:()=>true,loadPublicPlayerProfile:async()=>structuredClone(raw),loadClan:async()=>({...clan,name:raw.clanName}),loadClanMembers:async()=>[{uid:"review-ruler",displayName:raw.playerName,flag:raw.flag,role:"leader",kingPower:raw.kingPower}]});
  switchOnlineIsland=async(id,options)=>{
    if(sample==="failure")throw Error("The sample map could not load. Try again.");
    return originalSwitch(id,options);
  };
  async function show(next="standard"){
    sample=next;
    raw={uid:"review-ruler",playerName:sample==="large"?"AlexandriaIronwood":"Aldric",kingPower:sample==="large"?284720190:184720,kingPowerVersion:KING_POWER_AUTHORITY_VERSION,
      flag:{version:2,primary:"#596044",secondary:"#C5AD75",symbolColor:"#F2E2BF",pattern:"diagonal",symbol:"crown"},
      mainCityId:sample==="unavailable"?"":target.id,mainRegionId:region.id,
      cityCount:sample==="large"?1284:18,troopEstimate:sample==="independent"?null:{min:sample==="large"?780000000:180000,max:sample==="large"?820000000:220000},
      strongholds:sample==="independent"?[]:[{id:"sample-gold",name:"Aurum Keep",regionId:region.id},{id:"sample-defense",name:"Ironwatch",regionId:region.id}],
      clanId:sample==="independent"?"":clan.id,clanName:sample==="large"?"Wardens of the Northern Marches":clan.name,clanTag:"OAK"};
    if(raw.clanId)raw.clan={...clan,name:raw.clanName};
    // Model entering a public profile from the own-profile/clan view.
    showProfileScreen();
    await showPublicPlayerProfile(raw.uid);
    window.PublicProfileReview.raw=raw;
  }
  window.PublicProfileReview={show,raw:null,target,region};
  window.addEventListener("message",e=>{if(e.origin===location.origin&&e.source===parent&&e.data?.type==="public-profile-review")void show(e.data.sample);});
  await show();parent.postMessage({type:"public-profile-ready"},location.origin);
})();
