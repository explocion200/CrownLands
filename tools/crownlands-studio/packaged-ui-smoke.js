"use strict";

const assert = require("node:assert/strict");

const port = Number(process.argv.find(argument => argument.startsWith("--port="))?.split("=")[1] || 9333);
const save = process.argv.includes("--save");
const expectedBranch = process.argv.find(argument => argument.startsWith("--branch="))?.slice("--branch=".length) || "";
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
    const waitFor = async (predicate, label, timeoutMs = 12000) => {
      const started = Date.now();
      while (!predicate()) {
        if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for ' + label);
        await delay(50);
      }
    };
    const button = label => [...document.querySelectorAll("button")].find(node => node.textContent.trim() === label || node.textContent.trim().startsWith(label));
    const screenPreset = id => document.querySelector('[data-preview-target="screen"][data-preview-preset="' + id + '"]');
    const change = (node, value) => { node.value = value; node.dispatchEvent(new Event("input", { bubbles: true })); };
    const currentWorldButton = button("Current World");
    const pendingCoreButton = button("Pending Core 5×5");
    currentWorldButton.click();
    await waitFor(() => !document.querySelector("#worldView").classList.contains("hidden"), "initial Current World view");
    const currentWorldRegionCount = document.querySelectorAll("#worldGrid [data-region-id]").length;
    const currentWorldInitiallyVisible = !document.querySelector("#worldView").classList.contains("hidden");
    pendingCoreButton.click();
    await waitFor(() => document.querySelector("#corePreviewIntegrityBadge").textContent.includes("VERIFIED"), "Core manifest verification");
    await waitFor(() => document.querySelectorAll("#corePreviewGrid [data-core-region]").length === 25, "25 Core map tiles");
    try {
      await waitFor(() => [...document.querySelectorAll("#corePreviewGrid > [data-core-region] > img")].filter(image => image.complete && image.naturalWidth > 0).length === 25, "25 Core map images", 30000);
    } catch (error) {
      const images = [...document.querySelectorAll("#corePreviewGrid > [data-core-region] > img")];
      throw new Error(error.message + ': ' + JSON.stringify({ total: images.length, loaded: images.filter(image => image.complete && image.naturalWidth > 0).length, failed: images.filter(image => image.complete && image.naturalWidth === 0).map(image => image.src) }));
    }
    await delay(100);
    const pendingCore = {
      visible: !document.querySelector("#corePreviewView").classList.contains("hidden"),
      banner: document.querySelector(".core-preview-banner strong").textContent.trim(),
      integrity: document.querySelector("#corePreviewIntegrityBadge").textContent.trim(),
      maps: document.querySelectorAll("#corePreviewGrid [data-core-region]").length,
      loadedImages: [...document.querySelectorAll("#corePreviewGrid > [data-core-region] > img")].filter(image => image.complete && image.naturalWidth > 0).length,
      counts: document.querySelector("#corePreviewCounts").textContent.trim(),
      camp: document.querySelector("#corePreviewCampSize").value,
      stronghold: document.querySelector("#corePreviewStrongholdSize").value,
      citadel: document.querySelector("#corePreviewCitadelSize").value,
      holdingTowers: document.querySelectorAll('[data-objective-kind="holdingTower"]').length,
      towerWidth: document.querySelector("#corePreviewTowerWidth").value,
      towerAnchorX: document.querySelector("#corePreviewTowerAnchorX").value,
      towerAnchorY: document.querySelector("#corePreviewTowerAnchorY").value,
      towerYOffset: document.querySelector("#corePreviewTowerYOffset").value,
    };
    change(document.querySelector("#corePreviewCampSize"), "145");
    document.querySelector("#corePreviewUndoBtn").click();
    const campAfterUndo = document.querySelector("#corePreviewCampSize").value;
    document.querySelector("#corePreviewRedoBtn").click();
    const campAfterRedo = document.querySelector("#corePreviewCampSize").value;
    document.querySelector("#corePreviewResetBtn").click();
    const campAfterReset = document.querySelector("#corePreviewCampSize").value;
    currentWorldButton.click();
    await waitFor(() => !document.querySelector("#worldView").classList.contains("hidden"), "Current World view");
    const currentWorldAfterSwitch = {
      visible: !document.querySelector("#worldView").classList.contains("hidden"),
      coreHidden: document.querySelector("#corePreviewView").classList.contains("hidden"),
      regions: document.querySelectorAll("#worldGrid [data-region-id]").length,
    };
    pendingCoreButton.click();
    await waitFor(() => window.CrownlandsCorePreview.getVerificationStatus().attempts >= 2 && document.querySelector("#corePreviewIntegrityBadge").textContent.includes("VERIFIED"), "Core manifest re-verification");
    const manifestChecksOnEachOpen = window.CrownlandsCorePreview.getVerificationStatus().attempts;
    currentWorldButton.click();
    await waitFor(() => !document.querySelector("#worldView").classList.contains("hidden"), "return to Current World");
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
      worldSources: {
        currentWorldInitiallyVisible,
        currentWorldRegionCount,
        pendingCore,
        campAfterUndo,
        campAfterRedo,
        campAfterReset,
        currentWorldAfterSwitch,
        manifestChecksOnEachOpen,
      },
    };
  })()`);

  assert.equal(result.desktopBridge, true);
  if (expectedBranch) assert.equal(result.branch, expectedBranch);
  assert.equal(result.worldSources.currentWorldInitiallyVisible, true);
  assert.ok(result.worldSources.currentWorldRegionCount > 0);
  assert.equal(result.worldSources.pendingCore.visible, true);
  assert.match(result.worldSources.pendingCore.banner, /PENDING CORE 5×5.*LOCAL PREVIEW.*NOT LIVE/);
  assert.equal(result.worldSources.pendingCore.integrity, "MANIFEST VERIFIED");
  assert.equal(result.worldSources.pendingCore.maps, 25);
  assert.equal(result.worldSources.pendingCore.loadedImages, 25);
  assert.match(result.worldSources.pendingCore.counts, /25 maps.*1480 cities.*21 visual objectives.*4 towers.*40 reciprocal roads/);
  assert.equal(result.worldSources.pendingCore.holdingTowers, 4);
  assert.deepEqual([
    result.worldSources.pendingCore.camp,
    result.worldSources.pendingCore.stronghold,
    result.worldSources.pendingCore.citadel,
  ], ["132", "154", "260"]);
  assert.deepEqual([
    result.worldSources.pendingCore.towerWidth,
    result.worldSources.pendingCore.towerAnchorX,
    result.worldSources.pendingCore.towerAnchorY,
    result.worldSources.pendingCore.towerYOffset,
  ], ["184", "0.5", "0.969", "0"]);
  assert.equal(result.worldSources.campAfterUndo, "132");
  assert.equal(result.worldSources.campAfterRedo, "145");
  assert.equal(result.worldSources.campAfterReset, "132");
  assert.deepEqual(result.worldSources.currentWorldAfterSwitch, {
    visible: true,
    coreHidden: true,
    regions: result.worldSources.currentWorldRegionCount,
  });
  assert.ok(result.worldSources.manifestChecksOnEachOpen >= 2);
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
