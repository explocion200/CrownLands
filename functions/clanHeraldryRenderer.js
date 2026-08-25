(function initializeClanHeraldryRenderer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.CrownlandsClanHeraldryRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createClanHeraldryRendererModule() {
  "use strict";

  function create({ config, assets, legacyRenderer }) {
    if (!config?.normalizeForRead || !config?.getShape) throw new Error("ClanHeraldryRenderer requires clanHeraldryConfig.");
    if (!assets?.symbolHref || !assets?.installSharedDefs) throw new Error("ClanHeraldryRenderer requires clanHeraldryAssets.");
    if (!legacyRenderer?.renderClanShield) throw new Error("ClanHeraldryRenderer requires the frozen v1 renderer.");
    const namedWidths = Object.freeze({ mini: 27, small: 40, large: 96, editor: 240 });

    function escapeHtml(value = "") { return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }
    function resolveWidth(options = {}, element = null) {
      const explicit = Number(options.width);
      if (Number.isFinite(explicit) && explicit > 0) return explicit;
      const named = namedWidths[String(options.size || "")];
      if (named) return named;
      const measured = Number(element?.getBoundingClientRect?.().width);
      return Number.isFinite(measured) && measured > 0 ? measured : 96;
    }
    function divisionMarkup(shield) {
      const color = "var(--clan-heraldry-secondary)";
      const paths = {
        pale: "M50 0H100V106H50Z", fess: "M0 52H100V106H0Z",
        quartered: "M50 0H100V53H50ZM0 53H50V106H0Z",
        stripes: "M10 0H20V106H10ZM30 0H40V106H30ZM50 0H60V106H50ZM70 0H80V106H70ZM90 0H100V106H90Z",
        bend: "M-18 13L2-7L118 86L98 106Z",
        saltire: "M-13 2L1-10L113 96L99 108ZM99-10L113 2L1 108L-13 96Z",
        chevron: "M4 70L50 35L96 70L86 82L50 54L14 82Z",
      };
      return paths[shield.division] ? `<path class="clan-heraldry-division" d="${paths[shield.division]}" fill="${color}"/>` : "";
    }
    function placementUse(charge, colorVariable, x, y, scale, variant) {
      if (!charge || charge === "none") return "";
      if (!config.getCharge(charge)?.available) return "";
      const href = assets.symbolHref(charge, variant);
      return href ? `<use class="clan-heraldry-charge" href="${escapeHtml(href)}" color="var(${colorVariable})" x="${x}" y="${y}" width="${scale}" height="${scale}"/>` : "";
    }
    function chargesMarkup(shield, variant) {
      if (variant === "micro") {
        if (shield.chargeLayout === "paired") return placementUse(shield.charge, "--clan-heraldry-charge", 13, 30, 38, variant) + placementUse(shield.secondaryCharge, "--clan-heraldry-secondary-charge", 49, 30, 38, variant);
        if (shield.chargeLayout === "chief") return placementUse(shield.charge, "--clan-heraldry-charge", 31, 12, 38, variant) + placementUse(shield.secondaryCharge, "--clan-heraldry-secondary-charge", 27, 48, 46, variant);
        if (shield.chargeLayout === "quartered") return placementUse(shield.charge, "--clan-heraldry-charge", 14, 18, 34, variant) + placementUse(shield.secondaryCharge, "--clan-heraldry-secondary-charge", 51, 53, 34, variant);
        return placementUse(shield.charge, "--clan-heraldry-charge", 20, 23, 60, variant);
      }
      if (shield.chargeLayout === "paired") return placementUse(shield.charge, "--clan-heraldry-charge", 11, 28, 43, variant) + placementUse(shield.secondaryCharge, "--clan-heraldry-secondary-charge", 47, 28, 43, variant);
      if (shield.chargeLayout === "quartered") return placementUse(shield.charge, "--clan-heraldry-charge", 13, 12, 34, variant) + placementUse(shield.secondaryCharge, "--clan-heraldry-secondary-charge", 53, 12, 34, variant) + placementUse(shield.secondaryCharge, "--clan-heraldry-secondary-charge", 13, 54, 34, variant) + placementUse(shield.charge, "--clan-heraldry-charge", 53, 54, 34, variant);
      if (shield.chargeLayout === "chief") return placementUse(shield.charge, "--clan-heraldry-charge", 15, 10, 26, variant) + placementUse(shield.charge, "--clan-heraldry-charge", 37, 8, 26, variant) + placementUse(shield.charge, "--clan-heraldry-charge", 59, 10, 26, variant) + placementUse(shield.secondaryCharge, "--clan-heraldry-secondary-charge", 27, 42, 48, variant);
      return placementUse(shield.charge, "--clan-heraldry-charge", 18, 20, 64, variant);
    }
    function renderV2Markup(shield, options = {}) {
      const width = resolveWidth(options);
      const variant = options.variant === "micro" || options.variant === "full" ? options.variant : config.getRenderVariant(width);
      const size = Object.prototype.hasOwnProperty.call(namedWidths, String(options.size || "")) ? String(options.size) : "custom";
      const shape = config.getShape(shield.shape);
      const label = escapeHtml(options.label || "Clan heraldic shield");
      const style = `--clan-heraldry-primary:${shield.primary};--clan-heraldry-secondary:${shield.secondary};--clan-heraldry-border:${shield.borderColor};--clan-heraldry-charge:${shield.chargeColor};--clan-heraldry-secondary-charge:${shield.secondaryChargeColor}`;
      const texture = variant === "full" && shield.finish !== "polished" ? `<rect class="clan-heraldry-texture" width="100" height="106" fill="url(#clan-v2-weathered)" color="${shield.finish === "battleworn" ? "#f2e2bf" : "#19201d"}" opacity="${shield.finish === "battleworn" ? ".23" : ".14"}"/>` : "";
      const scratches = variant === "full" && shield.finish === "battleworn" ? `<path class="clan-heraldry-wear" d="M19 25l23 17M66 15L44 68M72 56L53 90M20 72l16-11"/>` : "";
      const inner = shield.trim === "double" ? `<path class="clan-heraldry-inner-trim" d="${shape.path}"/>` : "";
      const rivets = shield.trim === "riveted" ? `<use class="clan-heraldry-rivets" href="#clan-v2-rivets"/>` : "";
      return `<span class="clan-heraldry-v2 clan-heraldry-size-${size} clan-heraldry-${variant} clan-heraldry-${escapeHtml(shield.finish)}" data-heraldry-version="2" data-heraldry-variant="${variant}" style="${style}"><svg viewBox="0 0 100 106" role="img" aria-label="${label}" focusable="false"><path class="clan-heraldry-backplate" d="${shape.path}"/><g class="clan-heraldry-boundary" clip-path="url(#clan-v2-clip-${escapeHtml(shield.shape)})"><rect class="clan-heraldry-field" width="100" height="106"/>${divisionMarkup(shield)}<g class="clan-heraldry-charges">${chargesMarkup(shield, variant)}</g>${texture}${scratches}<path class="clan-heraldry-border" d="${shape.path}"/>${inner}${rivets}</g></svg></span>`;
    }
    function renderMarkup(rawShield = null, options = {}) {
      const version = config.getVersion(rawShield);
      if (version === config.LEGACY_VERSION) return legacyRenderer.renderClanShield(rawShield, options);
      return renderV2Markup(config.normalizeV2ForRead(rawShield), options);
    }
    function getSignature(shield, options) {
      const normalized = config.normalizeForRead(shield);
      const width = resolveWidth(options, options.element || null);
      const variant = options.variant === "micro" || options.variant === "full" ? options.variant : config.getRenderVariant(width);
      return `${JSON.stringify(normalized)}|${variant}|${options.label || ""}`;
    }
    function render(element, rawShield = null, options = {}) {
      if (!element) return null;
      const resolvedOptions = { ...options, width: resolveWidth(options, element), element };
      const signature = getSignature(rawShield, resolvedOptions);
      if (element.dataset?.heraldryRenderSignature === signature) return Object.freeze({ changed: false, shield: config.normalizeForRead(rawShield) });
      assets.installSharedDefs(element.ownerDocument || globalThis.document);
      element.innerHTML = renderMarkup(rawShield, resolvedOptions);
      if (element.dataset) element.dataset.heraldryRenderSignature = signature;
      return Object.freeze({ changed: true, shield: config.normalizeForRead(rawShield) });
    }
    return Object.freeze({ render, renderMarkup, renderV2Markup, getSignature });
  }
  return Object.freeze({ create });
});
