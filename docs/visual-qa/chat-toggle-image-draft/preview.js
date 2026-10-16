"use strict";
(() => {
  const frame = document.getElementById("game"), notice = document.getElementById("notice");
  let ready = false;
  const normalize = data => ({ look: data.look === "current" ? "current" : "draft", open: data.open === true || data.open === "true", unread: data.unread === true || data.unread === "true" });
  let settings = normalize(Object.fromEntries(new URLSearchParams(location.search)));
  const status = (message, ready = false) => parent.postMessage({ type:"chat-image-status", message, ready }, location.origin);
  window.addEventListener("message", event => {
    if (event.origin !== location.origin) return;
    if (event.source === parent && event.data?.type === "chat-image-review") {
      settings = normalize(event.data); if (ready) frame.contentWindow.ChatImageDraft.apply(settings);
    }
    if (event.source === frame.contentWindow && event.data?.type === "chat-image-state") {
      settings.open = event.data.open;
      parent.postMessage({ type:"chat-image-state", open:settings.open }, location.origin);
    }
  });
  frame.addEventListener("load", async () => {
    try {
      const win = frame.contentWindow, doc = frame.contentDocument;
      for (let i=0;i<600 && doc.documentElement.dataset.crownlandsBenchmarkReady !== "true";i++) await new Promise(resolve => setTimeout(resolve,100));
      if (!win.__CROWNLANDS_BENCHMARK__ || !win.CrownlandsOnline?.__getBenchmarkTelemetry || doc.documentElement.dataset.crownlandsBenchmarkReady !== "true") throw Error("Synthetic game unavailable");
      const style = doc.createElement("link"); style.rel = "stylesheet"; style.href = "/docs/visual-qa/chat-toggle-image-draft/draft.css";
      const styled = new Promise((resolve,reject) => { style.onload=resolve;style.onerror=reject; });doc.head.append(style);await styled;
      const script = doc.createElement("script");script.src = "/docs/visual-qa/chat-toggle-image-draft/runtime-fixture.js";
      const loaded = new Promise((resolve,reject) => { script.onload=resolve;script.onerror=reject; });doc.body.append(script);await loaded;
      await Promise.all([...doc.querySelectorAll(".chat-image-draft")].map(image=>image.decode()));
      ready=true;notice.hidden=true;win.ChatImageDraft.apply(settings);
      document.documentElement.dataset.chatDraftReady="true";
      status("Draft only · Click the Chat arrow in the map to show or hide sample messages.",true);
    } catch (_) { notice.hidden=false;notice.textContent="Start the local map benchmark server to view this draft.";status(notice.textContent); }
  });
  if (location.hostname !== "127.0.0.1") { notice.textContent="This preview runs only on the local preview server.";return; }
  frame.src="/__benchmark__/?scenario=A&visualMarches=0&chatMode=closed";
})();
