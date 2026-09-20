"use strict";
// Synthetic deadlines only; reuse the actual game renderer, without Firebase.
(() => {
  const element=document.getElementById("combatTimers");
  let selected="multiple",snapshot={};
  const cities=[
    {cityName:"Stoneward Keep",cityId:"city-147",regionId:"Northgate March"},
    {cityName:"Ravenbrook",cityId:"city-302",regionId:"West Crownlands"},
    {cityName:"Oakfell",cityId:"city-518",regionId:"East Crownlands"},
    {cityName:"Highwatch",cityId:"city-710",regionId:"Northgate March"},
    {cityName:"Windsor Crossing",cityId:"city-819",regionId:"West Crownlands"}
  ];
  function render(){window.CrownlandsCombatTimersUI.render(element,snapshot,Date.now());}
  function reset(next){
    selected=["multiple","single","shield","none","expiring"].includes(next)?next:"multiple";
    const now=Date.now(),count=selected==="single"||selected==="expiring"?1:selected==="multiple"?5:0;
    snapshot={shieldExpiresAtMs:selected==="none"?0:now+14*60_000+42_000,retaliation:cities.slice(0,count).map((city,i)=>({...city,id:"sample-capture-"+i,status:"available",expiresAtMs:now+(selected==="expiring"?12_000:5*60_000+21_000+i*75_000)}))};
    element.querySelector("details").open=false;
    render();
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
