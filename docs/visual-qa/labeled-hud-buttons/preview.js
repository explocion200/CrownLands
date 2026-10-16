"use strict";
(() => {
  const frame = document.getElementById("game"), notice = document.getElementById("notice"), query = new URLSearchParams(location.search);
  let ready = false;
  const normalize = data => ({ look: data.look === "current" ? "current" : "draft", clan: ["amber", "raven", "none"].includes(data.clan) ? data.clan : "amber", badges: data.badges !== false && data.badges !== "false" });
  let settings = normalize(Object.fromEntries(query));
  const status = (message, ready = false) => parent.postMessage({ type: "labeled-hud-status", message, ready }, location.origin);
  window.addEventListener("message", event => {
    if (event.origin !== location.origin) return;
    if (event.source === parent && event.data?.type === "labeled-hud-review") {
      settings = normalize(event.data); if (ready) frame.contentWindow.LabeledHudDraft.apply(settings);
    }
    if (event.source === frame.contentWindow && event.data?.type === "labeled-hud-status") status(event.data.message);
  });
  frame.addEventListener("load", async () => {
    try {
      const win = frame.contentWindow, doc = frame.contentDocument;
      for (let i = 0; i < 600 && doc.documentElement.dataset.crownlandsBenchmarkReady !== "true"; i++) await new Promise(resolve => setTimeout(resolve, 100));
      if (!win.__CROWNLANDS_BENCHMARK__ || !win.CrownlandsOnline?.__getBenchmarkTelemetry || doc.documentElement.dataset.crownlandsBenchmarkReady !== "true") throw Error("Fixture unavailable");
      const style = doc.createElement("link"); style.rel = "stylesheet"; style.href = "/docs/visual-qa/labeled-hud-buttons/draft.css";
      const styled = new Promise((resolve, reject) => { style.onload = resolve; style.onerror = reject; }); doc.head.append(style); await styled;
      const script = doc.createElement("script"); script.src = "/docs/visual-qa/labeled-hud-buttons/runtime-fixture.js";
      const loaded = new Promise((resolve, reject) => { script.onload = resolve; script.onerror = reject; }); doc.body.append(script); await loaded;
      await Promise.all([...doc.querySelectorAll(".hud-draft-image")].map(image => image.decode()));
      ready = true; notice.hidden = true; win.LabeledHudDraft.apply(settings);
      doc.documentElement.dataset.hudDraftReady = "true"; document.documentElement.dataset.hudDraftReady = "true";
      status("Appearance preview only · Uses example clans and sample game data.", true);
    } catch (_) {
      notice.hidden = false; notice.textContent = "Start the local map benchmark server to view this draft."; status(notice.textContent);
    }
  });
  if (location.hostname !== "127.0.0.1") { notice.textContent = "This draft runs only on the local preview server."; return; }
  frame.src = "/__benchmark__/?scenario=A&visualMarches=2&hudOperations=both&chatMode=quick";
})();
