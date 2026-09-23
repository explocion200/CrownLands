"use strict";
const frame=document.getElementById('preview'),canvas=document.getElementById('canvas'),query=new URLSearchParams(location.search),sizes={desktop:[1440,900],landscape:[844,390],small:[568,320]};
let viewport=Object.hasOwn(sizes,query.get('viewport'))?query.get('viewport'):'desktop';
if([...document.getElementById('chapter').options].some(o=>o.value===query.get('chapter')))document.getElementById('chapter').value=query.get('chapter');
function resize(){const[w,h]=sizes[viewport],scale=Math.min(1,(document.documentElement.clientWidth-24)/w);Object.assign(frame.style,{width:w+'px',height:h+'px',transform:`scale(${scale})`});canvas.style.width=w*scale+'px';canvas.style.height=h*scale+'px';document.getElementById('dimensions').textContent=`${w} × ${h}${scale<1?` · ${Math.round(scale*100)}% preview`:''}`;document.querySelectorAll('[data-viewport]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.viewport===viewport)));}
function updateUrl(){const url=new URL(location.href);url.searchParams.set('viewport',viewport);url.searchParams.set('chapter',document.getElementById('chapter').value);history.replaceState(null,'',url);}
function reset(){updateUrl();frame.contentWindow?.postMessage({type:'help-review',chapter:document.getElementById('chapter').value},location.origin);}
document.querySelectorAll('[data-viewport]').forEach(b=>b.addEventListener('click',()=>{viewport=b.dataset.viewport;resize();updateUrl();}));
document.getElementById('chapter').addEventListener('change',reset);document.getElementById('reset').addEventListener('click',reset);
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==frame.contentWindow||e.data?.type!=='help-status')return;document.getElementById('reviewStatus').textContent=e.data.message;if(e.data.chapter&&[...document.getElementById('chapter').options].some(o=>o.value===e.data.chapter)){document.getElementById('chapter').value=e.data.chapter;updateUrl();}});
frame.addEventListener('load',reset);window.addEventListener('resize',resize);resize();
