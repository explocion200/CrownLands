/* Encode reviewed imagegen art. No repainting or per-building scale changes. */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const crypto = require('node:crypto');
const estate = require('../inner-city-estate');
const root = path.resolve(__dirname, '..');
const sources = path.join(root, 'docs/art-sources/inner-city-estate');
const output = path.join(root, 'assets/inner-city-estate');
// The generator spaced the atlas organically. These reviewed bounds preserve
// whole sprites rather than cutting towers and sails at assumed grid lines.
const bounds = [
  [15,45,295,238], [320,0,343,310], [673,67,336,236], [1010,84,297,221], [1312,60,307,231],
  [0,310,414,218], [421,299,269,226], [690,325,345,213], [1045,311,321,226], [1380,334,239,200],
  [10,540,400,224], [415,533,269,221], [696,548,285,215], [980,556,425,223], [1408,519,211,257],
  [10,765,427,206], [438,765,251,206], [690,787,301,184], [996,783,343,188], [1338,777,281,194],
];
async function main() {
  await sharp(path.join(sources, 'terrain-cohesive-v2.png')).resize(1448,1086,{fit:'fill'}).webp({quality:85}).toFile(path.join(output,'terrain.webp'));
  const sizes = {};
  for (let i=0;i<estate.buildings.length;i++) {
    const [left,top,width,height]=bounds[i], key=estate.buildings[i].key;
    const crop=await sharp(path.join(sources,'buildings-cohesive-v2.png')).extract({left,top,width,height}).png().toBuffer();
    const trimmed=await sharp(crop).trim({threshold:4}).png().toBuffer();
    const metadata=await sharp(trimmed).metadata();
    // Every raw atlas pixel represents the same .30 logical-map pixels.
    // Delivery uses 2x density; do not fit individual buildings into a square.
    const w=Math.round(metadata.width*.60), h=Math.round(metadata.height*.60);
    await sharp(trimmed).resize(w,h,{fit:'fill'}).webp({quality:90,alphaQuality:100}).toFile(path.join(output,key+'.webp'));
    sizes[key]=[w/2,h/2];
  }
  // Add painted wall connectors without changing the original gate's height.
  const gate=await sharp(path.join(sources,'gatehouse-connectors-v2.png')).trim({threshold:4}).png().toBuffer();
  await sharp(gate).resize({height:118}).webp({quality:90,alphaQuality:100}).toFile(path.join(output,'gatehouse.webp'));
  const gm=await sharp(path.join(output,'gatehouse.webp')).metadata();
  sizes.gatehouse=[gm.width/2,gm.height/2];
  fs.writeFileSync(path.join(sources,'sprite-sizes.json'), JSON.stringify({mapPixelScale:.30,bounds,sizes},null,2)+'\n');
  const plots = path.join(sources,'plots-cohesive-v2.png');
  const pm = await sharp(plots).metadata();
  for (const [i,key] of ['surveyed-plot','construction'].entries()) {
    const left=Math.round(i*pm.width/2), right=Math.round((i+1)*pm.width/2);
    const crop=await sharp(plots).extract({left,top:0,width:right-left,height:pm.height}).png().toBuffer();
    const trimmed=await sharp(crop).trim({threshold:4}).png().toBuffer();
    await sharp(trimmed).resize(288,172,{fit:'fill'}).webp({quality:90,alphaQuality:100}).toFile(path.join(output,key+'.webp'));
  }
  async function record(directory, prefix, filter) {
    const entries=[];
    for(const file of fs.readdirSync(directory).filter(filter).sort()) {
      const bytes=fs.readFileSync(path.join(directory,file)),textFile=/\.(?:svg|json)$/.test(file);
      const hashInput=textFile?bytes.toString('utf8').replace(/\r\n/g,'\n'):bytes;
      const entry={path:prefix+file,sha256:crypto.createHash('sha256').update(hashInput).digest('hex')};
      if(textFile)entry.hashEncoding='utf8-lf';
      if(/\.(?:png|webp|svg)$/.test(file)){const m=await sharp(bytes).metadata();Object.assign(entry,{width:m.width,height:m.height,hasAlpha:m.hasAlpha});}
      entries.push(entry);
    }
    return entries;
  }
  const provenance={generator:'built-in image_gen.imagegen',generatedAt:new Date().toISOString(),reference:'docs/art-sources/inner-city-estate/reference-style.png',runtime:await record(output,'assets/inner-city-estate/',f=>f.endsWith('.webp')),sources:await record(sources,'docs/art-sources/inner-city-estate/',f=>/\.(png|svg|json)$/.test(f)&&f!=='art-record.json')};
  fs.writeFileSync(path.join(sources,'art-record.json'),JSON.stringify(provenance,null,2)+'\n');
  console.log(JSON.stringify(sizes));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
