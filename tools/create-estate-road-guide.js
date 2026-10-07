/* Development-only paint guide; geometry never overlays the game. */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const estate = require('../inner-city-estate');
const {starts} = require('../docs/art-sources/inner-city-estate/road-approaches-v3.json');
const root=path.resolve(__dirname,'..');
const sources=path.join(root,'docs/art-sources/inner-city-estate');
const output=path.join(root,'release-artifacts/inner-city-estate');
async function main(){
  for(const key of ['base',...estate.terrainTiles.map(t=>t.key)]){
    const tile=estate.terrainTiles.find(t=>t.key===key)||{x:0,y:0,width:estate.width,height:estate.height};
    const filename=key==='base'?'terrain-aligned-v3.png':'terrain-detail-'+key+'-v3.png';
    const input=fs.readFileSync(path.join(sources,filename)),metadata=await sharp(input).metadata();
    const sx=metadata.width/tile.width,sy=metadata.height/tile.height;
    const point=([x,y])=>[(x-tile.x)*sx,(y-tile.y)*sy].join(',');
    const paths=Object.entries(starts).map(([site,start])=>{
      const building=estate.buildings.find(b=>b.key===site),end=[building.entrance[0]*estate.width/100,building.entrance[1]*estate.height/100];
      return `<path d="M${point(start)} L${point(end)}"/>`;
    }).join('');
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${metadata.width}" height="${metadata.height}"><image href="data:image/png;base64,${input.toString('base64')}" width="100%" height="100%"/><g fill="none" stroke="#31bed7" stroke-width="${4*sx}" stroke-linecap="round">${paths}</g></svg>`;
    await sharp(Buffer.from(svg)).png().toFile(path.join(output,'road-guide-'+key+'.png'));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
