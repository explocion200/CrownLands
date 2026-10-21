"use strict";
// Private server-side routing experiment. No production imports or game writes.
// Straight segments cross section edges at any passable point. A bounded A*
// grid supplies detours; exact line checks smooth them without corner cutting.
const { performance } = require("node:perf_hooks");
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const copy = p => ({x:p.x,y:p.y});
class Heap {
  constructor(){this.items=[];}
  push(item){let i=this.items.length;this.items.push(item);while(i){const p=(i-1)>>1;if(this.items[p].f<=item.f)break;this.items[i]=this.items[p];i=p;}this.items[i]=item;}
  pop(){const result=this.items[0],last=this.items.pop();if(this.items.length){let i=0;while(i*2+1<this.items.length){let c=i*2+1;if(c+1<this.items.length&&this.items[c+1].f<this.items[c].f)c++;if(this.items[c].f>=last.f)break;this.items[i]=this.items[c];i=c;}this.items[i]=last;}return result;}
}
function createRouter(geometry) {
  if(geometry.version!=="open-world-draft-v1"||!geometry.sections.length||geometry.sections.length>256)throw Error("Unsupported private world geometry");
  const width=1448,height=1086,step=18.1,bucketSize=128;
  const sections=new Map(),buckets=new Map();
  for(const s of geometry.sections){if(s.width!==width||s.height!==height||s.x%width||s.y%height)throw Error("Invalid current section footprint");sections.set(`${s.x/width},${s.y/height}`,s);}
  for(const o of geometry.obstacles){if(![o.x,o.y,o.radius].every(Number.isFinite)||o.radius<0||o.radius>400)throw Error("Invalid obstacle");
    for(let y=Math.floor((o.y-o.radius-.5)/bucketSize);y<=Math.floor((o.y+o.radius+.5)/bucketSize);y++)for(let x=Math.floor((o.x-o.radius-.5)/bucketSize);x<=Math.floor((o.x+o.radius+.5)/bucketSize);x++){
      const key=`${x},${y}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(o);
    }
  }
  const sectionAt=p=>sections.get(`${Math.floor(p.x/width)},${Math.floor(p.y/height)}`);
  function cuts(a,b) {
    const result=[0,1];
    for(const [axis,span] of [["x",width],["y",height]]){
      const d=b[axis]-a[axis];if(!d)continue;
      for(let n=Math.floor(Math.min(a[axis],b[axis])/span)+1;n*span<Math.max(a[axis],b[axis]);n++)result.push((n*span-a[axis])/d);
    }
    return [...new Set(result)].sort((a,b)=>a-b);
  }
  const lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
  function land(a,b) {
    if(!sectionAt(a)||!sectionAt(b))return false;
    const ts=cuts(a,b);
    for(let i=1;i<ts.length;i++)if(!sectionAt(lerp(a,b,(ts[i-1]+ts[i])/2)))return false;
    // Do not squeeze diagonally through the corner of inactive land.
    for(const t of ts.slice(1,-1)){const p=lerp(a,b,t);if(Math.abs(p.x/width-Math.round(p.x/width))<1e-8&&Math.abs(p.y/height-Math.round(p.y/height))<1e-8)
      for(const dx of [-.001,.001])for(const dy of [-.001,.001])if(!sectionAt({x:p.x+dx,y:p.y+dy}))return false;}
    return true;
  }
  function clear(a,b,ignore=new Set()) {
    if(!land(a,b))return false;
    const checked=new Set(),dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy;
    // Visit each crossed bucket exactly once. Obstacles are registered with
    // their full clearance radius, so neighboring buckets need not be rescanned
    // for every sample along a long Theta* line-of-sight check.
    let bx=Math.floor(a.x/bucketSize),by=Math.floor(a.y/bucketSize);
    const endX=Math.floor(b.x/bucketSize),endY=Math.floor(b.y/bucketSize);
    const sx=Math.sign(dx),sy=Math.sign(dy),stepX=dx?bucketSize/Math.abs(dx):Infinity,stepY=dy?bucketSize/Math.abs(dy):Infinity;
    let nextX=dx?((bx+(sx>0?1:0))*bucketSize-a.x)/dx:Infinity;
    let nextY=dy?((by+(sy>0?1:0))*bucketSize-a.y)/dy:Infinity;
    const limit=Math.abs(endX-bx)+Math.abs(endY-by)+1;
    for(let n=0;n<limit;n++){
      for(const o of buckets.get(`${bx},${by}`)||[]){
        if(ignore.has(o.key)||checked.has(o.key))continue;checked.add(o.key);
        const t=len?Math.max(0,Math.min(1,((o.x-a.x)*dx+(o.y-a.y)*dy)/len)):0;
        if(distance(o,lerp(a,b,t))<o.radius+.5)return false;
      }
      if(bx===endX&&by===endY)return true;
      const crossX=bx===endX?Infinity:nextX,crossY=by===endY?Infinity:nextY;
      if(crossX<crossY){bx+=sx;nextX+=stepX;}
      else if(crossY<crossX){by+=sy;nextY+=stepY;}
      else{bx+=sx;by+=sy;nextX+=stepX;nextY+=stepY;}
    }
    return false;
  }
  function ignoredEndpoints(a,b) {
    const ignored=new Set();
    for(const p of [a,b])for(const o of buckets.get(`${Math.floor(p.x/bucketSize)},${Math.floor(p.y/bucketSize)}`)||[])
      if(distance(p,o)<1)ignored.add(o.key);
    return ignored;
  }
  function route(source,target,{maxVisited=50000,maxMs=700}={}) {
    const began=performance.now();
    if(![source?.x,source?.y,target?.x,target?.y].every(Number.isFinite)||!sectionAt(source)||!sectionAt(target))return {status:"invalid-endpoint"};
    const a=copy(source),b=copy(target),ignore=ignoredEndpoints(a,b);
    if(!clear(a,a,ignore)||!clear(b,b,ignore))return {status:"blocked-endpoint"};
    let points,visited=0;
    if(clear(a,b,ignore))points=[a,b];
    else {
      const cell=p=>({x:Math.floor(p.x/step),y:Math.floor(p.y/step)}),key=p=>`${p.x},${p.y}`,center=p=>({x:(p.x+.5)*step,y:(p.y+.5)*step});
      const endCell=cell(b),heap=new Heap(),records=new Map();
      const seeds=cell(a);
      for(let y=seeds.y-2;y<=seeds.y+2;y++)for(let x=seeds.x-2;x<=seeds.x+2;x++){
        const c={x,y},p=center(c);if(!clear(a,p,ignore))continue;
        const g=distance(a,p),record={...c,p,g,f:g+distance(p,b),parent:null};records.set(key(c),record);heap.push(record);
      }
      let found;
      while(heap.items.length){
        const current=heap.pop();if(current.closed||records.get(key(current))!==current)continue;current.closed=true;visited++;
        if(visited>maxVisited||((visited&63)===0&&performance.now()-began>maxMs))return {status:"budget-exceeded",visited};
        if(Math.abs(current.x-endCell.x)<=2&&Math.abs(current.y-endCell.y)<=2&&clear(current.p,b,ignore)){found=current;break;}
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          if(!dx&&!dy)continue;const c={x:current.x+dx,y:current.y+dy},k=key(c),p=center(c),old=records.get(k);
          let parent=current,g=current.g+distance(current.p,p);
          // Theta* shares a visible ancestor across open ground, so long
          // journeys do not expand a wide band of stair-stepped grid paths.
          const ancestor=current.parent;
          if(ancestor){const shortcut=ancestor.g+distance(ancestor.p,p);if(shortcut<g&&(!old||shortcut<old.g-1e-8)&&clear(ancestor.p,p,ignore)){g=shortcut;parent=ancestor;}}
          if(old&&old.g<=g+1e-8)continue;if(!clear(current.p,p,ignore))continue;
          const next={...c,p,g,f:g+distance(p,b),parent};records.set(k,next);heap.push(next);
        }
      }
      if(!found)return {status:"unreachable",visited};
      const reverse=[b];for(let p=found;p;p=p.parent)reverse.push(p.p);reverse.push(a);const raw=reverse.reverse();
      points=[a];let index=0;
      while(index<raw.length-1){let next=raw.length-1;while(next>index+1&&!clear(raw[index],raw[next],ignore))next--;points.push(raw[next]);index=next;}
    }
    const segments=[];let length=0;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],ts=cuts(a,b);length+=distance(a,b);
      for(let j=1;j<ts.length;j++){const start=lerp(a,b,ts[j-1]),end=lerp(a,b,ts[j]),s=sectionAt(lerp(a,b,(ts[j-1]+ts[j])/2));
        const last=segments.at(-1);if(last?.sectionId===s.id)last.points.push(end);else segments.push({sectionId:s.id,points:[start,end]});
      }
    }
    return {status:"ok",version:geometry.version,points,segments,length,mapUnits:length*geometry.unitsPerPixel,visited,elapsedMs:performance.now()-began};
  }
  return {route,clear,sectionAt,ignoredEndpoints};
}
module.exports={createRouter};
