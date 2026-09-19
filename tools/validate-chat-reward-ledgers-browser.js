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
      assert(await evaluate(()=>document.getElementById("chatTranslateBtn").hidden),"A sample translation provider must never appear as a live service.");
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
          if(window.qaTranslationLimited)throw Object.assign(new Error("Monthly limit"),{details:{reason:"translation-monthly-limit"}});
          return {provider:"google",translations:payload.messageIds.map(id=>({id,text:'Hola <img src=x onerror="throw new Error(1)"> '+id}))};
        };
        window.qaChat.setTranslationLanguage("es");
        document.getElementById("chatTranslateBtn").click();
      });
      await wait(200);
      const translated=await evaluate(()=>({
        visible:!document.getElementById("chatTranslateBtn").hidden,
        attribution:[...document.querySelectorAll("#chatDialog .chat-google-attribution")].every(node=>!node.hidden&&node.querySelector("img").naturalWidth>0),
        translated:document.getElementById("chatMessageList").textContent.includes("Hola <img"),
        injectedImages:document.querySelectorAll("#chatMessageList img[src=x]").length,
        calls:window.qaTranslationCalls,
        layout:window.ledgerLayout(document.getElementById("chatDialog"),document.getElementById("chatSendBtn")),
      }));
      assert(translated.visible&&translated.attribution&&translated.translated&&!translated.injectedImages);
      assert(translated.calls.length>0&&translated.calls.every(call=>call.targetLanguage==="es"&&!Object.hasOwn(call,"text")));
      assert(translated.layout.footerVisible&&!translated.layout.horizontalOverflow,JSON.stringify({viewport,translated}));
      await screenshot("chat-google-translation-"+viewport.name);
      await evaluate(()=>window.qaChatListeners.global.onMessages([{id:"translate-incoming",senderUid:"other",senderDisplayName:"Other",text:"Fresh message",createdAtMs:Date.now(),status:"visible"}],{}));
      await wait(80);
      assert(await evaluate(()=>document.getElementById("chatMessageList").textContent.includes("Hola <img src=x onerror=\"throw new Error(1)\"> translate-incoming")),"Incoming messages must translate automatically.");
      await evaluate(()=>document.getElementById("chatTranslateBtn").click());
      assert(await evaluate(()=>document.getElementById("chatMessageList").textContent.includes("Fresh message")),"Show originals restores message text.");
      await evaluate(()=>{window.qaTranslationLimited=true;document.getElementById("chatTranslateBtn").click();});
      await wait(80);
      assert(await evaluate(()=>document.getElementById("chatTranslationStatus").textContent.includes("Monthly translation allowance used")),"Explain quota failures while preserving originals.");
      await evaluate(()=>{window.qaTranslationLimited=false;document.getElementById("chatTranslationRetry").click();});
      await wait(80);
      assert(await evaluate(()=>document.getElementById("chatMessageList").textContent.includes("Hola <img")),"Retry must recover translations.");
      await evaluate(()=>document.getElementById("chatTranslateBtn").click());
      results.push({screen:"chat",viewport:viewport.name,layout:{...chat,text:undefined},navigation,unread});
      await evaluate(()=>window.qaChat.dispose({resetSession:true}));
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
