"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const game = fs.readFileSync(path.join(__dirname, "../game.js"), "utf8");
const displayCode = game.slice(game.indexOf("let gameDisplayEntryRequested = false;"), game.indexOf("function button(label,"));
const installedCode = game.slice(game.indexOf("function isInstalledAppDisplayMode()"), game.indexOf("function updateInstallAppButton()"));
assert(displayCode && installedCode);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
function fixture({mobile = true, mode = "browser", ios = false, fullscreen = true, lock = true, rejectFullscreen = false, rejectLock = false, delayedFullscreen = null, delayedLock = null} = {}) {
  const calls = [], help = {textContent:""}, target = {};
  const control = {hidden:false,classList:{toggle(){}},setAttribute(){}};
  const document = {documentElement:target, fullscreenElement:null, visibilityState:"visible", getElementById:() => help,
    async exitFullscreen() { calls.push("exit"); this.fullscreenElement = null; }};
  if (fullscreen) target.requestFullscreen = async options => {
    assert.equal(options.navigationUI,"hide"); calls.push("fullscreen");
    if (delayedFullscreen) await delayedFullscreen.promise;
    if (rejectFullscreen) throw Error("Denied");
    document.fullscreenElement = target;
  };
  const orientation = lock ? {async lock(value) {
    assert.equal(value,"landscape"); calls.push("landscape");
    if (delayedLock) await delayedLock.promise;
    if (rejectLock) throw Error("Unsupported");
  }} : {};
  const context = vm.createContext({document, fullscreenButtons:[control],renderCrownlandsIcon:()=>"", window:{screen:{orientation}, navigator:{standalone:ios},
    matchMedia:query => ({matches:query === "(pointer: coarse)" ? mobile : query === `(display-mode: ${mode})`})},
    startFromInput:fresh => {calls.push("start:"+fresh);return "started";}, showToast:message => calls.push("toast:"+message)});
  vm.runInContext(displayCode + installedCode,context);
  return {calls,help,document,control,run:code => vm.runInContext(code,context)};
}
async function main() {
  const pending = deferred(), mobile = fixture({delayedFullscreen:pending});
  assert.equal(mobile.run("startGameFromGesture(false)"),"started");
  assert.deepEqual(mobile.calls,["fullscreen","start:false"],"Fullscreen must retain the original entry gesture, without blocking login.");
  pending.resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(mobile.calls,["fullscreen","start:false","landscape"]);
  await mobile.run("toggleFullscreen()");
  mobile.run("prepareGameDisplayForEntry()");
  assert.equal(mobile.document.fullscreenElement,null,"An explicit exit must not be undone by another gameplay gesture.");
  assert.equal(mobile.calls.filter(c => c === "fullscreen").length,1);
  await mobile.run("toggleFullscreen()");
  assert.equal(mobile.calls.filter(c => c === "fullscreen").length,2,"The fullscreen button must allow an explicit retry.");

  const desktop = fixture({mobile:false});
  desktop.run("startGameFromGesture(true)");
  assert.deepEqual(desktop.calls,["start:true"],"Normal desktop tabs must retain windowed play.");
  const installedDesktop = fixture({mobile:false,mode:"standalone"});
  installedDesktop.run("startGameFromGesture(false)");
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(installedDesktop.calls,["fullscreen","start:false"]);
  const installedMobile = fixture({mode:"fullscreen"});
  assert.equal(installedMobile.run("isInstalledAppDisplayMode()"),true);
  await installedMobile.run("enterGameFullscreen()");
  assert.deepEqual(installedMobile.calls,["landscape"],"Manifest fullscreen must not request duplicate fullscreen.");
  assert.equal(installedMobile.control.hidden,true,"Native installed fullscreen must not offer a nonfunctional DOM exit button.");
  assert.equal(mobile.control.hidden,false,"DOM fullscreen must keep its exit button.");

  const unsupported = fixture({ios:true,fullscreen:false,lock:false});
  assert.equal(unsupported.run("isInstalledAppDisplayMode()"),true);
  unsupported.run("startGameFromGesture(false)");
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(unsupported.calls,["start:false"]);
  assert.match(unsupported.help.textContent,/cannot rotate automatically/);
  const rejected = fixture({rejectFullscreen:true,rejectLock:true});
  rejected.run("startGameFromGesture(false)");
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(rejected.calls,["fullscreen","start:false","landscape"]);
  assert.match(rejected.help.textContent,/turn your device sideways/);

  const lockPending = deferred(), concurrent = fixture({delayedLock:lockPending});
  const a = concurrent.run("requestLandscapeOrientation()"), b = concurrent.run("requestLandscapeOrientation()");
  assert.deepEqual(concurrent.calls,["landscape"]);
  lockPending.resolve(); assert.equal(await a,true); assert.equal(await b,true);
  concurrent.document.visibilityState = "hidden";
  assert.equal(await concurrent.run("requestLandscapeOrientation()"),false);
  console.log("Game display passed: trusted entry ordering, mobile/installed desktop, unsupported and rejected APIs, lock coalescing, exit and retry.");
}
main().catch(error => {console.error(error);process.exitCode=1;});
