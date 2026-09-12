"use strict";
const preview=document.getElementById("preview"),canvas=document.getElementById("canvas");
const query=new URLSearchParams(location.search);
const settings={layout:"draft",viewport:["landscape","small"].includes(query.get("viewport"))?query.get("viewport"):"desktop",sample:"ready"};
const sizes={desktop:[1440,900],landscape:[844,390],small:[568,320]};
function size(){const [w,h]=sizes[settings.viewport],scale=Math.min(1,(document.documentElement.clientWidth-24)/w);Object.assign(preview.style,{width:w+"px",height:h+"px",transform:`scale(${scale})`});canvas.style.width=w*scale+"px";canvas.style.height=h*scale+"px";document.getElementById("dimensions").textContent=`${w} × ${h} screen${scale<1?` · ${Math.round(scale*100)}% preview`:""}`;}
function update(reset=false){document.querySelectorAll("button[data-layout],button[data-viewport]").forEach(button=>{const key=Object.keys(button.dataset)[0];button.setAttribute("aria-pressed",String(settings[key]===button.dataset[key]));});preview.contentWindow?.postMessage({type:"royal-stables-review",...settings,reset},location.origin);size();}
document.querySelectorAll("button[data-layout],button[data-viewport]").forEach(button=>button.addEventListener("click",()=>{Object.assign(settings,button.dataset);update();}));
document.getElementById("sample").addEventListener("change",event=>{settings.sample=event.target.value;update(true);});
document.getElementById("reset").addEventListener("click",()=>update(true));
window.addEventListener("message",event=>{if(event.origin!==location.origin||event.source!==preview.contentWindow||event.data?.type!=="royal-stables-status")return;document.getElementById("reviewStatus").textContent=event.data.message;});
preview.addEventListener("load",()=>update());window.addEventListener("resize",size);size();
