"use strict";
// Exercise the real Bag and activation pipeline using synthetic server results.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const artifacts = path.resolve(__dirname, "../release-artifacts/shield-activation");

async function main() {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Set CHROME_PATH to Chromium.");
  fs.mkdirSync(artifacts, { recursive: true });
  const server = createMapBenchmarkServer(), address = await server.listen();
  let browser, client;
  const errors = [], layouts = [];
  try {
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
      for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await delay(100); }
      throw Error("Timed out: " + expression);
    };
    const use = () => evaluate('(()=>{const b=document.querySelector("[data-inventory-use]");b.focus();b.click();})()');
    const accept = () => evaluate('document.querySelector("#peaceShieldActivationDialog [data-shield-continue]").click()');
    const cancel = () => evaluate('document.querySelector("#peaceShieldActivationDialog footer [data-shield-cancel]").click()');
    const unchanged = async () => assert(await evaluate('qa.calls.length===0 && state.shopItems[ROYAL_PEACE_SHIELD_ITEM_ID]===2 && !getProjectedItemEffectExpiresAtMs(getShopItemById(ROYAL_PEACE_SHIELD_ITEM_ID)) && getInstantEconomyPendingActions().length===0'), "An unconfirmed item was consumed or queued");
    await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
    await ready('window.__CROWNLANDS_BENCHMARK__?.getStatus().status === "ready"');
    await evaluate(`(() => {
      modal.close(); clearSelection(false); setAnimationModePreference('off');
      window.qa={calls:[],cooldown:0,local:false,mode:'ok',refreshes:0};
      usesServerEconomyAuthority=()=>!qa.local;
      supportsInstantEconomyActionBatching=()=>false;
      getOffensiveShieldCooldownRemaining=()=>qa.cooldown;
      saveGame=()=>{};flushOnlineSave=async()=>true;syncPeaceShieldToAllOwnedCities=async()=>true;
      getOnlineApi=()=>({getUser:()=>({uid:'shield-fixture'}),activateInventoryItem:async({itemId,quantity})=>{
        qa.calls.push({itemId,quantity});
        if(qa.mode==='slow') await new Promise(resolve=>{qa.resolve=resolve;});
        if(qa.mode==='fail') throw Error('Synthetic activation rejection');
        qa.counts[itemId]-=quantity;qa.effects.shieldExpiresAtMs=Date.now()+ROYAL_PEACE_SHIELD_DURATION_MS;
        return {activatedQuantity:quantity,expiresAtMs:qa.effects.shieldExpiresAtMs,currentUser:{shopItems:{...qa.counts},itemEffects:{...qa.effects}}};
      }});
      refreshServerEconomy=async()=>{qa.refreshes++;applyServerEconomyResult({currentUser:{shopItems:{...qa.counts},itemEffects:{...qa.effects}}});return true;};
      refreshAllOwnedCities=async()=>{};
      qa.reset=()=>{
        document.querySelector('#peaceShieldActivationDialog footer [data-shield-cancel]')?.click();
        clearInstantEconomyActions();qa.calls=[];qa.cooldown=0;qa.local=false;qa.mode='ok';qa.refreshes=0;
        qa.counts={[ROYAL_PEACE_SHIELD_ITEM_ID]:2};qa.effects={shieldExpiresAtMs:0};
        state.shopItems={...qa.counts};state.itemEffects={...qa.effects};state.attacks=[];
        selectedInventoryCategory='all';selectedInventoryPage=0;selectedInventoryItemId=ROYAL_PEACE_SHIELD_ITEM_ID;selectedInventoryEntryKey=ROYAL_PEACE_SHIELD_ITEM_ID;
        showInventoryModal();
      };qa.reset();
    })()`);
    await ready('!!document.querySelector("[data-inventory-use]")');
    for (const [width,height] of [[1440,900],[844,390],[568,320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width,height,deviceScaleFactor:1,mobile:height<600 });
      await evaluate("qa.reset()"); await use(); await use(); await unchanged();
      assert.equal(await evaluate('document.querySelectorAll("#peaceShieldActivationDialog").length'),1);
      assert(await evaluate('document.activeElement.matches("footer [data-shield-cancel]")'));
      await evaluate('modal.dispatchEvent(new Event("close"))');
      assert(await evaluate('!!document.getElementById("peaceShieldActivationDialog")'), "Queued parent close must not dismiss a new confirmation");
      const layout = await evaluate(`(()=>{const d=document.getElementById('peaceShieldActivationDialog'),r=d.getBoundingClientRect();return {width:innerWidth,height:innerHeight,fits:r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,overflow:d.scrollWidth>d.clientWidth+1,buttons:[...d.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.top>=0&&r.bottom<=innerHeight;}),text:d.innerText};})()`);
      assert(layout.fits && !layout.overflow && layout.buttons.every(Boolean),JSON.stringify(layout));
      assert(layout.text.includes('12h') && layout.text.includes('fully repaired walls') && layout.text.includes('Activate Shield'));
      fs.writeFileSync(path.join(artifacts,`${width}-confirmation.png`),Buffer.from((await client.send("Page.captureScreenshot",{format:"png"})).data,"base64"));
      layouts.push(layout);
      await cancel(); await unchanged();
      assert(await evaluate('modal.open && document.activeElement.matches("[data-inventory-use]")'));
      await use();
      for (const type of ["keyDown","keyUp"]) await client.send("Input.dispatchKeyEvent",{type,key:"Escape",windowsVirtualKeyCode:27});
      await ready('!document.getElementById("peaceShieldActivationDialog")'); await unchanged();
      assert(await evaluate('modal.open'));
      await use();
      await evaluate(`(()=>{const b=document.querySelector('#peaceShieldActivationDialog [data-shield-continue]');b.click();b.click();useInventoryItem(ROYAL_PEACE_SHIELD_ITEM_ID);})()`);
      await ready('qa.calls.length===1 && getInstantEconomyPendingActions().length===0');
      assert(await evaluate('qa.calls[0].quantity===1 && state.shopItems[ROYAL_PEACE_SHIELD_ITEM_ID]===1 && getActivePeaceShieldExpiresAtMs()>Date.now()'));
    }
    for (const dismiss of ["document.querySelector('#peaceShieldActivationDialog header [data-shield-cancel]').click()", "document.getElementById('peaceShieldActivationDialog').click()", "document.getElementById('peaceShieldActivationDialog').close()", "modal.close()", "showShopModal()"] ) {
      await evaluate('qa.reset()'); await use(); await evaluate(dismiss);
      await ready('!document.getElementById("peaceShieldActivationDialog")'); await unchanged();
    }
    await evaluate('qa.reset()'); await use(); await evaluate('onlineSessionGeneration++'); await accept(); await unchanged();
    assert(await evaluate('!document.getElementById("peaceShieldActivationDialog")'));
    await evaluate('qa.reset()'); await use(); await evaluate('state={...state}'); await accept(); await unchanged();
    for (const change of ['state.shopItems[ROYAL_PEACE_SHIELD_ITEM_ID]=0','state.itemEffects.shieldExpiresAtMs=Date.now()+3600000','qa.cooldown=900000']) {
      await evaluate('qa.reset()'); await use(); await evaluate(change); await accept();
      assert(await evaluate('qa.calls.length===0 && getInstantEconomyPendingActions().length===0'),"Changed eligibility must prevent activation: "+change);
    }
    await evaluate('qa.reset();qa.cooldown=900000;useInventoryItem(ROYAL_PEACE_SHIELD_ITEM_ID)');
    assert(await evaluate('!document.getElementById("peaceShieldActivationDialog")')); await unchanged();
    await evaluate('qa.reset();qa.mode="slow"'); await use(); await accept();
    await ready('qa.calls.length===1');
    await evaluate('useInventoryItem(ROYAL_PEACE_SHIELD_ITEM_ID)');
    assert(await evaluate('!document.getElementById("peaceShieldActivationDialog") && getProjectedInventoryCount(ROYAL_PEACE_SHIELD_ITEM_ID)===1'));
    await evaluate('qa.resolve()'); await ready('getInstantEconomyPendingActions().length===0');
    await evaluate('qa.reset();qa.mode="fail"'); await use(); await accept();
    await ready('qa.refreshes===1 && getInstantEconomyPendingActions().length===0');
    assert(await evaluate('state.shopItems[ROYAL_PEACE_SHIELD_ITEM_ID]===2 && !getActivePeaceShieldExpiresAtMs()'));
    await evaluate('qa.mode="ok";selectedInventoryItemId=ROYAL_PEACE_SHIELD_ITEM_ID;selectedInventoryEntryKey=ROYAL_PEACE_SHIELD_ITEM_ID;showInventoryModal()');
    await use(); await accept(); await ready('qa.calls.length===2 && getInstantEconomyPendingActions().length===0');
    assert.equal(await evaluate('state.shopItems[ROYAL_PEACE_SHIELD_ITEM_ID]'),1);
    await evaluate('qa.reset();qa.local=true'); await use(); await unchanged(); await accept();
    assert(await evaluate('qa.calls.length===0 && state.shopItems[ROYAL_PEACE_SHIELD_ITEM_ID]===1 && getActivePeaceShieldExpiresAtMs()>Date.now()'));
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(artifacts,"browser.json"),JSON.stringify({layouts,errors,cases:["cancel","escape","close","backdrop","parent close","view change","session change","state change","inventory loss","active shield","cooldown","single activation","pending activation","failure and retry","local activation"]},null,2)+"\n");
    console.log("Shield activation confirmation passed: desktop/mobile layout, safe dismissal, eligibility rechecks, one-item activation, failure recovery and local/server pipelines.");
  } finally {
    if(client){await client.send("Browser.close").catch(()=>{});client.close();}
    if(browser){if(!await waitForProcessExit(browser.browserProcess)){browser.browserProcess.kill();await waitForProcessExit(browser.browserProcess);}await removeBrowserProfile(browser.profilePath);}
    await server.close();
  }
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
