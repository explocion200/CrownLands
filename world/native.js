/* Production continuous camera connected to the existing game controls. */
"use strict";
// Only regular castles use the approved readable menu. Cache silhouettes and
// layouts; camera frames only move its anchor, never reread pixels or rebuild it.
function createContinuousCastleActions(invalidate) {
  const masks=new Map(), layouts=new Map(), applied=new WeakMap();
  const angles=Array.from({length:181},(_,i)=>{
    const a=(-45+i*1.5)*Math.PI/180;return [Math.cos(a),118/142*Math.sin(a)];
  });
  let disposed=false;
  const remember=(cache,key,value)=>{
    if(cache.size>=64)cache.delete(cache.keys().next().value);
    cache.set(key,value);return value;
  };
  function silhouette(asset) {
    if(masks.has(asset))return masks.get(asset);
    const entry=remember(masks,asset,{state:"pending",edges:null}),image=new Image();
    entry.image=image;
    image.onload=()=>{
      if(disposed || masks.get(asset)!==entry)return;
      try {
        const canvas=document.createElement("canvas");canvas.width=canvas.height=256;
        const context=canvas.getContext("2d",{willReadFrequently:true});
        context.drawImage(image,0,0,256,256);
        const alpha=context.getImageData(0,0,256,256).data,edges=[];
        for(let y=0;y<256;y++)for(let x=0;x<256;x++){
          if(alpha[(y*256+x)*4+3]<=32)continue;
          if(x===0||y===0||x===255||y===255||alpha[(y*256+x-1)*4+3]<=32||alpha[(y*256+x+1)*4+3]<=32||alpha[((y-1)*256+x)*4+3]<=32||alpha[((y+1)*256+x)*4+3]<=32)
            edges.push([(x+.5)/256-.5,(y+.5)/256-.5]);
        }
        if(!edges.length)throw Error("Empty castle silhouette");
        entry.edges=edges;entry.state="ready";
      } catch {entry.state="fallback";}
      image.onload=image.onerror=null;delete entry.image;invalidate();
    };
    image.onerror=()=>{
      image.onload=image.onerror=null;delete entry.image;
      if(disposed || masks.get(asset)!==entry)return;
      entry.state="fallback";invalidate();
    };
    image.src=asset;
    return entry;
  }
  function layout(width,height,phone,mask) {
    const button=phone?44:56,gap=phone?4:6,stroke=8*button/64,cy=height*.08;
    const padding=gap+stroke/2;
    let radius=Math.max(width/2+gap,button*.6);
    if(mask.edges){
      const edges=mask.edges.map(([x,y])=>[x*width,y*height]);
      // All painted pixels must lie inside the ellipse. Measure clearance only
      // along its original open arc, so transparent corners don't inflate it.
      const clear=r=>{
        for(const [x,y] of edges){
          let a=Math.atan2((y-cy)*142/118,x);if(a< -Math.PI/4)a+=Math.PI*2;
          if(a<=Math.PI*1.25 && x*x+(y-cy)**2*(142/118)**2>r*r)return false;
        }
        for(const [ux,uy] of angles){
          const x=r*ux,y=cy+r*uy;
          for(const [ex,ey] of edges)if((x-ex)**2+(y-ey)**2<padding*padding)return false;
        }
        return true;
      };
      if(!clear(radius)){
        let low=radius,high=Math.hypot(width,height)+padding*2+button;
        while(high-low>.25){const middle=(low+high)/2;if(clear(middle))high=middle;else low=middle;}
        radius=Math.ceil(high*2)/2;
      }
    } else {
      // Pending/failed artwork uses a conservative rectangle envelope. Never
      // block commands or put the arc through an as-yet unreadable sprite.
      radius=Math.max(radius,Math.hypot(width/2+padding,(height/2+cy+padding)*142/118));
    }
    const ry=radius*118/142,tip=Math.SQRT1_2;
    const sideX=Math.max(radius,width/2+gap+button/2),sideY=cy-1.44*button/64;
    const infoY=Math.max(cy+ry,height/2+gap+button/2,sideY+button+2);
    return {button,stroke,path:`M ${radius*tip} ${cy-ry*tip} A ${radius} ${ry} 0 1 1 ${-radius*tip} ${cy-ry*tip}`,
      slots:{"wheel-level":[-sideX,sideY],"wheel-scout":[-sideX,sideY],"wheel-send":[sideX,sideY],"wheel-attack":[sideX,sideY],
        "wheel-info":[0,infoY],"wheel-regroup":[-sideX-button*.55,sideY-button-2],"wheel-scout-nearby":[sideX+button*.55,sideY-button-2],"wheel-report":[sideX+button*.55,sideY-button-2]}};
  }
  return {
    position(node,point,zoom,size) {
      if(disposed)return;
      const phone=size.height<=500,width=point.width*zoom,height=point.height*zoom,mask=silhouette(point.asset);
      const key=JSON.stringify([point.asset,width,height,phone,mask.state]);
      if(applied.get(node)===key)return;
      const data=layouts.get(key)||remember(layouts,key,layout(width,height,phone,mask));
      if(!node.classList.contains("continuous-castle-wheel")){
        node.classList.add("continuous-castle-wheel");
        const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
        svg.classList.add("castle-action-arc");svg.setAttribute("aria-hidden","true");
        svg.append(document.createElementNS(svg.namespaceURI,"path"));
        node.querySelector(".city-wheel-ring")?.replaceWith(svg);
        const info=node.querySelector(".wheel-info");
        if(info&&!info.querySelector(".wheel-action-name")){
          const label=document.createElement("span");label.className="wheel-action-name";label.textContent="Info";info.append(label);
        }
      }
      node.classList.toggle("compact-castle-wheel",phone);
      node.querySelector(".castle-action-arc path").setAttribute("d",data.path);
      node.style.setProperty("--castle-arc-stroke",`${data.stroke}px`);
      for(const [slot,[x,y]] of Object.entries(data.slots)){
        const button=node.querySelector("."+slot);if(!button)continue;
        button.style.left=`${x}px`;button.style.top=`${y}px`;
      }
      applied.set(node,key);
    },
    dispose(){disposed=true;for(const mask of masks.values())if(mask.image)mask.image.onload=mask.image.onerror=null;masks.clear();layouts.clear();},
  };
}
window.mountContinuousWorld = async function (scene, {restoreSelection=null}={}) {
  const session = getOnlineSessionRequestScope();
  const readWorld = async (operation, input = {}, signal) => {
    if (getOnlineSessionRequestScope() !== session) throw Object.assign(Error("Session changed"), { status: 401 });
    try { return await getOnlineApi().readWorld(operation, { ...input, protocol: scene.protocol, revision: scene.revision, realm: scene.realmId }, signal); }
    catch (error) { if (error.status === 409) window.CrownlandsWorldReload?.(); error.status ||= ({ unauthenticated: 401, "permission-denied": 403, unavailable: 503, "resource-exhausted": 429 })[String(error.code).replace(/^functions\//, "")]; throw error; }
  };
  const host = document.createElement("div"); host.id = "continuous-game-surface";
  host.style.cssText = "position:absolute;inset:0;z-index:5";
  const root = host.attachShadow({mode:"open"});
  const html = await (await fetch("/world/surface.html")).text();
  const parsed = new DOMParser().parseFromString(html, "text/html");
  // Share the actual game's styles, rather than the prototype's replacement UI.
  root.innerHTML = ["styles.css","interface-theme.css","readability.css","manuscript-prototype.css","ui-contrast-correction.css","crownlands-palette.css","marauders-ui.css","holding-tower-ui.css","world/preview.css","world/flags.css"]
    .map(file=>`<link rel="stylesheet" href="/${file}">`).join("") + '<div class="shell">' + parsed.body.innerHTML + '</div>';
  const overlay = document.createElement("div"); overlay.id = "continuous-game-actions";
  const overlayStyle="position:absolute;inset:0;z-index:6;pointer-events:none;overflow:hidden";
  overlay.style.cssText = overlayStyle;
  const pickups = document.createElement("div"); pickups.id="continuous-world-pickups";
  pickups.style.cssText=overlayStyle;
  // SVG fragment references resolve inside the shadow tree. Reuse the game's
  // existing symbol definitions so neutral crests and player emblems stay visible.
  const symbols=document.createElementNS("http://www.w3.org/2000/svg","svg");
  symbols.style.cssText="position:absolute;width:0;height:0;overflow:hidden";symbols.setAttribute("aria-hidden","true");
  for(const symbol of document.querySelectorAll("svg symbol"))symbols.append(symbol.cloneNode(true));
  root.prepend(symbols);
  mapFrame.append(host,pickups,overlay); mapWorld.hidden = true;
  setMainCityReturnHudMode(true);if(mainCityReturnBtn)mainCityReturnBtn.title="Return to main city";
  // Renderer owns its pointer stream. Native HUD and dialog events stay outside.
  const stop = e => e.stopPropagation();
  for (const type of ["pointerdown","pointermove","pointerup","pointercancel","click","wheel","touchmove"]) { host.addEventListener(type,stop); overlay.addEventListener(type,stop); }
  for(const type of ["pointerdown","pointerup","click"])pickups.addEventListener(type,stop);
  // The legacy map has a capturing tower-click guard. Its prior drag flag must
  // not suppress a fresh command tap owned by this separate screen-space UI.
  overlay.addEventListener("pointerdown", () => { suppressMapClick = false; }, true);
  const original = { renderCities, renderArmies, renderPaths, renderHarvestBonuses, centerOnMap, centerOnCity, centerOnWorldPoint, beginMapVisualTransition, updateMainCityReturnButton,
    renderWorldMap, renderIslandTeleporters, preloadIslandMap, preloadNearbyIslandMaps,
    getNearbyScoutCandidates, getNearbyRegroupCandidates, toggleScoutNearby, toggleRegroup, createHarvestBonusPoint, isHarvestBonusPlacementSafe };
  let view, bridge, transitioning = false, restoringSelection = false, disposed = false, lastWheel = "", wheelPoint = null, pendingFocus = null, frameView = null;
  // A Location command can precede the bounded area's first snapshot. Resolve
  // its exact display position when that snapshot arrives, unless the player
  // has already chosen a new camera interaction.
  const cancelPendingFocus = () => { pendingFocus = null; };
  for (const type of ["pointerdown","wheel","keydown","click"]) host.addEventListener(type,cancelPendingFocus,true);
  let areasReady = false, bulk = null, bulkGeneration = 0, pickupPlacement;
  const pickupNodes=new Map();
  const castleActions=createContinuousCastleActions(()=>view?.invalidate());
  function renderPickups(){
    if(!view||disposed)return;
    const present=new Set(),daily=ensureDailyCaptureTracker();
    for(const bonus of getAllActiveHarvestBonuses()){
      if(!pickupPlacement?.safe(bonus))continue;
      const section=scene.sections.find(s=>s.id===bonus.regionId);if(!section)continue;
      const type=normalizeHarvestBonusType(bonus.type),remaining=getHarvestBonusRemaining(type,daily);
      let node=pickupNodes.get(bonus.id);
      if(!node){node=document.createElement("button");node.type="button";node.dataset.harvestBonusId=bonus.id;
        node.addEventListener("click",event=>{event.stopPropagation();if(areasReady)void collectHarvestBonus(bonus.id,node);});pickups.append(node);pickupNodes.set(bonus.id,node);}
      if(node.dataset.harvestBonusType!==type){node.dataset.harvestBonusType=type;node.innerHTML=`<span aria-hidden="true">${getHarvestBonusIcon(type)}</span>`;}
      node.className=`harvest-bonus-node harvest-bonus-${type}`;
      // Override legacy detail-far hit sizing on this screen-space layer.
      node.style.setProperty("--map-hit-size","44px");
      // The camera owns transform. The legacy idle bob overrides its scale;
      // use the existing brightness pulse while retaining the animated ring.
      node.style.animationName="harvestPulse";
      const pending=pendingHarvestBonusIds.has(bonus.id);node.disabled=!areasReady||pending||remaining<=0;
      node.setAttribute("aria-busy",String(pending));node.setAttribute("aria-label",`${pending?"Collecting":"Harvest"} ${type} pickup`);
      node.title=remaining>0?`Harvest ${type} · ${remaining} left today`:`Daily ${type} limit reached`;
      const b=section.gameBounds;node.worldPoint={x:section.x+(bonus.x-b.left)/b.width*section.width,y:section.y+(bonus.y-b.top)/b.height*section.height};node.bonus=bonus;present.add(bonus.id);
    }
    for(const[id,node]of pickupNodes)if(!present.has(id)){node.remove();pickupNodes.delete(id);}
  }
  const locate = (id,region) => view?.scene.objects.find(o => o.id === id && (!region || o.sectionId === region));
  function clearWheel() { overlay.replaceChildren(); lastWheel = ""; wheelPoint = null; }
  function positionWheel(nodes,{camera,size}) {
    const p=SeamlessModel.project(camera,wheelPoint,size);
    // Other objectives retain their existing close-up control size. Below maximum zoom the
    // entire wheel, including button spacing, shrinks with its map target.
    const maxZoom=SeamlessModel.forWorld(scene).limits(size).max;
    const closeScale=size.height<500?.74:.9;
    const scale=closeScale*Math.min(1,camera.zoom/maxZoom);
    for(const node of nodes){
      if(wheelPoint.kind==="castle" && node.classList.contains("city-action-wheel")){
        castleActions.position(node,wheelPoint,camera.zoom,size);
        node.style.left=`${p.x}px`;node.style.top=`${p.y}px`;node.style.transform="none";
        continue;
      }
      if(node.dataset.towerId){
        const bottom=wheelPoint.top+wheelPoint.height-wheelPoint.y;
        node.style.setProperty("--tower-action-y",`${(bottom*maxZoom+36)/closeScale}px`);
      }
      node.style.left=`${p.x}px`;node.style.top=`${p.y}px`;node.style.transform=`translate(-50%,-50%) scale(${scale})`;
    }
  }
  function paintWheel() {
    if (!view || !areasReady || bridge?.running || getOnlineSessionRequestScope() !== session) return clearWheel();
    const target = selectedTowerMapId ? getHoldingTowerVisual(selectedTowerMapId) : selectedTargetId ? getArmyTargetById(selectedTargetId) : selectedSourceId ? getTroopOrderSourceById(selectedSourceId) : null;
    const point = target && locate(target.id,getCityRegionId(target));
    if (!point || sendMode) return clearWheel();
    // City List, shared chat locations and profiles also use the native
    // selection functions. Adopt their identity without issuing another action.
    if (view.selectedKey !== point.key) {view.select(point.key,false);bridge.selected=point;}
    wheelPoint = point;
    const signature = JSON.stringify([point.key,target.owner,target.troops,target.level,Math.floor(getProjectedGold()),scoutNearbySourceId,regroupSourceId,pendingBulkOrderAction?.phase]);
    if (signature === lastWheel) return;
    clearWheel(); wheelPoint = point; lastWheel = signature;
    cityLayer.replaceChildren();
    if (isHoldingTowerTarget(target)) renderSelectedClanTowerWheel(target.id);
    else if (isRewardCampTarget(target)) renderSelectedRewardCampWheel(target);
    else if (isStronghold(target)) renderSelectedStrongholdWheel(target);
    else if (target.owner === "player") renderSelectedCityWheel(target);
    else renderSelectedForeignWheel(target);
    const controls=[...cityLayer.children];
    // The native tower row normally measures a legacy cityLayer marker, which
    // the connected map no longer renders. Retain its centered 60px spacing.
    for(const node of controls)if(node.dataset.towerId){
      const buttons=[...node.children];
      buttons.forEach((button,index)=>button.style.setProperty("--tower-action-x",`${(index-(buttons.length-1)/2)*60}px`));
    }
    // Size before attaching: async identity/selection updates must not flash
    // an unscaled wheel while waiting for the next camera frame.
    positionWheel(controls,view.snapshot());
    for (const node of controls) { node.style.pointerEvents = "auto"; overlay.append(node); }
  }
  // Identity repairs, own-power subscriptions and the existing power-band
  // stabilization timer must repaint visible banners as well as action wheels.
  renderCities = () => { view?.invalidate(); paintWheel(); };
  renderArmies = renderPaths = () => {};
  renderHarvestBonuses=renderPickups;
  // A section change still loads authoritative gameplay state, but the hidden
  // legacy renderer must not start another terrain/scenery loading pipeline.
  renderWorldMap = renderIslandTeleporters = preloadNearbyIslandMaps = () => {};
  preloadIslandMap = async () => true;
  mapImageSwapToken++; mapBg.replaceChildren(); portalLayer.replaceChildren();
  {
    // Normal buttons retain their costs, confirmation and request IDs. Candidate
    // identities/ranges come from the authenticated server, never the map cache.
    const key = c => `${getCityRegionId(c)}:${c.id}`;
    const rows = (anchor, name) => bulk?.key === key(anchor) ? bulk[name].map(c => ({ ...c, owner: name === "regroup" ? "player" : "neutral" })) : [];
    getNearbyScoutCandidates = anchor => rows(anchor, "nearby");
    getNearbyRegroupCandidates = anchor => rows(anchor, "regroup");
    const prepare = async (id, fn) => {
      const anchor = cityById(id), generation = ++bulkGeneration;
      if (!anchor || !areasReady) return;
      try {
        const options = await readWorld("options", { key: key(anchor) });
        if (disposed || generation !== bulkGeneration || !areasReady || getCityRegionId(anchor) !== getActiveMapRegionId()
          || (selectedSourceId !== id && selectedTargetId !== id)) return;
        bulk = { ...options, key: key(anchor) }; await fn(id); view.refresh();
      } catch (error) { bulk = null; showToast(error.message); }
    };
    toggleScoutNearby = id => prepare(id, original.toggleScoutNearby);
    toggleRegroup = id => prepare(id, original.toggleRegroup);
    window.CrownlandsContinuousControls = { surface: cityLayer,
      bulk: (field, options) => ({ [field]: options.map(({ city }) => ({ cityId: city.id, regionId: getCityRegionId(city) })) }),
    };
  }
  beginMapVisualTransition = () => null;
  updateMainCityReturnButton = () => {
    if(!mainCityReturnBtn||!frameView)return;
    const main=getMainCityReference(),point=main&&locate(main.id,getMainCityRegionId());
    const {project,size}=frameView,p=point&&project(point);
    const visible=p&&p.x>56&&p.y>100&&p.x<size.width-56&&p.y<size.height-80;
    if(mainCityReturnBtn.hidden!==Boolean(visible))mainCityReturnBtn.hidden=Boolean(visible);
  };
  centerOnMap = () => { if (!transitioning && !restoringSelection) { pendingFocus=null;const s=view?.scene.sections.find(s=>s.id===getActiveMapRegionId());if(s)view.focus({x:s.x+s.width/2,y:s.y+s.height/2}); } };
  centerOnCity = id => { const c = getArmyTargetById(id); if(c)centerOnWorldPoint(c,getCityRegionId(c)); };
  centerOnWorldPoint = (point,region=getActiveMapRegionId()) => {
    if (transitioning || restoringSelection) return true;
    const exact = point?.id && locate(point.id,region);
    if (exact) {pendingFocus=null;view.focus(exact);return true;}
    const section = view?.scene.sections.find(s=>s.id===region);
    if (!section || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return false;
    const b = getIslandMapBounds(region);
    pendingFocus=point.id?section.id+":"+point.id:null;
    view.focus({x:section.x+(point.x-b.left)/b.width*section.width,y:section.y+(point.y-b.top)/b.height*section.height});return true;
  };
  bridge = new window.ContinuousGameBridge({
    // Selection may recenter the camera and start a newer area load while the
    // game's section subscription resolves. Keep that identity; paintWheel
    // gates actions until fresh data arrives. Failure/permission loss cancels
    // the bridge explicitly in onAreas/onClear.
    valid: () => !disposed && getOnlineSessionRequestScope() === session,
    clear: clearWheel,
    busy: value => {host.setAttribute("aria-busy",String(value));},
    resolve: async item => {
      if (item.kind === "troop") return {id:item.id,sectionId:item.sectionId,patrol:true};
      if (modal.open) modal.close();
      transitioning = true;
      try { if (item.sectionId !== getActiveMapRegionId() && !await switchOnlineIsland(item.sectionId,{preserveModal:true})) return null; }
      finally { transitioning = false; }
      const target = getArmyTargetById(item.id);
      return target && getCityRegionId(target) === item.sectionId ? {id:target.id,sectionId:item.sectionId,target} : null;
    },
    activate: resolved => {
      if (resolved.patrol) return;
      const target=resolved.target;
      getChatController()?.setMode("closed");
      if (isHoldingTowerTarget(target)) return selectClanTowerOnMap(target.id);
      else if (target.targetType === "marauder") selectMarauder(target.id);
      else if (isRewardCampTarget(target)) selectRewardCamp(target.id); else selectCity(target.id);
    },
  });
  try {
    await Promise.all([...root.querySelectorAll('link[rel="stylesheet"]')].map(link=>new Promise((resolve,reject)=>{
      if(link.sheet)return resolve();
      const done=error=>{clearTimeout(timer);link.onload=link.onerror=null;error?reject(Error("Map styles unavailable. Reload to retry.")):resolve();};
      const timer=setTimeout(()=>done(true),10000);link.onload=()=>done(false);link.onerror=()=>done(true);
    })));
    view = await window.createContinuousWorldView({ root, scene, nativeUi:true,
    loadAreas: (ids, signal, cursor) => readWorld("areas", { realm: scene.realmId, ids, cursor }, signal),
      onAreas: data => {
        areasReady = !data.authExpired && !data.failed && data.authoritative === true;
        if (!areasReady) {
          bulkGeneration++; bulk=null; clearWheel();
          // Recentring on a valid selection can change the area window. Keep
          // its identity while that fresh snapshot loads; only a real failure
          // or permission loss cancels the native action context.
          if (data.failed || data.authExpired) { pendingFocus=null;bridge.cancel(); clearSelection(false); }
        }
        lastWheel=""; paintWheel();
        renderPickups();
        if(areasReady&&pendingFocus&&view){const target=view.getObject(pendingFocus);if(target){pendingFocus=null;view.focus(target);}}
        if(areasReady&&restoreSelection&&view&&data.sections.some(s=>restoreSelection.startsWith(s.id+":"))){
          const selected=view.getObject(restoreSelection);restoreSelection=null;
          if(selected?.selectable){restoringSelection=true;view.select(selected.key);}
        }
      },
    onSelect: item => {
      if (!["castle","camp","stronghold","citadel","npc","tower"].includes(item.kind) || !areasReady) {bridge.cancel();clearSelection(false);return;}
      void bridge.select(item).then(ok=>{lastWheel="";paintWheel();if(!ok && bridge.error)showToast(bridge.error);requestAnimationFrame(()=>{restoringSelection=false;});});
    },
    onClear: () => {pendingFocus=null;bulkGeneration++;bulk=null;bridge.cancel();clearSelection(false);clearWheel();},
    onZoom: () => {
      // Preserve an in-progress troop destination choice while navigating.
      if (!sendMode && view?.getObject(view.selectedKey)?.kind!=="troop") { view?.clear(); bridge.cancel(); clearSelection(false); clearWheel(); }
    },
    onFrame: ({camera,project,size}) => {
      frameView={project,size};updateMainCityReturnButton();
      if (getOnlineSessionRequestScope() !== session) { dispose(); return; }
      for(const node of pickupNodes.values()){const p=project(node.worldPoint);node.hidden=!areasReady||!pickupPlacement.safe(node.bonus,{size})||p.x< -30||p.y< -30||p.x>size.width+30||p.y>size.height+30;node.style.display=node.hidden?"none":"";node.style.left=`${p.x}px`;node.style.top=`${p.y}px`;node.style.transform=`translate(-50%,-50%) scale(${.8*Math.min(1,camera.zoom/SeamlessModel.forWorld(scene).limits(size).max)})`;}
      if (areasReady&&!sendMode&&!bridge.running&&!transitioning&&bridge.selected&&view.selectedKey
          && !selectedSourceId&&!selectedTargetId&&!selectedTowerMapId
          && view.getObject(view.selectedKey)?.kind!=="troop") view.clear();
      const selectedPoint=bridge.selected?.key===view.selectedKey?bridge.selected:null;
      if(selectedPoint&&!sendMode&&!bridge.running&&!transitioning){
        const p=project(selectedPoint);
        if(p.x<0||p.y<0||p.x>size.width||p.y>size.height){view.clear();bridge.cancel();clearSelection(false);clearWheel();}
      }
      if (!wheelPoint) return;
      const p=project(wheelPoint);
      const deselected=!selectedSourceId&&!selectedTargetId&&!selectedTowerMapId;
      if (view.selectedKey!==wheelPoint.key || (!bridge.running&&!transitioning&&deselected)
          || p.x<0 || p.y<0 || p.x>size.width || p.y>size.height) {
        if (!sendMode&&!bridge.running&&!transitioning) {view.clear();bridge.cancel();clearSelection(false);}
        clearWheel();return;
      }
      positionWheel(overlay.children,{camera,size});
    },
  });
  } catch (error) { dispose(); throw error; }
  pickupPlacement=createContinuousHarvestPlacement(view);
  createHarvestBonusPoint=pickupPlacement.create;isHarvestBonusPlacementSafe=pickupPlacement.safe;
  // Useful native panels still open from the real HUD; no replacement HUD.
  clearSelection(false);view.home();renderPickups();
  root.querySelector("#load-status").textContent="Connected";
  function dispose() {
    if(disposed)return;disposed=true;castleActions.dispose();window.removeEventListener("pagehide",dispose);bridge.dispose();view?.dispose();host.remove();overlay.remove();pickups.remove();pickupNodes.clear();mapWorld.hidden=false;setMainCityReturnHudMode(false);
    ({renderCities,renderArmies,renderPaths,renderHarvestBonuses,centerOnMap,centerOnCity,centerOnWorldPoint,beginMapVisualTransition,updateMainCityReturnButton,
      renderWorldMap,renderIslandTeleporters,preloadIslandMap,preloadNearbyIslandMaps,getNearbyScoutCandidates,getNearbyRegroupCandidates,toggleScoutNearby,toggleRegroup,createHarvestBonusPoint,isHarvestBonusPlacementSafe}=original);
    delete window.CrownlandsContinuousControls;
    delete window.CrownlandsContinuousWorld;cityRenderSignature="";renderedMapBoundsSignature="";renderAll();
  }
  window.CrownlandsContinuousWorld={view,bridge,dispose,root,locate,snapshot:()=>({section:getActiveMapRegionId(),source:selectedSourceId,target:selectedTargetId,sendMode,pending:bridge.running})};
  window.addEventListener("pagehide",dispose,{once:true});
};

// The connected renderer spreads cities independently of their saved game
// coordinates. Use its authenticated artwork rectangles, then convert the
// chosen point back for the existing reservation/collection API.
function createContinuousHarvestPlacement(view) {
  let cached;
  const overlaps = (p, radius, r) => p.x + radius >= r.left && p.x - radius <= r.right
    && p.y + radius >= r.top && p.y - radius <= r.bottom;
  function context(regionId, frame) {
    const scene=view.scene, labels=window.SeamlessAppearance?.labelBounds;
    const snapshot=view.snapshot(), size=frame?.size || snapshot.size;
    const feed=snapshot.feed, section=scene.sections.find(s=>s.id===regionId);
    const ready=section && feed && !feed.failed && !feed.authExpired && feed.ids.includes(regionId)
      && scene.objects.some(o=>o.sectionId===regionId);
    if(cached?.regionId===regionId && cached.objects===scene.objects && cached.labels===labels
      && cached.width===size.width && cached.height===size.height && cached.ready===ready) return cached;
    cached={regionId,objects:scene.objects,labels,width:size.width,height:size.height,ready,section,checked:new Map()};
    if(!ready)return cached;
    const maxZoom=SeamlessModel.forWorld(scene).limits(size).max;
    // Include the 20%-smaller art, ring and outer glow at the largest relative
    // footprint. Both marker and terrain scale proportionally after that.
    cached.radius=72*.8/maxZoom+4;
    cached.maxZoom=maxZoom;
    const center={x:section.x+section.width/2,y:section.y+section.height/2};
    const range=Math.min(section.width,section.height)*.35;
    cached.center=center;cached.range=range;
    const boxes=[];
    for(const o of scene.objects){
      const art={left:o.left,top:o.top,right:o.left+o.width,bottom:o.top+o.height};
      if(!Object.values(art).every(Number.isFinite))continue;
      if(overlaps(center,range+cached.radius,art))boxes.push(art);
      if(o.kind!=="scenery"){
        const label=labels?.get(o.key) || {left:o.x-100,right:o.x+100,top:o.top-110,bottom:o.top};
        if(overlaps(center,range+cached.radius,label))boxes.push(label);
      }
    }
    cached.boxes=boxes;
    return cached;
  }
  function project(point,c){
    const s=c.section,b=s.gameBounds;
    return {x:s.x+(point.x-b.left)/b.width*s.width,y:s.y+(point.y-b.top)/b.height*s.height};
  }
  function clear(point,c){
    if(!c.ready || !Number.isFinite(point.x) || !Number.isFinite(point.y))return false;
    const p=project(point,c),key=point.x+":"+point.y;
    let safe=c.checked.get(key);
    if(safe===undefined){
      safe=Math.hypot(p.x-c.center.x,p.y-c.center.y)<=c.range+1
        && !c.boxes.some(r=>overlaps(p,c.radius,r))
        && isHarvestBonusTerrainSafePoint(point.x,point.y,c.regionId);
      if(c.checked.size>=1024)c.checked.clear();
      c.checked.set(key,safe);
    }
    // A moving army can temporarily cross otherwise clear ground. Never
    // reserve or expose a pickup underneath its token or selected controls.
    return safe && !view.scene.marches.some(m=>m.position && Math.hypot(p.x-m.position.x,p.y-m.position.y)
      < c.radius+(view.selectedKey===m.key?110:55)/c.maxZoom);
  }
  return {
    safe(bonus,frame){return clear(bonus,context(bonus.regionId,frame));},
    create(regionId){
      const c=context(regionId);if(!c.ready)return null;
      const s=c.section,b=s.gameBounds;
      for(const fraction of HARVEST_BONUS_CENTER_SEARCH_FRACTIONS){
        const angle=Math.random()*Math.PI*2,offset=Math.random();
        for(let i=0;i<HARVEST_BONUS_CENTER_SEARCH_ATTEMPTS_PER_ZONE;i++){
          const r=Math.min(s.width,s.height)*fraction*Math.sqrt((offset+(i+.5)/HARVEST_BONUS_CENTER_SEARCH_ATTEMPTS_PER_ZONE)%1);
          const a=angle+i*HARVEST_BONUS_CENTER_SEARCH_GOLDEN_ANGLE;
          const p={x:Math.round(b.left+(s.width/2+Math.cos(a)*r)/s.width*b.width),y:Math.round(b.top+(s.height/2+Math.sin(a)*r)/s.height*b.height)};
          if(clear(p,c))return p;
        }
      }
      return null;
    }
  };
}
