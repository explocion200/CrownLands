(function () {
  "use strict";

  const CONFIG_URL = "/ui-studio-config.json";
  const STYLE_ID = "crownlands-ui-studio-runtime";
  const SCREEN_SELECTORS = Object.freeze({
    "commander-panel": ".commander-panel .cl-shared-close",
    "shared-modal": ".modal .modal-close.cl-shared-close",
    "player-profile": ".profile-screen:not(.clan-active):not(.settings-active) .profile-screen-close.cl-shared-close",
    "clan-members": ".profile-screen.clan-active .profile-screen-close.cl-shared-close",
    "reports": ".battle-report-modal .modal-close.cl-shared-close",
    "scout-report": ".scout-report-modal .modal-close.cl-shared-close",
    "daily-login": ".daily-login-reward-modal:has(#dailyRewardTabRewards[aria-selected=\"true\"]) .modal-close.cl-shared-close",
    "daily-missions": ".daily-mission-modal .modal-close.cl-shared-close, .daily-login-reward-modal:has(#dailyRewardTabQuests[aria-selected=\"true\"]) .modal-close.cl-shared-close",
    "achievements": ".daily-login-reward-modal:has(#dailyRewardTabAchievements[aria-selected=\"true\"]) .modal-close.cl-shared-close",
    "settings": ".profile-screen.settings-active .profile-screen-close.cl-shared-close",
    "shop": ".shop-modal .modal-close.cl-shared-close",
    "bag": ".inventory-modal .modal-close.cl-shared-close",
    "inner-castle": ".inner-castle-modal .modal-close.cl-shared-close",
  });
  const ELEMENT_SELECTORS = Object.freeze({
    "player-profile:panel-header": ".profile-screen .profile-screen-header",
    "player-profile:profile-heading": ".profile-screen .profile-screen-heading",
    "player-profile:profile-tabs": ".profile-screen .profile-tabs",
    "player-profile:profile-tab": "#profileTabBtn",
    "player-profile:clan-tab": "#clanTabBtn",
    "player-profile:skills-tab": "#skillsTabBtn",
    "player-profile:settings-tab": "#settingsTabBtn",
    "player-profile:identity-panel": ".profile-screen .profile-identity",
    "player-profile:ruler-name": "#profileNameText",
    "player-profile:level-text": "#profileLevelText",
    "player-profile:overview-panel": ".profile-screen .kingdom-overview",
    "clan-members:panel-header": ".profile-screen.clan-active .profile-screen-header",
    "clan-members:title": "#clanMembersPanel .clan-panel-heading h3",
    "clan-members:tabs": ".profile-screen.clan-active .clan-section-nav",
    "clan-members:members-tab": "#clanSectionTabMembers",
    "clan-members:quests-tab": "#clanSectionTabRewards",
    "clan-members:diplomacy-tab": "#clanSectionTabWarroom",
    "reports:title": ".battle-report-modal #modalTitle",
    "reports:battle-tab": ".battle-report-modal [data-report-filter=\"all\"]",
    "reports:scout-tab": ".battle-report-modal [data-report-filter=\"scout\"]",
    "scout-report:title": ".scout-report-modal #modalTitle",
    "scout-report:garrison-value": ".scout-report-modal .scout-report-overview strong",
    "scout-report:locate-button": ".scout-report-modal .scout-report-locate",
    "daily-login:title": ".daily-login-reward-modal #modalTitle",
    "daily-login:current-reward": ".daily-login-reward-modal .daily-reward-card.next",
    "daily-login:claim-button": ".daily-login-reward-modal .daily-reward-card.available",
    "daily-missions:title": ".daily-mission-modal #modalTitle, .daily-login-reward-modal #dailyRewardTabQuests",
    "daily-missions:mission-title": ".daily-login-reward-modal .daily-mission-row strong",
    "daily-missions:mission-claim": ".daily-login-reward-modal .daily-mission-claim",
    "achievements:title": ".daily-login-reward-modal #dailyRewardTabAchievements",
    "achievements:progress": ".daily-login-reward-modal .seasonal-achievement-progress",
    "settings:title": ".profile-screen.settings-active #audioSettingsTitle",
    "settings:music-input": "#musicVolume",
    "settings:animation-input": ".animation-mode-toggle",
    "notifications:title": ".profile-screen.settings-active .notification-settings-section h3",
    "notifications:new-badge": "#pushAlertsStatus",
    "privacy:title": ".profile-screen.settings-active .privacy-settings-section h3",
    "privacy:privacy-copy": ".profile-screen.settings-active .privacy-settings-section .settings-card-description",
    "privacy:policy-button": ".profile-screen.settings-active .privacy-settings-link",
    "shop:title": ".shop-modal #modalTitle",
    "shop:buy-war-drums": ".shop-modal [data-shop-item=\"war_drums_30m\"] .shop-buy-btn",
    "bag:title": ".inventory-modal #modalTitle",
    "bag:item-war-drums": ".inventory-modal .inventory-slot.filled:first-of-type",
  });
  const BREAKPOINTS = Object.freeze({
    desktop: "(min-width: 901px)",
    phone: "(min-width: 668px) and (max-width: 900px)",
    smallPhone: "(max-width: 667px)",
  });
  const SAFE_COLOR = /^(?:#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i;
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const color = (value, fallback) => SAFE_COLOR.test(String(value || "").trim()) ? String(value).trim() : fallback;
  const px = (value, fallback) => `${finite(value, fallback)}px`;

  function closeRules(component = {}) {
    const states = component.states || {};
    const base = states.default || {};
    const hover = states.hover || {};
    const pressed = states.pressed || {};
    const disabled = states.disabled || {};
    const shadow = /^[^;{}]{0,140}$/.test(String(base.shadow || "")) ? String(base.shadow) : "none";
    return `
      .cl-shared-close {
        box-sizing: border-box;
        width: ${px(base.width, 40)};
        min-width: ${px(base.width, 40)};
        height: ${px(base.height, 40)};
        min-height: ${px(base.height, 40)};
        padding: ${px(base.padding, 0)};
        opacity: ${finite(base.opacity, 1)};
        color: ${color(base.iconColor, "#E7DDC4")};
        border: ${px(base.borderWidth, 1)} solid ${color(base.borderColor, "#45443E")};
        border-radius: ${px(base.borderRadius, 3)};
        background: ${color(base.backgroundColor, "#2B2925")};
        box-shadow: ${shadow};
      }
      .cl-shared-close .cl-icon {
        width: ${px(base.iconSize, 16)};
        height: ${px(base.iconSize, 16)};
        color: inherit;
      }
      .cl-shared-close .cl-icon path { stroke-width: ${finite(base.iconStrokeWidth, 3)}; }
      .cl-shared-close:hover,
      .cl-shared-close[data-ui-preview-state="hover"] {
        color: ${color(hover.iconColor, color(base.iconColor, "#E7DDC4"))};
        background: ${color(hover.backgroundColor, "#59534A")};
      }
      .cl-shared-close:active,
      .cl-shared-close[data-ui-preview-state="pressed"] {
        color: ${color(pressed.iconColor, color(base.iconColor, "#E7DDC4"))};
        background: ${color(pressed.backgroundColor, "#17130F")};
        transform: translateY(1px);
      }
      .cl-shared-close:disabled,
      .cl-shared-close[data-ui-preview-state="disabled"] { opacity: ${finite(disabled.opacity, .5)}; }
    `;
  }

  function positionRule(selector, value = {}) {
    const anchor = ["top-right", "top-left", "bottom-right", "bottom-left"].includes(value.anchor) ? value.anchor : "top-right";
    const declarations = [`translate: ${px(value.x, 0)} ${px(value.y, 0)}`];
    if (anchor.startsWith("top")) declarations.push(`top: ${px(value.top, 0)}`, "bottom: auto");
    else declarations.push(`bottom: ${px(value.bottom ?? value.top, 0)}`, "top: auto");
    if (anchor.endsWith("right")) declarations.push(`right: ${px(value.right, 0)}`, "left: auto");
    else declarations.push(`left: ${px(value.left ?? value.right, 0)}`, "right: auto");
    return `${selector} { ${declarations.join("; ")}; }`;
  }

  function genericRule(record = {}, breakpoint = "base") {
    const key = `${record.screenId || ""}:${record.elementId || ""}`;
    const previewTarget = `[data-ui-screen="${CSS.escape(record.screenId || "")}"] [data-ui-element-id="${CSS.escape(record.elementId || "")}"]`;
    const target = [previewTarget, ELEMENT_SELECTORS[key]].filter(Boolean).join(", ");
    const values = record[breakpoint] || {};
    const declarations = [];
    const numericPx = ["fontSize", "letterSpacing", "borderWidth", "borderRadius", "width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "marginTop", "marginRight", "marginBottom", "marginLeft", "gap", "top", "right", "bottom", "left", "x", "y", "iconSize"];
    for (const property of numericPx) {
      if (!Number.isFinite(Number(values[property]))) continue;
      if (property === "x" || property === "y") continue;
      const cssName = property.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
      declarations.push(`${cssName}: ${px(values[property], 0)}`);
    }
    if (Number.isFinite(Number(values.x)) || Number.isFinite(Number(values.y))) declarations.push(`translate: ${px(values.x, 0)} ${px(values.y, 0)}`);
    for (const property of ["color", "backgroundColor", "borderColor"]) {
      if (!SAFE_COLOR.test(String(values[property] || ""))) continue;
      declarations.push(`${property.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)}: ${values[property]}`);
    }
    if (Number.isFinite(Number(values.opacity))) declarations.push(`opacity: ${Number(values.opacity)}`);
    if (Number.isFinite(Number(values.fontWeight))) declarations.push(`font-weight: ${Number(values.fontWeight)}`);
    if (Number.isFinite(Number(values.lineHeight))) declarations.push(`line-height: ${Number(values.lineHeight)}`);
    if (["left", "center", "right", "justify"].includes(values.textAlign)) declarations.push(`text-align: ${values.textAlign}`);
    if (["relative", "absolute", "static"].includes(values.position)) declarations.push(`position: ${values.position}`);
    if (["solid", "dashed", "dotted", "double", "none"].includes(values.borderStyle)) declarations.push(`border-style: ${values.borderStyle}`);
    if (/^[^;{}]{0,140}$/.test(String(values.textShadow || "")) && values.textShadow) declarations.push(`text-shadow: ${values.textShadow}`);
    return declarations.length ? `${target} { ${declarations.join("; ")}; }` : "";
  }

  function buildCss(config = {}) {
    const component = config.globalComponents?.["close-button"] || {};
    const rules = [closeRules(component)];
    for (const [screenId, selector] of Object.entries(SCREEN_SELECTORS)) {
      const value = config.screenOverrides?.[screenId]?.["close-button"];
      if (value) rules.push(positionRule(selector, value));
    }
    const responsive = component.responsive || {};
    for (const [breakpoint, query] of Object.entries(BREAKPOINTS)) {
      if (responsive[breakpoint]) rules.push(`@media ${query} { ${closeRules({ states: { ...component.states, default: { ...(component.states?.default || {}), ...responsive[breakpoint] } } })} }`);
    }
    for (const record of Object.values(config.elementOverrides || {})) {
      rules.push(genericRule(record, "base"));
      for (const [breakpoint, query] of Object.entries(BREAKPOINTS)) {
        const rule = genericRule(record, breakpoint);
        if (rule) rules.push(`@media ${query} { ${rule} }`);
      }
    }
    return rules.filter(Boolean).join("\n");
  }

  function applyConfig(config) {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.append(style);
    }
    style.textContent = buildCss(config);
    document.documentElement.dataset.uiComponentVersion = String(config?.globalComponents?.["close-button"]?.version || 1);
    return config;
  }

  async function load() {
    try {
      const response = await fetch(CONFIG_URL, { cache: "no-store" });
      if (!response.ok) throw new Error(`UI config request failed: ${response.status}`);
      return applyConfig(await response.json());
    } catch (error) {
      console.warn("Crownlands shared UI configuration could not be loaded; existing CSS remains active.", error);
      return null;
    }
  }

  window.CrownlandsUIRuntime = Object.freeze({ load, applyConfig, buildCss });
  load();
})();
