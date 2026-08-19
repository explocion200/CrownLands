(function () {
  const config = window.CROWNLANDS_UI_LAYOUT_CONFIG;
  if (!config || config.schemaVersion !== 1 || !config.presets) return;

  const selectors = {
    profile: ".profile-stack",
    fullscreen: "#fullscreenBtn",
    chat: "#chatToggleBtn",
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
  const chatRowGap = 9;
  const positionProperties = ["left", "right", "top", "bottom", "transform", "z-index"];

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

  function clearManagedPosition(element) {
    if (!element) return;
    element.classList.remove("hud-layout-managed", "hud-layout-hidden");
    positionProperties.forEach(property => element.style.removeProperty(property));
  }

  function restoreOperationAlertStack() {
    const nav = document.querySelector(".bottom-nav");
    const reports = document.querySelector("#logBtn");
    const outgoing = document.querySelector("#outgoingAttackBtn");
    const incoming = document.querySelector("#incomingAttackBtn");
    if (!nav || !reports || !outgoing || !incoming) return;
    [outgoing, incoming].forEach(element => {
      clearManagedPosition(element);
      element.style.removeProperty("width");
      element.style.removeProperty("height");
    });
    nav.appendChild(incoming);
    nav.appendChild(outgoing);
    nav.appendChild(reports);
  }

  function alignChatToBag() {
    const chat = document.querySelector(selectors.chat);
    const bag = document.querySelector(selectors.inventory);
    if (!chat || !bag) return;
    const chatRect = chat.getBoundingClientRect();
    const bagRect = bag.getBoundingClientRect();
    if (!chatRect.width || !chatRect.height || !bagRect.width || !bagRect.height) return;
    const centeredTop = bagRect.top + (bagRect.height - chatRect.height) / 2;
    chat.style.right = `${Math.max(0, window.innerWidth - bagRect.left + chatRowGap)}px`;
    chat.style.bottom = `${Math.max(0, window.innerHeight - centeredTop - chatRect.height)}px`;
  }

  function applyLayout() {
    const preset = choosePreset();
    restoreOperationAlertStack();
    Object.entries(preset?.components || {}).forEach(([id, component]) => {
      const element = document.querySelector(selectors[id]);
      if (!element || !component || typeof component !== "object") return;
      if (id === "returnHome" && element.classList.contains("hud-home-return")) return;
      if (id === "outgoingMarch" || id === "incomingMarch") return;
      let layoutElement = element;
      if (id === "fullscreen") {
        const resourceBar = element.closest(".resource-bar");
        if (resourceBar?.classList.contains("has-home-return")) {
          clearManagedPosition(element);
          layoutElement = resourceBar;
          resourceBar.style.setProperty("--hud-corner-control-width", `${Number(component.width) || 38}px`);
          resourceBar.style.setProperty("--hud-corner-control-height", `${Number(component.height) || 38}px`);
        } else if (resourceBar) {
          clearManagedPosition(resourceBar);
          resourceBar.style.removeProperty("--hud-corner-control-width");
          resourceBar.style.removeProperty("--hud-corner-control-height");
        }
      }
      const position = positionFor(component);
      layoutElement.classList.add("hud-layout-managed");
      Object.entries(position).forEach(([property, value]) => { layoutElement.style[property] = value; });
      if (Number.isFinite(Number(component.width))) element.style.width = `${component.width}px`;
      if (Number.isFinite(Number(component.height))) element.style.height = `${component.height}px`;
      if (Number.isFinite(Number(component.zIndex))) layoutElement.style.zIndex = String(component.zIndex);
      layoutElement.classList.toggle("hud-layout-hidden", component.visible === false);
    });
    alignChatToBag();
    window.dispatchEvent(new Event("crownlands:ui-layout-applied"));
  }

  applyLayout();
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(applyLayout, 100);
  });
  window.addEventListener("crownlands:ui-layout-refresh", applyLayout);
})();
