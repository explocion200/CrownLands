"use strict";
const preview = document.getElementById("preview");
const requestedBuilding = new URLSearchParams(location.search).get("building");
if (requestedBuilding) {
  const previewUrl = new URL(preview.getAttribute("src"), location.href);
  previewUrl.searchParams.set("building", requestedBuilding);
  preview.src = previewUrl.href;
}
const canvas = document.getElementById("canvas");
const selection = { layout: "draft", viewport: new URLSearchParams(location.search).get("viewport") === "landscape" ? "landscape" : "desktop" };
const sizes = { landscape: [844, 390], desktop: [1440, 900] };
function sizePreview() {
  const [width, height] = sizes[selection.viewport];
  const scale = Math.min(1, (document.documentElement.clientWidth - 24) / width);
  preview.style.width = `${width}px`;
  preview.style.height = `${height}px`;
  preview.style.transform = `scale(${scale})`;
  canvas.style.width = `${width * scale}px`;
  canvas.style.height = `${height * scale}px`;
  document.getElementById("dimensions").textContent = `${width} × ${height} screen${scale < 1 ? ` · ${Math.round(scale * 100)}% preview` : ""}`;
}
function update() {
  document.querySelectorAll(".review-controls button").forEach(button => {
    const key = Object.keys(button.dataset)[0];
    button.setAttribute("aria-pressed", String(selection[key] === button.dataset[key]));
  });
  document.getElementById("reviewNote").textContent = selection.layout === "current"
    ? "Existing overview captured from the local game fixture. Select any of the six buildings to compare its information."
    : "Desktop and mobile landscape only · New Royal Bailey, Great Hall and Treasury artwork. Select a hanging building sign.";
  preview.contentWindow?.postMessage({ type: "castle-overview-preview", layout: selection.layout }, location.origin);
  sizePreview();
}
document.querySelectorAll(".review-controls button").forEach(button => button.addEventListener("click", () => {
  Object.assign(selection, button.dataset);
  update();
}));
preview.addEventListener("load", update);
window.addEventListener("resize", sizePreview);
update();
