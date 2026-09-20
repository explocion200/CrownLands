"use strict";
const frame=document.getElementById("preview"),canvas=document.getElementById("canvas"),query=new URLSearchParams(location.search);
const sizes={desktop:[1440,900],landscape:[844,390],small:[568,320]};
let viewport=Object.hasOwn(sizes,query.get("viewport"))?query.get("viewport"):"desktop";
const controls=["view","sample","locale","timers"].map(id=>document.getElementById(id));
for(const c of controls)if([...c.options].some(o=>o.value===query.get(c.id)))c.value=query.get(c.id);
function sync(){const p=new URLSearchParams({viewport});controls.forEach(c=>p.set(c.id,c.value));history.replaceState(null,"","?"+p);}
function resize(){const [w,h]=sizes[viewport],scale=Math.min(1,(document.documentElement.clientWidth-24)/w);Object.assign(frame.style,{width:w+"px",height:h+"px",transform:"scale("+scale+")"});Object.assign(canvas.style,{width:w*scale+"px",height:h*scale+"px"});document.getElementById("dimensions").textContent=w+" × "+h+" · "+Math.round(scale*100)+"% preview";document.querySelectorAll("[data-viewport]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.viewport===viewport)));sync();}
function send(action){frame.contentWindow?.postMessage({type:"boosts-chat-review",action,...Object.fromEntries(controls.map(c=>[c.id,c.value]))},location.origin);sync();}
document.querySelectorAll("[data-viewport]").forEach(b=>b.addEventListener("click",()=>{viewport=b.dataset.viewport;resize();}));
controls.forEach(c=>c.addEventListener("change",()=>send(c.id)));
document.getElementById("reset").addEventListener("click",()=>send("reset"));
document.getElementById("incoming").addEventListener("click",()=>send("incoming"));
window.addEventListener("resize",resize);
window.addEventListener("message",e=>{if(e.origin!==location.origin||e.source!==frame.contentWindow)return;if(e.data?.type==="boosts-chat-ready")send("reset");if(e.data?.type==="boosts-chat-status"){document.getElementById("reviewStatus").textContent=e.data.message;if(e.data.view)document.getElementById("view").value=e.data.view;sync();}});
resize();frame.src="preview.html";
