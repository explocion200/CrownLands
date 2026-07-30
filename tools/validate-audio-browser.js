const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createAudioBrowserTestServer } = require("./audio-browser-test-server");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (_error) {
  throw new Error(
    "Playwright is required for the local audio browser suite. Install it or expose it through NODE_PATH.",
  );
}

const PLAYBACK_TIMEOUT_MS = 30000;
const BROWSER_CANDIDATES = [
  {
    executablePath: process.env.CROWNLANDS_CHROME_PATH
      || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    name: "Chrome",
  },
  {
    executablePath: process.env.CROWNLANDS_EDGE_PATH
      || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    name: "Edge",
  },
].filter(candidate => fs.existsSync(candidate.executablePath));

function describeError(error) {
  return error?.stack || error?.message || String(error);
}

function installAudioDiagnostics(page) {
  const issues = [];
  page.on("console", message => {
    const text = message.text();
    if (
      /NotSupportedError|Crownlands audio is unavailable|Audio manifest request failed|Could not (?:play|resume) music|MediaError:[1-4]/i.test(text)
    ) {
      issues.push(`console ${message.type()}: ${text}`);
    }
  });
  page.on("pageerror", error => {
    const text = describeError(error);
    if (/audio|media|NotSupportedError/i.test(text)) issues.push(`page error: ${text}`);
  });
  page.on("requestfailed", request => {
    if (!new URL(request.url()).pathname.startsWith("/audio/")) return;
    const failure = request.failure()?.errorText || "unknown request failure";
    if (/ERR_ABORTED/i.test(failure)) return;
    issues.push(`request failed: ${request.url()} (${failure})`);
  });
  return issues;
}

async function addDocumentStartDiagnostics(context) {
  await context.addInitScript(() => {
    window.__crownlandsControllerAtDocumentStart = Boolean(navigator.serviceWorker?.controller);
    window.__crownlandsMediaPlayCalls = [];
    const nativePlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function crownlandsObservedPlay() {
      window.__crownlandsMediaPlayCalls.push({
        at: performance.now(),
        source: this.currentSrc || this.src || "",
      });
      return nativePlay.call(this);
    };
  });
}

