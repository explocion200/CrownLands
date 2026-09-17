"use strict";
// Local-only adapter: no Firebase, account, membership, or messaging requests.
(() => {
  const $=id=>document.getElementById(id),listeners=new Map(),uid="chat-ledger-preview-ruler";
  window.CROWNLANDS_REALM_CONFIG={resetGeneration:"chat-ledger-design-preview"};
  const people=["Lady Elinor","Marshal Alden","Thane Rowan","Lady Maeve","Lord Edmund"];
  const lines={global:[
    [0,"Good evening, rulers. The western roads are quiet tonight."],
    [1,"Our scouts have returned from Stoneward. The northern pass is clear."],
    [2,"A fine day to strengthen the walls. How are your kingdoms faring?"],
    [3,"The harvest has been kind to us. Our treasury is recovering."],
    [4,"Our reinforcements are on their way home. We will be ready at dawn."],
    [1,"We will keep watch along the eastern road until then."],
    [0,"Safe travels to every banner on the road."],
    [2,"Does anyone have news from the Crown Citadel?"],
    [3,"The banners are still flying. I am waiting for a fresh scout report."],
    [4,"Let us know when it arrives. We will be watching the border."],
    [0,"Of course. I will share an update when the scout returns."]
  ],clan:[
    [1,"Council, gather your reports. We should know our strength before we march."],
    [2,"My troops are stationed at Ravenwatch. The western road is covered."],
    [3,"I am upgrading my city first. I can send more troops once the march returns."],
    [0,"Keep a reserve at home. We should avoid leaving our cities unguarded."],
    [4,"Agreed. I will hold our position until everyone is ready."],
    [1,"Check the rally in the War Room before committing your troops."],
    [2,"Understood. I will send another scout and wait for the report."],
    [3,"We stand together. For the clan!"]
  ]};
  let sample="standard",data={global:[],clan:[]},sequence=0,cooldownUntil=0,noticeTimer;
  const controller=window.CrownlandsChat.createController();
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function message(channel,index,text,stamp,id){return {id:id||`${channel}-${++sequence}`,channel,channelId:channel==="clan"?"preview-clan":"global",senderUid:index===4?uid:`preview-${index}`,senderDisplayName:people[index],text,createdAtMs:stamp,status:"visible"};}
  function publish(label="Review ready"){
    const d=controller.diagnostics();
    document.body.dataset.chatMode=d.mode;
    const clan=d.channel==="clan";
    $("quickChannel").textContent=clan?"Clan Chat":"Global Chat";
    $("channelAudience").textContent=clan?(sample==="no-clan"?"Membership required":"Visible to your clan"):"All rulers of the realm";
    $("historyLabel").textContent=clan?"YOUR CLAN'S CORRESPONDENCE":"THE REALM'S CONVERSATION";
    $("retention").textContent=clan?"Clan history":"Past 24 hours";
    $("composeLabel").textContent=clan?"Write to Clan":"Write to Global";
    $("historyNote").textContent=clan?"Clan history":"Past 24 hours";
    $("chatHistory").setAttribute("aria-labelledby",clan?"clanTab":"globalTab");
    $("chatMessageList").setAttribute("aria-label",clan?"Clan messages":"Global messages");
    const ownIds=new Set([...data.global,...data.clan].filter(m=>m.senderUid===uid).map(m=>m.id));
    for(const row of $("chatMessageList").children)row.classList.toggle("is-own",ownIds.has(row.dataset.messageId));
    window.parent.postMessage({type:"chat-status",message:label,mode:d.mode,channel:d.channel},location.origin);
  }
  const api={
    subscribeChatMessages(options,handlers){const channel=options.channel;listeners.set(channel,handlers);queueMicrotask(()=>{if(listeners.get(channel)!==handlers)return;handlers.onMessages(data[channel],{initial:true,hasMore:data[channel].length>0});if(sample==="reconnecting")handlers.onError(new Error("Preview reconnect"));publish();if(controller.diagnostics().mode==="full"&&controller.diagnostics().channel===channel)controller.selectChannel(channel,{focus:false,forceBottom:true});});return()=>{if(listeners.get(channel)===handlers)listeners.delete(channel);};},
    async loadOlderChatMessages({channel,beforeCreatedAtMs}){await wait(350);const older=Array.from({length:8},(_,i)=>message(channel,i%4,lines[channel][i%lines[channel].length][1],beforeCreatedAtMs-(8-i)*60000));data[channel]=[...older,...data[channel]];setTimeout(()=>publish("Earlier messages loaded locally"),0);return older;},
    async sendChatMessage(payload){await wait(350);if(sample==="failed"||sample==="reconnecting")throw new Error("Message could not be sent. Your draft is still here. Try again when connected.");const now=Date.now();if(now<cooldownUntil){const e=new Error("Please wait before sending again.");e.details={retryAfterMs:cooldownUntil-now};throw e;}const m=message(payload.channel,4,payload.text,now);data[payload.channel].push(m);listeners.get(payload.channel)?.onMessages(data[payload.channel],{initial:false,changes:[{type:"added",message:m}]});cooldownUntil=now+3000;setTimeout(()=>publish("Message added to this local draft only"),0);return {ok:true,serverNowMs:now,cooldownUntilMs:cooldownUntil,retryAfterMs:3000};}
  };
  function reset(options={}){
    sample=["standard","long","empty","no-clan","reconnecting","failed","busy"].includes(options.sample)?options.sample:"standard";
    controller.dispose({resetSession:true});listeners.clear();cooldownUntil=0;
    const now=Date.now();sequence=0;
    for(const channel of ["global","clan"])data[channel]=sample==="empty"?[]:lines[channel].map(([person,text],i)=>message(channel,person,text,now-(lines[channel].length-i)*65000));
    if(sample==="long")for(const channel of ["global","clan"]){data[channel].push(message(channel,1,"We are waiting for the last march to return before choosing our next destination. Keep an eye on your reports and leave a reserve at home. I will post another update as soon as we have word from the scouts along the northern road.",now-20000));data[channel].push(message(channel,4,"First, review the scout report.\nThen, decide how many troops to send.\nWe will meet in the War Room when everyone is ready.",now-10000));}
    if(sample==="no-clan")data.clan=[];
    $("chatMessageInput").value="";$("chatStatus").hidden=true;
    document.querySelector(".movement-context").hidden=sample!=="busy";
    $("connection").dataset.state=sample;
    $("connection").lastElementChild.textContent=sample==="reconnecting"?"Reconnecting…":"Connected";
    controller.start({api,uid,clanId:sample==="no-clan"?"":"preview-clan"});
    controller.selectChannel(sample==="no-clan"?"clan":options.channel||"global",{focus:false,forceBottom:true});
    controller.setMode(options.mode||"full");
    window.dispatchEvent(new Event("crownlands:hud-occupancy-changed"));publish("Local example ready");
  }
  function incoming(){const d=controller.diagnostics(),channel=d.channel;if(channel==="clan"&&sample==="no-clan"){publish("Clan messages are unavailable without membership");return;}const m=message(channel,0,"A fresh dispatch has arrived. The scouts are returning along the western road.",Date.now());data[channel].push(m);listeners.get(channel)?.onMessages(data[channel],{initial:false,changes:[{type:"added",message:m}]});publish("Incoming message added locally");}
  window.addEventListener("message",e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.type!=="chat-review")return;const o=e.data;if(o.action==="reset"||o.action==="sample")reset(o);else if(o.action==="incoming")incoming();else if(o.action==="channel"){controller.selectChannel(o.channel,{focus:false,forceBottom:true});publish();}else if(o.action==="mode"){controller.setMode(o.mode);publish();}});
  $("reopen").addEventListener("click",()=>{controller.setMode("full");publish();});
  document.addEventListener("click",()=>setTimeout(()=>publish(),0));
  $("chatDialog").addEventListener("close",()=>setTimeout(()=>publish(),0));
  // Keyboard tab navigation is preview chrome; the live controller owns channel state.
  document.querySelector(".chat-tabs").addEventListener("keydown",e=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;e.preventDefault();const current=controller.diagnostics().channel;controller.selectChannel(e.key==="Home"?"global":e.key==="End"?"clan":current==="global"?"clan":"global");publish();});
  window.addEventListener("crownlands:chat-player-profile",e=>{const m=[...data.global,...data.clan].find(m=>m.senderUid===e.detail?.uid);clearTimeout(noticeTimer);$("profileNotice").textContent=`${m?.senderDisplayName||"Ruler"} · Player profile link · Local preview`;
    // Place the notice inside the open dialog so it is visible above the modal backdrop.
    $("chatDialog").append($("profileNotice"));$("profileNotice").hidden=false;noticeTimer=setTimeout(()=>{$("profileNotice").hidden=true;},2300);publish("Player profile link checked locally");});
  window.addEventListener("beforeunload",()=>controller.dispose({resetSession:true}));
  window.ChatLedgerDraft=Object.freeze({controller,reset,incoming});
  if(parent===window)reset(Object.fromEntries(new URLSearchParams(location.search)));
  else window.parent.postMessage({type:"chat-ready"},location.origin);
})();
