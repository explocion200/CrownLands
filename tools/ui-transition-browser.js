"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

async function validateUiTransitions(client, evaluate) {
  const root = path.resolve(__dirname, "..");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "audio/manifest.json"), "utf8"));
  for (const id of ["menu_open", "menu_close", "parchment_open"]) {
    const asset = manifest.assets.find(entry => entry.id === id);
    assert.equal(asset.source_sha256, "b900ac84cd3d7fa6e07f8accd68fd96c2b9493ea5dea7b6d29fa6ec676f0cb3a");
    for (const extension of ["wav", "mp3", "ogg"]) {
      assert.deepEqual(fs.readFileSync(path.join(root, "audio/ui", `${id}.${extension}`)),
        fs.readFileSync(path.join(root, "audio/ui", `menu_open.${extension}`)), "Every UI transition must use the supplied recording");
    }
  }

  const results = await evaluate(async () => {
    const manager = CrownlandsAudio, dialog = document.getElementById("modal"), profile = document.getElementById("profileScreen");
    const events = [], checks = [], play = manager.playEffect;
    const settle = () => new Promise(resolve => setTimeout(resolve, 80));
    await settle();
    manager.playEffect = function (id, options) {
      const accepted = play.call(this, id, options);
      if (accepted) events.push(id);
      return accepted;
    };
    const button = document.createElement("button");
    button.textContent = "Inspect";
    document.body.appendChild(button);
    const check = async (name, action) => {
      const start = events.length;
      action(); await settle();
      checks.push({ name, events: events.slice(start) });
    };
    const music = manager.currentMusic, musicSource = music.src, musicPosition = music.currentTime;
    const muted = manager.preferences.effectsMuted;
    try {
      await check("generic button opens dialog once", () => { button.onclick = () => dialog.showModal(); button.click(); });
      await check("repeated open stays silent", () => dialog.showModal());
      await check("content refresh stays silent", () => { dialog.classList.add("audio-test-refresh"); dialog.classList.remove("audio-test-refresh"); });
      await check("close button closes once", () => document.getElementById("closeModalBtn").click());
      await check("repeated close stays silent", () => dialog.close());
      await check("report cue suppresses generic open", () => { manager.playEffect("parchment_open", { cooldownMs: 120 }); dialog.showModal(); });
      await check("backdrop dismissal closes once", () => dialog.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      await check("contextual action suppresses generic open", () => { dialog.showModal(); manager.playEffect("level_up"); });
      await check("programmatic close", () => dialog.close());
      await check("profile opens once", () => profile.classList.add("open"));
      await check("profile rerender stays silent", () => { profile.classList.add("audio-test-refresh"); profile.classList.remove("audio-test-refresh"); });
      await check("profile closes once", () => profile.classList.remove("open"));
      manager.setEffectsMuted(true);
      await check("muted opening stays silent", () => dialog.showModal());
      await check("muted closing stays silent", () => dialog.close());
      manager.setEffectsMuted(muted);
      await check("ordinary button retains click", () => { button.onclick = null; button.click(); });
      await check("prepare keyboard close", () => dialog.showModal());
      window.__uiAudioCloseProbe = { events, start: events.length, restore: () => { manager.playEffect = play; button.remove(); } };
      return { checks, musicContinuous: manager.currentMusic === music && music.src === musicSource && music.currentTime >= musicPosition && !music.paused };
    } catch (error) {
      manager.playEffect = play; button.remove(); manager.setEffectsMuted(muted);
      throw error;
    }
  });
  const expected = [
    ["menu_open"], [], [], ["menu_close"], [], ["parchment_open"], ["menu_close"], ["level_up"], ["menu_close"],
    ["menu_open"], [], ["menu_close"], [], [], ["button_click"], ["menu_open"],
  ];
  try {
    results.checks.forEach((check, index) => assert.deepEqual(check.events, expected[index], check.name));
    assert(results.musicContinuous, "UI transitions must preserve music playback");
    for (const type of ["keyDown", "keyUp"]) await client.send("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    const escape = await evaluate(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      return { open: document.getElementById("modal").open, events: __uiAudioCloseProbe.events.slice(__uiAudioCloseProbe.start) };
    });
    assert.equal(escape.open, false, "Escape must still close the dialog");
    assert.deepEqual(escape.events, ["menu_close"], "Escape must play one close cue");
  } finally {
    await evaluate(() => { window.__uiAudioCloseProbe?.restore(); delete window.__uiAudioCloseProbe; });
  }
  return { checks: results.checks.length + 1, musicContinuous: results.musicContinuous };
}

module.exports = { validateUiTransitions };
