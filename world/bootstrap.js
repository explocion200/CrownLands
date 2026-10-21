/* Optional local-world adapter. Authority and availability come from the server. */
(function () {
  "use strict";
  const modules=["model","assets","feed","delta-feed","sprite-layer","game-bridge","appearance","preview","native"];
  let loading=false,loaded=false,stopped=false,session=null,lastAttempt=0,reload=false,restore,lastError="",lastErrorAt=0;
  const ready=()=>{try{return typeof getOnlineSessionRequestScope==="function"&&onlineWorldConnected&&!isMapInteractionBlocked()&&state?.mainCityId&&getOnlineApi()?.getUser?.();}catch{return false;}};
  function save(){
    const v=window.CrownlandsContinuousWorld?.view;if(!v)return;
    const {camera,selected}=v.snapshot(),s=v.scene.sections.find(s=>camera.x>=s.x&&camera.x<s.x+s.width&&camera.y>=s.y&&camera.y<s.y+s.height);
    restore=s?{realm:v.scene.realmId,generation:v.scene.resetGeneration,section:s.id,x:camera.x-s.x,y:camera.y-s.y,zoom:camera.zoom,selected}:null;
  }
  window.CrownlandsWorldReload=()=>{if(reload)return;save();reload=true;delete window.CROWNLANDS_WORLD_SESSION;window.CrownlandsContinuousWorld?.dispose();lastAttempt=0;};
  function script(name){return new Promise((resolve,reject)=>{const s=document.createElement("script");s.src="world/"+name+".js?v=continuous-v1";s.onload=resolve;s.onerror=()=>{s.remove();reject(Error("Map files unavailable"));};document.head.append(s);});}
  async function tick(){
    if(stopped||loading||document.hidden)return;
    // Switching the normal game's section temporarily disconnects its old
    // subscription. That is not a logout and must not destroy this camera.
    const currentScope=typeof getOnlineSessionRequestScope==="function"?getOnlineSessionRequestScope():null;
    if(session===currentScope&&window.CrownlandsContinuousWorld&&!reload)return;
    if(!ready()){
      if(session){delete window.CROWNLANDS_WORLD_SESSION;window.CrownlandsContinuousWorld?.dispose();session=null;restore=null;}
      return;
    }
    const scope=getOnlineSessionRequestScope();
    if(session===scope&&window.CrownlandsContinuousWorld&&!reload)return;
    if(Date.now()-lastAttempt<5000)return;lastAttempt=Date.now();loading=true;
    try{
      const scene=await getOnlineApi().readWorld("catalog");
      if(scope!==getOnlineSessionRequestScope())return;
      if(!scene.enabled){reload=false;lastAttempt=Date.now()+25000;return;}
      if(scene.protocol!==1||scene.routingVersion!=="continuous-world-v1"||!/^[a-f0-9]{64}$/.test(scene.revision||""))throw Error("Refresh Crownlands to load the updated world.");
      if(!loaded){for(const name of modules)await script(name);loaded=true;}
      if(scope!==getOnlineSessionRequestScope())return;
      window.CrownlandsContinuousWorld?.dispose();
      const main=cityById(state.mainCityId);if(main&&scene.sections.some(s=>s.id===getCityRegionId(main)))scene.homeSectionId=getCityRegionId(main);
      const sameWorld=restore&&restore.realm===scene.realmId&&restore.generation===scene.resetGeneration;
      await window.mountContinuousWorld(scene,{restoreSelection:sameWorld?restore.selected:null});
      if(scope!==getOnlineSessionRequestScope()){window.CrownlandsContinuousWorld?.dispose();return;}
      window.CROWNLANDS_WORLD_SESSION=Object.freeze({protocol:scene.protocol,revision:scene.revision});
      if(restore&&restore.realm===scene.realmId&&restore.generation===scene.resetGeneration){
        const s=scene.sections.find(s=>s.id===restore.section);
        if(s)window.CrownlandsContinuousWorld.view.view(s.x+restore.x,s.y+restore.y,restore.zoom);
      }
      restore=null;
      session=scope;reload=false;
    }catch(error){
      if(error.status===404){lastAttempt=Date.now()+25000;return;}
      // No fallback to another travel policy. Commands remain rejected by the
      // server until matching assets/catalog have mounted successfully.
      const message=error.message||"World map updating; retrying shortly.";
      if(typeof showToast==="function"&&(message!==lastError||Date.now()-lastErrorAt>30000)){showToast(message);lastError=message;lastErrorAt=Date.now();}
    }finally{loading=false;}
  }
  const timer=setInterval(()=>void tick(),1000);void tick();
  window.addEventListener("pagehide",()=>{stopped=true;clearInterval(timer);delete window.CROWNLANDS_WORLD_SESSION;window.CrownlandsContinuousWorld?.dispose();},{once:true});
})();
