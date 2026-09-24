"use strict";
const frame=document.getElementById("preview"),canvas=document.getElementById("canvas"),query=new URLSearchParams(location.search);
const sizes={desktop:[1440,900],landscape:[844,390],small:[568,320]};
let viewport=Object.hasOwn(sizes,query.get("viewport"))?query.get("viewport"):"landscape",look=query.get("look")==="current"?"current":"draft";
const zoom=document.getElementById("zoom"),guide=document.getElementById("guide");
if([...zoom.options].some(o=>o.value===query.get("zoom")))zoom.value=query.get("zoom");
guide.checked=query.get("guide")!=="off";
function sync(){
 const [width,height]=sizes[viewport];
 for(const el of[frame,canvas])Object.assign(el.style,{width:width+"px",height:height+"px"});
 document.querySelectorAll("[data-viewport]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.viewport===viewport)));
 document.querySelectorAll("[data-look]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.look===look)));
 document.getElementById("dimensions").textContent=width+" × "+height+" · Actual CSS size";
 const params=new URLSearchParams({viewport,look,zoom:zoom.value,guide:guide.checked?"on":"off"});
 history.replaceState(null,"","?"+params);document.getElementById("fullWindow").href="preview.html?"+params;
 frame.contentWindow.postMessage({type:"hud-alignment-review",look,zoom:Number(zoom.value),guide:guide.checked},location.origin);
}
document.querySelectorAll("[data-viewport]").forEach(b=>b.addEventListener("click",()=>{viewport=b.dataset.viewport;sync();}));
document.querySelectorAll("[data-look]").forEach(b=>b.addEventListener("click",()=>{look=b.dataset.look;sync();}));
zoom.addEventListener("change",sync);guide.addEventListener("change",sync);
window.addEventListener("message",event=>{if(event.origin===location.origin&&event.source===frame.contentWindow&&event.data?.type==="hud-alignment-status")document.getElementById("reviewStatus").textContent=event.data.message;});
frame.addEventListener("load",sync);sync();frame.src="preview.html?"+new URLSearchParams({look,zoom:zoom.value,guide:guide.checked?"on":"off"});
