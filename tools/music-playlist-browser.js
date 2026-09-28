"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { createAudioBrowserTestServer } = require("./audio-browser-test-server");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  const executable = [process.env.CHROME_PATH, process.env.CROWNLANDS_CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"]
    .find(file => file && fs.existsSync(file));
  assert(executable, "Set CHROME_PATH to a Chromium browser.");
  const server = createMapBenchmarkServer(), mapAddress = await server.listen();
  const audioServer = createAudioBrowserTestServer(), audioAddress = await audioServer.listen();
  // Keep the real map fixture and native byte-range audio delivery on one origin.
  const proxy = http.createServer((request, response) => {
    const base = request.url.startsWith("/audio/") ? audioAddress.url : mapAddress.url;
    const upstream = http.request(new URL(request.url, base), { method: request.method, headers: request.headers }, result => {
      response.writeHead(result.statusCode, result.headers); result.pipe(response);
    });
    upstream.on("error", error => response.destroy(error));
    request.pipe(upstream);
  });
  await new Promise(resolve => proxy.listen(0, "127.0.0.1", resolve));
  const address = { url: `http://127.0.0.1:${proxy.address().port}` };
  const browser = await startBrowserSession(executable);
  const client = await CdpClient.connect(browser.targets.find(target => target.type === "page").webSocketDebuggerUrl);
  const evidence = [], errors = [];
  const ev = async (fn, ...args) => {
    const result = await client.send("Runtime.evaluate", {
      expression: "(" + fn.toString() + ")(" + args.map(arg => JSON.stringify(arg)).join(",") + ")",
      awaitPromise: true, returnByValue: true,
    });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const ready = async (fn, ...args) => {
    for (let i = 0; i < 300; i++) { if (await ev(fn, ...args)) return; await delay(100); }
    throw Error("Music condition timed out: " + fn + "\n" + JSON.stringify(await ev(() => CrownlandsAudio.getDebugState())));
  };
  try {
    await Promise.all(["Page.enable", "Runtime.enable"].map(method => client.send(method)));
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    for (const [width, height] of [[1440, 900], [844, 390]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: height < 600 });
      await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
      await ready(() => document.documentElement?.dataset.crownlandsBenchmarkReady === "true" && window.CrownlandsAudio?.ready);
      await ev(() => { __CROWNLANDS_BENCHMARK__.closeModal(); CrownlandsAudio.setMusicMuted(false); });
      await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Shift", code: "ShiftLeft", windowsVirtualKeyCode: 16 });
      await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Shift", code: "ShiftLeft", windowsVirtualKeyCode: 16 });
      for (const type of ["mousePressed", "mouseReleased"]) {
        await client.send("Input.dispatchMouseEvent", { type, x: width / 2, y: 10, button: "left", buttons: type === "mousePressed" ? 1 : 0, clickCount: 1 });
      }
      await ready(() => !CrownlandsAudio.getDebugState().paused && CrownlandsAudio.currentMusic.currentTime > 0.1);
      const continuity = await ev(async () => {
        const manager = CrownlandsAudio, audio = manager.currentMusic, id = audio.dataset.audioId, src = audio.src;
        audio.currentTime = 30;
        let resets = 0, pauses = 0;
        const onReset = () => { resets++; }, onPause = () => { pauses++; };
        audio.addEventListener("loadstart", onReset); audio.addEventListener("pause", onPause);
        const maps = await __CROWNLANDS_BENCHMARK__.switchNeighborAndReturn();
        for (const state of ["main_menu", "world_map", "danger", "battle", "victory", "world_map"]) {
          await manager.setMusicState(state, { returnState: "world_map" });
          manager.pulseMusic("battle", 3500, state);
        }
        audio.removeEventListener("loadstart", onReset); audio.removeEventListener("pause", onPause);
        return { maps: [maps.neighborResult, maps.returnResult], sameElement: audio === manager.currentMusic,
          sameTrack: id === audio.dataset.audioId && src === audio.src, currentTime: audio.currentTime, resets, pauses,
          startupTracks: new Set(performance.getEntriesByType("resource").filter(entry => /\/audio\/music\/.+\.mp3/.test(entry.name)).map(entry => entry.name)).size };
      });
      assert.deepEqual(continuity.maps, [true, true]); assert(continuity.sameElement && continuity.sameTrack);
      assert(continuity.currentTime >= 30, JSON.stringify(continuity)); assert.equal(continuity.resets, 0); assert.equal(continuity.pauses, 0);
      assert.equal(continuity.startupTracks, 1, "Startup and map changes must only request the playing song");

      const sequence = [];
      for (let i = 0; i < 9; i++) {
        const state = await ev(() => CrownlandsAudio.getDebugState());
        assert.equal(state.currentMusicState, "soundtrack"); assert.equal(state.lastPlaybackError, "");
        sequence.push(state.currentAssetId);
        // Real ended events exercise natural advancement, including after mute/background.
        await ev(async i => {
          const m = CrownlandsAudio;
          if (i === 0) { await m.setMusicMuted(true); await m.setMusicMuted(false); }
          if (i === 1) { m.pauseForLifecycle("browser-test"); await m.resumeFromLifecycle(); }
          m.currentMusic.currentTime = m.currentMusic.duration - 0.15;
        }, i);
        await ready(id => {
          const m = CrownlandsAudio;
          return m.currentMusic?.dataset.audioId !== id && m.currentMusic?.currentTime > 0.05 && !m.currentMusic.paused;
        }, state.currentAssetId);
      }
      assert.equal(new Set(sequence.slice(0, 8)).size, 8);
      assert.notEqual(sequence[7], sequence[8]);
      assert.equal(await ev(() => document.querySelectorAll("audio").length), 1);

      const decoded = await ev(async () => {
        const context = new AudioContext(), results = [];
        try {
          for (const asset of CrownlandsAudio.musicPlaylists.get("soundtrack")) {
            const response = await fetch(asset.url), buffer = await context.decodeAudioData(await response.arrayBuffer());
            let peak = 0, squares = 0;
            const samples = buffer.getChannelData(0);
            for (let i = 0; i < samples.length; i++) { peak = Math.max(peak, Math.abs(samples[i])); squares += samples[i] ** 2; }
            results.push({ id: asset.id, status: response.status, duration: buffer.duration, channels: buffer.numberOfChannels, peak, rms: Math.sqrt(squares / samples.length) });
          }
        } finally { await context.close(); }
        return results;
      });
      assert.equal(decoded.length, 8);
      for (const track of decoded) {
        assert.equal(track.status, 200); assert.equal(track.channels, 2);
        assert(track.duration > 160 && track.duration < 225); assert(track.peak > 0.1 && track.peak < 1); assert(track.rms > 0.01);
      }
      evidence.push({ viewport: [width, height], continuity, sequence, decoded });
      console.log(`Music browser ${width}x${height}: real map switches preserved playback; all eight MP3s decoded and advanced naturally after mute/background.`);
    }
    assert.deepEqual(errors, []);
    const folder = path.resolve(__dirname, "../release-artifacts/continuous-shuffled-music");
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, "browser-verification.json"), JSON.stringify(evidence, null, 2) + "\n");
  } finally {
    await client.send("Browser.close").catch(() => {}); client.close();
    if (!await waitForProcessExit(browser.browserProcess)) { browser.browserProcess.kill(); await waitForProcessExit(browser.browserProcess); }
    await removeBrowserProfile(browser.profilePath);
    proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve));
    await server.close(); await audioServer.close();
  }
}
module.exports = { run };
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
