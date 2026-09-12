"use strict";
const frame = document.getElementById('preview'), canvas = document.getElementById('canvas');
const query = new URLSearchParams(location.search), sizes = { desktop:[1440,900], landscape:[844,390], small:[568,320] };
let viewport = Object.hasOwn(sizes, query.get('viewport')) ? query.get('viewport') : 'desktop';
function resize() {
  const [width,height] = sizes[viewport], scale = Math.min(1, (document.documentElement.clientWidth - 24) / width);
  Object.assign(frame.style, {width:width+'px',height:height+'px',transform:`scale(${scale})`});
  Object.assign(canvas.style, {width:width*scale+'px',height:height*scale+'px'});
  document.getElementById('dimensions').textContent = `${width} × ${height} screen${scale < 1 ? ` · ${Math.round(scale*100)}% preview` : ''}`;
  document.querySelectorAll('[data-viewport]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.viewport === viewport)));
}
function send(action) { frame.contentWindow?.postMessage({type:'quests-review',action,sample:document.getElementById('sample').value},location.origin); }
document.querySelectorAll('[data-viewport]').forEach(button => button.addEventListener('click',()=>{viewport=button.dataset.viewport;resize();history.replaceState(null,'',`?viewport=${viewport}`);}));
document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>send(button.dataset.action)));
document.getElementById('sample').addEventListener('change',()=>send('reset'));
frame.addEventListener('load',()=>send('reset'));
window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===frame.contentWindow&&event.data?.type==='quests-status')document.getElementById('reviewStatus').textContent=event.data.message;});
window.addEventListener('resize',resize);resize();
