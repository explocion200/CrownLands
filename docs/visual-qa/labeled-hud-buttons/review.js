"use strict";
(() => {
  const frame = document.getElementById("preview"), fit = document.getElementById("fit");
  const sizes = { desktop: [1440, 900], landscape: [844, 390], small: [568, 320] };
  const query = new URLSearchParams(location.search);
  let viewport = Object.hasOwn(sizes, query.get("viewport")) ? query.get("viewport") : "landscape";
  let look = query.get("look") === "current" ? "current" : "draft";
  const clan = document.getElementById("clan"), badges = document.getElementById("badges");
  if (["amber", "raven", "none"].includes(query.get("clan"))) clan.value = query.get("clan");
  badges.checked = query.get("badges") !== "false";
  function resize() {
    const [width, height] = sizes[viewport];
    const scale = Math.min(1, (fit.parentElement.clientWidth - 26) / width);
    Object.assign(fit.style, { width: width * scale + "px", height: height * scale + "px" });
    Object.assign(frame.style, { width: width + "px", height: height + "px", transform: `scale(${scale})` });
    document.getElementById("dimensions").textContent = `${width} × ${height} · ${Math.round(scale * 100)}% preview`;
  }
  function sync() {
    resize();
    document.querySelectorAll("[data-viewport]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.viewport === viewport)));
    document.querySelectorAll("[data-look]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.look === look)));
    const settings = { look, clan: clan.value, badges: badges.checked };
    frame.contentWindow.postMessage({ type: "labeled-hud-review", ...settings }, location.origin);
    const params = new URLSearchParams({ look, clan: clan.value, badges: String(badges.checked) });
    document.getElementById("fullWindow").href = "preview.html?" + params;
    history.replaceState(null, "", "?viewport=" + viewport + "&" + params);
  }
  document.querySelectorAll("[data-viewport]").forEach(b => b.addEventListener("click", () => { viewport = b.dataset.viewport; sync(); }));
  document.querySelectorAll("[data-look]").forEach(b => b.addEventListener("click", () => { look = b.dataset.look; sync(); }));
  clan.addEventListener("change", sync); badges.addEventListener("change", sync);
  window.addEventListener("message", event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.type !== "labeled-hud-status") return;
    document.getElementById("status").textContent = event.data.message;
    if (event.data.ready) { document.documentElement.dataset.draftReady = "true"; sync(); }
  });
  new ResizeObserver(resize).observe(fit.parentElement);
  frame.src = "preview.html?" + new URLSearchParams({ look, clan: clan.value, badges: String(badges.checked) });
  sync();
})();
