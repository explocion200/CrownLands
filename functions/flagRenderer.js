(function initializeCrownlandsFlagRenderer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CrownlandsFlagRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createFlagRendererModule() {
  "use strict";

  function create({ config, renderIcon }) {
    if (!config?.normalizeFlag || !Array.isArray(config.PATTERNS) || !Array.isArray(config.SYMBOLS)) {
      throw new Error("FlagRenderer requires the Crownlands player flag configuration.");
    }
    if (typeof renderIcon !== "function") throw new Error("FlagRenderer requires an SVG icon renderer.");

    const patternClasses = Object.freeze(config.PATTERNS.map(option => `pattern-${option.key}`));
    const symbolsByKey = new Map(config.SYMBOLS.map(option => [option.key, option]));

    function render(element, rawFlag, options = {}) {
      if (!element) return null;
      const stableKey = String(options.stableKey || element.dataset.flagStableKey || "");
      const normalized = config.normalizeFlag(rawFlag, stableKey);
      const hideSymbol = options.hideSymbol === true;
      const renderSignature = [
        normalized.version,
        normalized.primary,
        normalized.secondary,
        normalized.symbolColor,
        normalized.pattern,
        normalized.symbol,
        hideSymbol ? "symbol-hidden" : "symbol-visible",
      ].join(":");

      if (stableKey) element.dataset.flagStableKey = stableKey;
      else delete element.dataset.flagStableKey;
      element.dataset.flagVersion = String(normalized.version);
      if (options.context) element.dataset.flagContext = String(options.context);
      if (options.size) element.dataset.flagSize = String(options.size);

      const symbolElement = element.querySelector(".flag-symbol");
      if (element.dataset.flagRenderSignature === renderSignature
        && (hideSymbol || symbolElement?.firstElementChild)) return normalized;

      const primaryOption = config.getColorOption(normalized.primary);
      const secondaryOption = config.getColorOption(normalized.secondary);
      element.style.setProperty("--flag-primary", normalized.primary);
      element.style.setProperty("--flag-secondary", normalized.secondary);
      element.style.setProperty("--flag-symbol-color", normalized.symbolColor);
      element.style.setProperty("--flag-symbol-outline", config.getSymbolOutline(normalized.symbolColor));
      element.dataset.flagPrimaryDye = primaryOption?.label || "Custom heraldic color";
      element.dataset.flagSecondaryDye = secondaryOption?.label || "Custom heraldic color";
      element.classList.remove(...patternClasses);
      element.classList.add(`pattern-${normalized.pattern}`);

      if (symbolElement) {
        const symbol = symbolsByKey.get(normalized.symbol) || config.SYMBOLS[0];
        symbolElement.hidden = hideSymbol;
        symbolElement.dataset.flagSymbol = symbol.key;
        if (hideSymbol) symbolElement.replaceChildren();
        else symbolElement.innerHTML = renderIcon(symbol.icon || symbol.key, "flag-symbol-icon");
      }
      element.dataset.flagRenderSignature = renderSignature;
      return normalized;
    }

    function refresh(stableKey, flag, rootNode = globalThis.document) {
      const key = String(stableKey || "");
      if (!key || !rootNode?.querySelectorAll) return 0;
      let refreshed = 0;
      rootNode.querySelectorAll("[data-flag-stable-key]").forEach(element => {
        if (element.dataset.flagStableKey !== key) return;
        render(element, flag, {
          stableKey: key,
          context: element.dataset.flagContext,
          size: element.dataset.flagSize,
          hideSymbol: element.querySelector(".flag-symbol")?.hidden === true,
        });
        refreshed += 1;
      });
      return refreshed;
    }

    return Object.freeze({ render, refresh });
  }

  return Object.freeze({ create });
});
