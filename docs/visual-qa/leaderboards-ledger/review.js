"use strict";
const frame = document.getElementById("preview"), canvas = document.getElementById("canvas");
const sizes = {desktop:[1440,900],landscape:[844,390],small:[568,320]};
const query = new URLSearchParams(location.search), examples = document.getElementById("sample");
let viewport = Object.hasOwn(sizes,query.get("viewport")) ? query.get("viewport") : "desktop";
let section = query.get("section") === "clans" ? "clans" : "players";
if ([...examples.options].some(option=>option.value===query.get("sample"))) examples.value=query.get("sample");
function syncUrl(){history.replaceState(null,"",`?viewport=${viewport}&sample=${examples.value}&section=${section}`);}
function resize(){
 const [width,height]=sizes[viewport],scale=Math.min(1,(document.documentElement.clientWidth-24)/width);
 Object.assign(frame.style,{width:`${width}px`,height:`${height}px`,transform:`scale(${scale})`});
 Object.assign(canvas.style,{width:`${width*scale}px`,height:`${height*scale}px`});
 document.getElementById("dimensions").textContent=`${width} × ${height} screen${scale<1?` · ${Math.round(scale*100)}% preview`:""}`;
 document.querySelectorAll("[data-viewport]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.viewport===viewport)));
}
function reset(){frame.contentWindow?.postMessage({type:"leaderboard-review",sample:examples.value,section},location.origin);syncUrl();}
document.querySelectorAll("[data-viewport]").forEach(button=>button.addEventListener("click",()=>{viewport=button.dataset.viewport;resize();syncUrl();}));
examples.addEventListener("change",reset);document.getElementById("reset").addEventListener("click",reset);
frame.addEventListener("load",reset);window.addEventListener("resize",resize);
window.addEventListener("message",event=>{
 if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.type!=="leaderboard-status")return;
 document.getElementById("reviewStatus").textContent=event.data.message;
 if(["players","clans"].includes(event.data.section)){section=event.data.section;syncUrl();}
});
resize();
