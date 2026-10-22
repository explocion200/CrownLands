"use strict";
// Current-realm metadata. Generated sections follow the server template
// allocation while saved city coordinates remain unchanged.
const path = require("node:path");
const topology = require("../../functions/coreExpansionTopology");

const ROOT = path.resolve(__dirname, "../..");
const catalog = require("./source/catalog.json");
const worldLayout=require("../../functions/core-expansion-world-layout.json");
const {getMapBounds,getWorldSize,imagePointToWorld}=require("../../functions/authoritative-route-planner");
const placements = require("./placements.json");
const layoutRevision = require("node:crypto").createHash("sha256").update(JSON.stringify(placements)).digest("hex");
const fixture = JSON.parse(JSON.stringify(require("./templates.json")));
if (placements.topology !== "core-expansion-v1" || placements.version !== 1) throw Error("Unsupported display layout");
for (const section of fixture.sections) {
  const placement = placements.sections.find(s=>s.id===section.id);
  if (!placement) throw Error("Missing section placement");
  section.pickupZones = placement.pickupZones;
  for (const item of fixture.objects.filter(o=>o.sectionId===section.id)) {
    const p=placement.positions[item.id]; if (!p) continue;
    const dx=p.x+section.x-item.x,dy=p.y+section.y-item.y;
    item.x+=dx;item.y+=dy;item.left+=dx;item.top+=dy;item.previewLocal={...p};
  }
}
const approvedAssets = new Set(fixture.assets);
const templates = catalog.regions.filter(r => topology.parseNewLandsRegionId(r.id))
  .sort((a,b) => topology.parseNewLandsRegionId(a.id).activationOrdinal - topology.parseNewLandsRegionId(b.id).activationOrdinal);
function buildCatalog(realm, expansion) {
  if (expansion?.topologyVersion !== "core-expansion-v1" || expansion.worldId !== realm.worldId || expansion.resetGeneration !== realm.resetGeneration
      || expansion.realmShardId !== realm.sharedRealmId || !Array.isArray(expansion.activeRegionIds)) throw Error("Current expansion contract required");
  const ids = [...new Set([...catalog.regions.filter(r => r.permanentCore).map(r => r.id), ...expansion.activeRegionIds])];
  if (!ids.length || ids.length > 512) throw Error("World supports at most 512 active sections");
  const sections = ids.map(id => {
    const prepared = fixture.sections.find(s => s.id === id);
    if (prepared) return {...prepared, templateId:id};
    const allocation = topology.parseNewLandsRegionId(id);
    if (!allocation) throw Error("Unknown active region");
    const template = templates[allocation.activationOrdinal % templates.length];
    const base = fixture.sections.find(s => s.id === template.id);
    return {...base, id, name:topology.getNewLandsRegionName(allocation.activationOrdinal), gridX:allocation.gridX, gridY:allocation.gridY, templateId:template.id};
  });
  const minX = Math.min(...sections.map(s=>s.gridX)), minY = Math.min(...sections.map(s=>s.gridY));
  for(const s of sections) {
    s.x=(s.gridX-minX)*s.width; s.y=(s.gridY-minY)*s.height;
    // Generated server maps retain their template's compatibility coordinate
    // bounds, even though their continuous-preview grid position is different.
    s.gameBounds=getMapBounds(worldLayout.maps.find(m=>m.id===s.templateId),getWorldSize(worldLayout));
  }
  const scenery = new Map(sections.map(s => {
    const base=fixture.sections.find(t=>t.id===s.templateId);
    return [s.id,fixture.objects.filter(o=>o.sectionId===base.id && o.kind==="scenery").map(o=>{
      const item={...o,key:s.id+":"+o.id,sectionId:s.id,sectionName:s.name,
        x:o.x-base.x+s.x,y:o.y-base.y+s.y,left:o.left-base.x+s.x,top:o.top-base.y+s.y,owner:""};
      delete item.troops;return item;
    })];
  }));
  return {manifest:{topology:"core-expansion-v1",label:"Crownlands",liveReadOnly:true,authenticated:true,fullCatalog:true,
    realmId:realm.worldId+"--"+realm.sharedRealmId, resetGeneration:realm.resetGeneration, homeSectionId:fixture.homeSectionId,sections,
    width:(Math.max(...sections.map(s=>s.gridX))-minX+1)*1448,height:(Math.max(...sections.map(s=>s.gridY))-minY+1)*1086,
    overviewAsset:null},scenery};
}
function safeAsset(candidate, fallback) {
  if (typeof candidate!=="string" || !/^assets\/[a-zA-Z0-9_./-]+\.(webp|png|svg)$/.test(candidate) || candidate.includes("..")) return fallback;
  return approvedAssets.has(candidate) ? candidate : fallback;
}
function gameToImage(section,p){
  if(!Number.isFinite(p?.x)||!Number.isFinite(p?.y))return null;
  const b=section.gameBounds,x=(p.x-b.left)/b.width*section.width,y=(p.y-b.top)/b.height*section.height;
  if(x < -1 || x > section.width+1 || y < -1 || y > section.height+1)return null;
  return{x:Math.min(section.width,Math.max(0,x)),y:Math.min(section.height,Math.max(0,y))};
}
function imageToGame(section,p){return imagePointToWorld({bounds:section.gameBounds,dimensions:{width:section.width,height:section.height}},p);}
module.exports={buildCatalog,safeAsset,catalog,fixture,ROOT,gameToImage,imageToGame,layoutRevision};
