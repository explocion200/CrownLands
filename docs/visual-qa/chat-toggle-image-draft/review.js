"use strict";
(() => {
 const frame=document.getElementById("preview"),fit=document.getElementById("fit"),unread=document.getElementById("unread");
 const sizes={desktop:[1440,900],landscape:[844,390],small:[568,320]},query=new URLSearchParams(location.search);
 let viewport=Object.hasOwn(sizes,query.get("viewport"))?query.get("viewport"):"landscape";
 let look=query.get("look")==="current"?"current":"draft",open=query.get("open")==="true";
 unread.checked=query.get("unread")==="true";
 function resize(){const[w,h]=sizes[viewport],scale=Math.min(1,(fit.parentElement.clientWidth-26)/w);Object.assign(fit.style,{width:w*scale+"px",height:h*scale+"px"});Object.assign(frame.style,{width:w+"px",height:h+"px",transform:`scale(${scale})`});document.getElementById("dimensions").textContent=`${w} × ${h} · ${Math.round(scale*100)}% preview`;}
 function sync(send=true){
  resize();
  for(const key of ["viewport","look","open"])document.querySelectorAll(`[data-${key}]`).forEach(b=>b.setAttribute("aria-pressed",String(b.dataset[key]===String({viewport,look,open}[key]))));
  const settings={look,open,unread:unread.checked};
  if(send)frame.contentWindow.postMessage({type:"chat-image-review",...settings},location.origin);
  const params=new URLSearchParams(settings);document.getElementById("fullWindow").href="preview.html?"+params;history.replaceState(null,"","?viewport="+viewport+"&"+params);
 }
 document.querySelectorAll("[data-viewport]").forEach(b=>b.addEventListener("click",()=>{viewport=b.dataset.viewport;sync();}));
 document.querySelectorAll("[data-look]").forEach(b=>b.addEventListener("click",()=>{look=b.dataset.look;sync();}));
 document.querySelectorAll("[data-open]").forEach(b=>b.addEventListener("click",()=>{open=b.dataset.open==="true";sync();}));
 unread.addEventListener("change",()=>sync());
 window.addEventListener("message",event=>{
  if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
  if(event.data?.type==="chat-image-status"){document.getElementById("status").textContent=event.data.message;if(event.data.ready){document.documentElement.dataset.chatReviewReady="true";sync();}}
  if(event.data?.type==="chat-image-state"){open=event.data.open;sync(false);}
 });
 new ResizeObserver(resize).observe(fit.parentElement);
 frame.src="preview.html?"+new URLSearchParams({look,open,unread:unread.checked});sync(false);
})();
