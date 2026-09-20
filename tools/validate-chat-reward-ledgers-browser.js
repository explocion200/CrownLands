"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const artifacts = path.resolve(__dirname, "../release-artifacts/chat-reward-ledgers");

async function main() {
  const browser = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(browser, "Set CHROME_PATH to a Chromium browser.");
  fs.mkdirSync(artifacts, { recursive:true });
  const server = createMapBenchmarkServer();
  const address = await server.listen();
  let session, client;
  const errors = [], results = [];
  try {
    session = await startBrowserSession(browser);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all([client.send("Page.enable"), client.send("Runtime.enable")]);
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails?.exception?.description || event.exceptionDetails?.text));
    const evaluate = async (fn, arg) => {
      const result = await client.send("Runtime.evaluate", {expression:"(" + fn.toString() + ")(" + JSON.stringify(arg ?? null) + ")", awaitPromise:true, returnByValue:true});
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const screenshot = async name => {
      const shot = await client.send("Page.captureScreenshot", {format:"png"});
      fs.writeFileSync(path.join(artifacts,name+".png"), Buffer.from(shot.data,"base64"));
    };
    await client.send("Page.navigate", {url:address.url+"/__benchmark__/?scenario=A&visualMarches=0"});
    for(let i=0;i<240 && !await evaluate(()=>window.__CROWNLANDS_BENCHMARK__?.getStatus().status==="ready");i++) await wait(250);
    assert.equal(await evaluate(()=>window.__CROWNLANDS_BENCHMARK__?.getStatus().status),"ready");
    // Only this loopback game fixture is modified; no production API is used.
    await evaluate(()=>{
      window.__CROWNLANDS_BENCHMARK__.closeModal();
      levelUpRewardQueue.length=0; activeLevelUpReward=null; pendingOfflineRewardsSummary=null;
      screenRewardAnimationBlockUntilMs=0;
      window.rewardFeedback=[];
      playRewardAnimation=(kind,options)=>window.rewardFeedback.push({kind,anchor:options.sourceAnchor});
      getEffectiveAnimationMode=()=>"off";
      window.ledgerLayout=(dialog,button)=>{
        for(const animation of dialog.getAnimations({subtree:true}))if(Number.isFinite(animation.effect?.getComputedTiming().endTime))animation.finish();
        const r=dialog.getBoundingClientRect(), b=button.getBoundingClientRect();
        return {bounds:{x:r.x,y:r.y,width:r.width,height:r.height}, footerVisible:b.top>=r.top&&b.bottom<=r.bottom&&b.left>=r.left&&b.right<=r.right,
          buttonHeight:b.height, horizontalOverflow:dialog.scrollWidth>dialog.clientWidth+1, text:dialog.innerText,
          brokenImages:[...dialog.querySelectorAll("img")].filter(img=>!img.complete||!img.naturalWidth).map(img=>img.getAttribute("src"))};
      };
      toast.classList.remove("visible");
    });
    for(const viewport of [{name:"desktop",width:1440,height:900},{name:"landscape",width:844,height:390},{name:"short-landscape",width:568,height:320}]) {
      await client.send("Emulation.setDeviceMetricsOverride",{width:viewport.width,height:viewport.height,deviceScaleFactor:1,mobile:false});
      for(const sample of ["single","multiple","large"]) {
        await evaluate(sample=>{
          if(modal.open)modal.close();
          const large=sample==="large";
          activeLevelUpReward={fromLevel:large?149:24,toLevel:large?150:sample==="multiple"?27:25,levelsGained:sample==="multiple"?3:1,
            skillPoints:sample==="multiple"?3:1,gold:large?23497686072:125480,troops:large?4285960:32620,
            cityId:"fixture-city",cityName:large?"The Watch of Saint Bartholomew in the Northern Highlands":"Stoneward"};
          renderLevelUpReward(activeLevelUpReward);
          if(!levelUpRewardModal.open)levelUpRewardModal.showModal();
          levelUpRewardModal.classList.add("revealed");
        },sample);
        await wait(250);
        const layout=await evaluate(()=>window.ledgerLayout(levelUpRewardModal,document.getElementById("collectLevelUpRewardsBtn")));
        await screenshot("hero-"+sample+"-"+viewport.name);
        assert(layout.footerVisible&&!layout.horizontalOverflow&&layout.buttonHeight>=44,JSON.stringify({viewport,sample,layout}));
        assert.deepEqual(layout.brokenImages,[]);
        assert(layout.text.includes(sample==="large"?"+23,497,686,072":"+125,480"));
        if(sample==="multiple")assert(layout.text.includes("3 levels gained")&&layout.text.includes("+3"));
        results.push({screen:"hero",viewport:viewport.name,sample,layout:{...layout,text:undefined}});
      }
      const collect=await evaluate(async()=>{
        const before=state.gold;window.rewardFeedback=[];
        document.getElementById("collectLevelUpRewardsBtn").click();
        const balanceUnchanged=state.gold===before;
        await new Promise(resolve=>setTimeout(resolve,180));
        return {closed:!levelUpRewardModal.open,balanceUnchanged};
      });
      assert(collect.closed&&collect.balanceUnchanged,"Collect must dismiss an already credited Hero receipt: "+JSON.stringify(collect));
      await wait(30);
      for(const sample of ["safe","lost","many","losses-only","inactivity"]) {
        await evaluate(sample=>{
          pendingGameServerInactivityNotice=sample==="inactivity"?{type:"holdings-surrendered",releasedCities:4,releasedCamps:2,consolidatedTroops:82450}:null;
          const cities=sample==="many"?Array.from({length:12},(_,i)=>({id:"fixture-"+i,name:"The Watch of Saint Bartholomew "+i,regionId:state.online?.islandId||""}))
            :["lost","losses-only"].includes(sample)?[{id:"fixture",name:'Ashford <img src=x onerror="throw new Error(1)">',regionId:state.online?.islandId||""}]:[];
          showOfflineRewardsModal({elapsed:30240,goldGained:sample==="losses-only"?0:23497686072,troopsGained:sample==="losses-only"?0:12564390,lostCities:cities,lostCityCount:sample==="many"?14:cities.length});
        },sample);
        await wait(180);
        const layout=await evaluate(()=>window.ledgerLayout(modal,document.getElementById("offlineCollectBtn")));
        await screenshot("welcome-"+sample+"-"+viewport.name);
        assert(layout.footerVisible&&!layout.horizontalOverflow&&layout.buttonHeight>=44,JSON.stringify({viewport,sample,layout}));
        assert.deepEqual(layout.brokenImages,[]);
        if(sample==="safe")assert(layout.text.includes("No cities lost"));
        if(sample==="inactivity")assert(layout.text.includes("6 holdings surrendered")&&!layout.text.includes("No cities lost"));
        if(sample==="many") {
          const expanded=await evaluate(()=>{
            const btn=modalBody.querySelector("[data-offline-expand]");
            const before=[...modalBody.querySelectorAll("#lostCities li")].filter(e=>!e.hidden).length;
            btn.click();
            return {before,after:[...modalBody.querySelectorAll("#lostCities li")].filter(e=>!e.hidden).length,missing:modalBody.querySelector(".missing-cities").textContent};
          });
          assert.equal(expanded.before,4);assert.equal(expanded.after,12);assert(expanded.missing.includes("2 additional"));
        }
        const collected=await evaluate(()=>{
          const before=state.gold;window.rewardFeedback=[];
          const button=document.getElementById("offlineCollectBtn");
          button.click();button.click();
          return {closed:!modal.open,balanceUnchanged:state.gold===before};
        });
        await wait(30);
        assert(collected.closed&&collected.balanceUnchanged,"Welcome Back Collect must not credit balances again.");
        const feedback=await evaluate(()=>window.rewardFeedback);
        assert.equal(feedback.length,sample==="losses-only"?0:2,"One feedback per nonzero reward only.");
        results.push({screen:"welcome",viewport:viewport.name,sample,layout:{...layout,text:undefined}});
      }
      await evaluate(()=>{
        showGameServerInactivityNotice({type:"world-slot-reset"});
      });
      await wait(100);
      const notice=await evaluate(()=>window.ledgerLayout(modal,document.getElementById("inactivityNoticeCloseBtn")));
      await screenshot("inactivity-"+viewport.name);
      assert(notice.footerVisible&&notice.text.includes("World slot reset"),JSON.stringify(notice));
      await evaluate(()=>{
        document.getElementById("inactivityNoticeCloseBtn").click();
        window.qaChatListeners={};window.qaSendFailure=false;
        const now=Date.now();
        window.qaChatMessages=Array.from({length:50},(_,i)=>({id:"ledger-"+i,senderUid:i%3===0?"ledger-test-player":"ruler-"+i,senderDisplayName:i%3===0?"Your ruler":"Lady Elinor",text:"The northern roads are quiet. Keep a reserve at home before sending your next march. "+i,createdAtMs:now-(50-i)*1000,status:"visible",channel:"global"}));
        window.qaChatApi={
          getServerNowMs:()=>Date.now(),
          subscribeChatMessages(options,handlers){window.qaChatListeners[options.channel]=handlers;queueMicrotask(()=>handlers.onMessages(options.channel==="global"?window.qaChatMessages:[],{initial:true,hasMore:options.channel==="global"}));return ()=>{};},
          async loadOlderChatMessages(){return [];},
          async sendChatMessage(payload){if(window.qaSendFailure)throw new Error("Fixture send failed");const message={id:"sent-"+Date.now(),senderUid:"ledger-test-player",senderDisplayName:"Your ruler",text:payload.text,createdAtMs:Date.now(),status:"visible",channel:payload.channel};window.qaChatListeners[payload.channel].onMessages([message],{});return {retryAfterMs:3000};}
        };
        window.qaChat=CrownlandsChat.init();
        window.qaChat.dispose({resetSession:true});
        window.qaChat.start({api:window.qaChatApi,uid:"ledger-test-player",clanId:"test-clan"});
        document.getElementById("chatMessageInput").value="";
        document.getElementById("chatMessageInput").dispatchEvent(new Event("input",{bubbles:true}));
        window.qaChat.setMode("full");
      });
      await wait(200);
      const chat=await evaluate(()=>{
        const layout=window.ledgerLayout(document.getElementById("chatDialog"),document.getElementById("chatSendBtn"));
        const list=document.getElementById("chatMessageList");
        return {...layout,historyHeight:list.clientHeight,historyScrollable:list.scrollHeight>list.clientHeight,composer:document.getElementById("chatMessageInput").getBoundingClientRect().height,ownRows:list.querySelectorAll(".is-own").length};
      });
      await screenshot("chat-"+viewport.name);
      assert(chat.footerVisible&&!chat.horizontalOverflow&&chat.buttonHeight>=44&&chat.historyHeight>=40&&chat.historyScrollable&&chat.ownRows>0,JSON.stringify({viewport,chat}));
      assert(await evaluate(()=>!document.getElementById("chatTranslateBtn")&&!document.querySelector(".per-message-translate")),"No channel-wide control or unverified translation buttons.");
      const navigation=await evaluate(()=>{
        document.getElementById("chatMessageInput").value="Keep this unsent draft";
        window.qaChat.selectChannel("clan");
        const clan=document.getElementById("chatComposeLabel").textContent;
        window.qaChat.setMode("quick");window.qaChat.setMode("full");
        const kept=document.getElementById("chatMessageInput").value;
        window.qaChat.updateClan("");
        const disabled=document.getElementById("chatSendBtn").disabled;
        window.qaChat.selectChannel("global");
        return {clan,kept,disabled};
      });
      assert.deepEqual(navigation,{clan:"Write to Clan",kept:"Keep this unsent draft",disabled:true});
      await evaluate(()=>{
        const list=document.getElementById("chatMessageList");list.scrollTop=0;
        window.qaChatListeners.global.onMessages([{id:"incoming",senderUid:"ruler-new",senderDisplayName:"Marshal Alden",text:"Incoming dispatch",createdAtMs:Date.now(),status:"visible"}],{});
      });
      await wait(50);
      const unread=await evaluate(()=>({top:document.getElementById("chatMessageList").scrollTop,visible:!document.getElementById("chatNewMessagesBtn").hidden}));
      assert.equal(unread.top,0);assert(unread.visible);
      await evaluate(()=>{
        window.qaSendFailure=true;
        const input=document.getElementById("chatMessageInput");input.value="This text must survive rejection";input.dispatchEvent(new Event("input",{bubbles:true}));
        document.getElementById("chatComposer").requestSubmit();
      });
      await wait(50);
      assert.equal(await evaluate(()=>document.getElementById("chatMessageInput").value),"This text must survive rejection");
      await evaluate(()=>{
        window.qaTranslationCalls=[];window.qaTranslationLimited=false;
        window.qaChatApi.translateChatMessages=async payload=>{
          window.qaTranslationCalls.push(payload);
          if(payload.operation==="detect")return {detections:payload.messageIds.map(id=>({id,language:id==="same-language"?"es":"en",confidence:id==="uncertain"?.1:.99}))};
          if(window.qaTranslationLimited)throw Object.assign(new Error("Monthly limit"),{details:{reason:"translation-monthly-limit"}});
          return {provider:"google",translations:payload.messageIds.map(id=>({id,text:'Hola <img src=x onerror="throw new Error(1)"> '+id}))};
        };
        window.qaChat.setTranslationLanguage("en");
        window.qaChat.setTranslationLanguage("es");
      });
      await wait(150);
      assert(await evaluate(()=>window.qaTranslationCalls.every(call=>call.operation==="detect")),"Detection must not automatically translate.");
      await evaluate(()=>{
        const button=document.querySelector("#chatMessageList .per-message-translate");
        window.qaSelectedTranslationId=button.dataset.messageId;button.focus();button.click();
      });
      await wait(180);
      const translated=await evaluate(()=>({
        visible:!document.getElementById("chatTranslateBtn"),
        attribution:[...document.querySelectorAll("#chatDialog .chat-google-attribution")].some(node=>!node.hidden&&node.querySelector("img").naturalWidth>0),
        translated:document.querySelectorAll("#chatMessageList .is-translated").length,
        injectedImages:document.querySelectorAll("#chatMessageList img[src=x]").length,
        focusPreserved:document.activeElement.dataset.messageId===window.qaSelectedTranslationId,
        calls:window.qaTranslationCalls,
        layout:window.ledgerLayout(document.getElementById("chatDialog"),document.getElementById("chatSendBtn")),
      }));
      assert(translated.visible&&translated.attribution&&translated.translated===1&&!translated.injectedImages&&translated.focusPreserved,JSON.stringify(translated));
      assert(translated.calls.filter(call=>call.operation!=="detect").every(call=>call.messageIds.length===1&&call.targetLanguage==="es"&&!Object.hasOwn(call,"text")));
      assert(translated.layout.footerVisible&&!translated.layout.horizontalOverflow,JSON.stringify({viewport,translated}));
      await screenshot("chat-google-translation-"+viewport.name);
      await evaluate(()=>{
        document.querySelector('#chatMessageList [data-message-id="'+window.qaSelectedTranslationId+'"] .per-message-translate').click();
        document.getElementById("chatNewMessagesBtn").click();
        const now=Date.now();
        window.qaChatListeners.global.onMessages([
          {id:"same-language",text:"Hola amigo"},{id:"neutral",text:"12:30 (42,18)"},{id:"uncertain",text:"uncertain name"},{id:"translate-incoming",text:"Fresh message"}
        ].map((item,i)=>({...item,senderUid:"other",senderDisplayName:"Other",createdAtMs:now+i,status:"visible"})),{});
        const list=document.getElementById("chatMessageList");list.scrollTop=list.scrollHeight;list.dispatchEvent(new Event("scroll"));
      });
      await wait(150);
      assert(await evaluate(()=>document.getElementById("chatMessageList").textContent.includes("Fresh message")&&!document.querySelector('#chatMessageList [data-message-id="same-language"] .per-message-translate')&&!document.querySelector('#chatMessageList [data-message-id="neutral"] .per-message-translate')&&!document.querySelector('#chatMessageList [data-message-id="uncertain"] .per-message-translate')),"Same-language, neutral and uncertain messages must not offer translation.");
      await evaluate(()=>{window.qaTranslationLimited=true;document.querySelector('#chatMessageList [data-message-id="translate-incoming"] .per-message-translate').click();});
      await wait(80);
      assert(await evaluate(()=>document.querySelector('#chatMessageList [data-message-id="translate-incoming"]').textContent.includes("Monthly allowance used")),"Explain quota failures on the affected message.");
      await evaluate(()=>{window.qaTranslationLimited=false;document.querySelector('#chatMessageList [data-message-id="translate-incoming"] .per-message-translate').click();});
      await wait(80);
      assert(await evaluate(()=>document.querySelector('#chatMessageList [data-message-id="translate-incoming"] .chat-message-text').textContent.includes("Hola <img")),"Retry must recover that message.");
      await evaluate(()=>window.qaChat.setMode("quick"));await wait(120);
      const mini=await evaluate(()=>{
        const preview=document.getElementById("quickChat"),r=preview.getBoundingClientRect();
        const button=preview.querySelector(".per-message-translate"),b=button?.getBoundingClientRect();
        return {background:getComputedStyle(preview).backgroundImage,visible:!preview.hidden,bounds:{top:r.top,bottom:r.bottom,left:r.left,right:r.right},viewportHeight:innerHeight,
          buttonVisible:!button||b.top>=r.top&&b.bottom<=r.bottom,arrow:document.querySelector('#chatToggleBtn use').getAttribute('href'),
          sharedResult:preview.textContent.includes("Hola <img"),mode:window.qaChat.diagnostics().mode};
      });
      assert(mini.visible&&mini.buttonVisible&&mini.arrow==="#cl-icon-back"&&mini.background.includes("0.72")&&mini.bounds.top>=0&&mini.bounds.bottom<=viewport.height,JSON.stringify({viewport,mini}));
      await screenshot("chat-individual-mini-"+viewport.name);
      await evaluate(()=>document.getElementById("chatToggleBtn").click());
      assert(await evaluate(()=>document.getElementById("quickChat").hidden),"Arrow collapses preview");
      await evaluate(()=>{document.getElementById("chatToggleBtn").click();document.getElementById("openChatLedger").click();});
      assert(await evaluate(()=>document.getElementById("chatDialog").open),"Open chat enters the ledger");
      results.push({screen:"chat",viewport:viewport.name,layout:{...chat,text:undefined},navigation,unread});
      await evaluate(()=>window.qaChat.dispose({resetSession:true}));
      await evaluate(()=>{
        state.itemEffects={shieldExpiresAtMs:Date.now()+120000,warDrumsExpiresAtMs:Date.now()+100000,royalTaxDecreeExpiresAtMs:Date.now()+80000,veilOfSilenceExpiresAtMs:Date.now()+30000};
        updateShieldStatusBadge();
      });
      const boostHud=await evaluate(()=>{
        const buttons=[...document.querySelectorAll('#activeItemEffectsStack button')];
        return buttons.map(button=>{const r=button.getBoundingClientRect();return {id:button.id,top:r.top,bottom:r.bottom,left:r.left,right:r.right,
          hit:button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});
      });
      assert(boostHud.every(item=>item.hit&&item.left>=0&&item.right<=viewport.width&&item.top>=0&&item.bottom<=viewport.height),JSON.stringify({viewport,boostHud}));
      assert(Math.abs(boostHud[1].top-boostHud[4].top)<1,"All four effect icons fit one compact HUD row");
      await evaluate(()=>{
        document.getElementById("allEffects").click();
      });await wait(180);
      for(const id of ["shieldStatusBadge","warDrumsStatusBadge","taxDecreeStatusBadge","veilStatusBadge"]){
        await evaluate(id=>document.querySelector('#boostList [data-effect-id="'+id+'"]').click(),id);await wait(80);
        const boost=await evaluate(()=>window.ledgerLayout(document.getElementById("boostDialog"),document.getElementById("backToMap")));
        assert(boost.footerVisible&&!boost.horizontalOverflow&&!boost.brokenImages.length,JSON.stringify({viewport,id,boost}));
        if(id==="warDrumsStatusBadge")assert(boost.text.includes("+30% base troop production")&&boost.text.includes("does not increase battle power"));
        if(id==="veilStatusBadge")assert(boost.text.includes("personal item effect"));
        await screenshot("boost-"+id+"-"+viewport.name);
      }
      await evaluate(()=>{state.itemEffects={};updateShieldStatusBadge();});
      assert(await evaluate(()=>document.getElementById("boostDialog").textContent.includes("No active effects")&&document.querySelectorAll('#boostList button').length===0),"Expired effects must disappear without closing the dialog");
      await evaluate(()=>document.getElementById("backToMap").click());
      results.push({screen:"boosts",viewport:viewport.name,allEffects:true,expiry:true});
      console.log("Passed reward and Chat integration at "+viewport.width+"x"+viewport.height+".");
    }
    assert.deepEqual(errors,[],"Uncaught runtime errors.");
    fs.writeFileSync(path.join(artifacts,"verification.json"),JSON.stringify({results,errors},null,2));
  } finally {
    if(client)await client.send("Browser.close").catch(()=>{});
    if(session){await waitForProcessExit(session.browserProcess);await removeBrowserProfile(session.profilePath);}
    await server.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
