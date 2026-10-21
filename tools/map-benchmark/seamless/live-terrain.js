"use strict";
// Recompose the approved paintings and existing road geometry at the CURRENT
// section coordinates. Template terrain cannot be moved to a different parity
// without introducing seams. Outputs are private, disposable development files.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),sharp=require("sharp");
const {roadsSvg}=require("../../build-clean-map-ground");
const ROOT=path.resolve(__dirname,"../../.."),W=1448,H=1086;
const INPUTS=["docs/art-sources/clean-map-ground/ground.png","docs/art-sources/blended-dirt-roads/dirt-material.png","tools/map-art/clearance.json","tools/build-clean-map-ground.js","tools/map-benchmark/seamless/live-terrain.js"];
const hash=b=>crypto.createHash("sha256").update(b).digest("hex");
const building=new Map();
async function prepareTerrain(manifest){
  if(manifest.topology!=="core-expansion-v1"||manifest.sections.length>256)throw Error("Current private topology required");
  const geometry=manifest.sections.map(s=>[s.id,s.templateId,s.gridX,s.gridY]);
  const signature=hash(JSON.stringify([geometry,INPUTS.map(f=>hash(fs.readFileSync(path.join(ROOT,f))))])).slice(0,24);
  if(!building.has(signature))building.set(signature,build(manifest,signature).finally(()=>building.delete(signature)));
  const built=await building.get(signature);
  // Only artwork is shared. Concurrent fixture/owner sessions must retain
  // their own realm identity and manifest metadata.
  return{...built,manifest:{...manifest,sections:manifest.sections.map((s,i)=>({...s,terrain:built.manifest.sections[i].terrain,thumbnail:built.manifest.sections[i].thumbnail}))}};
}
async function build(manifest,signature){
  const dir=path.join(ROOT,"release-artifacts/continuous-world-terrain",signature),receipt=path.join(dir,"manifest.json");
  const files=new Map(),sections=manifest.sections.map(s=>({...s}));
  for(const s of sections)for(const [field,suffix]of[["terrain",""],["thumbnail","-thumb"]]){
    const name=s.id+suffix+".webp";s[field]=`tools/map-benchmark/seamless/terrain/live-${signature}-${name}`;files.set(s[field],path.join(dir,name));
  }
  const output={manifest:{...manifest,sections},files,signature};
  if(fs.existsSync(receipt)){
    const saved=JSON.parse(fs.readFileSync(receipt));
    if(saved.signature===signature&&saved.files.length===files.size&&saved.files.every(f=>fs.existsSync(path.join(dir,f.name))&&hash(fs.readFileSync(path.join(dir,f.name)))===f.sha256))return output;
  }
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const minX=Math.min(...sections.map(s=>s.gridX)),minY=Math.min(...sections.map(s=>s.gridY));
  const offset=s=>({x:(s.gridX-minX)*W,y:(s.gridY-minY)*H});
  const width=(Math.max(...sections.map(s=>s.gridX))-minX+1)*W,height=(Math.max(...sections.map(s=>s.gridY))-minY+1)*H;
  const roads=JSON.parse(fs.readFileSync(path.join(ROOT,INPUTS[2]))).maps,worldRoads=[],grounds=new Map();
  for(const fx of[0,1])for(const fy of[0,1]){let paint=sharp(path.join(ROOT,INPUTS[0])).resize(W,H,{fit:"fill"});if(fx)paint=paint.flop();if(fy)paint=paint.flip();grounds.set(`${fx}:${fy}`,await paint.png().toBuffer());}
  for(const s of sections){const p=offset(s),template=roads.find(r=>r.id===s.templateId);if(!template)throw Error("Missing current road template");worldRoads.push(...template.roads.map(line=>line.map(([x,y,w])=>[x+p.x,y+p.y,w])));}
  const material=await sharp(path.join(ROOT,INPUTS[1])).resize(384,384).png().toBuffer(),written=[];
  for(const s of sections){
    const p=offset(s),left=p.x-2,top=p.y-2,pw=W+4,ph=H+4,layers=[];
    for(const neighbor of sections){const n=offset(neighbor),x=Math.max(left,n.x),y=Math.max(top,n.y),right=Math.min(left+pw,n.x+W),bottom=Math.min(top+ph,n.y+H);if(right<=x||bottom<=y)continue;
      layers.push({input:await sharp(grounds.get(`${(neighbor.gridX-minX)%2}:${(neighbor.gridY-minY)%2}`)).extract({left:x-n.x,top:y-n.y,width:right-x,height:bottom-y}).png().toBuffer(),left:x-left,top:y-top});}
    const lines=[];
    for(const line of worldRoads){let start=-1;const near=([x,y,w])=>x>=left-w-8&&x<=left+pw+w+8&&y>=top-w-8&&y<=top+ph+w+8;
      for(let i=0;i<=line.length;i++)if(i<line.length&&near(line[i])){if(start<0)start=Math.max(0,i-2);}else if(start>=0){lines.push(line.slice(start,Math.min(line.length,i+2)));start=-1;}}
    const svg=roadsSvg(lines,material,0).toString().replaceAll('width="1448" height="1086"',`width="${width}" height="${height}"`)
      .replace(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1448 1086">`,`<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}" viewBox="${left} ${top} ${pw} ${ph}">`);
    if(!svg.includes(`viewBox="${left} ${top} ${pw} ${ph}"`))throw Error("Road rendering contract changed");
    const paint=await sharp({create:{width:pw,height:ph,channels:3,background:"#a4a15d"}}).composite([...layers,{input:Buffer.from(svg)}]).png().toBuffer();
    for(const [field,scale]of[["terrain",1],["thumbnail",2]]){const bytes=await sharp(paint).resize(pw/scale,ph/scale).webp({quality:82,effort:4}).toBuffer(),file=files.get(s[field]),temporary=file+".tmp-"+process.pid;
      fs.writeFileSync(temporary,bytes);fs.renameSync(temporary,file);written.push({name:path.basename(file),sha256:hash(bytes),bytes:bytes.length});}
  }
  const temporary=receipt+".tmp-"+process.pid;fs.writeFileSync(temporary,JSON.stringify({signature,sections:sections.length,files:written}));fs.renameSync(temporary,receipt);
  return output;
}
module.exports={prepareTerrain};
