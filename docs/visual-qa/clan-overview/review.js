"use strict";
const frame = document.getElementById("preview"), canvas = document.getElementById("canvas");
const sizes = { desktop: [1440, 900], landscape: [844, 390], small: [568, 320] };
const query = new URLSearchParams(location.search);
let viewport = Object.hasOwn(sizes, query.get("viewport")) ? query.get("viewport") : "desktop";
function resize() {
  const [width, height] = sizes[viewport], scale = Math.min(1, (document.documentElement.clientWidth - 24) / width);
  Object.assign(frame.style, { width: `${width}px`, height: `${height}px`, transform: `scale(${scale})` });
  Object.assign(canvas.style, { width: `${width * scale}px`, height: `${height * scale}px` });
  document.getElementById("dimensions").textContent = `${width} × ${height} screen${scale < 1 ? ` · ${Math.round(scale * 100)}% preview` : ""}`;
  document.querySelectorAll("[data-viewport]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.viewport === viewport)));
}
function reset() {
  document.getElementById("reviewStatus").textContent = "Example reset. Changes stay in this draft.";
  if (frame.contentWindow?.location.pathname !== new URL("preview.html", location.href).pathname) { frame.src = "preview.html"; return; }
  frame.contentWindow?.postMessage({ type: "clan-review", sample: document.getElementById("sample").value }, location.origin);
}
document.querySelectorAll("[data-viewport]").forEach(button => button.addEventListener("click", () => {
  viewport = button.dataset.viewport; resize(); history.replaceState(null, "", `?viewport=${viewport}`);
}));
document.getElementById("sample").addEventListener("change", reset);
document.getElementById("reset").addEventListener("click", reset);
frame.addEventListener("load", reset);
window.addEventListener("message", event => {
  if (event.origin === location.origin && event.source === frame.contentWindow && event.data?.type === "clan-review-status") document.getElementById("reviewStatus").textContent = event.data.message;
});
window.addEventListener("resize", resize); resize();
