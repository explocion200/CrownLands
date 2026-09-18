"use strict";
const frame=document.getElementById("preview"),canvas=document.getElementById("canvas"),query=new URLSearchParams(location.search);
const sizes={desktop:[1440,900],landscape:[844,390],small:[568,320]};
let viewport=Object.hasOwn(sizes,query.get("viewport"))?query.get("viewport"):"desktop";
const controls=["channel","mode","sample","locale"].map(id=>document.getElementById(id));
for(const control of controls) if([...control.options].some(o=>o.value===query.get(control.id))) control.value=query.get(control.id);
function sync(){const p=new URLSearchParams({viewport});controls.forEach(c=>p.set(c.id,c.value));history.replaceState(null,"",`?${p}`);}
function resize(){const [w,h]=sizes[viewport],scale=Math.min(1,(document.documentElement.clientWidth-24)/w);Object.assign(frame.style,{width:`${w}px`,height:`${h}px`,transform:`scale(${scale})`});Object.assign(canvas.style,{width:`${w*scale}px`,height:`${h*scale}px`});document.getElementById("dimensions").textContent=`${w} × ${h} screen · ${Math.round(scale*100)}% preview`;document.querySelectorAll("[data-viewport]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.viewport===viewport)));sync();}
function send(action){frame.contentWindow?.postMessage({type:"chat-review",action,...Object.fromEntries(controls.map(c=>[c.id,c.value]))},location.origin);sync();}
document.querySelectorAll("[data-viewport]").forEach(b=>b.addEventListener("click",()=>{viewport=b.dataset.viewport;resize();}));
controls.forEach(c=>c.addEventListener("change",()=>send(c.id)));
document.getElementById("reset").addEventListener("click",()=>send("reset"));document.getElementById("incoming").addEventListener("click",()=>send("incoming"));
window.addEventListener("resize",resize);
window.addEventListener("message",e=>{if(e.origin!==location.origin||e.source!==frame.contentWindow)return;if(e.data?.type==="chat-ready")send("reset");if(e.data?.type==="chat-status"){document.getElementById("reviewStatus").textContent=e.data.message;for(const id of ["channel","mode"]){const c=document.getElementById(id);if([...c.options].some(o=>o.value===e.data[id]))c.value=e.data[id];}sync();}});
resize();frame.src="preview.html";
