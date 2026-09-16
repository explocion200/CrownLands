"use strict";
const frame=document.getElementById("preview"),canvas=document.getElementById("canvas"),examples=document.getElementById("sample"),sizes={desktop:[1440,900],landscape:[844,390],small:[568,320]},query=new URLSearchParams(location.search);
let viewport=Object.hasOwn(sizes,query.get("viewport"))?query.get("viewport"):"desktop";
if([...examples.options].some(o=>o.value===query.get("sample")))examples.value=query.get("sample");
function syncUrl(){history.replaceState(null,"",`?viewport=${viewport}&sample=${examples.value}`);}
function resize(){const[w,h]=sizes[viewport],scale=Math.min(1,(document.documentElement.clientWidth-24)/w);Object.assign(frame.style,{width:`${w}px`,height:`${h}px`,transform:`scale(${scale})`});Object.assign(canvas.style,{width:`${w*scale}px`,height:`${h*scale}px`});document.getElementById("dimensions").textContent=`${w} × ${h} screen${scale<1?` · ${Math.round(scale*100)}% preview`:""}`;document.querySelectorAll("[data-viewport]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.viewport===viewport)));}
function reset(){frame.contentWindow?.postMessage({type:"stronghold-review",sample:examples.value},location.origin);syncUrl();}
document.querySelectorAll("[data-viewport]").forEach(b=>b.addEventListener("click",()=>{viewport=b.dataset.viewport;resize();syncUrl();}));examples.addEventListener("change",reset);document.getElementById("reset").addEventListener("click",reset);frame.addEventListener("load",reset);window.addEventListener("resize",resize);
window.addEventListener("message",event=>{if(event.origin===location.origin&&event.source===frame.contentWindow&&event.data?.type==="stronghold-status")document.getElementById("reviewStatus").textContent=event.data.message;});resize();
