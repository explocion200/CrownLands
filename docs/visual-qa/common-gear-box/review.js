"use strict";
const preview=document.getElementById("preview"),canvas=document.getElementById("canvas"),query=new URLSearchParams(location.search);
const settings={viewport:["landscape","small"].includes(query.get("viewport"))?query.get("viewport"):"desktop",sample:"ready",motion:"auto"};
const sizes={desktop:[1440,900],landscape:[844,390],small:[568,320]};
function resize(){const[w,h]=sizes[settings.viewport],scale=Math.min(1,(document.documentElement.clientWidth-24)/w);Object.assign(preview.style,{width:w+"px",height:h+"px",transform:`scale(${scale})`});canvas.style.width=w*scale+"px";canvas.style.height=h*scale+"px";document.getElementById("dimensions").textContent=`${w} × ${h} screen${scale<1?` · ${Math.round(scale*100)}% preview`:""}`;}
function update(action="settings"){document.querySelectorAll("[data-viewport]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.viewport===settings.viewport)));preview.contentWindow?.postMessage({type:"gear-box-review",...settings,action},location.origin);resize();}
document.querySelectorAll("[data-viewport]").forEach(b=>b.addEventListener("click",()=>{settings.viewport=b.dataset.viewport;update();}));
document.getElementById("sample").addEventListener("change",e=>{settings.sample=e.target.value;update("reset");});
document.getElementById("motion").addEventListener("change",e=>{settings.motion=e.target.value;update();});
document.getElementById("reset").addEventListener("click",()=>update("reset"));
document.getElementById("replay").addEventListener("click",()=>{settings.sample="ready";document.getElementById("sample").value="ready";update("replay");});
window.addEventListener("message",e=>{if(e.origin===location.origin&&e.source===preview.contentWindow&&e.data?.type==="gear-box-status")document.getElementById("reviewStatus").textContent=e.data.message;});
preview.addEventListener("load",()=>update("reset"));window.addEventListener("resize",resize);resize();
