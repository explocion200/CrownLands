"use strict";
const frame=document.getElementById("preview"),canvas=document.getElementById("canvas"),query=new URLSearchParams(location.search);
const sizes={desktop:[1440,900],landscape:[844,390],small:[568,320]};
let viewport=Object.hasOwn(sizes,query.get("viewport"))?query.get("viewport"):"desktop",look=query.get("look")==="current"?"current":"draft";
const sample=document.getElementById("sample"),zoom=document.getElementById("zoom");
if(["quiet","protected"].includes(query.get("sample")))sample.value=query.get("sample");
if([...zoom.options].some(o=>o.value===query.get("zoom")))zoom.value=query.get("zoom");
function sync(){
 const [width,height]=sizes[viewport];
 for(const el of[frame,canvas])Object.assign(el.style,{width:width+"px",height:height+"px"});
 document.querySelectorAll("[data-viewport]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.viewport===viewport)));
 document.querySelectorAll("[data-look]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.look===look)));
 document.getElementById("dimensions").textContent=width+" × "+height+" · Actual CSS size";
 const params=new URLSearchParams({viewport,look,sample:sample.value,zoom:zoom.value});
 history.replaceState(null,"","?"+params);document.getElementById("fullWindow").href="preview.html?"+params;
 frame.contentWindow.postMessage({type:"hud-art-review",look,sample:sample.value,zoom:Number(zoom.value)},location.origin);
}
document.querySelectorAll("[data-viewport]").forEach(b=>b.addEventListener("click",()=>{viewport=b.dataset.viewport;sync();}));
document.querySelectorAll("[data-look]").forEach(b=>b.addEventListener("click",()=>{look=b.dataset.look;sync();}));
sample.addEventListener("change",sync);zoom.addEventListener("change",sync);
window.addEventListener("message",event=>{if(event.origin===location.origin&&event.source===frame.contentWindow&&event.data?.type==="hud-art-status")document.getElementById("reviewStatus").textContent=event.data.message;});
const art=[["Leaderboards","leaderboard","Original crown medallion"],["Daily Login","daily-reward","Original reward calendar"],["Player frame","profile-frame","Original ornate frame"],["Bag","bag","Leather & ink"],["Shop","shop","Aged brass"],["Cities","cities","Limestone & slate"],["Maps","map","Painted parchment"]];
document.getElementById("artGrid").innerHTML=art.map(([name,key,note])=>'<figure><img src="art/hud-'+key+'-r1.webp" alt="Redrawn '+name+' icon"><figcaption>'+name+'</figcaption><small>'+note+'</small></figure>').join("");
frame.addEventListener("load",sync);sync();frame.src="preview.html?"+new URLSearchParams({look,sample:sample.value,zoom:zoom.value});
