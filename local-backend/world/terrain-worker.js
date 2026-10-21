"use strict";
// Expensive image composition runs away from command and authentication work.
const { parentPort, workerData } = require("node:worker_threads");
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), sharp = require("sharp");
const { roadsSvg } = require("./roads");
const W = 1448, H = 1086, source = path.join(__dirname, "source");
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 24);
async function build({ manifest, directory }) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const roads = JSON.parse(fs.readFileSync(path.join(source, "roads.json"))).maps;
  const inputs = ["ground.png", "dirt.png", "roads.json"].map(f => hash(fs.readFileSync(path.join(source, f))));
  const version = hash(JSON.stringify([inputs, hash(fs.readFileSync(__filename)), hash(fs.readFileSync(path.join(__dirname,"roads.js")))]));
  const ground = new Map(), material = await sharp(path.join(source, "dirt.png")).resize(384,384).png().toBuffer();
  for (const x of [0,1]) for (const y of [0,1]) {
    let image = sharp(path.join(source,"ground.png")).resize(W,H,{fit:"fill"});
    if(x)image=image.flop();if(y)image=image.flip();ground.set(`${x}:${y}`,await image.png().toBuffer());
  }
  const parity = n => ((n % 2) + 2) % 2;
  // Fixed atlas origin: adding a west/north section cannot repaint older tiles.
  const offset = s => ({x:(s.gridX+1024)*W,y:(s.gridY+1024)*H});
  const sections = manifest.sections.map(s=>({...s})), files=[];
  const valid = name => { try { return fs.readFileSync(path.join(directory,name)+".sha256","utf8")===hash(fs.readFileSync(path.join(directory,name))); } catch { return false; } };
  const put = (name,bytes) => { const file=path.join(directory,name),tmp=file+".next";fs.writeFileSync(tmp,bytes);fs.renameSync(tmp,file);fs.writeFileSync(file+".sha256",hash(bytes));files.push(name); };
  for (const s of sections) {
    const neighbors=sections.filter(n=>Math.abs(n.gridX-s.gridX)<=1&&Math.abs(n.gridY-s.gridY)<=1);
    const id=hash(JSON.stringify([version,s.id,s.templateId,s.gridX,s.gridY,neighbors.map(n=>[n.id,n.templateId])])), full=id+".webp",thumb=id+"-thumb.webp";
    s.terrain="api/local-game/world-assets/"+full;s.thumbnail="api/local-game/world-assets/"+thumb;
    if(valid(full)&&valid(thumb)){files.push(full,thumb);continue;}
    const p=offset(s),left=p.x-2,top=p.y-2,pw=W+4,ph=H+4,layers=[],lines=[];
    for(const neighbor of neighbors){
      const n=offset(neighbor),x=Math.max(left,n.x),y=Math.max(top,n.y),right=Math.min(left+pw,n.x+W),bottom=Math.min(top+ph,n.y+H);
      if(right>x&&bottom>y) layers.push({input:await sharp(ground.get(`${parity(neighbor.gridX)}:${parity(neighbor.gridY)}`)).extract({left:x-n.x,top:y-n.y,width:right-x,height:bottom-y}).png().toBuffer(),left:x-left,top:y-top});
      const template=roads.find(r=>r.id===neighbor.templateId);if(!template)throw Error("Missing road template");
      for(const line of template.roads){
        const points=line.map(([x,y,w])=>[x+n.x,y+n.y,w]);let start=-1;
        const near=([x,y,w])=>x>=left-w-8&&x<=left+pw+w+8&&y>=top-w-8&&y<=top+ph+w+8;
        for(let i=0;i<=points.length;i++)if(i<points.length&&near(points[i])){if(start<0)start=Math.max(0,i-2);}else if(start>=0){lines.push(points.slice(start,Math.min(points.length,i+2)));start=-1;}
      }
    }
    const svg=roadsSvg(lines,material,0).toString()
      .replaceAll('width="1448" height="1086"',`width="${left+pw}" height="${top+ph}"`)
      .replace(/<svg[^>]+>/,`<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}" viewBox="${left} ${top} ${pw} ${ph}">`);
    const paint=await sharp({create:{width:pw,height:ph,channels:3,background:"#a4a15d"}}).composite([...layers,{input:Buffer.from(svg)}]).png().toBuffer();
    put(full,await sharp(paint).webp({quality:82,effort:4}).toBuffer());
    put(thumb,await sharp(paint).resize(pw/2,ph/2).webp({quality:82,effort:4}).toBuffer());
  }
  const updated={...manifest,sections};
  const overviewId=hash(JSON.stringify(sections.map(s=>[s.id,s.thumbnail]))),overview=overviewId+"-overview.webp";
  if(!valid(overview)){
    const scale=Math.min(.085,4096/Math.max(manifest.width,manifest.height)),layers=[];
    for(const s of sections)layers.push({input:await sharp(path.join(directory,path.basename(s.thumbnail))).extract({left:1,top:1,width:724,height:543}).resize(Math.ceil(s.width*scale),Math.ceil(s.height*scale)).webp().toBuffer(),left:Math.floor(s.x*scale),top:Math.floor(s.y*scale)});
    put(overview,await sharp({create:{width:Math.ceil(manifest.width*scale)+1,height:Math.ceil(manifest.height*scale)+1,channels:3,background:"#676d37"}}).composite(layers).webp({quality:78}).toBuffer());
  }else files.push(overview);
  updated.overviewAsset="api/local-game/world-assets/"+overview;
  return {manifest:updated,files};
}
if(parentPort)build(workerData).then(result=>parentPort.postMessage(result)).catch(()=>{throw Error("World terrain preparation failed");});
module.exports={build};
