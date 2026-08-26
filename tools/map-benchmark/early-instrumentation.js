(function installCrownlandsBenchmarkInstrumentation() {
  "use strict";

  const bootstrap = window.__CROWNLANDS_BENCHMARK_BOOTSTRAP__;
  if (!bootstrap || location.hostname !== "127.0.0.1") {
    throw new Error("Crownlands benchmark instrumentation requires the loopback benchmark server.");
  }

  const native = {
    dateNow: Date.now.bind(Date),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    setInterval: window.setInterval.bind(window),
    clearInterval: window.clearInterval.bind(window),
  };
  const startedAt = performance.now();
  const preservePickupSoakClock = new URLSearchParams(location.search).get("pickupSoakClock") === "true";
  const pickupSoakClockStorageKey = `crownlands-benchmark-clock-${bootstrap.benchmarkSeed}`;
  let benchmarkClockBaseMs = bootstrap.fixedEpochMs;
  if (preservePickupSoakClock) {
    try {
      const storedClock = JSON.parse(window.sessionStorage?.getItem(pickupSoakClockStorageKey) || "null");
      if (Number.isFinite(storedClock?.clockMs) && Number.isFinite(storedClock?.nativeMs)) {
        benchmarkClockBaseMs = Math.max(
          bootstrap.fixedEpochMs,
          storedClock.clockMs + Math.max(0, native.dateNow() - storedClock.nativeMs)
        );
      }
    } catch (_error) {
      benchmarkClockBaseMs = bootstrap.fixedEpochMs;
    }
  }
  Date.now = () => benchmarkClockBaseMs + Math.floor(performance.now() - startedAt);
  if (preservePickupSoakClock) {
    native.setInterval(() => {
      try {
        window.sessionStorage?.setItem(pickupSoakClockStorageKey, JSON.stringify({
          clockMs: Date.now(),
          nativeMs: native.dateNow(),
        }));
      } catch (_error) {
        // Session persistence is a soak-test convenience; benchmark execution remains usable without it.
      }
    }, 250);
  }

  const activeTimeouts = new Map();
  const activeIntervals = new Map();
  const pendingAnimationFrames = new Map();
  let timeoutCreated = 0;
  let intervalCreated = 0;
  let animationFrameRequested = 0;
  let animationFrameExecuted = 0;
  let activeSample = null;
  const completedSamples = [];

  window.setTimeout = function benchmarkSetTimeout(callback, delay, ...args) {
    let id = 0;
    const wrapped = typeof callback === "function"
      ? (...callbackArgs) => {
          activeTimeouts.delete(id);
          return callback(...callbackArgs);
        }
      : callback;
    id = native.setTimeout(wrapped, delay, ...args);
    activeTimeouts.set(id, { createdAt: performance.now(), delay: Number(delay) || 0 });
    timeoutCreated += 1;
    return id;
  };
  window.clearTimeout = function benchmarkClearTimeout(id) {
    activeTimeouts.delete(id);
    return native.clearTimeout(id);
  };
  window.setInterval = function benchmarkSetInterval(callback, delay, ...args) {
    const id = native.setInterval(callback, delay, ...args);
    activeIntervals.set(id, { createdAt: performance.now(), delay: Number(delay) || 0 });
    intervalCreated += 1;
    return id;
  };
  window.clearInterval = function benchmarkClearInterval(id) {
    activeIntervals.delete(id);
    return native.clearInterval(id);
  };
  window.requestAnimationFrame = function benchmarkRequestAnimationFrame(callback) {
    let id = 0;
    id = native.requestAnimationFrame(timestamp => {
      pendingAnimationFrames.delete(id);
      animationFrameExecuted += 1;
      callback(timestamp);
    });
    pendingAnimationFrames.set(id, { createdAt: performance.now() });
    animationFrameRequested += 1;
    return id;
  };
  window.cancelAnimationFrame = function benchmarkCancelAnimationFrame(id) {
    pendingAnimationFrames.delete(id);
    return native.cancelAnimationFrame(id);
  };

  const longTasks = [];
  let longTaskObserver = null;
  try {
    longTaskObserver = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        longTasks.push({ startTime: entry.startTime, duration: entry.duration });
      }
    });
    longTaskObserver.observe({ type: "longtask", buffered: true });
  } catch (_error) {
    longTaskObserver = null;
  }

  function frameSampler(timestamp) {
    if (activeSample) activeSample.frameTimestamps.push(timestamp);
    native.requestAnimationFrame(frameSampler);
  }
  native.requestAnimationFrame(frameSampler);

  function percentile(values, value) {
    if (!values.length) return null;
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * value) - 1))];
  }

  function beginSample(name) {
    if (activeSample) throw new Error(`Benchmark sample ${activeSample.name} is already active.`);
    activeSample = {
      name: String(name || "sample"),
      startedAt: performance.now(),
      longTaskStartIndex: longTasks.length,
      frameTimestamps: [],
    };
    return activeSample.startedAt;
  }

  function endSample() {
    if (!activeSample) throw new Error("No benchmark sample is active.");
    const endedAt = performance.now();
    const frameTimes = [];
    for (let index = 1; index < activeSample.frameTimestamps.length; index += 1) {
      frameTimes.push(activeSample.frameTimestamps[index] - activeSample.frameTimestamps[index - 1]);
    }
    const durationMs = endedAt - activeSample.startedAt;
    const sampleLongTasks = longTasks.slice(activeSample.longTaskStartIndex).filter(entry => entry.startTime <= endedAt);
    const result = {
      name: activeSample.name,
      durationMs,
      frameCount: activeSample.frameTimestamps.length,
      fps: durationMs > 0 ? activeSample.frameTimestamps.length * 1000 / durationMs : null,
      medianFrameTimeMs: percentile(frameTimes, 0.5),
      p95FrameTimeMs: percentile(frameTimes, 0.95),
      maximumFrameTimeMs: frameTimes.length ? Math.max(...frameTimes) : null,
      longTaskCount: sampleLongTasks.length,
      longTaskTotalMs: sampleLongTasks.reduce((total, entry) => total + entry.duration, 0),
      longestTaskMs: sampleLongTasks.length ? Math.max(...sampleLongTasks.map(entry => entry.duration)) : 0,
    };
    completedSamples.push(result);
    activeSample = null;
    return result;
  }

  window.__CROWNLANDS_BENCHMARK_INSTRUMENTATION__ = Object.freeze({
    beginSample,
    endSample,
    getCompletedSamples: () => [...completedSamples],
    getTimerSnapshot: () => ({
      activeTimeouts: activeTimeouts.size,
      activeIntervals: activeIntervals.size,
      pendingAnimationFrames: pendingAnimationFrames.size,
      timeoutCreated,
      intervalCreated,
      animationFrameRequested,
      animationFrameExecuted,
      measurementAnimationFrameLoops: 1,
      longTaskObserverAvailable: Boolean(longTaskObserver),
    }),
    native,
  });
})();
