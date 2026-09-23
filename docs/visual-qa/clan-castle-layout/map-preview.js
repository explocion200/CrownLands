/* Loaded only into the existing loopback benchmark's mock game. */
(function () {
  "use strict";
  if (!window.__CROWNLANDS_BENCHMARK__ || location.pathname !== "/__benchmark__/") throw Error("The layout preview requires the mock game.");
  const B=window.CrownlandsClanTowerBuildings;
  const positions=Object.freeze({
    shop:{x:-.40,y:-.34},workshop:{x:.40,y:-.34},
    infirmary:{x:-.40,y:.26},training:{x:.40,y:.26}
  });
  let layout="proposed",sample="owned",level=4,tower=null,resizeTimer;
  const originalRender=renderClanTowerMapBuildings;
  renderClanTowerMapBuildings=function(visibleTowers,fragment){
    originalRender(visibleTowers,fragment);
    if(layout!=="proposed")return;
    for(const node of fragment.querySelectorAll(".holding-tower-building-node")){
      const visual=visibleTowers.find(t=>t.id===node.dataset.clanBuildingTower);
      const place=positions[node.dataset.clanBuildingId];
      if(!visual||!place)continue;
      const point=worldToMapPoint({x:visual.visualX,y:visual.visualY});
      // Placement only: keep runtime width, height, transforms, labels, artwork and click handlers.
      node.style.left=`${point.x+(place.x+.5-visual.anchorX)*visual.width}px`;
      node.style.top=`${point.y+(1-visual.anchorY+place.y)*visual.width}px`;
    }
  };
  const originalApi=getOnlineApi();
  getOnlineApi=()=>({
    ...originalApi,isReady:()=>true,isSignedIn:()=>true,
    subscribeHoldingTowerState:()=>()=>{},
    subscribeClanTreasury:()=>()=>{},
    getHoldingTowerState:async()=>({worldActive:true,towers:tower?[{...tower}]:[]}),
    getClanTowerShop:async()=>({clanShop:{level,localLevel:level,eligible:true,
      items:B.shopStatus(level,{},Date.now()).map(i=>({...i,price:1000}))}}),
    startClanTowerBuilding:async()=>{throw Error("Position preview only. No construction started.");},
    purchaseClanTowerShopItem:async()=>{throw Error("Position preview only. No Gold spent.");}
  });
  loadClanTreasuryStatus=async()=>({treasury:{balance:1e10}});
  function frameTower(){
    if(!tower)return;
    // Same camera scale as the current building review, for both comparisons.
    zoom=innerWidth<600?.4:innerHeight<560?.5:.8;
    centerOnRegion(tower.regionId);
    if(innerHeight<560)camera.y+=(innerWidth<600?50:18)/zoom;
    if(innerWidth<600)camera.x-=56/zoom;
    updateCameraTransform();
  }
  async function settings(next={}){
    layout=next.layout==="current"?"current":"proposed";
    sample=["owned","rival","building","unbuilt"].includes(next.sample)?next.sample:"owned";
    level=[1,4,7,10].includes(Number(next.level))?Number(next.level):4;
    if(sample==="building"&&level===10)level=7;
    if(modal.open)modal.close();
    clearSelection(false);
    const definition=HOLDING_TOWER_DEFINITIONS[0];
    await ensureRegionDefinitionLoaded(definition.regionId);
    tower=HOLDING_TOWER_UI.createQaSnapshot(getHoldingTowerVisual(definition.id),sample==="rival"?"enemy":"owner");
    tower.buildings=Object.fromEntries(B.DEFINITIONS.map(d=>[d.id,sample==="unbuilt"?0:level]));
    tower.buildingProject=sample==="building"?{buildingId:"workshop",targetLevel:level+1,remainingMs:8280000,progressStartedAtMs:Date.now()}:null;
    tower.wallIntegrityBps=10000;tower.attackBlocked=false;tower.repair=null;
    state.clanId=sample==="rival"?"qa-player-clan":tower.clanId;state.clanRole="leader";state.gold=1e9;
    clanTreasuryClanId=state.clanId;clanTreasuryStatus={treasury:{balance:1e10}};
    frameTower();ensureHoldingTowerMapSubscriptions();
    holdingTowerSnapshots.clear();holdingTowerSnapshots.set(tower.id,tower);
    selectedTowerMapId=tower.id;
    cityRenderSignature="";releaseSelectionRenderDelay();renderAll();
    document.documentElement.dataset.castlePositionLayout=layout;
    window.CrownlandsCastlePositionReview.tower=tower;
    parent.postMessage({type:"castle-layout-status",message:layout==="current"?"Current positions · Original game size, labels and controls":"Proposed positions only · Original game size, labels and controls"},location.origin);
  }
  window.CrownlandsCastlePositionReview={settings,frameTower,positions,tower:null};
  window.addEventListener("message",e=>{if(e.origin===location.origin&&e.source===parent&&e.data?.type==="castle-position-settings")void settings(e.data);});
  window.addEventListener("resize",()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(frameTower,80);});
  parent.postMessage({type:"castle-position-ready"},location.origin);
})();
