"use strict";
(() => {
  const frame = document.querySelector("#preview");
  const stage = document.querySelector("#stage");
  const viewport = document.querySelector("#viewport");
  const state = document.querySelector("#state");
  function fit() {
    const [width, height] = viewport.value.split("x").map(Number);
    const parentStyle = getComputedStyle(stage.parentElement);
    const available = stage.parentElement.clientWidth - parseFloat(parentStyle.paddingLeft) - parseFloat(parentStyle.paddingRight);
    const scale = Math.min(1, available / width);
    stage.style.width = `${width * scale}px`;
    stage.style.height = `${height * scale}px`;
    frame.style.width = `${width}px`;
    frame.style.height = `${height}px`;
    frame.style.transform = `scale(${scale})`;
    document.querySelector("#scaleNote").textContent = `${width} × ${height} viewport${scale < 1 ? `, shown at ${Math.round(scale * 100)}%` : ", shown at actual size"}. Try the city tabs and +1 upgrade. All values and outcomes are samples.`;
  }
  function reload() {
    const url = `frame.html?${new URLSearchParams({ state: state.value })}`;
    frame.src = url;
    document.querySelector("#openFrame").href = url;
    fit();
  }
  [viewport, state].forEach(element => element.addEventListener("change", reload));
  document.querySelector("#reset").addEventListener("click", () => { state.value = "ready"; reload(); });
  new ResizeObserver(fit).observe(stage.parentElement);
  fit();
})();
