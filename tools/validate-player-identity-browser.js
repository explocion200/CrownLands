"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Set CHROME_PATH to Chromium.");
  const server = createMapBenchmarkServer(), address = await server.listen();
  let session, client;
  try {
    session = await startBrowserSession(executable);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable"); await client.send("Runtime.enable");
    const evaluate = async expression => {
      const response = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
      return response.result.value;
    };
    const ready = async expression => {
      for (let attempt = 0; attempt < 200; attempt++) { if (await evaluate(expression)) return; await delay(100); }
      throw Error(`Timed out: ${expression}`);
    };
    for (const [label, width, height] of [["desktop", 1440, 900], ["mobile", 844, 390]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: label === "mobile" });
      await client.send("Page.navigate", { url: `${address.url}/__benchmark__/?scenario=A&visualMarches=0` });
      await ready('document.documentElement?.dataset.crownlandsBenchmarkReady === "true"');
      await evaluate(`(() => {
        window.requestAnimationFrame = () => 0;
        window.identityWrites = [];
        window.identityUid = 'identity-browser';
        const originalApi = getOnlineApi();
        window.identityServer = {playerName:'Saved Ruler',flag:PLAYER_FLAG_CONFIG.toStoredFlag({...state.flag,symbol:'lion'},identityUid),identityRevision:0};
        window.identityProfilePromise = new Promise((resolve,reject) => {window.resolveIdentityProfile=resolve;window.rejectIdentityProfile=reject;});
        window.identityApi = {...originalApi,isConfigured:()=>true,isSignedIn:()=>true,getUser:()=>({uid:identityUid}),
          loadPlayerProfile:()=>identityProfilePromise,loadGameSnapshot:async()=>({...identityServer,playerName:'Startup',flag:{...identityServer.flag,symbol:'oak-tree'},lastSeenAtMs:Date.now()+999999,resetGeneration:RESET_GENERATION}),
          loadPlayerGlobalStats:async()=>null,syncSkillPointSystem:undefined,
          savePlayerProfile:async p=>{identityWrites.push({kind:'profile',p});return true;},
          saveGameSnapshot:async p=>{identityWrites.push({kind:'snapshot',p});return true;},
          savePresence:async()=>true,syncPlayerIdentity:async()=>({ok:true}),
          repairMainCityAssignment:async()=>{throw Error('Synthetic map unavailable');},
          savePlayerIdentity:async(p,revision)=>{if(revision!==identityServer.identityRevision)throw Error('Synthetic conflict');identityServer={...identityServer,...p,identityRevision:revision+1};return identityServer;}
        };
        getOnlineApi=()=>identityApi;
        verifyRealmCompatibility=async()=>({});
        onlineWorldConnected=false;onlineProfileReady=null;
        window.identityEntry=setupOnlineWorld().then(()=>null,e=>e.message);
      })()`);
      await evaluate('queueOnlineSave(); flushOnlineSave(true)');
      assert.equal(await evaluate('identityWrites.length'), 0, "A delayed profile read allowed an auth/startup save.");
      await evaluate("rejectIdentityProfile(Error('Synthetic profile timeout'))");
      assert.match(await evaluate('identityEntry'), /saved profile could not be loaded/);
      assert.equal(await evaluate('identityWrites.length'), 0, "A failed login wrote to the profile.");

      await evaluate(`(() => {
        window.identityProfilePromise=Promise.resolve({...identityServer,uid:identityUid,resetGeneration:RESET_GENERATION,worldId:ONLINE_WORLD_ID,
          mainCityId:state.mainCityId,mainRegionId:getActiveOnlineRegionId(),lastSeenAtMs:1});
        window.identityEntry=setupOnlineWorld().then(()=>null,e=>e.message);
      })()`);
      await evaluate('identityEntry');
      assert.equal(await evaluate('state.playerName'), 'Saved Ruler', "A newer save slot replaced the loaded name.");
      assert.equal(await evaluate('state.flag.symbol'), 'lion', "A newer save slot replaced the loaded flag.");
      await evaluate(`(() => {
        onlineWorldConnected=true; markOnlineProfileReady();
        showProfileScreen(); beginProfileNameEdit(); profileNameInput.value='Chosen Ruler';
      })()`);
      await evaluate('saveProfileName()');
      assert.equal(await evaluate('state.playerName'), 'Chosen Ruler');
      assert.equal(await evaluate('identityServer.flag.symbol'), 'lion');
      await evaluate("showFlagEditor(); updateFlagDraft({symbol:'oak-tree'});");
      const bounds = await evaluate(`(() => {const r=flagSaveBtn.getBoundingClientRect();return {visible:r.width>0&&r.height>0&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,disabled:flagSaveBtn.disabled};})()`);
      assert(bounds.visible && !bounds.disabled, `${label}: Save Flag is not reachable.`);
      await evaluate('saveFlagEditor()');
      assert.equal(await evaluate('flagEditorSaveStatus.textContent'), 'Saved everywhere');
      assert.equal(await evaluate('identityServer.playerName'), 'Chosen Ruler');
      assert.equal(await evaluate('identityServer.flag.symbol'), 'oak-tree');
      assert.equal(await evaluate('state.identityRevision'), 2);
      const shot = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(__dirname, `../.codex_tmp_identity-${label}.png`), Buffer.from(shot.data, "base64"));
    }
    console.log("Player identity browser passed: delayed/failed login, stale snapshot and name/flag edits at desktop and landscape-mobile sizes.");
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (session) { if (!await waitForProcessExit(session.browserProcess)) { session.browserProcess.kill(); await waitForProcessExit(session.browserProcess); } await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
