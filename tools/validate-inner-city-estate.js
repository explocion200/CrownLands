const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const estate = require("../inner-city-estate");
const root = path.resolve(__dirname, "..");
const expected = {
  "great-hall":[50,31],treasury:[39,33],barracks:[61,34],alehouse:[40,46],"royal-stables":[60,48],"guild-master":[40,54],gatehouse:[50,60],
  quarry:[29,18],mine:[73,19],"foresters-lodge":[17,33],sawmill:[23,45],smithy:[27,61],workshop:[37,70],"builders-yard":[43,83],
  windmill:[12,64],farmstead:[18,79],granary:[29,87],storehouse:[69,63],"wagon-yard":[87,69],market:[83,44],
};
assert.equal(estate.buildings.length,20);
assert.equal(new Set(estate.buildings.map(b=>b.key)).size,20);
const box = b=>({left:b.hotspot.left-b.footprint.width/2,right:b.hotspot.left+b.footprint.width/2,top:b.hotspot.top-b.footprint.height/2,bottom:b.hotspot.top+b.footprint.height/2});
function intersects(a,b,r) {
  let lo=0,hi=1;
  for(const [p,q,min,max] of [[a[0],b[0],r.left+.1,r.right-.1],[a[1],b[1],r.top+.1,r.bottom-.1]]){
    if(Math.abs(q-p)<1e-8){if(p<=min||p>=max)return false;continue;}
    const first=(min-p)/(q-p),last=(max-p)/(q-p);lo=Math.max(lo,Math.min(first,last));hi=Math.min(hi,Math.max(first,last));
    if(lo>=hi)return false;
  }
  return hi>0&&lo<1;
}
const adjacency=new Map();
estate.roads.forEach(r=>{for(const [a,b] of [[r.from,r.to],[r.to,r.from]]){if(!adjacency.has(a))adjacency.set(a,[]);adjacency.get(a).push(b);}});
const visited=new Set(),queue=["south"];
while(queue.length){const node=queue.shift();if(visited.has(node))continue;visited.add(node);queue.push(...adjacency.get(node)||[]);}
assert.equal(visited.size,adjacency.size,"All road branches must connect to the royal approach");
for(const b of estate.buildings){
  assert.deepEqual([b.hotspot.left,b.hotspot.top],expected[b.key]);
  assert.deepEqual(b.entrance,[b.hotspot.left,b.hotspot.top+b.footprint.height/2]);
  const approaches=estate.roads.filter(r=>r.buildingKey===b.key);assert(approaches.length,b.key+" needs a road");
  assert(approaches.some(r=>r.points.some((p,i)=>i&&Math.abs((p[0]-r.points[i-1][0])*(b.entrance[1]-r.points[i-1][1])-(p[1]-r.points[i-1][1])*(b.entrance[0]-r.points[i-1][0]))<1e-7&&b.entrance[0]>=Math.min(p[0],r.points[i-1][0])-1e-7&&b.entrance[0]<=Math.max(p[0],r.points[i-1][0])+1e-7&&b.entrance[1]>=Math.min(p[1],r.points[i-1][1])-1e-7&&b.entrance[1]<=Math.max(p[1],r.points[i-1][1])+1e-7)),b.key+" entrance must meet its road");
  const a=box(b);assert(a.left>=0&&a.right<=100&&a.top>=0&&a.bottom<=100);
  for(const other of estate.buildings){if(b.key===other.key)continue;const c=box(other);assert(a.right<=c.left||a.left>=c.right||a.bottom<=c.top||a.top>=c.bottom,b.key+" footprint overlaps "+other.key);}
  for(const r of estate.roads){if(r.buildingKey===b.key)continue;for(let i=1;i<r.points.length;i++)assert(!intersects(r.points[i-1],r.points[i],a),r.id+" cuts through "+b.key);}
  for(const asset of Object.values(b.artByState)){assert(fs.existsSync(path.join(root,asset)),"Missing state art "+asset);}
}
const initial=estate.createStates();assert.equal(Object.values(initial).filter(s=>s==="completed").length,6);assert.equal(Object.values(initial).filter(s=>s==="unbuilt").length,14);
for(const cottage of estate.cottages){const a=box(cottage);for(const b of estate.buildings){const c=box(b);assert(a.right<=c.left||a.left>=c.right||a.bottom<=c.top||a.top>=c.bottom,cottage.key+" overlaps "+b.key);}for(const r of estate.roads)for(let i=1;i<r.points.length;i++)assert(!intersects(r.points[i-1],r.points[i],a),r.id+" cuts through "+cottage.key);}
assert.equal(estate.createStates({treasury:"invalid"}).treasury,"completed");assert.equal(estate.createStates({treasury:"constructing"}).treasury,"constructing");assert.equal(initial.treasury,"completed","Fixtures must not mutate defaults");
const straight=[[0,0],[10,0]],distance=estate.width*.1;
assert(Math.abs(estate.samplePath(straight,10).x-10)<1e-8);assert(Math.abs(estate.samplePath(straight,distance+10).x-(distance-10))<1e-8);assert.equal(estate.samplePath(straight,distance+10).facing,-1);
const atlas=fs.readFileSync(path.join(root,"assets/inner-city-estate/actors.webp"));assert.equal(atlas.toString("ascii",0,4),"RIFF");assert(atlas.length<200000,"Keep ambient atlas small");
for(const file of ["terrain.webp",...estate.buildings.map(b=>b.key+".webp")]){const buffer=fs.readFileSync(path.join(root,"assets/inner-city-estate",file));assert.equal(buffer.toString("ascii",8,12),"WEBP");assert(buffer.length<(file==="terrain.webp"?400000:50000),"Estate image exceeds budget: "+file);}
const source=fs.readFileSync(path.join(root,"inner-city-estate.js"),"utf8");assert.doesNotMatch(source,/\b(?:fetch|localStorage|saveGame|callServer)\s*[.(]/,"Visual estate must not write player progression or call the server");
const provenance=JSON.parse(fs.readFileSync(path.join(root,"docs/art-sources/inner-city-estate/art-record.json"),"utf8"));
for(const entry of [...provenance.runtime,...provenance.sources]){
  const bytes=fs.readFileSync(path.join(root,entry.path));
  const canonical=entry.hashEncoding==="utf8-lf"?bytes.toString("utf8").replace(/\r\n/g,"\n"):bytes;
  assert.equal(crypto.createHash("sha256").update(canonical).digest("hex"),entry.sha256,"Artwork differs from reviewed provenance: "+entry.path);
}
assert.equal(provenance.runtime.find(entry=>entry.path.endsWith("terrain.webp")).width,1448);
assert.equal(provenance.runtime.find(entry=>entry.path.endsWith("terrain.webp")).height,1086);
for(const entry of provenance.runtime.filter(entry=>entry.path.endsWith(".webp")&&!entry.path.endsWith("terrain.webp")))assert.equal(entry.hasAlpha,true,"Sprite alpha must be preserved: "+entry.path);
const index=fs.readFileSync(path.join(root,"index.html"),"utf8");assert(index.includes('inner-city-estate.css?v=20261006-estate-r1'));assert(index.indexOf('src="inner-city-estate.js')<index.indexOf('src="game.js'));
const build=fs.readFileSync(path.join(root,"tools/build-production-client.js"),"utf8");assert(build.includes('"inner-city-estate.js"'));assert(build.includes('copyDirectoryFiles("assets/inner-city-estate"'));
console.log("PASS: 20 approved fixed plots, distinct nonoverlapping footprints, connected south-facing approaches, roads clear of other plots, six initial buildings, isolated fixtures, shared movement geometry, compact artwork and production asset inclusion.");
