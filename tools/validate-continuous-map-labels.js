"use strict";
const assert=require("node:assert/strict");
const {fixture}=require("../local-backend/world/catalog");
const {placeLabels,project}=require("../world/model");
const sites=fixture.objects.filter(o=>o.kind!=="scenery");
const labels=sites.map(o=>({key:o.key,x:o.x,y:o.top-4,width:o.kind==="castle"?110:140,height:o.kind==="castle"?70:40,
  compact:{width:o.kind==="castle"?64:105,height:o.kind==="castle"?56:40}}));
function check(input){
  const placed=placeLabels(input);
  assert.equal(placed.length,input.length);
  assert(placed.every(p=>!p.hidden),"Current catalog banners must fit without losing a name");
  assert.deepEqual(placed,placeLabels([...input].reverse()),"Feed ordering must not move banners");
  for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++){
    const a=placed[i].rect,b=placed[j].rect;
    assert(!(a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top),"Overlapping labels at "+placed[i].key+" / "+placed[j].key);
  }
  return placed;
}
const normal=check(labels);
const selected=labels.map((l,i)=>i===800?{...l,width:200,height:90,priority:1,compact:null}:l);
assert.equal(check(selected).find(p=>p.key===selected[800].key).compact,false,"Keep all selected-city details");
// World-space offsets scale down with the map; no inverse-zoom compensation.
for(const p of normal){const size={width:844,height:390},a={x:p.rect.left,y:p.rect.top},b={x:p.rect.right,y:p.rect.bottom};let previous=Infinity;
  for(const zoom of [2,1,.6]){const first=project({x:500,y:500,zoom},a,size),last=project({x:500,y:500,zoom},b,size),width=last.x-first.x;assert(width<previous);previous=width;}
}
const degenerate=Array.from({length:100},(_,i)=>({key:String(i),x:0,y:0,width:110,height:70,compact:{width:64,height:56},priority:i===0?1:0}));
const fallback=placeLabels(degenerate);assert(!fallback[0].hidden);assert(fallback.some(p=>p.hidden),"Coincident invalid geometry must remain bounded instead of stacking labels");
console.log(`Continuous map labels passed: ${labels.length} catalog sites, section edges/corners, crowded owners, selected priority, stable ordering and zoom scale.`);
