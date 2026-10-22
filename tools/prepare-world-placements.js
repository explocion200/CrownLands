"use strict";
// Offline display packing for the active Core topology. Identity and saved
// coordinates stay in templates.json; only the live display offsets change.
const fs = require("node:fs"), path = require("node:path");
const fixture = require("../local-backend/world/templates.json");
const roads = require("../local-backend/world/source/roads.json");
const npcSites = require("../local-backend/world/npc-sites.json");
const destination = path.resolve(__dirname, "../local-backend/world/placements.json");
const overlap = (a,b,gap=0) => a.left < b.right+gap && a.right+gap > b.left && a.top < b.bottom+gap && a.bottom+gap > b.top;
const rect = (x,y,width=112,above=126,below=36) => ({left:x-width/2,right:x+width/2,top:y-above,bottom:y+below});
const distance = (a,b) => (a.x-b.x)**2 + ((a.y-b.y)*.8)**2;
function roadIndex(sectionId) {
  const buckets = new Map();
  for (const line of roads.maps.find(m=>m.id===sectionId).roads) for (const p of line) {
    const key=Math.floor(p[0]/64)+":"+Math.floor(p[1]/64);
    if (!buckets.has(key)) buckets.set(key,[]);
    buckets.get(key).push(p);
  }
  return (x,y,radius) => {
    const bx=Math.floor(x/64),by=Math.floor(y/64),cells=Math.ceil((radius+40)/64);
    for(let a=bx-cells;a<=bx+cells;a++) for(let b=by-cells;b<=by+cells;b++)
      if ((buckets.get(a+":"+b)||[]).some(p=>Math.hypot(x-p[0],y-p[1]) < radius+p[2]/2+8)) return true;
    return false;
  };
}
function prepareSection(section) {
  const items=fixture.objects.filter(o=>o.sectionId===section.id),cities=items.filter(o=>o.kind==="castle");
  const fixed=items.filter(o=>!["castle","scenery"].includes(o.kind));
  const landmarks=fixed.map(o=>({left:o.left-section.x-12,top:o.top-section.y-110,right:o.left-section.x+o.width+12,bottom:o.top-section.y+o.height+12}));
  const onRoad=roadIndex(section.id), points=[];
  for(let y=132;y<=section.height-56;y+=12) for(let x=64;x<=section.width-64;x+=12)
    if(!onRoad(x,y,40)&&!landmarks.some(r=>overlap(rect(x,y),r))) points.push({x,y});
  // Clearings are part of the display layout, not saved reward locations.
  // Keep them in the existing central spawn search and leave roads unobstructed.
  const pickupZones=[];
  for(const target of [{x:section.width/2-235,y:section.height/2+100},{x:section.width/2+235,y:section.height/2+100}]) {
    const candidates=points.filter(p=>Math.hypot(p.x-section.width/2,p.y-section.height/2)<290
      && !landmarks.some(r=>overlap(rect(p.x,p.y,164,82,82),r))
      && pickupZones.every(z=>Math.hypot(p.x-z.x,p.y-z.y)>180));
    candidates.sort((a,b)=>distance(a,target)-distance(b,target));
    if(!candidates.length) throw Error("No pickup clearing: "+section.id);
    pickupZones.push({...candidates[0],radius:82});
  }
  const available=points.filter(p=>!pickupZones.some(z=>overlap(rect(p.x,p.y),rect(z.x,z.y,164,82,82))));
  const slots=[],scores=available.map(()=>Infinity),center={x:section.width/2,y:section.height/2};
  for(let i=0;i<cities.length;i++) {
    let best=0;
    for(let j=1;j<available.length;j++) if(i?scores[j]>scores[best]:distance(available[j],center)<distance(available[best],center)) best=j;
    const point=available[best];slots.push(point);
    available.forEach((p,j)=>{scores[j]=Math.min(scores[j],distance(p,point));});
  }
  // Maximise each slot's separation from its neighbours. Vertical spacing gets
  // more room for banners. This work runs at authoring time, never on a phone.
  for(let round=0;round<6;round++) for(let i=0;i<slots.length;i++) {
    let best=slots[i],score=0;
    for(const p of available) {
      let d=Infinity;
      for(let j=0;j<slots.length;j++) if(i!==j) {d=Math.min(d,distance(p,slots[j]));if(d<score)break;}
      if(d>score+1) {score=d;best=p;}
    }
    slots[i]=best;
  }
  const positions={},remaining=slots.slice();
  // Keep each identity close to its previous display neighbourhood where possible.
  for(const city of [...cities].sort((a,b)=>distance(b.previewLocal,center)-distance(a.previewLocal,center)||a.id.localeCompare(b.id))) {
    remaining.sort((a,b)=>distance(a,city.previewLocal)-distance(b,city.previewLocal));
    positions[city.id]=remaining.shift();
  }
  // Keep the approved NPC alternatives clear of decorations, including the
  // attached name/countdown above each marker. Cities/objectives do not move.
  const npcClearings=(npcSites.sections.find(s=>s.id===section.id)?.points||[]).map(p=>rect(p.x,p.y,96,60,32));
  const reserved=[...landmarks,...slots.map(p=>rect(p.x,p.y)),...pickupZones.map(z=>rect(z.x,z.y,164,82,82)),...npcClearings],decorationBounds=[];
  for(const item of items.filter(o=>o.kind==="scenery").sort((a,b)=>b.width*b.height-a.width*a.height||a.id.localeCompare(b.id))) {
    const original={x:item.left+item.width/2-section.x,y:item.top+item.height/2-section.y};let best,score=Infinity;
    for(let y=item.height/2+6;y<section.height-item.height/2-6;y+=12) for(let x=item.width/2+6;x<section.width-item.width/2-6;x+=12) {
      const d=(x-original.x)**2+(y-original.y)**2;if(d>=score)continue;
      const box=rect(x,y,item.width,item.height/2,item.height/2);
      if(reserved.some(r=>overlap(box,r,3))||decorationBounds.some(r=>overlap(box,r,1))||onRoad(x,y,Math.max(item.width,item.height)/2))continue;
      best={x,y};score=d;
    }
    if(!best)throw Error("No clear decoration placement: "+section.id+"/"+item.id);
    // Seasonal decorations use a top-left anchor; ordinary scenery uses its
    // centre. Preserve that contract while packing the actual artwork bounds.
    positions[item.id]={x:best.x+item.x-item.left-item.width/2,y:best.y+item.y-item.top-item.height/2};
    decorationBounds.push(rect(best.x,best.y,item.width,item.height/2,item.height/2));
  }
  return {id:section.id,positions,pickupZones};
}
function prepare() { return {version:1,topology:"core-expansion-v1",sections:fixture.sections.map(prepareSection)}; }
if(require.main===module) {
  const text=JSON.stringify(prepare())+"\n";
  if(process.argv.includes("--check")) {if(fs.readFileSync(destination,"utf8")!==text)throw Error("Run node tools/prepare-world-placements.js");}
  else fs.writeFileSync(destination,text);
  console.log("Verified display placements for all "+fixture.sections.length+" current Core templates.");
}
module.exports={prepare,prepareSection,roadIndex,rect,overlap};
