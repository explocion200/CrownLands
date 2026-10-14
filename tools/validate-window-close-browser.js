"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const output = path.resolve(__dirname, "../release-artifacts/window-close");
const audit = process.env.CROWNLANDS_CLOSE_AUDIT === "1";

async function main() {
  const browser = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(browser, "Set CHROME_PATH to Chromium.");
  fs.mkdirSync(output, { recursive: true });
  const server = createMapBenchmarkServer(), address = await server.listen();
  let session, client;
  const results = [];
  try {
    session = await startBrowserSession(browser);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all([client.send("Page.enable"), client.send("Runtime.enable")]);
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    await client.send("Page.navigate", { url: `${address.url}/__benchmark__/?scenario=A&visualMarches=0` });
    for (let i = 0; i < 480 && !await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status === 'ready'"); i++) await wait(250);
    assert.equal(await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status"), "ready");
    await evaluate(`__CROWNLANDS_BENCHMARK__.closeModal();
      levelUpRewardQueue.length=0;activeLevelUpReward=null;pendingOfflineRewardsSummary=null;
      getIncomingAttacks=()=>[{key:'window-close-fixture',target:playerCities()[0],fromName:'Northern Watch',attackerName:'Opponent',ownerUid:'fixture-enemy',remaining:900,troops:1000}];
      toast.classList.remove('visible');`);
    await evaluate(`new Promise(resolve=>{if(ensureOptionalUiScripts('battle-report',modalBody,resolve))resolve();})`);
    await evaluate(`new Promise(resolve=>{if(ensureOptionalUiStyle('battle-report',modalBody,resolve))resolve();})`);
    await evaluate(`new Promise(resolve=>{if(ensureOptionalUiScripts('estate-economy',modalBody,resolve))resolve();})`);
    await evaluate(`new Promise(resolve=>{if(ensureOptionalUiStyle('estate-economy',modalBody,resolve))resolve();})`);
    for (const sample of ['quests-ledger/samples.js','achievements-ledger/samples.js'])
      await evaluate(fs.readFileSync(path.resolve(__dirname,'../docs/visual-qa',sample),'utf8'));
    const daily = JSON.parse(fs.readFileSync(path.resolve(__dirname,'../docs/visual-qa/daily-login-cycle/runtime-sample.json'),'utf8'));
    await evaluate(`dailyLoginRewardStatus=normalizeDailyLoginRewardStatus(${JSON.stringify(daily)});
      dailyMissionState=normalizeDailyMissionState(QuestReviewSamples.standard);
      seasonalAchievementState=normalizeSeasonalAchievementState({...AchievementReviewSamples.mixed,seasonEndsAtMs:Date.now()+86400000},Date.now());
      dailyLoginRewardStatusLoading=false;dailyMissionStatusLoading=false;seasonalAchievementStatusLoading=false;
      // This matrix opens rewards explicitly; do not auto-open them after City closes.
      const dailyAutoOpenKey=getDailyLoginRewardAutoOpenKey();if(dailyAutoOpenKey)localStorage.setItem(dailyAutoOpenKey,'1');`);
    const estate = require('./guild-production-preview').fixture().snapshot();
    await evaluate(`window.closeEstateSnapshot=${JSON.stringify(estate)};
      window.closeEconomy=CrownlandsEstateEconomy.create({scope:()=>'close-ui',api:()=>({getEstateState:async()=>structuredClone(closeEstateSnapshot)}),visible:()=>true,gold:()=>closeEstateSnapshot.gold,gear:CROWNLANDS_COMMON_GEAR});
      CrownlandsStaminaUI.sync({uid:'close-ui',api:{getStaminaState:async()=>({state:{version:1,value:70,recoveredAtMs:Date.now(),revision:1,paidDay:'',serverNowMs:Date.now()},crowns:120,walletRevision:1,huntingEnabled:true})}});
      // The offline benchmark's HUD would otherwise sign out this synthetic session.
      window.CrownlandsStaminaUI=Object.freeze({...CrownlandsStaminaUI,sync:()=>{}});
      window.closePaymentsHost=document.createElement('div');closePaymentsHost.hidden=true;document.body.append(closePaymentsHost);
      CrownlandsCrownPaymentsUI.mount(closePaymentsHost,{uid:'close-ui',api:{getCrownPaymentCatalog:async()=>({enabled:true,mode:'test',packs:[{id:'fixture',crowns:1000,amountMinor:499,currency:'usd'}]})}});
      modalBody.replaceChildren();`);
    const windows = [
      ["city", "showCityInfoModal(playerCities()[0].id)"],
      ["cities", "showCityListModal()"],
      ["shop", "showShopModal()"],
      ["bag", "showInventoryModal()"],
      ["help", "showHelpModal()", "#closeHelp"],
      ["reports", "showLogModal()", "[data-reports-close]"],
      ["incoming", "showIncomingAttacksModal()", ".close-button"],
      ...["marches", "rallies", "reinforcements", "camps", "strongholds"].map(tab => [tab, `showOutgoingAttacksModal();activeOperationsTab='${tab}';renderOutgoingAttacksModalContent()`, ".close-button"]),
      ["leaderboard", "showLeaderboardModal()"],
      ["maps", "showIslandSwitcherModal()"],
      ["daily", "showDailyLoginRewardsModal({skipRefresh:true})"],
      ["quests", "showDailyLoginRewardsModal({initialTab:'quests',skipRefresh:true})"],
      ["achievements", "showDailyLoginRewardsModal({initialTab:'achievements',skipRefresh:true})"],
      ["castle", "openInnerCastle(getMainCityReference().id)"],
      ...["treasury", "barracks", "gatehouse", "royal-stables"].map(building=>[building, `openInnerCastle(getMainCityReference().id);renderCommonGearBuilding('${building}')`]),
      ["public-profile", "showPublicPlayerProfile(getCurrentOnlineUid())"],
      ["profile", "showProfileScreen()", "#profileCloseBtn", "#profileScreen"],
      ["skills", "showProfileScreen();showProfileSkills()", "#profileCloseBtn", "#profileScreen"],
      ["settings", "showProfileScreen();showProfileSettings()", "#profileCloseBtn", "#profileScreen"],
      ["clan", "showProfileScreen();showProfileClan()", "#profileCloseBtn", "#profileScreen"],
      ["skins", "showProfileScreen();showProfileSkins()", "#profileCloseBtn", "#profileScreen"],
      ["flag", "showProfileScreen();showFlagEditor()", "#profileCloseBtn", "#profileScreen"],
      ["chat", "chatDialog.showModal()", "#chatCloseBtn", "#chatDialog"],
      ["production", "showProfileScreen();document.getElementById('profileGoldProductionBtn').click()", "button", "#profileProductionDialog"],
      ["shield-activation", "showInventoryModal();confirmPeaceShieldActivation({id:'royal-peace-shield'},null,()=>{throw Error('Close approved activation')})", "header button", "#peaceShieldActivationDialog"],
      ["email", "document.getElementById('emailAuthDialog').showModal()", "#emailAuthBackBtn", "#emailAuthDialog"],
      ["stamina", "CrownlandsStaminaUI.open()", "[data-stamina-close]", ".stamina-panel"],
      ["checkout", "closePaymentsHost.querySelector('button').click()", "[data-crown-close]", ".crown-payments-dialog"],
      ["battle-detail", "modalBody.innerHTML=CrownlandsBattleReportUI.loading({type:'attack',cityName:'The Northern Watch',createdAtMs:Date.now()},{label:'Victory'});CrownlandsBattleReportUI.mount(modal,modalBody,closeModalBtn);modal.showModal()", "[data-detail-close]"],
      ["scout", "modalBody.innerHTML=CrownlandsScoutReportUI.renderAttempt({type:'scout',cityName:'The Northern Watch',cityLevel:10,createdAtMs:Date.now()},{label:'Failed'});CrownlandsScoutReportUI.mount(modal,modalBody,closeModalBtn);modal.showModal()", "[data-scout-close]"],
      ...Object.keys(estate.estate.levels).map(key=>['estate-'+key,`closeEconomy.building('${key}')`,['guild-master','alehouse'].includes(key)?'.guild-close':'header [data-economy-action="close"]',['guild-master','alehouse'].includes(key)?'.guild-window[open]':'.estate-economy-dialog[open]']),
      ...['members','contracts','infirmary','training','archive','improvements'].map(tab=>['guild-'+tab,`closeEconomy.building('guild-master');document.querySelector('.guild-window[open] [data-guild="tab"][data-id="${tab}"]').click()`,'.guild-close','.guild-window[open]']),
    ];
    for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 568, height: 320 }]) {
      await client.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1, mobile: false });
      for (const [name, open, selector = "#closeModalBtn", root = "#modal"] of windows) {
        if (process.env.CROWNLANDS_CLOSE_FILTER && !name.match(process.env.CROWNLANDS_CLOSE_FILTER)) continue;
        await client.send("Emulation.setTouchEmulationEnabled",{enabled:false});
        await client.send("Input.dispatchMouseEvent",{type:"mouseMoved",x:0,y:0});
        await evaluate(open);
        for (let i = 0; i < 600 && await evaluate('!!document.querySelector(".optional-ui-loading")'); i++) await wait(100);
        await wait(250);
        assert(await evaluate(`!!document.querySelector(${JSON.stringify(root)})`),`${name} at ${viewport.width}: missing ${root}`);
        const status = await evaluate(`(() => {
          const root = document.querySelector(${JSON.stringify(root)}), button = root.querySelector(${JSON.stringify(selector)});
          if (!button) return {missing:true};
          for (const animation of root.getAnimations({subtree:true})) if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish();
          const r=button.getBoundingClientRect(),frame=root.getBoundingClientRect(),s=getComputedStyle(button),icon=getComputedStyle(button,'::before');
          const visible=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.visibility!=='hidden'&&s.display!=='none'&&r.width>0&&r.height>0;};
          const overlaps=[...root.querySelectorAll('button,h1,h2,[role="tab"]')].filter(el=>el!==button&&!el.contains(button)&&visible(el)).filter(el=>{
            let rects=[el.getBoundingClientRect()];
            if(el.matches('h1,h2')) { const range=document.createRange();range.selectNodeContents(el);rects=[...range.getClientRects()]; }
            return rects.some(b=>Math.min(b.right,r.right)-Math.max(b.left,r.left)>1&&Math.min(b.bottom,r.bottom)-Math.max(b.top,r.top)>1);
          }).map(el=>el.id||el.textContent.trim().slice(0,50));
          const header=[...root.querySelectorAll('.window-header,.profile-screen-header,.rs-shop-header,.ib-bag-header,.cll-header,.tg-header,.estate-header,.chat-header,.email-auth-header,.daily-header,.quest-header,.achievement-header,#modalTitle')].find(visible)||root.querySelector(':scope > header');
          const rgb=value=>(value.match(/[\\d.]+/g)||[]).map(Number);
          const luminance=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
          const lowContrast=header?[...header.querySelectorAll('h1,h2,h3,p,small,span,strong,b,button')].filter(el=>visible(el)&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).flatMap(el=>{
            const s=getComputedStyle(el);if(parseFloat(s.fontSize)<1||el.closest(':disabled,[aria-disabled="true"]'))return [];
            let parent=el,bg=[];while(parent){bg=rgb(getComputedStyle(parent).backgroundColor);if(bg.length===3||bg[3]===1)break;parent=parent.parentElement;}
            if(bg.length<3)return [];const l=[luminance(rgb(s.color)),luminance(bg)].sort((a,b)=>b-a),ratio=(l[0]+.05)/(l[1]+.05);
            return ratio<4.5?[{text:el.textContent.trim().slice(0,50),ratio:Math.round(ratio*100)/100,color:s.color}]:[];
          }):[];
          return {lowContrast,header:header?{background:getComputedStyle(header).backgroundColor,color:getComputedStyle(header).color}:null,rect:r.toJSON(),frame:frame.toJSON(),visible:visible(button),hit:button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),overlaps,
            background:s.backgroundColor,image:s.backgroundImage,border:parseFloat(s.borderTopWidth)+parseFloat(s.borderRightWidth)+parseFloat(s.borderBottomWidth)+parseFloat(s.borderLeftWidth),shadow:s.boxShadow,color:s.color,
            icon:icon.maskImage,iconWidth:icon.width,iconHeight:icon.height,label:button.getAttribute('aria-label'),position:s.position};
        })()`);
        const issues=[];
        if (!status.visible || !status.hit) issues.push("unreachable");
        if (status.rect?.width < 44 || status.rect?.height < 44) issues.push("small target");
        if (!status.label) issues.push("missing accessible name");
        if (status.rect && (status.rect.left < 0 || status.rect.top < 0 || status.rect.right > viewport.width || status.rect.bottom > viewport.height)) issues.push("outside viewport");
        if (status.rect && (status.rect.left < status.frame.left-1 || status.rect.top < status.frame.top-1 || status.rect.right > status.frame.right+1 || status.rect.bottom > status.frame.bottom+1)) issues.push("outside window");
        if (status.overlaps?.length) issues.push("overlap");
        if (status.background !== "rgb(114, 54, 58)" || status.image !== "none" || status.border !== 4 || status.shadow !== "none") issues.push("incorrect close frame");
        if (status.color !== "rgb(244, 230, 197)") issues.push("incorrect close ink");
        if (status.header?.background !== "rgb(114, 54, 58)") issues.push("incorrect header theme: "+JSON.stringify(status.header));
        if (status.lowContrast.length) issues.push("header text contrast: "+JSON.stringify(status.lowContrast));
        if (!status.icon?.startsWith('url("data:image/svg+xml')) issues.push("inconsistent X");
        if (status.iconWidth!=="20px" || status.iconHeight!=="20px") issues.push("inconsistent icon size");
        results.push({name,viewport,status,issues});
        await evaluate('document.activeElement?.blur()');
        const shot = await client.send("Page.captureScreenshot", {format:"png"});
        fs.writeFileSync(path.join(output,`${audit?'before-':''}${name}-${viewport.width}.png`),Buffer.from(shot.data,"base64"));
        if (status.hit) {
          const point={x:status.rect.x+status.rect.width/2,y:status.rect.y+status.rect.height/2};
          // Start inside this window, then send a non-activating keyboard event.
          // Tab can leave the page for browser chrome in a one-control dialog;
          // that browser behavior must not be confused with a missing focus ring.
          await evaluate(`document.querySelector(${JSON.stringify(root)}).querySelector(${JSON.stringify(selector)}).focus({preventScroll:true})`);
          await client.send("Input.dispatchKeyEvent",{type:"keyDown",key:"ArrowRight",code:"ArrowRight",windowsVirtualKeyCode:39});
          await client.send("Input.dispatchKeyEvent",{type:"keyUp",key:"ArrowRight",code:"ArrowRight",windowsVirtualKeyCode:39});
          const focused=await evaluate(`(() => {
            const button=document.querySelector(${JSON.stringify(root)}).querySelector(${JSON.stringify(selector)});
            const s=getComputedStyle(button);
            return {active:document.activeElement===button,visible:button.matches(':focus-visible'),tabbable:button.tabIndex>=0&&!button.disabled,outline:parseFloat(s.outlineWidth),style:s.outlineStyle};
          })()`);
          if (!focused.active || !focused.visible || !focused.tabbable || focused.outline<2 || focused.style==='none') issues.push("missing keyboard focus: "+JSON.stringify(focused));
          await client.send("Input.dispatchMouseEvent",{type:"mouseMoved",...point});
          const hover = await evaluate(`(() => {const s=getComputedStyle(document.querySelector(${JSON.stringify(root)}).querySelector(${JSON.stringify(selector)}));return [s.backgroundColor,s.backgroundImage,s.boxShadow];})()`);
          if (hover.join('|')!=="rgb(84, 39, 40)|none|none") issues.push("incorrect close hover: "+hover.join('|'));
          if (viewport.width < 1000) {
            await client.send("Emulation.setTouchEmulationEnabled",{enabled:true});
            await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{...point,id:1}]});
            await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
          } else {
            await client.send("Input.dispatchMouseEvent",{type:"mousePressed",...point,button:"left",clickCount:1});
            await client.send("Input.dispatchMouseEvent",{type:"mouseReleased",...point,button:"left",clickCount:1});
          }
        }
        await wait(100);
        const closed = await evaluate(["treasury","barracks","gatehouse","royal-stables"].includes(name)
          ? "modal.open && !!innerCastleEstateView && !modal.dataset.commonGearBuildingId"
          : root==="#profileScreen" ? "!profileScreen.classList.contains('open')" : `!document.querySelector('${root}')?.open`);
        if (!closed) issues.push("did not close");
        await evaluate("document.querySelectorAll('dialog[open]').forEach(d=>d.close());profileScreen.classList.remove('open')");
        await wait(50);
      }
    }
    await evaluate("showCityListModal()");
    for (let i = 0; i < 600 && await evaluate('!!modalBody.querySelector(".optional-ui-loading")'); i++) await wait(100);
    await wait(250);
    await evaluate("closeModalBtn.focus()");
    await client.send("Input.dispatchKeyEvent",{type:"keyDown",key:"Enter",code:"Enter",windowsVirtualKeyCode:13,text:"\r"});
    await client.send("Input.dispatchKeyEvent",{type:"keyUp",key:"Enter",code:"Enter",windowsVirtualKeyCode:13});
    assert.equal(await evaluate("modal.open"),false,"Keyboard activation must still close the window: "+JSON.stringify(await evaluate("({active:document.activeElement?.outerHTML.slice(0,200),classes:modal.className,dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>d.className)})")));
    fs.writeFileSync(path.join(output,`${audit?'before-':''}results.json`),JSON.stringify(results,null,2));
    const failed=results.filter(r=>r.issues.length).map(({name,viewport,issues,status})=>({name,width:viewport.width,issues,overlaps:status.overlaps}));
    console.log(JSON.stringify(failed,null,2));
    if (!audit) assert.equal(failed.length,0,"Window close controls failed; inspect release-artifacts/window-close/results.json.");
    console.log(`Reviewed ${results.length} window/viewport combinations.`);
  } finally {
    if (client) await client.send("Browser.close").catch(()=>{});
    if (session) { await waitForProcessExit(session.browserProcess); await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
