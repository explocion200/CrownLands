"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../game.js"), "utf8");
const extract = (name, next) => source.slice(source.indexOf(`function ${name}(`), source.indexOf(`function ${next}(`));
let now = 0, gesture = false, flushed = 0, timeout;
const classes = new Set(["camera-moving", "zooming"]);
const context = vm.createContext({
  performance: { now: () => now },
  mapFrame: {
    classList: { contains: name => classes.has(name), remove: (...names) => names.forEach(name => classes.delete(name)) },
    getBoundingClientRect: () => { now += 500; return { width: 844, height: 390 }; },
  },
  mapWorld: { style: {} }, camera: { x: 100, y: 100 }, zoom: 1,
  mapViewportWidth: 0, mapViewportHeight: 0,
  interactionRenderLockUntil: 260, cameraInteractionSettleTimer: 1,
  PAN_RENDER_SETTLE_MS: 180, ZOOM_RENDER_SETTLE_MS: 260,
  window: { clearTimeout: () => {}, setTimeout: (callback, delay) => { timeout = { callback, delay }; return 2; } },
  hasActiveCameraGesture: () => gesture, flushDeferredMapRender: () => flushed++,
  getActiveMapDimensions: () => ({ width: 10000, height: 7600 }),
  clampZoomForViewport: value => value, clamp: (value, low, high) => Math.max(low, Math.min(high, value)),
  getMapViewportOffset: () => ({ x: 0, y: 0 }), updateZoomPerformanceClasses: () => {},
  updateClanTowerActionWheelLayout: () => {}, updateMainCityReturnButtonForCamera: () => {}, scheduleOnboardingPointer: () => {},
});
vm.runInContext(extract("finishCameraInteraction", "markCameraInteraction")
  + extract("applyCameraTransform", "updateCameraTransform"), context);
context.applyCameraTransform();
context.finishCameraInteraction();
assert.equal(flushed, 0, "A render slower than the input timeout must not immediately restore full map detail.");
assert(classes.has("zooming"));
assert.equal(timeout.delay, 260, "The quiet period must start after the slow render, without increasing its normal duration.");
now += timeout.delay;
timeout.callback();
assert.equal(flushed, 1, "Deferred map updates must flush once when zooming settles.");
assert(!classes.has("zooming"));
assert.equal(context.cameraInteractionSettleTimer, null);
assert.equal(context.interactionRenderLockUntil, 0);

classes.add("camera-moving");
context.cameraInteractionSettleTimer = 1;
context.applyCameraTransform();
context.finishCameraInteraction();
assert.equal(timeout.delay, 180, "Panning retains its shorter quiet period.");
now += 180; gesture = true; timeout.callback();
assert.equal(flushed, 1, "An active gesture must keep detail restoration deferred.");
gesture = false; now += timeout.delay; timeout.callback();
assert.equal(flushed, 2);

context.cameraInteractionSettleTimer = 1;
context.interactionRenderLockUntil = now + 60000;
const explicitDeadline = context.interactionRenderLockUntil;
context.applyCameraTransform();
assert.equal(context.interactionRenderLockUntil, explicitDeadline, "Rendering must preserve an explicitly longer interaction lock.");
context.cameraInteractionSettleTimer = null;
context.interactionRenderLockUntil = 0;
context.applyCameraTransform();
assert.equal(context.interactionRenderLockUntil, 0, "An ordinary camera refresh must not start an interaction lock.");
console.log("Validated slow-render zoom settling, deferred flush, active gestures, pan timing and ordinary camera refreshes.");
