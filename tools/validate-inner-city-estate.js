const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");
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
  assert(b.artSize.width<=b.footprint.width*estate.width/100 && b.artSize.height<=b.footprint.height*estate.height/100,b.key+' art must fit its fixed reservation at the shared scale');
  assert(Math.abs(b.artOffsetY)+b.artSize.height/2<=b.footprint.height*estate.height/200,b.key+' masonry/ground offset must remain inside its reservation');
  assert(Math.abs(b.artOffsetX)+b.artSize.width/2<=b.footprint.width*estate.width/200,b.key+' horizontal wall offset must remain inside its reservation');
  for(const other of estate.buildings){if(b.key===other.key)continue;const c=box(other);assert(a.right<=c.left||a.left>=c.right||a.bottom<=c.top||a.top>=c.bottom,b.key+" footprint overlaps "+other.key);}
  for(const r of estate.roads){if(r.buildingKey===b.key)continue;for(let i=1;i<r.points.length;i++)assert(!intersects(r.points[i-1],r.points[i],a),r.id+" cuts through "+b.key);}
  for(const asset of Object.values(b.artByState)){assert(fs.existsSync(path.join(root,asset)),"Missing state art "+asset);}
}
const initial=estate.createStates();assert.equal(Object.values(initial).filter(s=>s==="completed").length,6);assert.equal(Object.values(initial).filter(s=>s==="unbuilt").length,14);
assert.equal(estate.maxLevel,100);
assert(estate.buildings.every(b=>b.maxLevel===100));
const initialLevels=estate.createLevels(initial);
assert.equal(initialLevels.treasury,1);assert.equal(initialLevels.quarry,0);
const levelFixture={treasury:100,barracks:25,"royal-stables":101,gatehouse:-1,alehouse:1.5,"great-hall":"50",quarry:75};
const reviewedLevels=estate.createLevels(initial,levelFixture);
assert.equal(reviewedLevels.treasury,100);assert.equal(reviewedLevels.barracks,25);
for(const key of ["royal-stables","gatehouse","alehouse","great-hall"])assert.equal(reviewedLevels[key],1,'Malformed levels must not manufacture progression');
assert.equal(reviewedLevels.quarry,0,'An unbuilt plot cannot display a completed level');
assert.equal(estate.createLevels(initial,null).treasury,1);
assert.equal(initialLevels.treasury,1,'Review levels must not mutate initial levels');
for(const cottage of estate.cottages){const a=box(cottage);for(const b of estate.buildings){const c=box(b);assert(a.right<=c.left||a.left>=c.right||a.bottom<=c.top||a.top>=c.bottom,cottage.key+" overlaps "+b.key);}for(const r of estate.roads)for(let i=1;i<r.points.length;i++)assert(!intersects(r.points[i-1],r.points[i],a),r.id+" cuts through "+cottage.key);}
assert.equal(estate.createStates({treasury:"invalid"}).treasury,"completed");assert.equal(estate.createStates({treasury:"constructing"}).treasury,"constructing");assert.equal(initial.treasury,"completed","Fixtures must not mutate defaults");
const straight=[[0,0],[10,0]],distance=estate.width*.1;
assert(Math.abs(estate.samplePath(straight,10).x-10)<1e-8);assert(Math.abs(estate.samplePath(straight,distance+10).x-(distance-10))<1e-8);assert.equal(estate.samplePath(straight,distance+10).facing,-1);
const runtimeFiles=fs.readdirSync(path.join(root,'assets/inner-city-estate'));
assert.equal(runtimeFiles.length,29);
assert(!runtimeFiles.includes('plot-ground.webp'),'Site ground belongs to the terrain, not a repeated soil sprite');
let allBytes=0,overviewBytes=0;
for(const file of runtimeFiles){const buffer=fs.readFileSync(path.join(root,"assets/inner-city-estate",file));assert.equal(buffer.toString("ascii",8,12),"WEBP");const detail=file.startsWith('terrain-detail-');assert(buffer.length<(detail?650*1024:file==='terrain.webp'?500*1024:128*1024),"Estate image exceeds budget: "+file);allBytes+=buffer.length;if(!detail)overviewBytes+=buffer.length;}
assert(allBytes<=4096*1024,'Zoom artwork must stay inside the bounded 4 MiB lazy budget');
assert(overviewBytes<=1600*1024,'Overview must not absorb the zoom-only payload');
const source=fs.readFileSync(path.join(root,"inner-city-estate.js"),"utf8");assert.doesNotMatch(source,/\b(?:fetch|localStorage|saveGame|callServer)\s*[.(]/,"Visual estate must not write player progression or call the server");
assert.doesNotMatch(source,/requestAnimationFrame|estate-roads|estate-wall|estate-actor|estate-mill-sails/,'Still cohesive scene has no vector roads/walls or ambient animation work');
assert.doesNotMatch(source,/estate-site-ground|plot-ground\.webp/,'Do not overlay repeated soil shapes on the integrated terrain');
const sizes=JSON.parse(fs.readFileSync(path.join(root,'docs/art-sources/inner-city-estate/sprite-sizes.json'),'utf8'));
assert.equal(sizes.mapPixelScale,.30);
for(const b of estate.buildings)assert.deepEqual([b.artSize.width,b.artSize.height],sizes.sizes[b.key],'Registry must preserve reviewed physical art size');
const gatePlacement=JSON.parse(fs.readFileSync(path.join(root,'docs/art-sources/inner-city-estate/gate-placement-v4.json'),'utf8'));
const gate=estate.buildings.find(b=>b.key==='gatehouse'),context=gatePlacement.context,extraction=gatePlacement.extraction;
assert.deepEqual(gate.artSize,gatePlacement.artSize,'Gate cutout must retain contextual proportions');
assert.deepEqual([gate.artOffsetX,gate.artOffsetY],[gatePlacement.artOffset.x,gatePlacement.artOffset.y]);
const contextualScale=context.width/gatePlacement.canvas.width;
assert(Math.abs(contextualScale-context.height/gatePlacement.canvas.height)<1e-8,'Context crop must not distort the masonry');
assert(Math.abs(gate.hotspot.left*estate.width/100+gate.artOffsetX-gate.artSize.width/2-context.x-extraction.left*contextualScale)<1e-8,'Gate left edge must recover its painted wall location');
assert(Math.abs(gate.hotspot.top*estate.height/100+gate.artOffsetY-gate.artSize.height/2-context.y-extraction.top*contextualScale)<1e-8,'Gate top edge must recover its painted wall location');
const provenance=JSON.parse(fs.readFileSync(path.join(root,"docs/art-sources/inner-city-estate/art-record.json"),"utf8"));
for(const entry of [...provenance.runtime,...provenance.sources]){
  const bytes=fs.readFileSync(path.join(root,entry.path));
  const canonical=entry.hashEncoding==="utf8-lf"?bytes.toString("utf8").replace(/\r\n/g,"\n"):bytes;
  assert.equal(crypto.createHash("sha256").update(canonical).digest("hex"),entry.sha256,"Artwork differs from reviewed provenance: "+entry.path);
}
assert.equal(provenance.runtime.find(entry=>entry.path.endsWith("terrain.webp")).width,1448);
assert.equal(provenance.runtime.find(entry=>entry.path.endsWith("terrain.webp")).height,1086);
for(const entry of provenance.runtime.filter(entry=>!path.basename(entry.path).startsWith('terrain')))assert.equal(entry.hasAlpha,true,"Sprite alpha must be preserved: "+entry.path);
for(const b of estate.buildings){const art=provenance.runtime.find(e=>e.path===b.artByState.completed);assert(art.width/b.artSize.width>=3.2&&art.height/b.artSize.height>=3.2,'Retain native source detail at the full camera zoom');assert(Math.abs(art.width/art.height-b.artSize.width/b.artSize.height)<.02,'Preserve building proportions');}
function webpSize(buffer){
  assert.equal(buffer.toString('ascii',8,12),'WEBP');
  for(let offset=12;offset+8<=buffer.length;){
    const type=buffer.toString('ascii',offset,offset+4),size=buffer.readUInt32LE(offset+4),data=offset+8;
    if(type==='VP8X')return [buffer.readUIntLE(data+4,3)+1,buffer.readUIntLE(data+7,3)+1];
    if(type==='VP8 ')return [buffer.readUInt16LE(data+6)&0x3fff,buffer.readUInt16LE(data+8)&0x3fff];
    if(type==='VP8L'){const bits=buffer.readUInt32LE(data+1);return [(bits&0x3fff)+1,((bits>>>14)&0x3fff)+1];}
    offset=data+size+(size%2);
  }
  throw new Error('Unsupported WebP frame');
}
const catalogContext={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'assets/worlds/core-expansion-v1/region-catalog.js'),'utf8'),catalogContext);
const catalog=catalogContext.window.CROWNLANDS_REGION_CATALOG;
assert.equal(catalog.topologyVersion,JSON.parse(fs.readFileSync(path.join(root,'functions/release-config.json'),'utf8')).worldTopology);
assert.deepEqual([estate.width,estate.height],[catalog.globalSettings.defaultMapWidth,catalog.globalSettings.defaultMapHeight],'Estate must use the active game topology map dimensions');
const normalMap=catalog.regions.find(region=>region.spawnEligible&&region.artPresentation);
assert(normalMap,'Verify an actual normal map from the active catalog');
assert.deepEqual(webpSize(fs.readFileSync(path.join(root,normalMap.mapAsset))),[estate.width,estate.height],'Actual normal map art must match estate logical dimensions');
for(const tile of estate.terrainTiles){const art=provenance.runtime.find(entry=>entry.path===tile.src);assert(art.width/tile.width>=1.9&&art.height/tile.height>=1.9,'Native close-up terrain must contain more detail than the overview');assert(tile.x>=0&&tile.y>=0&&tile.x+tile.width<=estate.width&&tile.y+tile.height<=estate.height);}
const css=fs.readFileSync(path.join(root,'inner-city-estate.css'),'utf8');
assert.doesNotMatch(css,/will-change\s*:\s*transform/,'Do not magnify a cached overview raster at higher zoom');
const surroundRecipe=JSON.parse(fs.readFileSync(path.join(root,'docs/art-sources/inner-city-estate/surround-v5-prompts.json'),'utf8'));
for(const side of estate.scenery){
  const art=provenance.runtime.find(entry=>entry.path===side.src),crop=surroundRecipe.crops[side.key],logical=surroundRecipe.logical[side.key];
  assert.deepEqual(webpSize(fs.readFileSync(path.join(root,side.src))),[crop.width,crop.height]);
  assert.deepEqual([side.x,side.width,side.height],[logical.left,logical.width,logical.height]);
  assert.equal(art.hasAlpha,false,'Surrounding scenery must cover the flat gutter');
  assert.equal(art.width/side.width,art.height/side.height,'Do not stretch painted scenery');
}
const index=fs.readFileSync(path.join(root,"index.html"),"utf8");assert(index.includes('inner-city-estate.css?v=20261007-estate-labels-r3'));assert(index.indexOf('src="inner-city-estate.js')<index.indexOf('src="game.js'));
const build=fs.readFileSync(path.join(root,"tools/build-production-client.js"),"utf8");assert(build.includes('"inner-city-estate.js"'));assert(build.includes('copyDirectoryFiles("assets/inner-city-estate"'));
console.log("PASS: 20 fixed plots, integrated terrain ground and contextual Gatehouse placement, connected layout graph, six initial buildings, actual active-topology map dimensions, native 3.2x+ sprites, bounded lazy detail tiles, painted construction states, no ambient loops/overlay roads and production inclusion.");
