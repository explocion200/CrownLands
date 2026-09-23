"use strict";
const game = document.getElementById("game"), loading = document.getElementById("loading");
const query = new URLSearchParams(location.search);
let requested = { size: Number(query.get("size")) || 56, zoom: Number(query.get("zoom")) || 60, sample: query.get("sample") === "owned" ? "owned" : "rival" };
let ready = false, currentSample = null, applying = false, pending = false;
function reportError(error) { loading.hidden = false; loading.textContent = error.message + " Reload to try again."; }
async function update() {
  if (!ready) return;
  if (applying) { pending = true; return; }
  applying = true;
  try {
    do {
      pending = false;
      const next = { ...requested };
      if (currentSample !== next.sample || !game.contentDocument.querySelector(".clan-tower-action-wheel")) {
        await game.contentWindow.CrownlandsCastlePositionReview.settings({ sample: next.sample, level: 4 });
        currentSample = next.sample;
      }
      game.contentWindow.CrownlandsActionSizeReview.set(next);
      loading.hidden = true;
      document.documentElement.dataset.actionSizeReady = "true";
    } while (pending);
  } catch (error) { reportError(error); }
  finally { applying = false; }
}
function inject(source) {
  return new Promise((resolve, reject) => {
    const script = game.contentDocument.createElement("script");
    script.src = source; script.onload = resolve; script.onerror = () => reject(Error("Could not load the review fixture."));
    game.contentDocument.body.appendChild(script);
  });
}
game.addEventListener("load", async () => {
  try {
    let loaded = false;
    for (let i = 0; i < 300; i++) {
      const data = game.contentDocument?.documentElement?.dataset;
      if (data?.crownlandsBenchmarkReady === "true") { loaded = true; break; }
      if (data?.crownlandsBenchmarkError === "true") throw Error("The sample map could not start.");
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!loaded) throw Error("The sample map did not finish loading.");
    await inject("/docs/visual-qa/clan-castle-layout/map-preview.js");
    await inject("/docs/visual-qa/clan-tower-action-size/action-size-fixture.js");
    ready = true;
    await update();
    parent.postMessage({ type: "tower-size-ready" }, location.origin);
  } catch (error) { reportError(error); }
});
window.addEventListener("message", event => {
  if (event.origin !== location.origin) return;
  if (event.source === parent && event.data?.type === "tower-size-settings") { requested = { ...requested, ...event.data }; void update(); }
  if (event.source === game.contentWindow && event.data?.type === "tower-size-measurement") parent.postMessage(event.data, location.origin);
});
