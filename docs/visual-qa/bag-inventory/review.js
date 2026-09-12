"use strict";
const frame=document.getElementById("preview"),canvas=document.getElementById("canvas"),query=new URLSearchParams(location.search);
const sizes={desktop:[1440,900],landscape:[844,390],small:[568,320]};
let viewport=Object.hasOwn(sizes,query.get("viewport"))?query.get("viewport"):"desktop";
function resize(){const[w,h]=sizes[viewport],scale=Math.min(1,(document.documentElement.clientWidth-24)/w);Object.assign(frame.style,{width:w+"px",height:h+"px",transform:`scale(${scale})`});canvas.style.width=w*scale+"px";canvas.style.height=h*scale+"px";document.getElementById("dimensions").textContent=`${w} × ${h} screen${scale<1?` · ${Math.round(scale*100)}% preview`:""}`;document.querySelectorAll("[data-viewport]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.viewport===viewport)));}
function reset(){frame.contentWindow?.postMessage({type:"bag-review",sample:document.getElementById("sample").value},location.origin);document.getElementById("boxLink").hidden=true;}
document.querySelectorAll("[data-viewport]").forEach(b=>b.addEventListener("click",()=>{viewport=b.dataset.viewport;resize();}));
document.getElementById("sample").addEventListener("change",reset);document.getElementById("reset").addEventListener("click",reset);
window.addEventListener("message",e=>{if(e.origin!==location.origin||e.source!==frame.contentWindow||e.data?.type!=="bag-status")return;document.getElementById("reviewStatus").textContent=e.data.message;document.getElementById("boxLink").hidden=e.data.handoff!=="box";});
frame.addEventListener("load",reset);window.addEventListener("resize",resize);resize();
