"use strict";
const frame=document.getElementById("preview"),canvas=document.getElementById("canvas"),query=new URLSearchParams(location.search);
const viewports={desktop:[1440,900],landscape:[844,390],small:[568,320]};
let viewport=Object.hasOwn(viewports,query.get("viewport"))?query.get("viewport"):"desktop";
for(const id of ["level","sample"])if([...document.getElementById(id).options].some(option=>option.value===query.get(id)))document.getElementById(id).value=query.get(id);
function resize(){const [width,height]=viewports[viewport];for(const element of [frame,canvas])Object.assign(element.style,{width:width+"px",height:height+"px"});document.getElementById("dimensions").textContent=`${width} × ${height} · 1:1 preview`;document.querySelectorAll("[data-viewport]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.viewport===viewport)));}
function settings(){return{level:Number(document.getElementById("level").value),sample:document.getElementById("sample").value};}
function updateUrl(){const params=new URLSearchParams({viewport,...settings()});history.replaceState(null,"","?"+params);document.getElementById("fullWindow").href="preview.html?"+params;}
function reset(){updateUrl();frame.contentWindow.postMessage({type:"infirmary-review",...settings()},location.origin);}
document.querySelectorAll("[data-viewport]").forEach(button=>button.addEventListener("click",()=>{viewport=button.dataset.viewport;resize();updateUrl();}));
for(const id of ["level","sample"])document.getElementById(id).addEventListener("change",reset);
document.getElementById("reset").addEventListener("click",reset);
window.addEventListener("message",event=>{if(event.origin===location.origin&&event.source===frame.contentWindow&&event.data?.type==="infirmary-status")document.getElementById("reviewStatus").textContent=event.data.message;});
frame.addEventListener("load",reset);resize();updateUrl();frame.src="preview.html?"+new URLSearchParams(settings());
