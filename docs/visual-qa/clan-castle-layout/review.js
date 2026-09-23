"use strict";
const frame=document.getElementById("preview"),canvas=document.getElementById("canvas"),query=new URLSearchParams(location.search);
const sizes={desktop:[1440,900],landscape:[844,390],small:[568,320]};
let viewport=Object.hasOwn(sizes,query.get("viewport"))?query.get("viewport"):"desktop";
for(const id of ["sample","level"])if([...document.getElementById(id).options].some(o=>o.value===query.get(id)))document.getElementById(id).value=query.get(id);
function resize(){const[w,h]=sizes[viewport],scale=Math.min(1,(document.documentElement.clientWidth-24)/w);Object.assign(frame.style,{width:w+"px",height:h+"px",transform:`scale(${scale})`});canvas.style.width=w*scale+"px";canvas.style.height=h*scale+"px";document.getElementById("dimensions").textContent=`${w} × ${h} · Landscape only`;document.querySelectorAll("[data-viewport]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.viewport===viewport)));}
function reset(){const url=new URL(location.href);url.searchParams.set("viewport",viewport);for(const id of ["sample","level"])url.searchParams.set(id,document.getElementById(id).value);history.replaceState(null,"",url);frame.contentWindow?.postMessage({type:"castle-layout-review",sample:document.getElementById("sample").value,level:Number(document.getElementById("level").value)},location.origin);}
document.querySelectorAll("[data-viewport]").forEach(b=>b.addEventListener("click",()=>{viewport=b.dataset.viewport;resize();reset();}));
for(const id of ["sample","level"])document.getElementById(id).addEventListener("change",reset);
document.getElementById("reset").addEventListener("click",reset);frame.addEventListener("load",reset);window.addEventListener("resize",resize);
window.addEventListener("message",e=>{if(e.origin===location.origin&&e.source===frame.contentWindow&&e.data?.type==="castle-layout-status")document.getElementById("reviewStatus").textContent=e.data.message;});resize();
