"use strict";
const frame=document.getElementById("preview"),canvas=document.getElementById("canvas"),examples=document.getElementById("sample"),holdings=document.getElementById("holding"),sizes={desktop:[1440,900],landscape:[844,390],small:[568,320]},query=new URLSearchParams(location.search);
let viewport=Object.hasOwn(sizes,query.get("viewport"))?query.get("viewport"):"desktop";
if([...examples.options].some(o=>o.value===query.get("sample")))examples.value=query.get("sample");
if(Object.hasOwn(STRONGHOLD_DEFINITIONS,query.get("holding")))holdings.value=query.get("holding");
function syncUrl(){history.replaceState(null,"",`?viewport=${viewport}&sample=${examples.value}&holding=${holdings.value}`);}
function resize(){const[w,h]=sizes[viewport],scale=Math.min(1,(document.documentElement.clientWidth-24)/w);Object.assign(frame.style,{width:`${w}px`,height:`${h}px`,transform:`scale(${scale})`});Object.assign(canvas.style,{width:`${w*scale}px`,height:`${h*scale}px`});document.getElementById("dimensions").textContent=`${w} × ${h} screen${scale<1?` · ${Math.round(scale*100)}% preview`:""}`;document.querySelectorAll("[data-viewport]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.viewport===viewport)));}
function reset(){
 const hold=STRONGHOLD_DEFINITIONS[holdings.value];
 document.title=`Crown Lands · ${hold.kind} draft`;
 document.getElementById("reviewTitle").textContent=hold.crown?"Crown Citadel · The royal seat":`${hold.kind} · ${hold.name}`;
 document.getElementById("approvalStatus").textContent=hold.approved?"Design approved · Draft only":"Draft for approval";
 const names={owned:`Your ${hold.crown?"Citadel":"Stronghold"}`,damaged:`Your ${hold.crown?"Citadel":"Stronghold"} · damaged walls`,"legacy-loading":`${hold.crown?"Reign Ledger":"Legacy"} · loading`,"legacy-error":`${hold.crown?"Reign Ledger":"Legacy"} · unavailable`,"legacy-empty":`${hold.crown?"Reign Ledger":"Legacy"} · no holders`};
 for(const option of examples.options)if(names[option.value])option.textContent=names[option.value];
 frame.title=`${hold.kind} detail design preview`;
 frame.contentWindow?.postMessage({type:"stronghold-review",sample:examples.value,holding:holdings.value},location.origin);syncUrl();
}
document.querySelectorAll("[data-viewport]").forEach(b=>b.addEventListener("click",()=>{viewport=b.dataset.viewport;resize();syncUrl();}));examples.addEventListener("change",reset);holdings.addEventListener("change",reset);document.getElementById("reset").addEventListener("click",reset);frame.addEventListener("load",reset);window.addEventListener("resize",resize);
window.addEventListener("message",event=>{if(event.origin===location.origin&&event.source===frame.contentWindow&&event.data?.type==="stronghold-status")document.getElementById("reviewStatus").textContent=event.data.message;});resize();reset();
