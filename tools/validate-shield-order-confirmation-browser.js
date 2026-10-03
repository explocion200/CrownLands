"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const artifacts = path.resolve(__dirname, "../release-artifacts/shield-order-confirmation");

(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  const server = createMapBenchmarkServer(), address = await server.listen();
  let browser, client;
  const errors = [], results = [];
  try {
    const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
    assert(executable, "Set CHROME_PATH to Chromium.");
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all(["Page.enable", "Runtime.enable", "Network.enable"].map(method => client.send(method)));
    await client.send("Network.setBlockedURLs", { urls: ["https://*", "http://*.googleapis.com/*"] });
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const ready = async expression => {
      for (let i = 0; i < 160; i++) { if (await evaluate(expression)) return; await delay(100); }
      throw Error("Timed out: " + expression);
    };
    const cancel = () => evaluate('document.querySelector("#peaceShieldOrderDialog footer [data-shield-cancel]").click()');
    const proceed = () => evaluate('document.querySelector("#peaceShieldOrderDialog [data-shield-continue]").click()');
    await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
    await ready('window.__CROWNLANDS_BENCHMARK__?.getStatus().status === "ready"');
    await evaluate(`(() => {
      modal.close();clearSelection(false);setAnimationModePreference('off');
      const source=playerCities().find(c=>c.troops>0),target=state.cities.find(c=>c.owner==='neutral'&&!isStronghold(c)&&!isProtectedMainCity(c));
      window.shieldQa={source:{...source,name:'Oakshield'},target:{...target,name:'Ravenstone'},sent:[],rallies:0};
      const q=shieldQa, lookupCity=cityById, lookupTarget=getArmyTargetById;
      cityById=id=>id===q.source.id?q.source:id===q.target.id?q.target:lookupCity(id);
      getArmyTargetById=id=>id===q.target.id?q.target:lookupTarget(id);
      getTroopSliderSendLimit=s=>s.troops;
      getPeaceShieldAttackBlockReason=()=>'';getClanReinforcementBlockReason=()=>'';
      isClanAllyCity=c=>c?.id===q.target.id&&q.kind==='reinforce';
      supportsAuthoritativeArmyRoutes=()=>false;
      launchAttack=(...args)=>{q.sent.push(args);return false;};
      submitClanRallyTroopOrder=()=>{q.rallies++;return false;};
      q.open=(kind='attack',owner='enemy',shield=true)=>{
        document.querySelector('#peaceShieldOrderDialog footer [data-shield-cancel]')?.click();
        clearSelection(false);q.sent=[];q.kind=kind;q.source.troops=5000;
        Object.assign(q.target,{owner,ownerKind:owner==='neutral'?'neutral':'player',ownerUid:owner==='player'?getCurrentOnlineUid():'fixture-rival',kind:'city',campType:''});
        state.itemEffects.shieldExpiresAtMs=shield?Date.now()+7200000:0;
        q.shield=state.itemEffects.shieldExpiresAtMs;
        selectedSourceId=q.source.id;selectedTargetId=q.target.id;selectedTroopAmount=1003;sendMode=true;
        showTroopSliderModalWithRoute(q.source,q.target,{points:[{x:source.x,y:source.y},{x:target.x,y:target.y}],length:1000},{orderKind:kind});
      };
      q.send=()=>document.getElementById('troopSliderConfirm').click();
      q.edit=amount=>{const input=document.getElementById('troopExactAmount');input.value=String(amount);input.dispatchEvent(new Event('input',{bubbles:true}));};
    })()`);
    for (const [width,height] of [[1440,900],[844,390],[568,320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width,height,deviceScaleFactor:1,mobile:height<600 });
      await evaluate("shieldQa.open();shieldQa.send();shieldQa.send()");
      assert(await evaluate('document.querySelectorAll("#peaceShieldOrderDialog").length===1&&shieldQa.sent.length===0'));
      assert(await evaluate('document.activeElement.matches("footer [data-shield-cancel]")'), "Cancel must have initial focus");
      const layout=await evaluate(`(()=>{const d=document.getElementById('peaceShieldOrderDialog'),r=d.getBoundingClientRect();return {fits:r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,overflow:d.scrollWidth>d.clientWidth+1,buttons:[...d.querySelectorAll('footer button')].map(b=>{const r=b.getBoundingClientRect();return r.height>=44&&r.bottom<=innerHeight&&r.top>=0;}),text:d.innerText}})()`);
      assert(layout.fits&&!layout.overflow&&layout.buttons.every(Boolean),JSON.stringify(layout));
      assert(layout.text.includes('1,003')&&layout.text.includes('Ravenstone')&&layout.text.includes('Shield time remaining'));
      fs.writeFileSync(path.join(artifacts,`${width}-warning.png`),Buffer.from((await client.send("Page.captureScreenshot",{format:"png"})).data,"base64"));
      await cancel();
      assert(await evaluate('!document.getElementById("peaceShieldOrderDialog")&&modal.open&&shieldQa.sent.length===0&&selectedTroopAmount===1003&&shieldQa.source.troops===5000&&state.itemEffects.shieldExpiresAtMs===shieldQa.shield'));
      await evaluate("shieldQa.send()");
      await client.send("Input.dispatchKeyEvent", { type:"keyDown",key:"Escape",windowsVirtualKeyCode:27 });
      await client.send("Input.dispatchKeyEvent", { type:"keyUp",key:"Escape",windowsVirtualKeyCode:27 });
      await ready('!document.getElementById("peaceShieldOrderDialog")');
      assert(await evaluate('modal.open&&shieldQa.sent.length===0&&state.itemEffects.shieldExpiresAtMs===shieldQa.shield'),JSON.stringify(await evaluate('({open:modal.open,sent:shieldQa.sent.length,shield:state.itemEffects.shieldExpiresAtMs,expected:shieldQa.shield})')));
      await evaluate("shieldQa.send()");
      await evaluate("(()=>{const button=document.querySelector('#peaceShieldOrderDialog [data-shield-continue]');button.click();button.click()})()");
      assert(await evaluate('shieldQa.sent.length===1&&shieldQa.sent[0][4]===1003'), "Continue must dispatch exactly once");
      results.push({width,height,cancel:true,escape:true,continueOnce:true,layout});
    }
    for (const [kind,owner,active,warning] of [
      ['attack','neutral',true,false],['transfer','player',true,false],['attack','enemy',false,false],
      ['reinforce','enemy',true,true],['rally_create','enemy',true,false],['rally_join','enemy',true,false],
    ]) {
      await evaluate(`shieldQa.open(${JSON.stringify(kind)},${JSON.stringify(owner)},${active});shieldQa.send()`);
      assert.equal(await evaluate('!!document.getElementById("peaceShieldOrderDialog")'),warning,kind);
      if(warning) {assert.equal(await evaluate('shieldQa.sent.length'),0);await cancel();}
      else if(!kind.startsWith('rally')) assert.equal(await evaluate('shieldQa.sent.length'),1);
    }
    assert.equal(await evaluate('shieldQa.rallies'),2);
    // Existing camp/Stronghold shield removal applies even while those objectives are neutral.
    for(const patch of [{campType:'gold'},{kind:'stronghold'}]) {
      await evaluate(`shieldQa.open('attack','neutral');Object.assign(shieldQa.target,${JSON.stringify(patch)});shieldQa.send()`);
      assert(await evaluate('!!document.getElementById("peaceShieldOrderDialog")&&shieldQa.sent.length===0'));
      await cancel();
    }
    await evaluate('shieldQa.open();shieldQa.send();shieldQa.source.troops=500');
    await proceed();
    assert.equal(await evaluate('shieldQa.sent.length'),0,'Reduced garrison must not send a stale troop count');
    await evaluate('shieldQa.open();shieldQa.send();shieldQa.source.owner="enemy"');
    await proceed();assert.equal(await evaluate('shieldQa.sent.length'),0,'Lost origin must not dispatch');
    await delay(100);
    await evaluate('shieldQa.source.owner="player";shieldQa.open();shieldQa.send();onlineSessionGeneration++');
    await proceed();assert.equal(await evaluate('shieldQa.sent.length'),0,'Session changes must cancel confirmation');
    await evaluate('shieldQa.open();shieldQa.send();modalBody.replaceChildren()');
    await proceed();assert.equal(await evaluate('shieldQa.sent.length'),0,'Replaced parent view must cancel confirmation');
    await evaluate('shieldQa.open();shieldQa.send();modal.close()');
    await ready('!document.getElementById("peaceShieldOrderDialog")');
    assert.equal(await evaluate('shieldQa.sent.length'),0);
    await evaluate('shieldQa.open();shieldQa.send();state.itemEffects.shieldExpiresAtMs+=60000');
    await proceed();
    assert(await evaluate('shieldQa.sent.length===0&&!!document.getElementById("peaceShieldOrderDialog")'),'A newly changed shield needs a fresh decision');
    await cancel();
    await evaluate('shieldQa.open();shieldQa.send();shieldQa.edit(1004)');
    await proceed();
    assert(await evaluate('shieldQa.sent.length===0&&document.getElementById("peaceShieldOrderDialog").innerText.includes("1,004")'),'Changed troop selection needs fresh confirmation');
    await proceed();assert.equal(await evaluate('shieldQa.sent[0][4]'),1004);
    await evaluate('shieldQa.open();shieldQa.send();state.itemEffects.shieldExpiresAtMs=Date.now()-1');
    await proceed();assert.equal(await evaluate('shieldQa.sent.length'),1,'An expired shield must not cause a confirmation loop');
    // The older percentage preview still exposes a dispatch button. Exercise
    // its real handler with deterministic forecast data, as for the slider.
    await evaluate(`shieldQa.open();selectedMarchPercent=0.25;
      calculateBattlePreview=()=>({path:[{x:0,y:0},{x:1,y:1}],success:true,send:1250,attackPower:1562,defensePower:100,travel:60,survivors:1100,minimumCaptureTroops:100});
      showAttackPreview(shieldQa.source,shieldQa.target);
      document.getElementById('confirmAttackBtn').click()`);
    assert(await evaluate('shieldQa.sent.length===0&&!!document.getElementById("peaceShieldOrderDialog")'));
    await cancel();assert(await evaluate('modal.open&&shieldQa.sent.length===0'));
    await evaluate("document.getElementById('confirmAttackBtn').click()");
    await proceed();assert.equal(await evaluate('shieldQa.sent.length'),1);
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(artifacts,'browser.json'),JSON.stringify({results,errors,cases:['shield policy','cancel','escape','double click','lost origin','reduced troops','session change','view change','parent close','changed shield','changed troops','expired shield']},null,2)+'\n');
    console.log('Shield confirmation passed: three viewport sizes, safe dismissal, exact one-send approval, harmless orders, rallies and stale-order guards.');
  } finally {
    if(client){await client.send("Browser.close").catch(()=>{});client.close();}
    if(browser){if(!await waitForProcessExit(browser.browserProcess)){browser.browserProcess.kill();await waitForProcessExit(browser.browserProcess);}await removeBrowserProfile(browser.profilePath);}
    await server.close();
  }
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
