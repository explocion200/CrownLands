/* Actual-game rendering with synthetic local marches. Never included in production. */
(async function () {
  if (location.hostname !== "127.0.0.1" || !window.__CROWNLANDS_BENCHMARK__) throw Error("Local benchmark required");
  const deadline = Date.now() + 60000;
  while (window.__CROWNLANDS_BENCHMARK__.getStatus().status !== "ready") {
    if (Date.now() > deadline) throw Error("Benchmark initialization timed out");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const source = {...state.cities.find(city => city.owner === "player"),name:"Briarford"};
  const target = {...state.cities.find(city => city.owner !== "player"),name:"Greyhaven",troops:3200,ownerUid:"march-review-opponent"};
  const owned = {...source,name:"Ravenwatch"};
  const region = getCityRegionId(source);
  let marches = [];
  const snapshot = () => ({marches,rallies:[],reinforcements:[],camps:[],strongholds:marches.length?[]:[{...source,kind:"stronghold",strongholdType:"gold",name:"Ironwatch"}]});
  getActiveOperationsSnapshot = snapshot;
  getOutgoingAttacks = () => marches;
  useSwiftMarchOrderOnMission = id => {document.documentElement.dataset.marchAction="swift:"+id;swiftMarchOrderRequests.add(id);patchMarchItemActionUi();showToast("Local review: Swift handler received "+id);};
  useRecallHornOnMission = id => {document.documentElement.dataset.marchAction="recall:"+id;recallHornRequests.add(id);patchMarchItemActionUi();showToast("Local review: Recall handler received "+id);};
  const samples=["standard","transfers","returns","pending","long","many","no-items","empty"];
  function make(sample) {
    const now=Date.now();
    const base={owner:"player",ownerUid:getCurrentOnlineUid(),source,target,fromId:source.id,toId:target.id,sourceRegionId:region,targetRegionId:getCityRegionId(target),kind:"attack",remaining:252,total:500,launchedAtMs:now-248000,arrivesAtMs:now+252000,troops:4850};
    let result=[
      {...base,id:"review-scout",key:"review-scout",kind:"scout",troops:1,remaining:42},
      {...base,id:"review-transfer",key:"review-transfer",kind:"transfer",target:owned,toId:owned.id,troops:12000,remaining:166},
      {...base,id:"review-attack",key:"review-attack"},
      {...base,id:"review-return",key:"review-return",returning:true,troops:2250,remaining:304},
      {...base,id:"review-reinforce",key:"review-reinforce",kind:"transfer",target:{...owned,kind:"stronghold",strongholdType:"gold",name:"Ironwatch"},remaining:680,troops:8000},
      {...base,id:"review-rally",key:"review-rally",kind:"rally_join",remaining:965,troops:6500}
    ];
    if(sample==="transfers")result=[result[1],{...result[1],id:"review-used",key:"review-used",swiftMarchUsedAtMs:now,remaining:400},result[4],{...result[4],id:"review-allied",key:"review-allied",target:{...result[4].target,owner:"enemy",ownerUid:"ally"},remaining:720}];
    if(sample==="returns")result=[result[3],{...result[3],id:"review-return-soon",key:"review-return-soon",remaining:16},{...result[1],id:"review-camp-return",key:"review-camp-return",campReturn:true,remaining:750}];
    if(sample==="pending"){result=[{...result[1],id:"review-sending",key:"review-sending",troops:null,serverPending:true,remaining:0},{...result[2],id:"review-checking",key:"review-checking",serverPending:true,serverRetrying:true,target:null,remaining:0},{...result[0],id:"review-resolving",key:"review-resolving",isResolving:true,remaining:0},result[1],result[2]];swiftMarchOrderRequests.add("review-transfer");recallHornRequests.add("review-attack");}
    if(sample==="long")result=result.slice(1,4).map((row,i)=>({...row,source:{...source,name:"The Royal Borough of West Ravenwatch"},target:{...row.target,name:"The High Citadel of Thornfield and Ash",troops:888888888},troops:[999999999,12500000,8900100][i],remaining:7519+i*500}));
    if(sample==="many")result=Array.from({length:18},(_,i)=>({...result[i%result.length],id:`review-many-${i}`,key:`review-many-${i}`,remaining:42+i*147}));
    return sample==="empty"?[]:result.sort((a,b)=>a.remaining-b.remaining);
  }
  function show(sample) {
    swiftMarchOrderRequests.clear();recallHornRequests.clear();
    state.shopItems[SWIFT_MARCH_ORDER_ITEM_ID]=sample==="no-items"?0:3;
    state.shopItems[RECALL_HORN_ITEM_ID]=sample==="no-items"?0:2;
    marches=make(sample);activeOperationsTab="marches";
    modal.className="modal outgoing-attack-modal";renderOutgoingAttacksModalContent(snapshot());
    if(!modal.open)modal.showModal();
    document.documentElement.dataset.marchRuntimeSample=sample;
  }
  const controls=document.createElement("div");controls.style="position:fixed;top:0;right:0;z-index:999999;display:flex;gap:4px;background:#e8dbb8;color:#352f23";
  const picker=document.createElement("select");picker.setAttribute("aria-label","Runtime march example");picker.innerHTML=samples.map(s=>`<option>${s}</option>`).join("");picker.addEventListener("change",()=>show(picker.value));controls.append(picker);
  const refresh=document.createElement("button");refresh.textContent="Refresh snapshot";refresh.addEventListener("click",()=>renderOutgoingAttacksModalContent(snapshot()));controls.append(refresh);
  const reopen=document.createElement("button");reopen.textContent="Reopen Marches";reopen.addEventListener("click",()=>show(picker.value));controls.append(reopen);
  modal.append(controls);
  window.__marchRuntimeReview={show};show("standard");
  document.documentElement.dataset.marchRuntimeReady="true";
})();
