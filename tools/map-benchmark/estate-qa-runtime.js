/* Real estate/equipment UI with synthetic state, only in the loopback harness. */
(function installEstateUiQa() {
  "use strict";
  const query = new URLSearchParams(location.search);
  if (query.get("estateUi") !== "1") return;
  if (location.hostname !== "127.0.0.1") throw Error("Estate QA requires the loopback fixture.");
  const run = async () => {
    const started = performance.now();
    while (window.__CROWNLANDS_BENCHMARK__?.getStatus().status !== "ready") {
      if (performance.now() - started > 30000) throw Error("Estate fixture did not become ready.");
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const scene = ["initial", "completed", "constructing"].includes(query.get("scene")) ? query.get("scene") : "initial";
    const renderer = window.CrownlandsEstate;
    const fixture = scene === "initial" ? null : Object.fromEntries(renderer.buildings.map(b => [b.key, scene]));
    // Each real Back action remounts the same development scene and controls.
    window.CrownlandsEstate = Object.freeze({ ...renderer, mount(host, options) {
      const view = renderer.mount(host, { ...options, fixture });
      window.estatePreview = view;
      const controls = document.createElement("div");
      controls.id = "fixtureControls";
      controls.innerHTML = '<select aria-label="Visual fixture"><option value="initial">Initial estate</option><option value="completed">All completed</option><option value="constructing">Construction</option></select>';
      host.querySelector(".estate-viewport").append(controls);
      controls.children[0].value = scene;
      controls.children[0].onchange = event => {
        query.set("scene", event.target.value);
        location.search = query.toString();
      };
      return view;
    } });
    const style = document.createElement("style");
    style.textContent = '#fixtureControls{position:absolute;right:12px;bottom:12px;z-index:15;padding:4px;background:#f0e4c7;border:1px solid #ad9870}#fixtureControls select{min-height:44px;max-width:125px;background:#f0e4c7;color:#332e23;border:1px solid #ad9870}@media(max-height:550px){#fixtureControls{right:7px;bottom:7px}#fixtureControls select{max-width:100px}}';
    document.head.append(style);
    document.title = "Crownlands Estate — Building UI Preview";
    window.__CROWNLANDS_BENCHMARK__.closeModal();
    state.gear = normalizeCommonGearState(state.gear);
    const city = getMainCityReference();
    city.name = "Crownlands";
    openInnerCastle(city.id);
    toast.classList.remove("visible");
    document.documentElement.dataset.estateQa = "ready";
  };
  run().catch(error => { document.documentElement.dataset.estateQa = "error"; console.error(error); });
})();
