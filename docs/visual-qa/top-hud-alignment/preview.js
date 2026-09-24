"use strict";
(() => {
 const frame=document.getElementById("game"),notice=document.getElementById("notice"),query=new URLSearchParams(location.search);
 let settings={look:query.get("look")==="current"?"current":"draft",zoom:Number(query.get("zoom"))||1,guide:query.get("guide")!=="off"},ready=false;
 const status=message=>{if(parent!==window)parent.postMessage({type:"hud-alignment-status",message},location.origin);};
 function update(){if(ready)frame.contentWindow.HudAlignmentDraft.apply(settings);}
 window.addEventListener("message",event=>{
  if(event.origin!==location.origin)return;
  if(event.source===parent&&event.data?.type==="hud-alignment-review"){
   settings={look:event.data.look==="current"?"current":"draft",zoom:[1,1.6,2.2].includes(event.data.zoom)?event.data.zoom:1,guide:!!event.data.guide};update();
  }
  if(event.source===frame.contentWindow&&event.data?.type==="hud-alignment-status")status(event.data.message);
 });
 frame.addEventListener("load",async()=>{
  try{
   const win=frame.contentWindow,doc=frame.contentDocument;
   for(let i=0;i<600&&doc.documentElement.dataset.crownlandsBenchmarkReady!=="true";i++)await new Promise(resolve=>setTimeout(resolve,100));
   if(!win.__CROWNLANDS_BENCHMARK__||!win.CrownlandsOnline?.__getBenchmarkTelemetry||doc.documentElement.dataset.crownlandsBenchmarkReady!=="true")throw Error("Local fixture unavailable");
   const style=doc.createElement("link");style.rel="stylesheet";style.href="/docs/visual-qa/top-hud-alignment/draft.css";
   const styled=new Promise((resolve,reject)=>{style.onload=resolve;style.onerror=reject;});doc.head.append(style);await styled;
   const script=doc.createElement("script");script.src="/docs/visual-qa/top-hud-alignment/runtime-fixture.js";
   const loaded=new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=reject;});doc.body.append(script);await loaded;
   ready=true;notice.hidden=true;update();document.documentElement.dataset.hudAlignmentReady="true";
  }catch(_){notice.hidden=false;notice.textContent="The local preview is unavailable. Start tools/map-benchmark/start-server.js to review this draft.";status(notice.textContent);}
 });
 if(location.hostname!=="127.0.0.1"){notice.textContent="This draft runs only on the local preview server.";return;}
 frame.src="/__benchmark__/?scenario=A&visualMarches=2&hudOperations=both&chatMode=quick";
})();
