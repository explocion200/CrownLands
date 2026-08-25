"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const { CdpClient, fetchJson } = require("./map-benchmark/cdp-client.js");
const { createMapBenchmarkServer } = require("./map-benchmark/server.js");

const DESKTOP_VIEWPORT = { width: 1200, height: 800 };
const TOUCH_VIEWPORT = { width: 844, height: 390 };
const READY_TIMEOUT_MS = 30000;
const ACTION_TIMEOUT_MS = 10000;

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  const chromePath = candidates.find(candidate => fs.existsSync(candidate));
  if (!chromePath) throw new Error("Chrome or Edge was not found. Set CHROME_PATH to a Chromium executable.");
  return chromePath;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function launchChrome(chromePath, debugPort, profilePath) {
  return childProcess.spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profilePath}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-breakpad",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-features=Translate,MediaRouter,OptimizationHints",
    "--disable-sync",
    "--metrics-recording-only",
    "--mute-audio",
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description
      || result.exceptionDetails.text
      || "Page evaluation failed.";
    throw new Error(description);
  }
  return result.result?.value;
}

async function waitFor(client, expression, message, timeoutMs = ACTION_TIMEOUT_MS) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await evaluate(client, expression);
    if (value) return value;
    await delay(25);
  }
  throw new Error(message);
}

async function setViewport(client, viewport, touch = false) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: touch,
  });
  await client.send("Emulation.setTouchEmulationEnabled", {
    enabled: touch,
    maxTouchPoints: touch ? 5 : 1,
  });
}

let fixtureRunId = 0;

async function loadFixture(client, serverUrl, viewport, touch = false) {
  fixtureRunId += 1;
  await setViewport(client, viewport, touch);
  await client.send("Page.navigate", {
    url: `${serverUrl}/__benchmark__/?scenario=A&mapPickerInput=${fixtureRunId}`,
  });
  await waitFor(
    client,
    `document.documentElement?.dataset.crownlandsBenchmarkReady === "true"
      ? window.__CROWNLANDS_BENCHMARK__.getMapPickerInputTelemetry()
      : null`,
    `Map picker fixture did not become ready within ${READY_TIMEOUT_MS} ms.`,
    READY_TIMEOUT_MS
  );
  await evaluate(client, "window.__CROWNLANDS_BENCHMARK__.resetMapPickerInputTelemetry()");
  return evaluate(client, "window.__CROWNLANDS_BENCHMARK__.getMapPickerInputTelemetry()");
}

