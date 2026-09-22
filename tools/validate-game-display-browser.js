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
  assert(executable,"Set CHROME_PATH to Chromium.");
  const server = createMapBenchmarkServer(), address = await server.listen();
  let session, client;
  try {
    session = await startBrowserSession(executable);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable"); await client.send("Runtime.enable");
    const evaluate = async expression => {
      const response = await client.send("Runtime.evaluate", {expression, awaitPromise:true, returnByValue:true, userGesture:true});
      if (response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
      return response.result.value;
    };
    const ready = async expression => {
      for (let i=0;i<200;i++) { if (await evaluate(expression)) return; await delay(100); }
      throw Error(`Timed out: ${expression}`);
    };
    const viewport = async (width,height,mobile) => {
      await client.send("Emulation.setDeviceMetricsOverride", {width,height,deviceScaleFactor:1,mobile});
      await client.send("Emulation.setTouchEmulationEnabled", {enabled:mobile,maxTouchPoints:5});
      await delay(100);
    };
    const buttonBounds = id => evaluate(`(() => {const b=document.getElementById(${JSON.stringify(id)}),r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,visible:r.width>0&&r.height>0&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,reachable:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===b};})()`);
    const capture = async name => {
      const shot=await client.send("Page.captureScreenshot",{format:"png"});
      fs.writeFileSync(path.join(__dirname,`../.codex_tmp_display-${name}.png`),Buffer.from(shot.data,"base64"));
    };
    await viewport(1440,900,false);
    await client.send("Page.navigate",{url:`${address.url}/__benchmark__/?scenario=A&visualMarches=0`});
    await ready('document.documentElement?.dataset.crownlandsBenchmarkReady === "true"');
    assert.equal(await evaluate("isMobileGameDisplay()"),false);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.rotate-warning')).display"),"none");
    await evaluate("document.getElementById('fullscreenBtn').click()");
    await ready("document.fullscreenElement === document.documentElement");
    assert.equal(await evaluate("document.getElementById('fullscreenBtn').getAttribute('aria-label')"),"Exit fullscreen");
    await capture("desktop-fullscreen");
    await evaluate("document.getElementById('fullscreenBtn').click()");
    await ready("!document.fullscreenElement");
    assert.equal(await evaluate("document.getElementById('fullscreenBtn').getAttribute('aria-label')"),"Enter fullscreen");
    await evaluate(`(() => {
      window.originalDisplayMatchMedia=window.matchMedia;
      window.matchMedia=query=>query==='(display-mode: fullscreen)'?{matches:true}:originalDisplayMatchMedia(query);
      document.querySelector('.resource-bar').classList.add('has-home-return');
      window.dispatchEvent(new Event('crownlands:ui-layout-refresh'));
      updateFullscreenButton();
    })()`);
    const legacyControl = await buttonBounds("fullscreenBtn");
    assert.equal(legacyControl.reachable,true,`Older fullscreen installations must retain reachable help beside Home: ${JSON.stringify(legacyControl)}`);
    assert.equal(await evaluate("document.getElementById('fullscreenBtn').getAttribute('aria-label')"),"Fullscreen help");
    await evaluate("window.matchMedia=originalDisplayMatchMedia;document.querySelector('.resource-bar').classList.remove('has-home-return');window.dispatchEvent(new Event('crownlands:ui-layout-refresh'));updateFullscreenButton()");

    await viewport(390,844,true);
    assert.equal(await evaluate("isMobileGameDisplay()"),true);
    await evaluate(`(() => {
      window.displayAttempts=[];
      document.documentElement.requestFullscreen=async()=>{displayAttempts.push('fullscreen');throw new DOMException('Synthetic refusal','NotAllowedError');};
      screen.orientation.lock=async()=>{displayAttempts.push('landscape');throw new DOMException('Synthetic unsupported lock','NotSupportedError');};
      setupScreen.classList.add('visible');
    })()`);
    const action = await buttonBounds("landscapeDisplayBtn");
    assert(action.visible && action.reachable,"Portrait fallback must be visible and clickable above the login screen.");
    await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:action.x,y:action.y}]});
    await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await ready("document.getElementById('landscapeDisplayHelp').textContent.includes('cannot rotate automatically')");
    assert.deepEqual(await evaluate("displayAttempts"),["fullscreen","landscape"]);
    assert.equal(await evaluate("document.querySelector('.rotate-warning').getAttribute('aria-hidden')"),null);
    await capture("portrait-fallback");

    await viewport(844,390,true);
    await evaluate("setupScreen.classList.remove('visible')");
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.rotate-warning')).display"),"none");
    const control = await buttonBounds("fullscreenBtn");
    assert(control.visible && control.reachable,"Landscape fullscreen retry must remain reachable.");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight"),true,"The landscape shell must fit the viewport.");
    await capture("landscape");
    // A failed/finished launch attempt must not reopen fullscreen on later map interactions.
    await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:422,y:190}]});
    await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await delay(100);
    assert.deepEqual(await evaluate("displayAttempts"),["fullscreen","landscape"]);
    // Returning automatic entry may try once on the first gameplay gesture.
    await evaluate("gameDisplayEntryRequested=false;displayAttempts=[]");
    await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:422,y:200}]});
    await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await ready("displayAttempts.length === 2");
    assert.deepEqual(await evaluate("displayAttempts"),["fullscreen","landscape"]);
    console.log("Game display browser passed: desktop fullscreen/exit, mobile portrait refusal fallback, landscape viewport and one-time automatic-entry gesture.");
  } finally {
    if(client){await client.send("Browser.close").catch(()=>{});client.close();}
    if(session){if(!await waitForProcessExit(session.browserProcess)){session.browserProcess.kill();await waitForProcessExit(session.browserProcess);}await removeBrowserProfile(session.profilePath);}
    await server.close();
  }
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
