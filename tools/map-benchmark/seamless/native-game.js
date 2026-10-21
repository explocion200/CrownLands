/* Appended to game.js only by the loopback test server. Native menus/commands,
   separate continuous camera; no production entry point imports this adapter. */
(async function installNativeContinuousWorld() {
  "use strict";
  const fixture = window.__CROWNLANDS_BENCHMARK_BOOTSTRAP__;
  if (!fixture?.nativeWorld) return;
  const authenticated = fixture.nativeAuthenticated === true;
  if (location.hostname !== "127.0.0.1" && !(authenticated && location.pathname.startsWith("/api/local-game/rehearsal/") && document.querySelector('meta[name="crownlands-private-preview-origin"]')?.content === location.origin)) throw Error("Native world rehearsal requires a private test entry");
  for (let i = 0; i < 600 && (authenticated ? !onlineWorldConnected || !state?.mainCityId : document.documentElement.dataset.crownlandsBenchmarkReady !== "true"); i++) await new Promise(r => setTimeout(r, 100));
  if (!state || !onlineWorldConnected) throw Error("Native game did not connect");
  const session = getOnlineSessionRequestScope();
  const readWorld = async (operation, input = {}, signal) => {
    if (getOnlineSessionRequestScope() !== session) throw Object.assign(Error("Session changed"), { status: 401 });
    try { return await getOnlineApi().readWorld(operation, input, signal); }
    catch (error) { error.status ||= ({ unauthenticated: 401, "permission-denied": 403, unavailable: 503, "resource-exhausted": 429 })[String(error.code).replace(/^functions\//, "")]; throw error; }
  };
  const scene = authenticated ? await readWorld("catalog") : fixture.nativeScene;
  const host = document.createElement("div"); host.id = "continuous-game-surface";
  host.style.cssText = "position:absolute;inset:0;z-index:5";
  const root = host.attachShadow({mode:"open"});
  const html = await (await fetch("/tools/map-benchmark/seamless/index.html")).text();
  const parsed = new DOMParser().parseFromString(html, "text/html");
  root.innerHTML = '<link rel="stylesheet" href="/tools/map-benchmark/seamless/preview.css"><style>:host{display:block}.shell{height:100%;display:flex;flex-direction:column}header{position:absolute;top:80px;right:8px;padding:3px;z-index:6}header nav{display:grid;grid-template-columns:32px 32px;gap:2px}header button{min-height:28px;font-size:10px;padding:2px}header #home,header #fit{grid-column:span 2}header #zoom{display:none}header>div,footer #hint{display:none}footer{position:absolute;top:4px;right:60px;border:1px solid #a88c5d;max-width:200px;font-size:8px}#load-status{white-space:normal}#viewport{height:100%}</style><div class="shell">' + parsed.body.innerHTML + '</div>';
  root.querySelector("#fit").textContent = "World";
  const inspectorStyle = document.createElement("style");
  inspectorStyle.textContent = "#inspector{bottom:100px;max-height:calc(100% - 190px)}@media(max-height:500px){#inspector{bottom:84px;max-height:calc(100% - 135px);width:265px;padding:6px}#inspector h1{font-size:15px;margin:2px 30px 3px 0}#inspector p{margin:1px 0;font-size:11px}#inspector #kind{font-size:9px}#inspector #follow{min-height:26px;padding:3px 10px;position:sticky;bottom:0}}";
  root.append(inspectorStyle);
  if (authenticated) { const style = document.createElement("link"); style.rel="stylesheet"; style.href="/__benchmark__/seamless/flags.css"; root.append(style); }
  const overlay = document.createElement("div"); overlay.id = "continuous-game-actions";
  overlay.style.cssText = "position:absolute;inset:0;z-index:6;pointer-events:none;overflow:hidden";
  mapFrame.append(host,overlay); mapWorld.hidden = true;
  // Renderer owns its pointer stream. Native HUD and dialog events stay outside.
  const stop = e => e.stopPropagation();
  for (const type of ["pointerdown","pointermove","pointerup","pointercancel","click","wheel","touchmove"]) { host.addEventListener(type,stop); overlay.addEventListener(type,stop); }
  // The legacy map has a capturing tower-click guard. Its prior drag flag must
  // not suppress a fresh command tap owned by this separate screen-space UI.
  overlay.addEventListener("pointerdown", () => { suppressMapClick = false; }, true);
  const original = { renderCities, renderArmies, renderPaths, renderHarvestBonuses, centerOnMap, centerOnCity, centerOnWorldPoint, beginMapVisualTransition, updateMainCityReturnButton,
    renderWorldMap, renderIslandTeleporters, preloadIslandMap, preloadNearbyIslandMaps,
    getNearbyScoutCandidates, getNearbyRegroupCandidates, toggleScoutNearby, toggleRegroup };
  let view, bridge, transitioning = false, disposed = false, lastWheel = "", wheelPoint = null;
  let areasReady = !authenticated, bulk = null, bulkGeneration = 0;
  const locate = (id,region) => view?.scene.objects.find(o => o.id === id && (!region || o.sectionId === region));
  function clearWheel() { overlay.replaceChildren(); lastWheel = ""; wheelPoint = null; }
  function paintWheel() {
    if (!view || !areasReady || bridge?.running || getOnlineSessionRequestScope() !== session) return clearWheel();
    const target = selectedTowerMapId ? getHoldingTowerVisual(selectedTowerMapId) : selectedTargetId ? getArmyTargetById(selectedTargetId) : selectedSourceId ? getTroopOrderSourceById(selectedSourceId) : null;
    const point = target && locate(target.id,getCityRegionId(target));
    if (!point || sendMode) return clearWheel();
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
    // These require the bounded authenticated neighbour feed before this HUD
    // can submit the expanded cross-section candidate list. Do not send the
    // old same-section list under the wider-world rules.
    if (!authenticated) for (const button of cityLayer.querySelectorAll(".wheel-scout-nearby,.wheel-regroup")) {button.disabled=true;button.title="Wider-world bulk controls are not connected in this UI rehearsal";}
    for (const node of [...cityLayer.children]) { node.style.pointerEvents = "auto"; overlay.append(node); }
  }
  renderCities = paintWheel;
  renderArmies = renderPaths = renderHarvestBonuses = () => {};
  // A section change still loads authoritative gameplay state, but the hidden
  // legacy renderer must not start another terrain/scenery loading pipeline.
  renderWorldMap = renderIslandTeleporters = preloadNearbyIslandMaps = () => {};
  preloadIslandMap = async () => true;
  mapImageSwapToken++; mapBg.replaceChildren(); portalLayer.replaceChildren();
  if (authenticated) {
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
    valid: () => !disposed && areasReady && getOnlineSessionRequestScope() === session,
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
  try { view = await window.createContinuousWorldView({ root, scene, nativeUi:true,
    ...(authenticated ? { loadAreas: (ids, signal, cursor) => readWorld("areas", { realm: scene.realmId, ids, cursor }, signal),
      onAreas: data => {
        areasReady = !data.authExpired && !data.failed && data.authoritative === true;
        if (!areasReady) {
          bulkGeneration++; bulk=null; clearWheel();
          // Recentring on a valid selection can change the area window. Keep
          // its identity while that fresh snapshot loads; only a real failure
          // or permission loss cancels the native action context.
          if (data.failed || data.authExpired) { bridge.cancel(); clearSelection(false); }
        }
        lastWheel=""; paintWheel();
      } } : {}),
    onSelect: item => {
      if (!["castle","camp","stronghold","citadel","npc","tower"].includes(item.kind) || !areasReady) {bridge.cancel();clearSelection(false);return;}
      void bridge.select(item).then(ok=>{lastWheel="";paintWheel();if(!ok && bridge.error)showToast(bridge.error);});
    },
    onClear: () => {bulkGeneration++;bulk=null;bridge.cancel();clearSelection(false);},
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
    ({renderCities,renderArmies,renderPaths,renderHarvestBonuses,centerOnMap,centerOnCity,centerOnWorldPoint,beginMapVisualTransition,updateMainCityReturnButton,
      renderWorldMap,renderIslandTeleporters,preloadIslandMap,preloadNearbyIslandMaps,getNearbyScoutCandidates,getNearbyRegroupCandidates,toggleScoutNearby,toggleRegroup}=original);
    delete window.CrownlandsContinuousControls;
    delete window.nativeContinuousWorld;cityRenderSignature="";renderedMapBoundsSignature="";renderAll();
  }
  window.nativeContinuousWorld={view,bridge,dispose,root,locate,snapshot:()=>({section:getActiveMapRegionId(),source:selectedSourceId,target:selectedTargetId,sendMode,pending:bridge.running})};
  window.addEventListener("pagehide",dispose,{once:true});
})();
