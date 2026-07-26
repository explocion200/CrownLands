(function () {
  const config = window.CROWNLANDS_UI_LAYOUT_CONFIG;
  if (!config || config.schemaVersion !== 1 || !config.presets) return;

  const selectors = {
    profile: ".profile-stack",
    fullscreen: "#fullscreenBtn",
    inventory: "#inventoryBtn",
    shop: "#shopBtn",
    activeEffects: "#activeItemEffectsStack",
    cityList: "#cityListBtn",
    islandSwitch: "#islandSwitchBtn",
    returnHome: "#mainCityReturnBtn",
    commanderPanel: ".commander-panel",
    outgoingMarch: "#outgoingAttackBtn",
    incomingMarch: "#incomingAttackBtn",
    reportsNav: ".bottom-nav",
  };
  const anchors = {
    topLeft: ["left", "top"],
    topCenter: ["center", "top"],
    topRight: ["right", "top"],
    centerLeft: ["left", "center"],
    center: ["center", "center"],
    centerRight: ["right", "center"],
    bottomLeft: ["left", "bottom"],
    bottomCenter: ["center", "bottom"],
    bottomRight: ["right", "bottom"],
  };

  function choosePreset() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (width >= 1100 && height >= 650) return config.presets.desktop;
    return config.presets.landscapeTablet;
  }

  function positionFor(component) {
    const [horizontal, vertical] = anchors[component.anchor] || anchors.topLeft;
    const x = Number(component.offsetX) || 0;
    const y = Number(component.offsetY) || 0;
    const translateX = horizontal === "center" ? "-50%" : "0";
    const translateY = vertical === "center" ? "-50%" : "0";
    return {
      left: horizontal === "left" ? `${x}px` : horizontal === "center" ? `calc(50% + ${x}px)` : "auto",
      right: horizontal === "right" ? `${x}px` : "auto",
      top: vertical === "top" ? `${y}px` : vertical === "center" ? `calc(50% + ${y}px)` : "auto",
      bottom: vertical === "bottom" ? `${y}px` : "auto",
      transform: `translate(${translateX}, ${translateY})`,
    };
  }

  function applyLayout() {
    const preset = choosePreset();
    Object.entries(preset?.components || {}).forEach(([id, component]) => {
      const element = document.querySelector(selectors[id]);
      if (!element || !component || typeof component !== "object") return;
      if ((id === "outgoingMarch" || id === "incomingMarch") && element.parentElement?.classList.contains("bottom-nav")) {
        document.querySelector(".game-view")?.appendChild(element);
      }
      const position = positionFor(component);
      element.classList.add("hud-layout-managed");
      Object.entries(position).forEach(([property, value]) => { element.style[property] = value; });
      if (Number.isFinite(Number(component.width))) element.style.width = `${component.width}px`;
      if (Number.isFinite(Number(component.height))) element.style.height = `${component.height}px`;
      if (Number.isFinite(Number(component.zIndex))) element.style.zIndex = String(component.zIndex);
      element.classList.toggle("hud-layout-hidden", component.visible === false);
    });
  }

  applyLayout();
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(applyLayout, 100);
  });
})();
