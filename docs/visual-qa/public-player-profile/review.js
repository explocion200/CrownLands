"use strict";
const frame=document.getElementById("preview"),canvas=document.getElementById("canvas"),query=new URLSearchParams(location.search);
const sizes={desktop:[1440,900],landscape:[844,390],small:[568,320]};
let viewport=Object.hasOwn(sizes,query.get("viewport"))?query.get("viewport"):"desktop";
const sample=document.getElementById("sample");
if([...sample.options].some(o=>o.value===query.get("sample")))sample.value=query.get("sample");
function resize(){const[w,h]=sizes[viewport],scale=Math.min(1,(document.documentElement.clientWidth-24)/w);Object.assign(frame.style,{width:w+"px",height:h+"px",transform:`scale(${scale})`});canvas.style.width=w*scale+"px";canvas.style.height=h*scale+"px";document.getElementById("dimensions").textContent=`${w} × ${h}`;document.querySelectorAll("[data-viewport]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.viewport===viewport)));}
function reset(){const url=new URL(location.href);url.searchParams.set("viewport",viewport);url.searchParams.set("sample",sample.value);history.replaceState(null,"",url);frame.contentWindow?.postMessage({type:"public-profile-review",sample:sample.value},location.origin);}
document.querySelectorAll("[data-viewport]").forEach(b=>b.addEventListener("click",()=>{viewport=b.dataset.viewport;resize();reset();}));
sample.addEventListener("change",reset);document.getElementById("reset").addEventListener("click",reset);
window.addEventListener("message",e=>{if(e.origin===location.origin&&e.source===frame.contentWindow&&e.data?.type==="public-profile-ready")reset();});window.addEventListener("resize",resize);resize();
