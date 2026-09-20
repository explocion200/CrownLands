"use strict";
// Synthetic deadlines only; reuse the actual game renderer, without Firebase.
(() => {
  const element=document.getElementById("combatTimers");
  const mapTarget=document.createElement("div");
  mapTarget.className="retaliation-map-target";
  mapTarget.hidden=true;
  mapTarget.setAttribute("role","status");
  mapTarget.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s8-8 8-13A8 8 0 0 0 4 9c0 5 8 13 8 13Z"/><circle cx="12" cy="9" r="3"/></svg><strong></strong><small></small>';
  document.body.append(mapTarget);
  let selected="multiple",snapshot={};
  const cities=[
    {cityName:"Stoneward Keep",cityId:"city-147",regionId:"Northgate March"},
    {cityName:"Ravenbrook",cityId:"city-302",regionId:"West Crownlands"},
    {cityName:"Oakfell",cityId:"city-518",regionId:"East Crownlands"},
    {cityName:"Highwatch",cityId:"city-710",regionId:"Northgate March"},
    {cityName:"Windsor Crossing",cityId:"city-819",regionId:"West Crownlands"}
  ];
  function render(){
    window.CrownlandsCombatTimersUI.render(element,snapshot,Date.now(),showLocation);
  }
  function reset(next){
    selected=["multiple","single","shield","none","expiring"].includes(next)?next:"multiple";
    const now=Date.now(),count=selected==="single"||selected==="expiring"?1:selected==="multiple"?5:0;
    snapshot={shieldExpiresAtMs:selected==="none"?0:now+14*60_000+42_000,retaliation:cities.slice(0,count).map((city,i)=>({...city,id:"sample-capture-"+i,status:"available",expiresAtMs:now+(selected==="expiring"?12_000:5*60_000+21_000+i*75_000)}))};
    element.querySelector("details").open=false;
    mapTarget.hidden=true;
    document.querySelector(".map-caption").hidden=false;
    document.getElementById("mapNotice").hidden=true;
    render();
  }
  function showLocation(cityId,regionId){
    const city=snapshot.retaliation.find(record=>record.cityId===cityId&&record.regionId===regionId&&record.expiresAtMs>Date.now());
    if(!city){render();return;}
    element.querySelector("details").open=false;
    element.querySelector("summary").focus({preventScroll:true});
    document.querySelector(".map-caption").hidden=true;
    mapTarget.querySelector("strong").textContent=city.cityName;
    mapTarget.querySelector("small").textContent=city.regionId+" · "+city.cityId;
    mapTarget.hidden=false;
    const notice=document.getElementById("mapNotice");
    notice.textContent="Preview location · "+city.cityName;notice.hidden=false;
    if(parent!==window)parent.postMessage({type:"boosts-chat-status",message:"Sample location: "+city.cityName+" · "+city.regionId+". Retaliation remains available."},location.origin);
    return true;
  }
  window.addEventListener("message",event=>{
    if(event.origin!==location.origin||event.source!==parent||event.data?.type!=="boosts-chat-review")return;
    if(event.data.action==="reset"||event.data.timers&&event.data.timers!==selected)reset(event.data.timers);
  });
  element.querySelector("summary").addEventListener("keydown",event=>{
    if(event.key==="Escape")element.querySelector("details").open=false;
  });
  reset(new URLSearchParams(location.search).get("timers")||"multiple");
  setInterval(render,1000);
})();
