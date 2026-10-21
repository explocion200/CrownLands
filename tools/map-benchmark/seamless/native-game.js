/* Appended to game.js only by the loopback test server. Native menus/commands,
   separate continuous camera; no production entry point imports this adapter. */
(async function installNativeContinuousWorld() {
  "use strict";
  const fixture = window.__CROWNLANDS_BENCHMARK_BOOTSTRAP__;
  if (!fixture?.nativeWorld) return;
  if (location.hostname !== "127.0.0.1") throw Error("Native world rehearsal requires loopback");
  for (let i = 0; i < 400 && document.documentElement.dataset.crownlandsBenchmarkReady !== "true"; i++) await new Promise(r => setTimeout(r, 100));
  if (!state || !onlineWorldConnected) throw Error("Native game did not connect");
  const session = getOnlineSessionRequestScope();
  const host = document.createElement("div"); host.id = "continuous-game-surface";
  host.style.cssText = "position:absolute;inset:0;z-index:5";
  const root = host.attachShadow({mode:"open"});
  const html = await (await fetch("/tools/map-benchmark/seamless/index.html")).text();
  const parsed = new DOMParser().parseFromString(html, "text/html");
  root.innerHTML = '<link rel="stylesheet" href="/tools/map-benchmark/seamless/preview.css"><style>:host{display:block}.shell{height:100%;display:flex;flex-direction:column}header{position:absolute;top:80px;right:8px;padding:3px;z-index:6}header nav{display:grid;grid-template-columns:32px 32px;gap:2px}header button{min-height:28px;font-size:10px;padding:2px}header #home,header #fit{grid-column:span 2}header #zoom{display:none}header>div,footer #hint{display:none}footer{position:absolute;top:4px;right:60px;border:1px solid #a88c5d;max-width:200px;font-size:8px}#load-status{white-space:normal}#viewport{height:100%}</style><div class="shell">' + parsed.body.innerHTML + '</div>';
  root.querySelector("#fit").textContent = "World";
  const overlay = document.createElement("div"); overlay.id = "continuous-game-actions";
  overlay.style.cssText = "position:absolute;inset:0;z-index:6;pointer-events:none;overflow:hidden";
  mapFrame.append(host,overlay); mapWorld.hidden = true;
  // Renderer owns its pointer stream. Native HUD and dialog events stay outside.
  const stop = e => e.stopPropagation();
  for (const type of ["pointerdown","pointermove","pointerup","pointercancel","click","wheel","touchmove"]) { host.addEventListener(type,stop); overlay.addEventListener(type,stop); }
  const original = { renderCities, renderArmies, renderPaths, renderHarvestBonuses, centerOnMap, centerOnCity, centerOnWorldPoint, beginMapVisualTransition, updateMainCityReturnButton };
  let view, bridge, transitioning = false, disposed = false, lastWheel = "", wheelPoint = null;
  const locate = (id,region) => view?.scene.objects.find(o => o.id === id && (!region || o.sectionId === region));
  function clearWheel() { overlay.replaceChildren(); lastWheel = ""; wheelPoint = null; }
  function paintWheel() {
    if (!view || bridge?.running || getOnlineSessionRequestScope() !== session) return clearWheel();
    const target = selectedTargetId ? getArmyTargetById(selectedTargetId) : selectedSourceId ? getTroopOrderSourceById(selectedSourceId) : null;
    const point = target && locate(target.id,getCityRegionId(target));
    if (!point || sendMode) return clearWheel();
    wheelPoint = point;
    const signature = JSON.stringify([point.key,target.owner,target.troops,target.level,Math.floor(getProjectedGold()),scoutNearbySourceId,regroupSourceId,pendingBulkOrderAction?.phase]);
    if (signature === lastWheel) return;
    clearWheel(); wheelPoint = point; lastWheel = signature;
    cityLayer.replaceChildren();
    if (isRewardCampTarget(target)) renderSelectedRewardCampWheel(target);
    else if (isStronghold(target)) renderSelectedStrongholdWheel(target);
    else if (target.owner === "player") renderSelectedCityWheel(target);
    else renderSelectedForeignWheel(target);
    // These require the bounded authenticated neighbour feed before this HUD
    // can submit the expanded cross-section candidate list. Do not send the
    // old same-section list under the wider-world rules.
    for (const button of cityLayer.querySelectorAll(".wheel-scout-nearby,.wheel-regroup")) {button.disabled=true;button.title="Wider-world bulk controls are not connected in this UI rehearsal";}
    for (const node of [...cityLayer.children]) { node.style.pointerEvents = "auto"; overlay.append(node); }
  }
  renderCities = paintWheel;
  renderArmies = renderPaths = renderHarvestBonuses = () => {};
  beginMapVisualTransition = () => null;
  updateMainCityReturnButton = () => { if (mainCityReturnBtn) mainCityReturnBtn.hidden=true; };
  centerOnMap = () => { if (!transitioning) { const s=view?.scene.sections.find(s=>s.id===getActiveMapRegionId());if(s)view.focus({x:s.x+s.width/2,y:s.y+s.height/2}); } };
  centerOnCity = id => { const c = getArmyTargetById(id); const o = c && locate(id,getCityRegionId(c)); if (!transitioning && o) view?.focus(o); };
  centerOnWorldPoint = (point,region=getActiveMapRegionId()) => {
    if (transitioning) return true;
    const exact = point?.id && locate(point.id,region);
    if (exact) {view.focus(exact);return true;}
    const section = view?.scene.sections.find(s=>s.id===region);
    if (!section || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return false;
    const b = getIslandMapBounds(region);
    view.focus({x:section.x+(point.x-b.left)/b.width*section.width,y:section.y+(point.y-b.top)/b.height*section.height});return true;
  };
  bridge = new window.ContinuousGameBridge({
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
      if (isRewardCampTarget(target)) selectRewardCamp(target.id); else selectCity(target.id);
    },
  });
  try { view = await window.createContinuousWorldView({ root, scene: fixture.nativeScene, nativeUi:true,
    onSelect: item => {
      if (!["castle","camp","stronghold","citadel"].includes(item.kind)) {bridge.cancel();clearSelection(false);return;}
      void bridge.select(item).then(ok=>{lastWheel="";paintWheel();if(!ok && bridge.error)showToast(bridge.error);});
    },
    onClear: () => {bridge.cancel();clearSelection(false);},
    onFrame: ({project,size}) => {
      if (getOnlineSessionRequestScope() !== session) { dispose(); return; }
      if (!wheelPoint) return;
      const p=project(wheelPoint);
      for(const node of overlay.children){const small=size.height<500,scale=small?.74:.9;node.style.left=`${Math.max(small?Math.min(285,size.width/2):110,Math.min(size.width-115,p.x))}px`;node.style.top=`${Math.max(small?120:110,Math.min(size.height-(small?135:115),p.y))}px`;node.style.transform=`translate(-50%,-50%) scale(${scale})`;}
    },
  });
  } catch (error) { dispose(); throw error; }
  root.querySelector("#home").addEventListener("click",()=>centerOnCity(state.mainCityId));
  // Useful native panels still open from the real HUD; no replacement HUD.
  clearSelection(false);view.home();
  root.querySelector("#load-status").textContent="Private game UI — sample data";
  function dispose() {
    if(disposed)return;disposed=true;window.removeEventListener("pagehide",dispose);bridge.dispose();view?.dispose();host.remove();overlay.remove();mapWorld.hidden=false;
    ({renderCities,renderArmies,renderPaths,renderHarvestBonuses,centerOnMap,centerOnCity,centerOnWorldPoint,beginMapVisualTransition,updateMainCityReturnButton}=original);
    delete window.nativeContinuousWorld;cityRenderSignature="";renderAll();
  }
  window.nativeContinuousWorld={view,bridge,dispose,root,locate,snapshot:()=>({section:getActiveMapRegionId(),source:selectedSourceId,target:selectedTargetId,sendMode,pending:bridge.running})};
  window.addEventListener("pagehide",dispose,{once:true});
})();
