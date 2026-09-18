"use strict";
// Fictional fixtures. This page never imports the game or calls its reward APIs.
const examples={
 standard:{elapsed:30240,gold:125480,troops:32620,lost:[],count:0},
 lost:{elapsed:30240,gold:125480,troops:18450,lost:[{name:"Ashford",region:"Central Plains"},{name:"Ravenwatch",region:"Northern Reach"}],count:2},
 many:{elapsed:186300,gold:23497686072,troops:12564390,lost:Array.from({length:12},(_,i)=>({name:["The Watch of Saint Bartholomew","Ashford","Ravenwatch","Whitehaven","Highcross","Thornmere","Eastgate","Redbrook","Stoneward","Frostmere","Oakheart","Westwatch"][i],region:i%2?"Northern Reach":"Central Plains"})),count:14},
 "losses-only":{elapsed:7200,gold:0,troops:0,lost:[{name:"Ashford",region:"Central Plains"}],count:1},
 inactivity:{elapsed:1296000,gold:620450,troops:28410,lost:[],count:0,inactivity:true}
};
const modal=document.getElementById("offlineModal");
let current=examples.standard,expanded=false,collected=false;
const amount=value=>Math.max(0,Math.floor(Number(value)||0)).toLocaleString("en-US");
function duration(seconds){const mins=Math.floor(seconds/60),days=Math.floor(mins/1440),hours=Math.floor(mins%1440/60),minutes=mins%60;return [days?`${days}d`:"",hours?`${hours}h`:"",minutes?`${minutes}m`:""].filter(Boolean).join(" ")||"<1m";}
function notify(message){parent.postMessage({type:"offline-status",message},location.origin);}
function renderCities(){
 const list=document.getElementById("lostCities");list.replaceChildren();
 (expanded?current.lost:current.lost.slice(0,4)).forEach(city=>{
  const row=document.createElement("li"),name=document.createElement("strong"),region=document.createElement("span");
  name.textContent=city.name;region.textContent=city.region;row.append(name,region);list.append(row);
 });
 const expand=document.getElementById("expandCities");
 expand.hidden=current.lost.length<=4;expand.setAttribute("aria-expanded",String(expanded));
 expand.textContent=expanded?"Show fewer cities":`Show all ${current.lost.length} named cities`;
 const missing=Math.max(0,current.count-current.lost.length),missingNote=document.getElementById("missingCities");
 missingNote.hidden=!missing;missingNote.textContent=`${missing} additional ${missing===1?"city name":"city names"} unavailable.`;
}
function show(key){
 current=examples[key]||examples.standard;expanded=false;collected=false;
 document.getElementById("elapsed").textContent=duration(current.elapsed);
 for(const type of ["gold","troops"]){const field=document.getElementById(type);field.textContent=(current[type]>0?"+":"")+amount(current[type]);field.classList.toggle("long-amount",amount(current[type]).length>11);}
 document.getElementById("lossCount").textContent=amount(current.count);
 document.getElementById("safeStatus").hidden=current.count>0||current.inactivity===true;
 document.getElementById("lostStatus").hidden=current.count===0;
 document.getElementById("inactivityNotice").hidden=!current.inactivity;
 document.getElementById("holdingsTitle").textContent=current.inactivity?"Your holdings":"Your cities";
 document.getElementById("receiptStatus").textContent=current.gold||current.troops?"Production already added to your kingdom.":"Your return summary has been recorded.";
 document.getElementById("collect").disabled=false;document.getElementById("localNotice").hidden=true;
 renderCities();document.getElementById("cityLedger").scrollTop=0;
 if(!modal.open)modal.showModal();document.getElementById("offlineTitle").focus();
 notify("Ready to review · fictional example");
}
document.getElementById("expandCities").addEventListener("click",()=>{expanded=!expanded;renderCities();if(!expanded)document.getElementById("cityLedger").scrollTop=0;});
document.getElementById("collect").addEventListener("click",()=>{
 if(collected)return;collected=true;document.getElementById("collect").disabled=true;modal.close();
 document.getElementById("localNotice").hidden=false;notify("Example collected once · no game rewards changed");
});
document.getElementById("reopen").addEventListener("click",()=>show(Object.keys(examples).find(key=>examples[key]===current)));
window.addEventListener("message",event=>{if(event.origin===location.origin&&event.source===parent&&event.data?.type==="offline-review")show(event.data.sample);});
show("standard");parent.postMessage({type:"offline-ready"},location.origin);
