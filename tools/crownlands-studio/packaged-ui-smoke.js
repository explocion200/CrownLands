"use strict";

const assert = require("node:assert/strict");

const port = Number(process.argv.find(argument => argument.startsWith("--port="))?.split("=")[1] || 9333);
const save = process.argv.includes("--save");
let nextId = 0;
let activeSocket = null;
const pending = new Map();

async function main() {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find(candidate => candidate.type === "page" && /Crownlands Studio/.test(candidate.title));
  assert.ok(target?.webSocketDebuggerUrl, "Packaged Crownlands Studio CDP target was not found.");

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  activeSocket = socket;
  socket.onmessage = event => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  };
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error("Could not connect to packaged Studio debugging target."));
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const response = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result?.value;
  };

  await send("Runtime.enable");
  const result = await evaluate(`(async () => {
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const button = label => [...document.querySelectorAll("button")].find(node => node.textContent.trim() === label || node.textContent.trim().startsWith(label));
    const screenPreset = id => document.querySelector('[data-preview-target="screen"][data-preview-preset="' + id + '"]');
    const change = (node, value) => { node.value = value; node.dispatchEvent(new Event("input", { bubbles: true })); };
    button("UI Studio").click();
    await delay(80);
    button("Screens").click();
    screenPreset("phone").click();
    button("Inspect UI").click();
    await delay(120);
    const frame = document.querySelector("#screenPreviewFrame");
    const frameDocument = frame.contentDocument;
    frameDocument.querySelector('[data-ui-element-id="close-button"]').click();
    await delay(80);
    const width = document.querySelector('[data-ui-global-property="width"]');
    const top = document.querySelector("#uiPositionTop");
    change(width, "44");
    change(top, "6");
    const pendingAfterCloseEdits = document.querySelector("#uiPendingCount").textContent;
    const liveCloseWidth = frameDocument.defaultView.getComputedStyle(frameDocument.querySelector('[data-ui-element-id="close-button"]')).width;
    const sharedCloseWidths = [...frameDocument.querySelectorAll('[data-ui-component="close-button"]')].map(node => frameDocument.defaultView.getComputedStyle(node).width);
    const profileCloseTop = frameDocument.defaultView.getComputedStyle(frameDocument.querySelector('[data-ui-screen="player-profile"] [data-ui-element-id="close-button"]')).top;
    const reportsCloseTop = frameDocument.defaultView.getComputedStyle(frameDocument.querySelector('[data-ui-screen="reports"] [data-ui-element-id="close-button"]')).top;
    screenPreset("smallPhone").click();
    const smallViewport = [frame.style.width, frame.style.height];
    screenPreset("phone").click();
    button("Compare Viewports").click();
    const compareViewports = [...document.querySelectorAll("[data-compare-preset]")].map(node => [node.dataset.comparePreset, node.style.width, node.style.height]);
    button("Compare Viewports").click();
    document.querySelector("#uiUndoBtn").click();
    document.querySelector("#uiUndoBtn").click();
    const widthAfterUndo = width.value;
    document.querySelector("#uiRedoBtn").click();
    document.querySelector("#uiRedoBtn").click();
    const widthAfterRedo = width.value;

    frameDocument.querySelector('[data-ui-element-id="level-text"]').click();
    await delay(40);
    const textColor = document.querySelector('[data-ui-property="color"]');
    change(textColor, "#d6c6a2");
    const lowContrast = document.querySelector("#uiContrastStatus").textContent;
    change(textColor, "#34241b");
    const passingContrast = document.querySelector("#uiContrastStatus").textContent;
    document.querySelector("#uiRunQaBtn").click();
    const levelFinding = [...document.querySelectorAll("#uiQaResults article")].find(article => article.textContent.includes("Level 38"));
    levelFinding?.querySelector("button")?.click();
    await delay(60);

    let saveResult = null;
    if (${save ? "true" : "false"}) {
      saveResult = await window.CrownlandsUIInspector.save({ confirm: false });
      await delay(120);
    }
    const sourceStatus = await window.crownlandsDesktop.sourceControl.status();
    const diff = saveResult ? await window.crownlandsDesktop.sourceControl.diff(["ui-studio-config.json"]) : { text: "" };
    return {
      title: document.title,
      desktopBridge: window.crownlandsDesktop.isDesktop,
      branch: sourceStatus.branch,
      dirty: sourceStatus.dirty,
      pendingAfterCloseEdits,
      liveCloseWidth,
      sharedCloseCount: sharedCloseWidths.length,
      allSharedCloseWidthsUpdated: sharedCloseWidths.every(value => value === "44px"),
      profileCloseTop,
      reportsCloseTop,
      smallViewport,
      compareViewports,
      widthAfterUndo,
      widthAfterRedo,
      lowContrast,
      passingContrast,
      qaBreadcrumb: document.querySelector("#uiBreadcrumb").textContent,
      saveStatus: document.querySelector("#uiSaveStatus").textContent,
      saved: Boolean(saveResult),
      validationOk: saveResult?.validation?.ok ?? null,
      changedFiles: saveResult?.changedFiles || [],
      diffHasConfig: diff.text.includes("ui-studio-config.json") || diff.text.includes('"width": 44'),
      sourceMessage: document.querySelector("#uiGitDirtyNotice").textContent,
    };
  })()`);

  assert.equal(result.desktopBridge, true);
  assert.equal(result.branch, "codex/crownlands-studio-phase-2a");
  assert.equal(result.pendingAfterCloseEdits, "2");
  assert.equal(result.liveCloseWidth, "44px");
  assert.ok(result.sharedCloseCount >= 12);
  assert.equal(result.allSharedCloseWidthsUpdated, true);
  assert.notEqual(result.profileCloseTop, result.reportsCloseTop);
  assert.deepEqual(result.smallViewport, ["667px", "375px"]);
  assert.deepEqual(result.compareViewports, [["smallPhone", "667px", "375px"], ["phone", "844px", "390px"], ["desktop", "1440px", "900px"]]);
  assert.equal(result.widthAfterUndo, "40");
  assert.equal(result.widthAfterRedo, "44");
  assert.match(result.lowContrast, /LOW CONTRAST/);
  assert.match(result.passingContrast, /PASS/);
  assert.match(result.qaBreadcrumb, /Level/);
  if (save) {
    assert.equal(result.saved, true);
    assert.equal(result.validationOk, true);
    assert.deepEqual(result.changedFiles, ["ui-studio-config.json"]);
    assert.equal(result.diffHasConfig, true);
    assert.match(result.saveStatus, /Saved/);
  }
  socket.close();
  activeSocket = null;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch(error => {
  activeSocket?.close();
  console.error(error);
  process.exitCode = 1;
});
