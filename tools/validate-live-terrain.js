"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),sharp=require("sharp");
const {buildCatalog}=require("./map-benchmark/seamless/live-catalog"),{prepareTerrain}=require("./map-benchmark/seamless/live-terrain"),topology=require("../functions/coreExpansionTopology");
async function main(){
  const realm={worldId:"main-terrain-test",resetGeneration:"realm-terrain-test",sharedRealmId:"shard_0001"};
  const base=buildCatalog(realm,{...realm,realmShardId:realm.sharedRealmId,topologyVersion:"core-expansion-v1",activeRegionIds:Array.from({length:87},(_,i)=>topology.getRegionAtActivationOrdinal(i).id)}).manifest;
  const [a,b]=await Promise.all([prepareTerrain(base),prepareTerrain({...base,realmId:"different-test-realm"})]);
  assert.equal(a.manifest.realmId,base.realmId);assert.equal(b.manifest.realmId,"different-test-realm","Artwork cache replaced realm identity");assert.equal(a.signature,b.signature);
  assert.equal(a.manifest.sections.length,112);const roads=require("./map-art/clearance.json").maps,results=[];let corners=0;
  for(const [field,scale]of[["terrain",1],["thumbnail",2]]){
    const rows=new Map();for(const s of a.manifest.sections){const image=await sharp(a.files.get(s[field])).removeAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(image.info.width,1452/scale);assert.equal(image.info.height,1090/scale);rows.set(s.id,image);}
    const W=1448/scale,H=1086/scale,g=2/scale,edges=[];
    const color=(im,x,y,c)=>im.data[(y*im.info.width+x)*3+c];
    for(const s of a.manifest.sections){
      for(const [dx,dy]of[[1,0],[0,1]]){
        const n=a.manifest.sections.find(t=>t.gridX===s.gridX+dx&&t.gridY===s.gridY+dy);if(!n)continue;
        const x=rows.get(s.id),y=rows.get(n.id);let sum=0;for(let i=0;i<(dx?H:W);i++)for(let c=0;c<3;c++)sum+=Math.abs(color(x,dx?W+g-1:i+g,dx?i+g:H+g-1,c)-color(y,dx?g:i+g,dx?i+g:g,c));
        const mean=sum/((dx?H:W)*3);edges.push({a:s.id,b:n.id,mean});assert.ok(mean<=4,`Visible ${field} seam ${s.id}/${n.id}: ${mean}`);
        for(const [section,p]of[[s,dx?[1448,543]:[724,1086]],[n,dx?[0,543]:[724,0]]])assert.ok(roads.find(r=>r.id===section.templateId).roads.some(line=>[line[0],line.at(-1)].some(v=>v[0]===p[0]&&v[1]===p[1])),"Missing connected road approach");
      }
      const square=[[0,0],[1,0],[0,1],[1,1]].map(([dx,dy])=>a.manifest.sections.find(t=>t.gridX===s.gridX+dx&&t.gridY===s.gridY+dy));
      if(square.every(Boolean)){
        const points=[[W+g-1,H+g-1],[g,H+g-1],[W+g-1,g],[g,g]];let max=0;
        for(let c=0;c<3;c++){const values=square.map((q,i)=>color(rows.get(q.id),...points[i],c));max=Math.max(max,Math.max(...values)-Math.min(...values));}
        assert.ok(max<=16,`Four-section corner mismatch ${s.id}: ${max}`);if(scale===1)corners++;
      }
    }
    assert.equal(edges.length,202);results.push({field,joins:edges.length,worstMean:Math.max(...edges.map(e=>e.mean)),above4:edges.filter(e=>e.mean>4).length});
  }
  const output=path.resolve("release-artifacts/continuous-live-reader");fs.mkdirSync(output,{recursive:true});const report={at:new Date().toISOString(),sections:112,corners,signature:a.signature,results,productionArtworkChanged:false};fs.writeFileSync(path.join(output,"seams.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
