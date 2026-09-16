"use strict";
// Local presentation preview. Reads packaged public catalog artwork only.
const $=id=>document.getElementById(id),esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const catalog=CROWNLANDS_REGION_CATALOG,activeIds=new Set(ATLAS_SNAPSHOT.activeRegionIds),regions=catalog.regions.filter(r=>activeIds.has(r.id)),byId=new Map(regions.map(r=>[r.id,r]));
const tileW=238,tileH=179,gap=34,padding=260,stepX=tileW+gap,stepY=tileH+gap;
const minX=Math.min(...regions.map(r=>r.gridX)),maxX=Math.max(...regions.map(r=>r.gridX)),minY=Math.min(...regions.map(r=>r.gridY)),maxY=Math.max(...regions.map(r=>r.gridY));
const bounds={left:padding,top:padding,right:padding+(maxX-minX)*stepX+tileW,bottom:padding+(maxY-minY)*stepY+tileH};
const position=r=>({x:padding+(r.gridX-minX)*stepX+tileW/2,y:padding+(r.gridY-minY)*stepY+tileH/2});
let sample="standard",currentId="core-v2-greybanner-hold-p0-m1",homeId="core-v2-north-support-p0-m2",camera={x:0,y:0,z:.8},viewMode="local",noticeTimer,gesture=null,dragged=false,pointers=new Map(),opened=0;
const viewport=$("mapViewport"),stage=$("mapStage");
function send(message){parent.postMessage({type:"atlas-status",message},location.origin);}
function ownCount(r){if(sample==="unknown")return null;if(r.id===homeId)return 7;if(r.id===(sample==="frontier"?"new-lands-l02-p006":"core-v2-greybanner-hold-p0-m1"))return 4;return r.permanentCore?(r.gridX===-1&&r.gridY===0?2:0):r.id==="new-lands-l01-p001"?3:0;}
function feature(r){return [r.objectivePurpose==="holding_tower"?"Tower":"",r.campCount>0?"Camp":"",r.objectivePurpose==="crown_citadel"?"Citadel":r.objectivePurpose==="stronghold"?"Stronghold":""].filter(Boolean).join(" · ");}
function thumb(r){const art=r.artPresentation||catalog.regions.find(t=>t.id===r.templateRegionId)?.artPresentation;return `<svg viewBox="0 0 1448 1086" aria-hidden="true" focusable="false"><image href="${esc(r.thumbnailAsset||r.mapAsset)}" width="1448" height="1086"/>${(art?.landmarks||[]).map(a=>`<image href="${esc(a.asset)}" x="${a.x}" y="${a.y}" width="${a.width}" height="${a.height}"/>`).join("")}</svg>`;}
function describe(r){const count=ownCount(r);return `${r.name} · Your cities: ${count===null?"Syncing":count}${feature(r)?` · ${feature(r)==="Tower"?"Clan Tower":feature(r)}`:""}${r.id===currentId?" · Current map":""}${r.id===homeId?" · Home map":""}`;}
function tile(r){const p=position(r),kind=feature(r),current=r.id===currentId,home=r.id===homeId,count=ownCount(r),royal=catalog.mapPresentation.redTrimRegionIds.includes(r.id);return `<button class="map-tile ${royal?"royal":""} ${r.objectivePurpose==="holding_tower"?"tower":""} ${r.campCount>0?"camp":""} ${current?"current":""} ${home?"home":""}" data-region="${r.id}" data-grid-x="${r.gridX}" data-grid-y="${r.gridY}" style="left:${p.x-tileW/2}px;top:${p.y-tileH/2}px" tabindex="${current?0:-1}" aria-label="Open ${esc(describe(r))}"><span class="map-thumb">${thumb(r)}</span><span class="map-name">${esc(r.name)}</span><span class="map-meta"><span class="map-owned">Your cities: <strong>${count===null?"Syncing":count}</strong></span><span class="feature-label">${kind}</span></span>${current||home?`<span class="map-flags">${current?'<span class="map-flag"><span class="full-label">Current map</span><span class="short-label">Here</span></span>':""}${home?'<span class="map-flag home-flag"><span class="full-label">Home map</span><span class="short-label">Home</span></span>':""}</span>`:""}${current?'<span class="map-state-marker" aria-hidden="true"></span>':""}</button>`;}
function render(){
 $("tiles").innerHTML=regions.map(tile).join("");
 const edges=new Map();for(const r of regions)for(const c of Object.values(r.connections||{})){if(c.state==="open"&&activeIds.has(c.targetRegionId)){const key=[r.id,c.targetRegionId].sort().join("::");edges.set(key,[r,byId.get(c.targetRegionId)]);}}
 $("connections").innerHTML=[...edges.values()].map(([a,b])=>{const p=position(a),q=position(b);return `<line data-from="${a.id}" data-to="${b.id}" x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}"/>`;}).join("");
 $("connections").setAttribute("width",bounds.right+padding);$("connections").setAttribute("height",bounds.bottom+padding);
 stage.style.width=`${bounds.right+padding}px`;stage.style.height=`${bounds.bottom+padding}px`;
 $("currentName").textContent=byId.get(currentId).name;$("homeName").textContent=byId.get(homeId).name;$("mapCount").textContent=`${regions.length} active maps`;
 $("mapInfo").textContent=describe(byId.get(currentId));viewport.dataset.opened=String(opened);applyCamera();
}
function minimumZoom(){return Math.max(.06,Math.min(1,(viewport.clientWidth-30)/(bounds.right-bounds.left),(viewport.clientHeight-30)/(bounds.bottom-bounds.top)));}
function constrain(){
 camera.z=Math.min(1,Math.max(minimumZoom(),camera.z));
 for(const [axis,low,high,size] of [["x",bounds.left,bounds.right,viewport.clientWidth],["y",bounds.top,bounds.bottom,viewport.clientHeight]]){
  const min=size-15-high*camera.z,max=15-low*camera.z;
  camera[axis]=min>max?(size-(low+high)*camera.z)/2:Math.max(min,Math.min(max,camera[axis]));
 }
}
function applyCamera(){constrain();stage.style.transform=`translate(${camera.x}px,${camera.y}px) scale(${camera.z})`;stage.style.setProperty("--zoom",camera.z);viewport.dataset.zoom=camera.z.toFixed(3);viewport.dataset.cameraX=camera.x.toFixed(1);viewport.dataset.cameraY=camera.y.toFixed(1);viewport.classList.toggle("overview",camera.z<.48);$("zoomValue").textContent=`${Math.round(camera.z*100)}%`;$("zoomIn").disabled=camera.z>=.999;$("zoomOut").disabled=camera.z<=minimumZoom()+.001;}
function centerRegion(id,{opening=false}={}){const p=position(byId.get(id));if(opening)camera.z=viewport.clientHeight<220?.68:viewport.clientHeight<350?.78:Math.min(.88,(viewport.clientHeight-12)/(tileH+stepY*2));camera.x=viewport.clientWidth/2-p.x*camera.z;camera.y=viewport.clientHeight/2-p.y*camera.z;viewMode="local";applyCamera();}
function fit(){camera.z=minimumZoom();camera.x=(viewport.clientWidth-(bounds.left+bounds.right)*camera.z)/2;camera.y=(viewport.clientHeight-(bounds.top+bounds.bottom)*camera.z)/2;viewMode="whole";applyCamera();send("Whole realm shown. Zoom in to read each map’s details.");}
function zoom(next,anchor={x:viewport.clientWidth/2,y:viewport.clientHeight/2}){const z=Math.max(minimumZoom(),Math.min(1,next)),wx=(anchor.x-camera.x)/camera.z,wy=(anchor.y-camera.y)/camera.z;camera.x=anchor.x-wx*z;camera.y=anchor.y-wy*z;camera.z=z;viewMode="local";applyCamera();}
function notify(message){clearTimeout(noticeTimer);$("notice").textContent=message;$("notice").hidden=false;noticeTimer=setTimeout(()=>$("notice").hidden=true,4000);send(message);}
function openRegion(id){
 const r=byId.get(id);if(!r)return;
 if(sample==="error"){notify(`Could not open ${r.name}. Your current map is unchanged. Try again after reconnecting.`);return;}
 currentId=id;opened++;render();$("visitName").textContent=r.name;$("visitArt").innerHTML=thumb(r);$("visitInfo").textContent=describe(r);$("atlasDialog").close();$("reopen").hidden=true;$("mapVisit").hidden=false;$("returnToAtlas").focus();send(`Draft only: opened ${r.name}. No game map was changed.`);
}
function showAtlas(){ $("mapVisit").hidden=true;$("reopen").hidden=false;if(!$("atlasDialog").open)$("atlasDialog").showModal();centerRegion(currentId,{opening:true});$("current").focus();}
$("current").addEventListener("click",()=>{centerRegion(currentId,{opening:true});send(`Centered on current map: ${byId.get(currentId).name}.`);});$("home").addEventListener("click",()=>{centerRegion(homeId,{opening:true});send(`Centered on home map: ${byId.get(homeId).name}.`);});$("fit").addEventListener("click",fit);$("zoomIn").addEventListener("click",()=>zoom(camera.z*1.24));$("zoomOut").addEventListener("click",()=>zoom(camera.z/1.24));$("close").addEventListener("click",()=>$("atlasDialog").close());$("reopen").addEventListener("click",showAtlas);$("returnToAtlas").addEventListener("click",showAtlas);
$("atlasDialog").addEventListener("close",()=>{$("notice").hidden=true;$("reopen").focus();});
viewport.addEventListener("wheel",event=>{event.preventDefault();const r=viewport.getBoundingClientRect();zoom(camera.z*Math.exp(-event.deltaY*.0015),{x:event.clientX-r.left,y:event.clientY-r.top});},{passive:false});
const localPoint=event=>{const r=viewport.getBoundingClientRect();return{x:event.clientX-r.left,y:event.clientY-r.top};};
function beginGesture(){const points=[...pointers.values()];if(points.length>=2){const[a,b]=points,middle={x:(a.x+b.x)/2,y:(a.y+b.y)/2};gesture={kind:"pinch",distance:Math.hypot(a.x-b.x,a.y-b.y),z:camera.z,world:{x:(middle.x-camera.x)/camera.z,y:(middle.y-camera.y)/camera.z}};dragged=true;}else if(points.length===1)gesture={kind:"pan",point:points[0],x:camera.x,y:camera.y};else gesture=null;}
viewport.addEventListener("pointerdown",event=>{if(event.button!==0&&event.pointerType!=="touch")return;if(!pointers.size)dragged=false;pointers.set(event.pointerId,localPoint(event));viewport.setPointerCapture(event.pointerId);beginGesture();});
viewport.addEventListener("pointermove",event=>{
 if(!pointers.has(event.pointerId))return;pointers.set(event.pointerId,localPoint(event));if(!gesture)return;
 if(gesture.kind==="pinch"&&pointers.size>=2){const[a,b]=[...pointers.values()],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};camera.z=Math.max(minimumZoom(),Math.min(1,gesture.z*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,gesture.distance)));camera.x=mid.x-gesture.world.x*camera.z;camera.y=mid.y-gesture.world.y*camera.z;}
 else{const p=pointers.get(event.pointerId),dx=p.x-gesture.point.x,dy=p.y-gesture.point.y;if(Math.hypot(dx,dy)>7)dragged=true;if(!dragged)return;camera.x=gesture.x+dx;camera.y=gesture.y+dy;}
 viewport.classList.add("dragging");viewMode="local";applyCamera();
});
function endPointer(event){pointers.delete(event.pointerId);if(viewport.hasPointerCapture(event.pointerId))viewport.releasePointerCapture(event.pointerId);beginGesture();if(!pointers.size)viewport.classList.remove("dragging");}
viewport.addEventListener("pointerup",endPointer);viewport.addEventListener("pointercancel",event=>{dragged=true;endPointer(event);});
viewport.addEventListener("click",event=>{if(dragged){dragged=false;if(event.detail)return;}const r=viewport.getBoundingClientRect(),worldX=(event.clientX-r.left-camera.x)/camera.z,worldY=(event.clientY-r.top-camera.y)/camera.z;const direct=event.target.closest("[data-region]");const region=direct?byId.get(direct.dataset.region):event.detail?regions.find(map=>{const p=position(map);return Math.abs(worldX-p.x)<=tileW/2&&Math.abs(worldY-p.y)<=tileH/2;}):null;if(region)openRegion(region.id);});
viewport.addEventListener("pointerover",event=>{const el=event.target.closest("[data-region]");if(el)$("mapInfo").textContent=describe(byId.get(el.dataset.region));});
viewport.addEventListener("focusin",event=>{const el=event.target.closest("[data-region]");if(!el)return;$("mapInfo").textContent=describe(byId.get(el.dataset.region));const r=el.getBoundingClientRect(),v=viewport.getBoundingClientRect();if(r.left<v.left||r.right>v.right||r.top<v.top||r.bottom>v.bottom)centerRegion(el.dataset.region);});
viewport.addEventListener("keydown",event=>{const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},delta=directions[event.key];if(!delta)return;event.preventDefault();const focused=event.target.closest("[data-region]"),r=byId.get(focused?.dataset.region||currentId),next=regions.find(n=>n.gridX===r.gridX+delta[0]&&n.gridY===r.gridY+delta[1]);if(next){const button=$("tiles").querySelector(`[data-region="${next.id}"]`);document.querySelectorAll("[data-region]").forEach(b=>b.tabIndex=-1);button.tabIndex=0;centerRegion(next.id);button.focus({preventScroll:true});}});
function reset(nextSample){sample=nextSample;currentId=sample==="frontier"?"new-lands-l02-p006":sample==="same"?"core-v2-north-support-p0-m2":"core-v2-greybanner-hold-p0-m1";homeId=sample==="frontier"?"new-lands-l01-p002":"core-v2-north-support-p0-m2";opened=0;dragged=false;pointers.clear();gesture=null;render();showAtlas();send("Atlas draft ready. Map layout is current; holdings are fictional review data.");}
window.addEventListener("message",event=>{if(event.origin===location.origin&&event.source===parent&&event.data?.type==="atlas-review")reset(["standard","frontier","same","unknown","error"].includes(event.data.sample)?event.data.sample:"standard");});
new ResizeObserver(()=>{if($("atlasDialog").open){if(viewMode==="whole")fit();else centerRegion(currentId,{opening:true});}}).observe(viewport);
render();showAtlas();
