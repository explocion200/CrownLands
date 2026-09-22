"use strict";
const frame=document.getElementById('preview'),canvas=document.getElementById('canvas'),query=new URLSearchParams(location.search);
const sizes={desktop:[1440,900],landscape:[844,390],small:[568,320]};
let viewport=Object.hasOwn(sizes,query.get('viewport'))?query.get('viewport'):'desktop';
if(query.has('level')&&Number(query.get('level'))>=0&&Number(query.get('level'))<=10)document.getElementById('level').value=query.get('level');
if([...document.getElementById('sample').options].some(o=>o.value===query.get('sample')))document.getElementById('sample').value=query.get('sample');
function resize(){const[w,h]=sizes[viewport],scale=Math.min(1,(document.documentElement.clientWidth-24)/w);Object.assign(frame.style,{width:w+'px',height:h+'px',transform:`scale(${scale})`});canvas.style.width=w*scale+'px';canvas.style.height=h*scale+'px';document.getElementById('dimensions').textContent=`${w} × ${h}${scale<1?` · ${Math.round(scale*100)}% preview`:''}`;document.querySelectorAll('[data-viewport]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.viewport===viewport)));}
function reset(){const url=new URL(location.href);url.searchParams.set('viewport',viewport);url.searchParams.set('level',document.getElementById('level').value);url.searchParams.set('sample',document.getElementById('sample').value);history.replaceState(null,'',url);frame.contentWindow?.postMessage({type:'clan-shop-review',level:Number(document.getElementById('level').value),sample:document.getElementById('sample').value},location.origin);}
document.querySelectorAll('[data-viewport]').forEach(b=>b.addEventListener('click',()=>{viewport=b.dataset.viewport;resize();const url=new URL(location.href);url.searchParams.set('viewport',viewport);history.replaceState(null,'',url);}));
document.getElementById('sample').addEventListener('change',reset);document.getElementById('level').addEventListener('change',reset);document.getElementById('reset').addEventListener('click',reset);
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==frame.contentWindow||e.data?.type!=='clan-shop-status')return;document.getElementById('reviewStatus').textContent=e.data.message;});
frame.addEventListener('load',reset);window.addEventListener('resize',resize);resize();
