"use strict";
const frame=document.getElementById("preview"),canvas=document.getElementById("canvas"),select=document.getElementById("sample");
const sizes={desktop:[1366,820],landscape:[844,390],small:[568,320]};
const query=new URLSearchParams(location.search);
let size=Object.hasOwn(sizes,query.get("size"))?query.get("size"):"desktop";
let section=["players","clans","glory"].includes(query.get("section"))?query.get("section"):"players";
if([...select.options].some(option=>option.value===query.get("sample")))select.value=query.get("sample");
function sync(){history.replaceState(null,"","?size="+size+"&section="+section+"&sample="+select.value);}
function resize(){
  const [width,height]=sizes[size],scale=Math.min(1,(document.documentElement.clientWidth-24)/width);
  Object.assign(frame.style,{width:width+"px",height:height+"px",transform:"scale("+scale+")"});
  Object.assign(canvas.style,{width:width*scale+"px",height:height*scale+"px"});
  document.getElementById("dimensions").textContent=width+" × "+height+" · "+Math.round(scale*100)+"% preview";
  document.querySelectorAll("[data-size]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.size===size)));sync();
}
function reset(){frame.contentWindow?.postMessage({type:"podium-review",sample:select.value,section},location.origin);sync();}
document.querySelectorAll("[data-size]").forEach(button=>button.addEventListener("click",()=>{size=button.dataset.size;resize();}));
select.addEventListener("change",reset);frame.addEventListener("load",reset);window.addEventListener("resize",resize);
window.addEventListener("message",event=>{
  if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.type!=="podium-status")return;
  document.getElementById("reviewStatus").textContent=event.data.message;
  if(["players","clans","glory"].includes(event.data.section)){section=event.data.section;sync();}
});
resize();
