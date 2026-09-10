"use strict";
const preview = document.getElementById("preview");
const canvas = document.getElementById("canvas");
const selection = { panel:"list", layout:"draft", viewport:"phone" };
const sizes = { phone:[390,844], landscape:[844,390], desktop:[1440,900] };
function sizePreview() {
  const [width,height]=sizes[selection.viewport];
  const scale=Math.min(1,(document.documentElement.clientWidth-24)/width);
  preview.style.width=`${width}px`;preview.style.height=`${height}px`;preview.style.transform=`scale(${scale})`;
  canvas.style.width=`${width*scale}px`;canvas.style.height=`${height*scale}px`;
  document.getElementById("dimensions").textContent=`${width} × ${height} screen${scale<1?` · ${Math.round(scale*100)}% preview`:""}`;
}
function update() {
  document.querySelectorAll(".review-controls button").forEach(button=>{
    const key=Object.keys(button.dataset)[0];button.setAttribute("aria-pressed",String(selection[key]===button.dataset[key]));
  });
  document.getElementById("reviewNote").textContent=selection.layout==="current"
    ? "Current shipped layout, shown with the same sample information for comparison."
    : selection.panel==="list" ? "Matching window dimensions. Image, level, garrison and production share one band; on phones, upgrades sit directly below."
    : "Matching window dimensions. City information stays on the left; Develop this city stays on the right. Both columns scroll when needed.";
  preview.contentWindow?.postMessage({type:"compact-city-preview",panel:selection.panel,layout:selection.layout},location.origin);
  sizePreview();
}
document.querySelectorAll(".review-controls button").forEach(button=>button.addEventListener("click",()=>{Object.assign(selection,button.dataset);update();}));
preview.addEventListener("load",update);window.addEventListener("resize",sizePreview);
window.addEventListener("message",event=>{if(event.origin!==location.origin||event.source!==preview.contentWindow||event.data?.type!=="compact-city-panel")return;selection.panel=event.data.panel;update();});
update();
