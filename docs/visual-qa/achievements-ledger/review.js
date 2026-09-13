"use strict";
const frame=document.getElementById('preview'), canvas=document.getElementById('canvas');
const sizes={desktop:[1440,900],landscape:[844,390],small:[568,320]}, query=new URLSearchParams(location.search);
let viewport=Object.hasOwn(sizes,query.get('viewport'))?query.get('viewport'):'desktop';
function resize(){const [w,h]=sizes[viewport], scale=Math.min(1,(document.documentElement.clientWidth-24)/w);Object.assign(frame.style,{width:w+'px',height:h+'px',transform:`scale(${scale})`});Object.assign(canvas.style,{width:w*scale+'px',height:h*scale+'px'});document.getElementById('dimensions').textContent=`${w} × ${h} screen${scale<1?` · ${Math.round(scale*100)}% preview`:''}`;document.querySelectorAll('[data-viewport]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.viewport===viewport)));}
function send(action){frame.contentWindow?.postMessage({type:'achievements-review',action,sample:document.getElementById('sample').value},location.origin);}
document.querySelectorAll('[data-viewport]').forEach(b=>b.addEventListener('click',()=>{viewport=b.dataset.viewport;resize();history.replaceState(null,'',`?viewport=${viewport}`);}));
document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>send(b.dataset.action)));
document.getElementById('sample').addEventListener('change',()=>send('reset'));
frame.addEventListener('load',()=>send('reset'));
window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===frame.contentWindow&&e.data?.type==='achievements-status')document.getElementById('reviewStatus').textContent=e.data.message;});
window.addEventListener('resize',resize);resize();
