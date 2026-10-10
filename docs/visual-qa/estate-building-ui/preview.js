"use strict";
(async()=>{
  if(location.hostname!=="127.0.0.1")throw Error("Building UI review is loopback only.");
  const params=new URL(location.href).searchParams,building=document.querySelector('#previewBuilding'),profile=document.querySelector('#previewProfile');
  building.innerHTML=CrownlandsEstate.buildings.map(b=>`<option value="${b.key}">${b.label}</option>`).join('');building.value=params.get('building')||'sawmill';profile.value=params.get('profile')||'ready';
  let sample,view;
  const load=async()=>{const response=await fetch('/building-ui-fixture?'+new URLSearchParams({building:building.value,profile:profile.value}));if(!response.ok)throw Error(await response.text());sample=await response.json();return structuredClone(sample);};
  const api={getEstateState:async()=>structuredClone(sample),getEstateQuote:async input=>{const response=await fetch('/building-ui-quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});const result=await response.json();if(!response.ok)throw Error(result.error);return result;},commitEstateAction:async()=>{throw Error('Visual preview only. No Gold or materials have been spent.');},getEstateChampions:async()=>({champions:Object.values(sample.champions),nextCursor:''})};
  await load();
  const economy=CrownlandsEstateEconomy.create({scope:()=> 'building-ui-preview',preferenceScope:()=> 'building-ui-preview',api:()=>api,visible:()=>true,gold:()=>sample.gold,gear:CROWNLANDS_COMMON_GEAR,selectBuilding:key=>{view.select(key);return document.querySelector(`[data-inner-castle-building="${key}"]`);}});
  view=CrownlandsEstate.mount(document.querySelector('#modalBody'),{cityName:'Kingsmoor',estate:sample.estate,getResources:()=>({...sample.estate.stock,gold:sample.gold,crowns:160}),actions:CrownlandsEstateEconomy.mapActions(()=>'<svg aria-hidden="true"></svg>',economy),onBuilding:key=>economy.building(key),onUpgrade:key=>economy.upgrade(key)});
  document.querySelector('#modal').show();view.fit();
  const refresh=async()=>{await load();view.updateEstate(sample.estate);await economy.refresh();};
  building.addEventListener('change',refresh);profile.addEventListener('change',refresh);
  document.querySelector('#previewService').onclick=()=>economy.building(building.value);document.querySelector('#previewUpgrade').onclick=()=>economy.upgrade(building.value);
  window.buildingUiPreview={economy,view,refresh,load};document.documentElement.dataset.buildingUiReady='true';
  if(params.get('view')!=='map')(params.get('view')==='upgrade'?economy.upgrade:economy.building)(building.value);
})().catch(error=>{console.error(error);document.body.insertAdjacentHTML('beforeend','<p>Preview failed. Run node tools/estate-building-ui-preview.js.</p>');});
