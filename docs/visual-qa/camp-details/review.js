"use strict";
const frame=document.getElementById('preview'),canvas=document.getElementById('canvas'),sample=document.getElementById('sample'),campChoice=document.getElementById('camp'),query=new URLSearchParams(location.search);
const sizes={desktop:[1440,900],landscape:[844,390],small:[568,320]};
let viewport=Object.hasOwn(sizes,query.get('viewport'))?query.get('viewport'):'desktop';
if([...sample.options].some(o=>o.value===query.get('sample')))sample.value=query.get('sample');
if([...campChoice.options].some(o=>o.value===query.get('camp')))campChoice.value=query.get('camp');
function campControls(){for(const option of sample.options){if(option.dataset.deedOnly!==undefined){option.hidden=campChoice.value!=='deed';option.disabled=option.hidden;}}if(sample.selectedOptions[0]?.disabled)sample.value='owned';const name=campChoice.selectedOptions[0].textContent;document.getElementById('reviewTitle').textContent=`${name} · The field ledger`;document.title=`Crown Lands · ${name} draft`;frame.title=`${name} design preview`;}
function sync(){history.replaceState(null,'',`?viewport=${viewport}&sample=${sample.value}&camp=${campChoice.value}`);}
function resize(){const[w,h]=sizes[viewport],scale=Math.min(1,(document.documentElement.clientWidth-24)/w);Object.assign(frame.style,{width:`${w}px`,height:`${h}px`,transform:`scale(${scale})`});Object.assign(canvas.style,{width:`${w*scale}px`,height:`${h*scale}px`});document.getElementById('dimensions').textContent=`${w} × ${h} screen · ${Math.round(scale*100)}% preview`;document.querySelectorAll('[data-viewport]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.viewport===viewport)));sync();}
function reset(){campControls();frame.contentWindow?.postMessage({type:'camp-review',sample:sample.value,camp:campChoice.value},location.origin);sync();}
document.querySelectorAll('[data-viewport]').forEach(b=>b.addEventListener('click',()=>{viewport=b.dataset.viewport;resize();}));
sample.addEventListener('change',reset);campChoice.addEventListener('change',reset);document.getElementById('reset').addEventListener('click',reset);frame.addEventListener('load',reset);window.addEventListener('resize',resize);
window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===frame.contentWindow&&e.data?.type==='camp-status')document.getElementById('reviewStatus').textContent=e.data.message;});resize();
campControls();sync();frame.src=`preview.html?sample=${encodeURIComponent(sample.value)}&camp=${campChoice.value}`;