async function openApp(page, baseUrl) {
  await page.goto(`${baseUrl}/`, {
    timeout: PLAYBACK_TIMEOUT_MS,
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(
    () => window.CrownlandsAudio?.ready === true,
    null,
    { timeout: PLAYBACK_TIMEOUT_MS },
  );
}

async function getAudioState(page) {
  return page.evaluate(() => window.CrownlandsAudio?.getDebugState?.() || null);
}

async function waitForPlayback(page, minimumTime = 0.12) {
  await page.waitForFunction(
    threshold => {
      const state = window.CrownlandsAudio?.getDebugState?.();
      return Boolean(
        state
        && state.musicUnlocked
        && !state.musicMuted
        && !state.paused
        && state.readyState >= 2
        && state.currentTime >= threshold
        && !state.lastPlaybackError
      );
    },
    minimumTime,
    { timeout: PLAYBACK_TIMEOUT_MS },
  );
  return getAudioState(page);
}

function assertHealthyPlayback(state, expectedState) {
  assert.ok(state, "Audio diagnostics must be available.");
  assert.equal(state.ready, true);
  assert.equal(state.musicUnlocked, true);
  assert.equal(state.musicMuted, false);
  assert.equal(state.paused, false);
  assert.ok(state.readyState >= 2, `Media readyState must be usable, received ${state.readyState}.`);
  assert.ok(state.currentTime > 0, "Playback time must advance.");
  assert.equal(state.lastPlaybackError, "");
  assert.match(state.currentSource, /\.(?:mp3|ogg|wav)(?:\?|$)/i);
  if (expectedState) assert.equal(state.currentMusicState, expectedState);
}

async function assertLoginControlLayout(page, viewport) {
  await page.setViewportSize({ height: viewport.height, width: viewport.width });
  await page.waitForTimeout(80);
  const metrics = await page.evaluate(() => {
    const button = document.getElementById("loginMusicMuteBtn");
    const rect = button?.getBoundingClientRect();
    const width = Math.min(window.innerWidth, window.innerHeight * 4 / 3);
    const height = Math.min(window.innerHeight, window.innerWidth * 3 / 4);
    return {
      art: {
        bottom: (window.innerHeight + height) / 2,
        left: (window.innerWidth - width) / 2,
        right: (window.innerWidth + width) / 2,
        top: (window.innerHeight - height) / 2,
      },
      button: rect && {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
      },
    };
  });
  assert.ok(metrics.button, `${viewport.label}: login music control must exist.`);
  const tolerance = 1.5;
  assert.ok(
    metrics.button.left >= metrics.art.left - tolerance
      && metrics.button.right <= metrics.art.right + tolerance
      && metrics.button.top >= metrics.art.top - tolerance
      && metrics.button.bottom <= metrics.art.bottom + tolerance,
    `${viewport.label}: login music control must stay inside the rendered 4:3 artwork.`,
  );
  const leftInset = metrics.button.left - metrics.art.left;
  const bottomInset = metrics.art.bottom - metrics.button.bottom;
  assert.ok(leftInset >= 8 && leftInset <= 64, `${viewport.label}: lower-left horizontal inset is ${leftInset}.`);
  assert.ok(bottomInset >= 8 && bottomInset <= 64, `${viewport.label}: lower-left vertical inset is ${bottomInset}.`);
  assert.ok(metrics.button.width >= 40 && metrics.button.height >= 40, `${viewport.label}: mute target is too small.`);
}

async function clickOrdinarySurface(page) {
  const viewport = page.viewportSize();
  await page.mouse.click(Math.floor(viewport.width / 2), 10);
}

async function waitForEffectsAuthorization(page) {
  await page.waitForFunction(
    () => {
      const state = window.CrownlandsAudio?.getDebugState?.();
      return Boolean(state?.effectsUnlocked && state.effectsContextState === "running");
    },
    null,
    { timeout: PLAYBACK_TIMEOUT_MS },
  );
}

async function waitForServiceWorkerControl(page) {
  await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) throw new Error("Service workers are unsupported.");
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(
    () => Boolean(navigator.serviceWorker.controller),
    null,
    { timeout: PLAYBACK_TIMEOUT_MS },
  );
}

async function runAllowedPlaybackSuite(browser, browserName, baseUrl, fixture) {
  const context = await browser.newContext({
    serviceWorkers: "allow",
    viewport: { height: 900, width: 1440 },
  });
  await addDocumentStartDiagnostics(context);
  const page = await context.newPage();
  const issues = installAudioDiagnostics(page);
  try {
    await openApp(page, baseUrl);
    assert.equal(
      await page.evaluate(() => window.__crownlandsControllerAtDocumentStart),
      false,
      `${browserName}: the first load must begin outside service-worker control.`,
    );
    assertHealthyPlayback(await waitForPlayback(page), "main_menu");
    assert.equal(
      await page.evaluate(() => document.querySelectorAll("audio").length),
      1,
      `${browserName}: music and transitions must retain exactly one media element.`,
    );

    for (const viewport of [
      { height: 900, label: `${browserName} desktop`, width: 1440 },
      { height: 844, label: `${browserName} phone portrait`, width: 390 },
      { height: 390, label: `${browserName} phone landscape`, width: 844 },
      { height: 768, label: `${browserName} tablet landscape`, width: 1024 },
    ]) {
      await assertLoginControlLayout(page, viewport);
    }
    await page.setViewportSize({ height: 900, width: 1440 });

    const transition = await page.evaluate(async () => {
      const manager = window.CrownlandsAudio;
      const retainedElement = manager.persistentMusic;
      const started = await manager.setMusicState("world_map", { immediate: true });
      return {
        sameElement: retainedElement === manager.persistentMusic
          && retainedElement === manager.currentMusic,
        started,
      };
    });
    assert.equal(transition.started, true, `${browserName}: world-map transition must start.`);
    assert.equal(transition.sameElement, true, `${browserName}: world-map transition must reuse the media element.`);
    assertHealthyPlayback(await waitForPlayback(page), "world_map");

    await page.evaluate(() => {
      window.CrownlandsAudio.currentMusic.pause();
      window.dispatchEvent(new Event("pageshow"));
    });
    assertHealthyPlayback(await waitForPlayback(page), "world_map");

    await waitForServiceWorkerControl(page);
    fixture.requests.length = 0;
    await page.reload({ timeout: PLAYBACK_TIMEOUT_MS, waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.CrownlandsAudio?.ready === true,
      null,
      { timeout: PLAYBACK_TIMEOUT_MS },
    );
    assert.equal(
      await page.evaluate(() => window.__crownlandsControllerAtDocumentStart),
      true,
      `${browserName}: the reload must begin under service-worker control.`,
    );
    assertHealthyPlayback(await waitForPlayback(page), "main_menu");
    await page.waitForFunction(
      () => window.__crownlandsMediaPlayCalls.length > 0,
      null,
      { timeout: PLAYBACK_TIMEOUT_MS },
    );
    const controlledRangeProbe = await page.evaluate(async () => {
      const source = window.CrownlandsAudio?.getDebugState?.().currentSource;
      const response = await fetch(source, {
        cache: "no-store",
        headers: { Range: "bytes=0-1023" },
      });
      return {
        bytes: (await response.arrayBuffer()).byteLength,
        contentRange: response.headers.get("content-range"),
        status: response.status,
      };
    });
    assert.equal(
      controlledRangeProbe.status,
      206,
      `${browserName}: a controlled-page Range request must remain Partial Content.`,
    );
    assert.match(controlledRangeProbe.contentRange || "", /^bytes 0-1023\/\d+$/);
    assert.equal(controlledRangeProbe.bytes, 1024);
    const rangedAudioRequests = fixture.requests.filter(entry => (
      entry.status === 206
      && Boolean(entry.range)
      && /^\/audio\/.*\.(?:mp3|ogg|wav)$/i.test(entry.path)
    ));
    assert.ok(
      rangedAudioRequests.length > 0,
      `${browserName}: a service-worker-controlled reload must preserve native 206 media requests.`,
    );

    await clickOrdinarySurface(page);
    await waitForEffectsAuthorization(page);
    await page.locator("#loginMusicMuteBtn").click();
    const muted = await getAudioState(page);
    assert.equal(muted.musicMuted, true, `${browserName}: login mute must mute music.`);
    assert.equal(muted.effectsMuted, false, `${browserName}: login mute must leave effects enabled.`);
    assert.equal(muted.paused, true, `${browserName}: muting must pause the music element.`);
    assert.deepEqual(
      await page.evaluate(() => ({
        ariaPressed: document.getElementById("loginMusicMuteBtn")?.getAttribute("aria-pressed"),
        label: document.getElementById("loginMusicMuteBtn")?.getAttribute("aria-label"),
        profileMusicMuted: document.getElementById("musicMute")?.checked,
      })),
      {
        ariaPressed: "true",
        label: "Unmute music",
        profileMusicMuted: true,
      },
    );

    const effectQueued = await page.evaluate(() => window.CrownlandsAudio.playEffect("notification"));
    assert.equal(effectQueued, true, `${browserName}: effects must queue while music is muted.`);
    await page.waitForFunction(
      () => {
        const state = window.CrownlandsAudio?.getDebugState?.();
        return state?.bufferedEffectCount >= 1 && !state.lastEffectsError;
      },
      null,
      { timeout: PLAYBACK_TIMEOUT_MS },
    );

    await page.reload({ timeout: PLAYBACK_TIMEOUT_MS, waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.CrownlandsAudio?.ready === true,
      null,
      { timeout: PLAYBACK_TIMEOUT_MS },
    );
    const persistedMute = await getAudioState(page);
    assert.equal(persistedMute.musicMuted, true, `${browserName}: music mute must persist across reload.`);
    assert.equal(persistedMute.effectsMuted, false);
    assert.equal(persistedMute.paused, true);
    assert.equal(
      await page.locator("#loginMusicMuteBtn").getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(await page.locator("#musicMute").isChecked(), true);

    await page.locator("#loginMusicMuteBtn").click();
    assertHealthyPlayback(await waitForPlayback(page), "main_menu");
    assert.equal((await getAudioState(page)).effectsMuted, false);
    assert.equal(await page.locator("#musicMute").isChecked(), false);

    assert.deepEqual(issues, [], `${browserName}: audio-related browser errors were observed.`);
    return {
      browser: browserName,
      rangeResponses: rangedAudioRequests.length,
      source: (await getAudioState(page)).currentSource,
    };
  } finally {
    await context.close();
  }
}

async function runInFlightGestureRace(browser, baseUrl, fixture) {
  const context = await browser.newContext({
    serviceWorkers: "block",
    viewport: { height: 900, width: 1440 },
  });
  await addDocumentStartDiagnostics(context);
  const page = await context.newPage();
  const issues = installAudioDiagnostics(page);
  fixture.setAudioDelay(1000);
  try {
    await openApp(page, baseUrl);
    await page.waitForFunction(
      () => window.CrownlandsAudio?.getDebugState?.().unlockMode === "automatic",
      null,
      { timeout: PLAYBACK_TIMEOUT_MS },
    );
    assert.equal(
      await page.evaluate(() => window.__crownlandsMediaPlayCalls.length),
      1,
      "The race fixture must begin with one in-flight automatic play call.",
    );
    fixture.setAudioDelay(0);
    await clickOrdinarySurface(page);
    assert.ok(
      await page.evaluate(() => window.__crownlandsMediaPlayCalls.length >= 2),
      "The first trusted gesture must supersede the in-flight automatic play call.",
    );
    assertHealthyPlayback(await waitForPlayback(page), "main_menu");
    assert.equal((await getAudioState(page)).unlockMode, "idle");
    assert.deepEqual(issues, [], "The in-flight gesture race must not cause media errors.");
  } finally {
    fixture.setAudioDelay(0);
    await context.close();
  }
}

async function runBlockedPlaybackSuite(browser, baseUrl, mobile = false) {
  const context = await browser.newContext(mobile ? {
    hasTouch: true,
    isMobile: true,
    serviceWorkers: "allow",
    userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36",
    viewport: { height: 844, width: 390 },
  } : {
    serviceWorkers: "allow",
    viewport: { height: 900, width: 1440 },
  });
  await addDocumentStartDiagnostics(context);
  const page = await context.newPage();
  const issues = installAudioDiagnostics(page);
  const label = mobile ? "Android Chrome emulation" : "Chrome blocked autoplay";
  try {
    await openApp(page, baseUrl);
    await page.waitForTimeout(250);
    const blocked = await getAudioState(page);
    assert.equal(blocked.musicUnlocked, false, `${label}: autoplay must initially be blocked.`);
    assert.equal(blocked.paused, true);
    assert.equal(blocked.lastPlaybackError, "NotAllowedError");

    const viewport = page.viewportSize();
    if (mobile) {
      await page.touchscreen.tap(Math.floor(viewport.width / 2), 10);
      assert.ok(await page.evaluate(() => navigator.maxTouchPoints > 0));
    } else {
      await clickOrdinarySurface(page);
    }
    assertHealthyPlayback(await waitForPlayback(page), "main_menu");
    await waitForEffectsAuthorization(page);

    await page.evaluate(() => {
      window.CrownlandsAudio.currentMusic.pause();
      window.dispatchEvent(new Event("pageshow"));
    });
    assertHealthyPlayback(await waitForPlayback(page), "main_menu");

    if (mobile) {
      await waitForServiceWorkerControl(page);
      await page.reload({ timeout: PLAYBACK_TIMEOUT_MS, waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        () => window.CrownlandsAudio?.ready === true,
        null,
        { timeout: PLAYBACK_TIMEOUT_MS },
      );
      const reloaded = await getAudioState(page);
      assert.equal(reloaded.musicUnlocked, false, `${label}: a new mobile document may require a fresh gesture.`);
      await page.touchscreen.tap(Math.floor(viewport.width / 2), 10);
      assertHealthyPlayback(await waitForPlayback(page), "main_menu");
    }

    assert.deepEqual(issues, [], `${label}: audio-related browser errors were observed.`);
    return label;
  } finally {
    await context.close();
  }
}

async function runPreManifestGestureSuite(browser, baseUrl) {
  const context = await browser.newContext({
    serviceWorkers: "block",
    viewport: { height: 900, width: 1440 },
  });
  await addDocumentStartDiagnostics(context);
  const page = await context.newPage();
  const issues = installAudioDiagnostics(page);
  await page.route("**/audio/manifest.json", async route => {
    const response = await route.fetch();
    await new Promise(resolve => setTimeout(resolve, 650));
    await route.fulfill({ response });
  });
  try {
    await page.goto(`${baseUrl}/`, {
      timeout: PLAYBACK_TIMEOUT_MS,
      waitUntil: "domcontentloaded",
    });
    assert.equal(
      await page.evaluate(() => window.CrownlandsAudio?.ready),
      false,
      "The delayed-manifest fixture must receive the first gesture before audio is ready.",
    );
    await clickOrdinarySurface(page);
    await page.waitForFunction(
      () => window.CrownlandsAudio?.ready === true,
      null,
      { timeout: PLAYBACK_TIMEOUT_MS },
    );
    assertHealthyPlayback(await waitForPlayback(page), "main_menu");
    assert.equal((await getAudioState(page)).pendingMusicGesture, false);
    assert.deepEqual(issues, [], "The retained pre-manifest gesture must not cause media errors.");
    return "Chrome pre-manifest first gesture";
  } finally {
    await context.close();
  }
}

async function launchBrowser(executablePath, autoplayAllowed) {
  const args = [
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--mute-audio",
    autoplayAllowed
      ? "--autoplay-policy=no-user-gesture-required"
      : "--autoplay-policy=document-user-activation-required",
  ];
  if (!autoplayAllowed) {
    args.push("--disable-features=MediaEngagementBypassAutoplayPolicies,PreloadMediaEngagementData");
  }
  return chromium.launch({
    args,
    executablePath,
    headless: true,
  });
}

async function run() {
  assert.ok(BROWSER_CANDIDATES.length > 0, "No installed Chrome or Edge executable was found.");
  const fixture = createAudioBrowserTestServer();
  const address = await fixture.listen();
  const results = [];
  try {
    for (const candidate of BROWSER_CANDIDATES) {
      const browser = await launchBrowser(candidate.executablePath, true);
      try {
        results.push(await runAllowedPlaybackSuite(
          browser,
          candidate.name,
          address.url,
          fixture,
        ));
        if (candidate.name === "Chrome") {
          await runInFlightGestureRace(browser, address.url, fixture);
        }
      } finally {
        await browser.close();
      }
    }

    const chrome = BROWSER_CANDIDATES.find(candidate => candidate.name === "Chrome");
    if (chrome) {
      const blockedBrowser = await launchBrowser(chrome.executablePath, false);
      try {
        results.push({ browser: await runBlockedPlaybackSuite(blockedBrowser, address.url) });
        results.push({ browser: await runPreManifestGestureSuite(blockedBrowser, address.url) });
        results.push({ browser: await runBlockedPlaybackSuite(blockedBrowser, address.url, true) });
      } finally {
        await blockedBrowser.close();
      }
    }

    console.log("Real-browser Crownlands audio validation passed.");
    for (const result of results) {
      console.log(`- ${result.browser}${result.rangeResponses ? ` (${result.rangeResponses} ranged media responses)` : ""}`);
    }
  } finally {
    await fixture.close();
  }
}

run().catch(error => {
  console.error(describeError(error));
  process.exitCode = 1;
});
