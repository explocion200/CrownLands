"use strict";
(() => {
 const frame=document.getElementById("game"),notice=document.getElementById("notice"),query=new URLSearchParams(location.search);
 let settings={look:query.get("look")==="current"?"current":"draft",sample:["quiet","protected"].includes(query.get("sample"))?query.get("sample"):"active",zoom:Number(query.get("zoom"))||1},ready=false;
 const status=message=>{if(parent!==window)parent.postMessage({type:"hud-art-status",message},location.origin);};
 function update(){if(ready)frame.contentWindow.postMessage({type:"hud-art-apply",...settings},location.origin);}
 window.addEventListener("message",event=>{
  if(event.origin!==location.origin)return;
  if(event.source===parent&&event.data?.type==="hud-art-review"){
   settings={look:event.data.look==="current"?"current":"draft",sample:["quiet","protected"].includes(event.data.sample)?event.data.sample:"active",zoom:[1,1.6,2.2].includes(event.data.zoom)?event.data.zoom:1};update();
  }
  if(event.source===frame.contentWindow&&event.data?.type==="hud-art-fixture-ready"){
   ready=true;notice.hidden=true;document.documentElement.dataset.hudArtReady="true";update();status("New art is a local draft · Compare with Current game");
  }
  if(event.source===frame.contentWindow&&event.data?.type==="hud-art-status")status(event.data.message);
 });
 frame.addEventListener("load",async()=>{
  try{
   const win=frame.contentWindow,doc=frame.contentDocument;
   for(let i=0;i<600&&doc.documentElement.dataset.crownlandsBenchmarkReady!=="true";i++)await new Promise(resolve=>setTimeout(resolve,100));
   if(!win.__CROWNLANDS_BENCHMARK__||!win.CrownlandsOnline?.__getBenchmarkTelemetry||doc.documentElement.dataset.crownlandsBenchmarkReady!=="true")throw Error("Local fixture unavailable");
   const link=doc.createElement("link");link.rel="stylesheet";link.href="/docs/visual-qa/main-screen-art/draft.css";doc.head.append(link);
   const script=doc.createElement("script");script.src="/docs/visual-qa/main-screen-art/runtime-fixture.js";doc.body.append(script);
  }catch(_){notice.hidden=false;notice.textContent="The local preview server is unavailable. Start tools/map-benchmark/start-server.js to review this draft.";status(notice.textContent);}
 });
 if(location.hostname!=="127.0.0.1"){notice.textContent="This draft runs only on the local preview server.";return;}
 frame.src="/__benchmark__/?scenario=A&visualMarches=2&hudOperations=both&chatMode=quick";
})();
