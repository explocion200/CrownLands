"use strict";
const frame=document.getElementById("preview"),canvas=document.getElementById("canvas"),query=new URLSearchParams(location.search);
const sizes={desktop:[1440,900],landscape:[844,390],small:[568,320]};
let viewport=Object.hasOwn(sizes,query.get("viewport"))?query.get("viewport"):"desktop";
const sample=document.getElementById("sample");
if([...sample.options].some(option=>option.value===query.get("sample")))sample.value=query.get("sample");
function sync(){history.replaceState(null,"",`?${new URLSearchParams({viewport,sample:sample.value})}`);}
function resize(){
 const [width,height]=sizes[viewport],scale=Math.min(1,(document.documentElement.clientWidth-24)/width);
 Object.assign(frame.style,{width:`${width}px`,height:`${height}px`,transform:`scale(${scale})`});
 Object.assign(canvas.style,{width:`${width*scale}px`,height:`${height*scale}px`});
 document.getElementById("dimensions").textContent=`${width} × ${height} screen · ${Math.round(scale*100)}% preview`;
 document.querySelectorAll("[data-viewport]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.viewport===viewport)));sync();
}
function replay(){frame.contentWindow?.postMessage({type:"offline-review",sample:sample.value},location.origin);sync();}
document.querySelectorAll("[data-viewport]").forEach(button=>button.addEventListener("click",()=>{viewport=button.dataset.viewport;resize();}));
sample.addEventListener("change",replay);document.getElementById("reset").addEventListener("click",replay);
window.addEventListener("resize",resize);
window.addEventListener("message",event=>{
 if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
 if(event.data?.type==="offline-ready")replay();
 if(event.data?.type==="offline-status")document.getElementById("reviewStatus").textContent=event.data.message;
});
resize();frame.src="preview.html";
