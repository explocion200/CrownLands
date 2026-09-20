"use strict";
// Synthetic fixtures only. No Firebase, Google calls, account access or storage writes.
(() => {
  const $=id=>document.getElementById(id), phrase=window.ChatTranslationPreview.phrases;
  const effects=[
    {id:"shield",name:"Royal Peace Shield",category:"Protection",art:"item-peace-shield-384x384-c74d2eb2f8ac.webp",benefit:"Protection from rival attacks",scope:"Your regular cities",description:"Turns back rival attacks against protected cities.",note:"Attacking another player cancels your shield. Strongholds are excluded.",seconds:7*3600+24*60+16,total:12*3600},
    {id:"drums",name:"War Drums",category:"Troop production",art:"item-war-drums-384x384-40892cafa303.webp",benefit:"+30% base troop production",scope:"Your owned cities",description:"Adds troops based on each city's base production.",note:"Production boost only. It does not increase battle power.",seconds:23*60+48,total:30*60},
    {id:"tax",name:"Royal Tax Decree",category:"Gold production",art:"item-royal-tax-decree-384x384-86d99a278ab1.webp",benefit:"+50% base Gold production",scope:"Your owned cities",description:"Adds Gold based on each city's base production.",note:"Using another Decree extends the timer; the percentage stays the same.",seconds:18*60+32,total:30*60},
    {id:"veil",name:"Veil of Silence",category:"Concealment",art:"item-veil-of-silence-384x384-45fcf6e08b34.webp",benefit:"Enemy scouting blocked",scope:"Your regular cities",description:"Hides your cities from enemy scouts while active.",note:"Scouting protection only. This does not block attacks.",seconds:4*60+36,total:5*60}
  ];
  let sample="standard",view="map",channel="global",target="en",selected="drums",miniOpen=true,epoch=0,started=Date.now(),messages=[],nextId=0,sendUntil=0;
  const translated=new Map();
  const esc=value=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const languageName=code=>{try{return new Intl.DisplayNames([target],{type:"language"}).of(code);}catch(_){return code;}};
  const translateIcon='<svg aria-hidden="true"><use href="#translate-mark"></use></svg>';
  function report(message){if(parent!==window)parent.postMessage({type:"boosts-chat-status",message,view},location.origin);}
  function remaining(effect){return Math.max(0,Math.ceil((effect.expires-Date.now())/1000));}
  function time(seconds){const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60;return h?h+":"+String(m).padStart(2,"0")+":"+String(s).padStart(2,"0"):m+":"+String(s).padStart(2,"0");}
  function active(){return effects.filter(e=>remaining(e)>0);}
  function art(effect){return "assets/optimized/"+effect.art;}
  function renderEffects(){
    $("effectRack").innerHTML=active().map(e=>'<div class="effect-token" title="'+esc(e.name)+'" aria-label="'+esc(e.name)+'"><img src="'+art(e)+'" alt="'+esc(e.name)+'"><time data-timer="'+e.id+'">'+time(remaining(e))+'</time></div>').join("");
  }
  function setView(next){
    view=next==="chat"?"chat":"map";
    if($("chatDialog").open)$("chatDialog").close();
    if(view==="chat"){renderMessages();$("chatDialog").showModal();$("chatMessageList").scrollTop=$("chatMessageList").scrollHeight;}
    report(view==="map"?"Original compact chat and right-side item timers":"Translate works on one message at a time");
  }
  function setMini(open){miniOpen=open;$("quickChat").hidden=!open;$("chatToggleBtn").classList.toggle("is-expanded",open);$("chatToggleBtn").setAttribute("aria-expanded",String(open));$("chatToggleBtn").setAttribute("aria-label",open?"Hide mini chat":"Show mini chat");}
  function makeMessage(person,lang,phraseIndex,own=false){return {id:"draft-"+(++nextId),person,lang,source:phrase[phraseIndex][lang],phraseIndex,own,stamp:"14:"+String(20+nextId%40).padStart(2,"0")};}
  function seed(){
    messages=[
      makeMessage("Lady Elinor","en",0),
      makeMessage("Don Rodrigo","es",1),
      makeMessage("Lady Amélie","fr",2),
      makeMessage("Lord Edmund",target,3,true),
      makeMessage("Thane Alrik","de",4),
      {id:"draft-neutral",person:"Thane Rowan",source:"(42, 18) · 12:30",lang:null,stamp:"14:26"},
      makeMessage("Lady Elinor","en",5),
      makeMessage("Don Rodrigo","es",0),
      makeMessage("Marshal Alden","es",1)
    ];
    // Keep the own-language fixture available for unsupported preview locales.
    messages.forEach(m=>{if(!m.source){m.source=phrase[m.phraseIndex].en;m.lang="en";}});
  }
  function canTranslate(m){return Boolean(m.lang&&m.lang!==target&&phrase[m.phraseIndex]?.[target]);}
  function toolsFor(m,mini=false){
    if(!canTranslate(m))return "";
    const state=translated.get(m.id)||{}, pending=state.status==="loading",ready=state.status==="ready"&&!state.original,error=state.status==="error";
    const label=pending?"Translating…":error?"Retry translation":ready?"Show original":"Translate";
    return '<div class="message-tools">'+(ready?'<span class="translation-note">Translated to '+esc(languageName(target))+'</span>':'')+'<button class="per-message-translate" type="button" data-translate="'+m.id+'" '+(pending?'disabled ':'')+'aria-label="'+esc(label+" · "+m.person+" · "+languageName(target))+'">'+(ready?'':translateIcon)+label+'</button>'+(ready?'<img class="google-badge" src="assets/icons/google-translate-attribution'+(mini?'-short':'')+'.png" alt="Google Translate">':'')+(error?'<span class="message-error" role="status">Unavailable · original kept</span>':'')+'</div>';
  }
  function shown(m){const s=translated.get(m.id);return s?.status==="ready"&&!s.original?s.text:m.source;}
  function renderMessages(){
    const list=$("chatMessageList"),scroll=list.scrollTop;
    // Replace only rows whose visible content changed; retain the reader's anchor.
    const anchor=[...list.children].find(row=>row.getBoundingClientRect().bottom>list.getBoundingClientRect().top);
    const anchorId=anchor?.dataset.id,top=anchor?.getBoundingClientRect().top;
    const keep=new Set(messages.map(m=>m.id));for(const row of [...list.children])if(!keep.has(row.dataset.id))row.remove();
    for(const m of messages){
      const state=translated.get(m.id)||{};
      const html='<div class="chat-message-line"><strong class="chat-message-sender">'+esc(m.person)+'</strong><div class="message-content"><p dir="auto" lang="'+(state.status==="ready"&&!state.original?target:m.lang||"")+'">'+esc(shown(m))+'</p>'+toolsFor(m)+'</div><time>'+m.stamp+'</time></div>';
      let row=[...list.children].find(row=>row.dataset.id===m.id);
      if(!row){row=document.createElement("article");row.className="chat-message"+(m.own?" is-own":"");row.dataset.id=m.id;list.append(row);}
      if(row.innerHTML!==html)row.innerHTML=html;
    }
    if(anchorId){const a=[...list.children].find(row=>row.dataset.id===anchorId);list.scrollTop=scroll+(a?a.getBoundingClientRect().top-top:0);}
    $("quickChatMessages").innerHTML=messages.slice(-3).map(m=>'<div class="mini-row"><div class="mini-line"><strong>'+esc(m.person)+'</strong><span class="mini-text" dir="auto">'+esc(shown(m))+'</span></div>'+toolsFor(m,true)+'</div>').join("");
    $("quickChatMessages").scrollTop=$("quickChatMessages").scrollHeight;
    $("targetLanguage").textContent="Translate to "+languageName(target);
  }
  async function translate(id){
    const m=messages.find(m=>m.id===id);if(!m||!canTranslate(m))return;
    const old=translated.get(id);
    if(old?.status==="loading")return;
    if(old?.status==="ready"){old.original=!old.original;renderMessages();report(old.original?"Original restored for one message":"Prepared translation shown for one message");return;}
    const revision=epoch,lang=target,failedAlready=old?.status==="error";
    translated.set(id,{status:"loading"});renderMessages();report("Translating this message only");
    await new Promise(resolve=>setTimeout(resolve,sample==="loading"?3500:650));
    if(epoch!==revision||target!==lang||!messages.includes(m))return;
    if(sample==="error"&&!failedAlready){translated.set(id,{status:"error"});report("Example failure · original stays visible · retry this message");}
    else{translated.set(id,{status:"ready",text:phrase[m.phraseIndex][target],original:false});report("One message translated · other messages unchanged");}
    renderMessages();
  }
  function incoming(){
    const list=$("chatMessageList"),atBottom=list.scrollHeight-list.scrollTop-list.clientHeight<30;
    const lang=target==="es"?"fr":"es";messages.push(makeMessage("Lady Elinor",lang,0));renderMessages();
    if(atBottom)list.scrollTop=list.scrollHeight;else $("newMessages").hidden=false;
    report("New foreign-language message · waiting for its own Translate tap");
  }
  function reset(options={}){
    epoch++;sample=options.sample||"standard";started=Date.now();
    target=options.locale&&options.locale!=="device"?options.locale:window.ChatTranslationPreview.language();
    selected=sample==="expiring"?"veil":"drums";translated.clear();nextId=0;sendUntil=0;channel="global";
    for(const e of effects)e.expires=sample==="empty"?0:started+1000*(sample==="expiring"&&e.id==="veil"?12:e.seconds);
    seed();$("chatMessageInput").value="";$("chatStatus").hidden=true;$("newMessages").hidden=true;updateComposer();selectChannel("global",false);setMini(true);renderEffects();setView(options.view||"map");
  }
  function selectChannel(next,notify=true){
    epoch++;channel=next;translated.clear();renderMessages();
    for(const b of document.querySelectorAll("[data-channel]")){const selected=b.dataset.channel===channel;b.classList.toggle("active",selected);b.setAttribute("aria-selected",String(selected));b.tabIndex=selected?0:-1;}
    $("channelAudience").textContent=channel==="clan"?"Visible to your clan":"All rulers of the realm";$("quickChannel").textContent=channel==="clan"?"Clan Chat":"Global Chat";$("composeLabel").textContent="Write to "+(channel==="clan"?"Clan":"Global");$("chatHistory").setAttribute("aria-labelledby",channel+"Tab");
    $("chatMessageList").scrollTop=$("chatMessageList").scrollHeight;if(notify)report("Local "+channel+" conversation · translation selection cleared");
  }
  function updateComposer(){const text=$("chatMessageInput").value;$("chatCharacterCount").textContent=text.length+"/250";$("chatSendBtn").disabled=!text.trim()||Date.now()<sendUntil;}
  $("chatComposer").addEventListener("submit",e=>{e.preventDefault();const text=$("chatMessageInput").value.trim();if(!text||Date.now()<sendUntil)return;messages.push({id:"draft-"+(++nextId),person:"Lord Edmund",source:text,lang:null,own:true,stamp:"Now"});$("chatMessageInput").value="";sendUntil=Date.now()+3000;renderMessages();$("chatMessageList").scrollTop=$("chatMessageList").scrollHeight;updateComposer();report("Local sample added only · arbitrary text has no guessed language");});
  $("chatMessageInput").addEventListener("input",updateComposer);$("chatMessageInput").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){e.preventDefault();$("chatComposer").requestSubmit();}});
  document.addEventListener("click",e=>{
    const tr=e.target.closest("[data-translate]");if(tr){e.stopPropagation();translate(tr.dataset.translate);return;}
    const tab=e.target.closest("[data-channel]");if(tab)selectChannel(tab.dataset.channel);
  });
  $("chatToggleBtn").addEventListener("click",()=>{setMini(!miniOpen);report(miniOpen?"Mini chat open · translucent map preview":"Mini chat hidden · arrow remains");});
  $("openLedger").addEventListener("click",()=>setView("chat"));$("openChat").addEventListener("click",()=>setView("chat"));
  for(const id of ["chatMinimizeBtn","chatCloseBtn"])$(id).addEventListener("click",()=>{if(id==="chatMinimizeBtn")setMini(true);setView("map");});
  for(const dialog of [$("chatDialog")])dialog.addEventListener("cancel",e=>{e.preventDefault();setView("map");});
  $("newMessages").addEventListener("click",()=>{$("chatMessageList").scrollTop=$("chatMessageList").scrollHeight;$("newMessages").hidden=true;});
  $("chatMessageList").addEventListener("scroll",()=>{const l=$("chatMessageList");if(l.scrollHeight-l.scrollTop-l.clientHeight<30)$("newMessages").hidden=true;});
  document.querySelector(".chat-tabs").addEventListener("keydown",e=>{if(["ArrowLeft","ArrowRight","Home","End"].includes(e.key)){e.preventDefault();selectChannel(e.key==="Home"?"global":e.key==="End"?"clan":channel==="global"?"clan":"global");$(channel+"Tab").focus();}});
  document.querySelectorAll("[data-nav]").forEach(b=>b.addEventListener("click",()=>report(b.dataset.nav+" is unchanged; this draft focuses on chat and timers")));
  $("quickChatMessages").addEventListener("click",e=>{if(!e.target.closest("[data-translate]"))setView("chat");});
  window.addEventListener("message",e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.type!=="boosts-chat-review")return;const o=e.data;if(o.action==="view")setView(o.view);else if(o.action==="incoming")incoming();else reset(o);});
  let lastActive="";
  setInterval(()=>{
    const signature=active().map(e=>e.id+":"+(remaining(e)<300)).join(",");
    if(signature!==lastActive){lastActive=signature;renderEffects();}
    for(const node of document.querySelectorAll("[data-timer]"))node.textContent=time(remaining(effects.find(e=>e.id===node.dataset.timer)));
    const selectedEffect=active().find(e=>e.id===selected),track=document.querySelector(".time-track>span");if(track&&selectedEffect)track.style.width=Math.min(100,remaining(selectedEffect)/selectedEffect.total*100)+"%";
    updateComposer();
  },1000);
  if(parent===window)reset(Object.fromEntries(new URLSearchParams(location.search)));
  else parent.postMessage({type:"boosts-chat-ready"},location.origin);
})();