async function getElementPoint(client, selector) {
  return evaluate(client, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      width: rect.width,
      height: rect.height,
    };
  })()`);
}

async function getVisibleMapTile(client) {
  return evaluate(client, `(() => {
    const picker = document.querySelector(".island-map-picker");
    if (!picker) return null;
    const pickerRect = picker.getBoundingClientRect();
    const activeRegionId = window.__CROWNLANDS_BENCHMARK__.getMapPickerInputTelemetry().activeRegionId;
    for (const button of picker.querySelectorAll("[data-island-region]")) {
      const regionId = String(button.dataset.islandRegion || "");
      if (!regionId || regionId === activeRegionId) continue;
      const rect = button.getBoundingClientRect();
      const left = Math.max(0, pickerRect.left, rect.left);
      const right = Math.min(innerWidth, pickerRect.right, rect.right);
      const top = Math.max(0, pickerRect.top, rect.top);
      const bottom = Math.min(innerHeight, pickerRect.bottom, rect.bottom);
      if (right - left < 12 || bottom - top < 12) continue;
      const x = (left + right) / 2;
      const y = (top + bottom) / 2;
      if (document.elementFromPoint(x, y)?.closest?.("[data-island-region]") !== button) continue;
      return { regionId, x, y, width: rect.width, height: rect.height };
    }
    return null;
  })()`);
}

async function mouseClick(client, point) {
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: point.x,
    y: point.y,
    button: "none",
    buttons: 0,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x,
    y: point.y,
    button: "left",
    buttons: 0,
    clickCount: 1,
  });
}

async function mouseDrag(client, point, dx = 60, dy = 12) {
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: point.x,
    y: point.y,
    button: "none",
    buttons: 0,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  for (const fraction of [0.25, 0.5, 0.75, 1]) {
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: point.x + dx * fraction,
      y: point.y + dy * fraction,
      button: "left",
      buttons: 1,
    });
  }
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x + dx,
    y: point.y + dy,
    button: "left",
    buttons: 0,
    clickCount: 1,
  });
}

async function touchTap(client, point, id = 1) {
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ id, x: point.x, y: point.y, radiusX: 2, radiusY: 2, force: 1 }],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

async function touchDrag(client, point, dx = 50, dy = 10, id = 1) {
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ id, x: point.x, y: point.y, radiusX: 2, radiusY: 2, force: 1 }],
  });
  for (const fraction of [0.25, 0.5, 0.75, 1]) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{
        id,
        x: point.x + dx * fraction,
        y: point.y + dy * fraction,
        radiusX: 2,
        radiusY: 2,
        force: 1,
      }],
    });
  }
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

async function touchPinch(client, center) {
  const first = { id: 1, x: center.x - 20, y: center.y, radiusX: 2, radiusY: 2, force: 1 };
  const second = { id: 2, x: center.x + 20, y: center.y, radiusX: 2, radiusY: 2, force: 1 };
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [first] });
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [first, second] });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { ...first, x: center.x - 50 },
      { ...second, x: center.x + 50 },
    ],
  });
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function getTelemetry(client) {
  return evaluate(client, "window.__CROWNLANDS_BENCHMARK__.getMapPickerInputTelemetry()");
}

async function openPicker(client, touch = false) {
  const point = await getElementPoint(client, "#islandSwitchBtn");
  assert.ok(point, "The map HUD button must be present.");
  if (touch) await touchTap(client, point);
  else await mouseClick(client, point);
  await waitFor(
    client,
    "window.__CROWNLANDS_BENCHMARK__.getMapPickerInputTelemetry().pickerOpen",
    "The map picker did not open."
  );
  await evaluate(client, "window.__CROWNLANDS_BENCHMARK__.resetMapPickerInputTelemetry()");
}

async function waitForSwitch(client, targetRegionId) {
  try {
    return await waitFor(
      client,
      `(() => {
        const telemetry = window.__CROWNLANDS_BENCHMARK__.getMapPickerInputTelemetry();
        return telemetry.activeRegionId === ${JSON.stringify(targetRegionId)}
          && telemetry.modalOpen === false
          && telemetry.mapInteractionBlocked === false
          ? telemetry
          : null;
      })()`,
      `The map did not switch to ${targetRegionId}.`
    );
  } catch (error) {
    const telemetry = await getTelemetry(client);
    error.message += `\nMap picker telemetry: ${JSON.stringify(telemetry, null, 2)}`;
    throw error;
  }
}

function assertSinglePickerSwitch(telemetry, targetRegionId, label) {
  assert.equal(telemetry.switchCalls.length, 1, `${label} must call switchOnlineIsland exactly once.`);
  assert.deepEqual(
    telemetry.switchCalls.map(call => ({ regionId: call.regionId, fromMapPicker: call.fromMapPicker })),
    [{ regionId: targetRegionId, fromMapPicker: true }],
    `${label} must switch only to the selected map through the picker path.`
  );
}

async function validateDesktopMouseClick(client, serverUrl) {
  await loadFixture(client, serverUrl, DESKTOP_VIEWPORT);
  await openPicker(client);
  const tile = await getVisibleMapTile(client);
  assert.ok(tile, "A visible non-current desktop map tile is required.");
  await mouseClick(client, tile);
  const telemetry = await waitForSwitch(client, tile.regionId);
  assertSinglePickerSwitch(telemetry, tile.regionId, "A desktop mouse click");
}

async function validateDesktopDrag(client, serverUrl) {
  await loadFixture(client, serverUrl, DESKTOP_VIEWPORT);
  const initial = await getTelemetry(client);
  await openPicker(client);
  const tile = await getVisibleMapTile(client);
  assert.ok(tile, "A visible desktop map tile is required for drag validation.");
  await mouseDrag(client, tile);
  await delay(250);
  const telemetry = await getTelemetry(client);
  assert.equal(telemetry.switchCalls.length, 0, "Dragging across a desktop map tile must not switch maps.");
  assert.equal(telemetry.activeRegionId, initial.activeRegionId, "A desktop drag must preserve the active region.");
  assert.equal(telemetry.modalOpen, true, "A desktop drag must leave the map picker open.");
}

async function validateImmediateClickAfterDesktopDrag(client, serverUrl) {
  await loadFixture(client, serverUrl, DESKTOP_VIEWPORT);
  await openPicker(client);
  let tile = await getVisibleMapTile(client);
  assert.ok(tile, "A visible desktop map tile is required for the drag-followed-by-click regression.");
  await mouseDrag(client, tile);
  const afterDrag = await getTelemetry(client);
  assert.equal(afterDrag.switchCalls.length, 0, "The completed drag gesture must not switch maps.");
  tile = await getVisibleMapTile(client);
  assert.ok(tile, "A visible map tile must remain after panning.");
  await mouseClick(client, tile);
  const telemetry = await waitForSwitch(client, tile.regionId);
  assertSinglePickerSwitch(telemetry, tile.regionId, "A distinct mouse click immediately after a drag");
}

async function validateKeyboardActivation(client, serverUrl, key) {
  await loadFixture(client, serverUrl, DESKTOP_VIEWPORT);
  await openPicker(client);
  const tile = await getVisibleMapTile(client);
  assert.ok(tile, `A visible map tile is required for ${key} activation.`);
  await evaluate(client, `document.querySelector('[data-island-region="${tile.regionId}"]').focus()`);
  assert.equal(
    await evaluate(client, "document.activeElement?.dataset?.islandRegion || ''"),
    tile.regionId,
    `The ${key} test must focus the selected map tile.`
  );
  const keyCode = key === "Enter" ? 13 : 32;
  const code = key === "Enter" ? "Enter" : "Space";
  const keyValue = key === "Enter" ? "Enter" : " ";
  await client.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: keyValue,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  });
  await client.send("Input.dispatchKeyEvent", {
    type: "char",
    key: keyValue,
    code,
    text: key === "Enter" ? "\r" : " ",
    unmodifiedText: key === "Enter" ? "\r" : " ",
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  });
  await client.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: keyValue,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  });
  const telemetry = await waitForSwitch(client, tile.regionId);
  assertSinglePickerSwitch(telemetry, tile.regionId, `${key} keyboard activation`);
}

async function validateDesktopWheelZoom(client, serverUrl) {
  await loadFixture(client, serverUrl, DESKTOP_VIEWPORT);
  await openPicker(client);
  const picker = await getElementPoint(client, ".island-map-picker");
  const beforeZoom = await evaluate(client, "Number(document.querySelector('.island-map-picker').dataset.islandMapZoom)");
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: picker.x,
    y: picker.y,
    deltaX: 0,
    deltaY: -120,
  });
  await delay(350);
  const afterZoom = await evaluate(client, "Number(document.querySelector('.island-map-picker').dataset.islandMapZoom)");
  const telemetry = await getTelemetry(client);
  assert.notEqual(afterZoom, beforeZoom, "The desktop mouse wheel must continue to zoom the map picker.");
  assert.equal(telemetry.switchCalls.length, 0, "Wheel zooming must not switch maps.");
  assert.equal(telemetry.modalOpen, true, "Wheel zooming must leave the map picker open.");
}

async function validateTouchTap(client, serverUrl) {
  await loadFixture(client, serverUrl, TOUCH_VIEWPORT, true);
  await openPicker(client, true);
  const tile = await getVisibleMapTile(client);
  assert.ok(tile, "A visible non-current touch map tile is required.");
  await touchTap(client, tile);
  const telemetry = await waitForSwitch(client, tile.regionId);
  await delay(350);
  const settled = await getTelemetry(client);
  assertSinglePickerSwitch(settled, tile.regionId, "A touch tap");
  assert.equal(settled.modalOpen, false, "A touch tap must not ghost-click the HUD and reopen the picker.");
}

async function validateTouchDragAndPinch(client, serverUrl) {
  await loadFixture(client, serverUrl, TOUCH_VIEWPORT, true);
  const initial = await getTelemetry(client);
  await openPicker(client, true);
  const tile = await getVisibleMapTile(client);
  assert.ok(tile, "A visible touch map tile is required for drag validation.");
  await touchDrag(client, tile);
  await delay(300);
  let telemetry = await getTelemetry(client);
  assert.equal(telemetry.switchCalls.length, 0, "Touch dragging must not switch maps.");
  assert.equal(telemetry.activeRegionId, initial.activeRegionId, "Touch dragging must preserve the active region.");
  assert.equal(telemetry.modalOpen, true, "Touch dragging must leave the picker open.");

  await loadFixture(client, serverUrl, TOUCH_VIEWPORT, true);
  await openPicker(client, true);
  const picker = await getElementPoint(client, ".island-map-picker");
  await touchPinch(client, picker);
  await delay(300);
  telemetry = await getTelemetry(client);
  assert.equal(telemetry.switchCalls.length, 0, "Pinch zooming must not switch maps.");
  assert.equal(telemetry.modalOpen, true, "Pinch zooming must leave the picker open.");
}

async function closeChrome(client, chrome, profilePath) {
  if (client) {
    try { await Promise.race([client.send("Browser.close"), delay(1500)]); } catch (_error) { /* Chrome normally closes the socket first. */ }
    client.close();
  }
  await Promise.race([
    new Promise(resolve => chrome.once("exit", resolve)),
    delay(3000),
  ]);
  if (chrome.exitCode === null) {
    if (process.platform === "win32") {
      childProcess.spawnSync("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } else {
      chrome.kill("SIGKILL");
    }
  }
  const resolvedTemp = path.resolve(os.tmpdir());
  const resolvedProfile = path.resolve(profilePath);
  if (resolvedProfile.startsWith(`${resolvedTemp}${path.sep}`) && path.basename(resolvedProfile).startsWith("crownlands-map-picker-input-")) {
    await fsp.rm(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

async function main() {
  const chromePath = findChrome();
  const debugPort = await getFreePort();
  const profilePath = await fsp.mkdtemp(path.join(os.tmpdir(), "crownlands-map-picker-input-"));
  const fixtureServer = createMapBenchmarkServer();
  const serverAddress = await fixtureServer.listen(0);
  const chrome = launchChrome(chromePath, debugPort, profilePath);
  let client;
  try {
    const targets = await fetchJson(`http://127.0.0.1:${debugPort}/json/list`);
    const pageTarget = targets.find(target => target.type === "page");
    if (!pageTarget) throw new Error("Chrome did not expose a page target.");
    client = await CdpClient.connect(pageTarget.webSocketDebuggerUrl);
    await Promise.all([
      client.send("Page.enable"),
      client.send("Runtime.enable"),
      client.send("Network.enable"),
    ]);
    const consoleErrors = [];
    const removeConsoleListener = client.on("Runtime.consoleAPICalled", event => {
      if (event.type !== "error") return;
      consoleErrors.push((event.args || []).map(argument => argument.value || argument.description || "").join(" "));
    });
    const removeExceptionListener = client.on("Runtime.exceptionThrown", event => {
      consoleErrors.push(event.exceptionDetails?.exception?.description || event.exceptionDetails?.text || "Uncaught page exception");
    });

    try {
      await validateDesktopMouseClick(client, serverAddress.url);
      await validateDesktopDrag(client, serverAddress.url);
      await validateImmediateClickAfterDesktopDrag(client, serverAddress.url);
      await validateKeyboardActivation(client, serverAddress.url, "Enter");
      await validateKeyboardActivation(client, serverAddress.url, "Space");
      await validateDesktopWheelZoom(client, serverAddress.url);
      await validateTouchTap(client, serverAddress.url);
      await validateTouchDragAndPinch(client, serverAddress.url);
      assert.deepEqual(consoleErrors, [], `Map picker interaction checks must not emit console errors:\n${consoleErrors.join("\n")}`);
      console.log("Validated desktop click, immediate post-drag click, keyboard activation, wheel zoom, touch tap, touch drag, pinch behavior, and a clean browser console in the live map picker UI.");
    } finally {
      removeConsoleListener();
      removeExceptionListener();
    }
  } finally {
    await closeChrome(client, chrome, profilePath);
    await fixtureServer.close();
  }
}

main().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
