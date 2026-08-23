(function initializeClanHeraldryLegacyV1(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.CrownlandsClanHeraldryLegacyV1 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createClanHeraldryLegacyV1() {
  "use strict";

  const OPTIONS = Object.freeze({
    shapes: ["castilian", "heater", "kite", "round"],
    divisions: ["solid", "pale", "fess", "quartered", "stripes", "bend", "saltire", "chevron"],
    charges: ["none", "castle", "lion", "eagle", "crown", "swords", "fleur", "sun"],
    layouts: ["center", "paired", "quartered", "chief"],
    trims: ["plain", "double", "riveted"],
    finishes: ["polished", "weathered", "battleworn"],
  });
  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }
  function createDefaultClanShield() {
    return { version: 1, shape: "castilian", division: "quartered", primary: "#7a2638", secondary: "#d8bd78", borderColor: "#d8bd78", charge: "castle", secondaryCharge: "lion", chargeColor: "#19201d", secondaryChargeColor: "#7a2638", chargeLayout: "quartered", trim: "double", finish: "weathered" };
  }
  function normalizeClanShieldColor(value, fallback) {
    const color = String(value || "").trim().toLowerCase();
    return /^#[0-9a-f]{6}$/.test(color) ? color : fallback;
  }
  function normalizeClanShieldChoice(value, options, fallback) {
    const key = String(value || "").trim().toLowerCase();
    return options.includes(key) ? key : fallback;
  }
  function normalizeClanShield(value = null, legacyBanner = null) {
    const defaults = createDefaultClanShield();
    const source = value && typeof value === "object" ? value : legacyBanner && typeof legacyBanner === "object" ? legacyBanner : {};
    const legacyPatternMap = { split: "pale", diagonal: "bend", band: "fess", cross: "quartered", chief: "fess" };
    const legacySymbolMap = { tower: "castle", cross: "fleur", star: "sun", moon: "sun", knight: "swords", diamond: "fleur", spire: "fleur" };
    return {
      version: 1,
      shape: normalizeClanShieldChoice(source.shape, OPTIONS.shapes, defaults.shape),
      division: normalizeClanShieldChoice(legacyPatternMap[source.pattern] || source.division || source.pattern, OPTIONS.divisions, defaults.division),
      primary: normalizeClanShieldColor(source.primary, defaults.primary), secondary: normalizeClanShieldColor(source.secondary, defaults.secondary),
      borderColor: normalizeClanShieldColor(source.borderColor, defaults.borderColor),
      charge: normalizeClanShieldChoice(legacySymbolMap[source.symbol] || source.charge || source.symbol, OPTIONS.charges, defaults.charge),
      secondaryCharge: normalizeClanShieldChoice(source.secondaryCharge, OPTIONS.charges, defaults.secondaryCharge),
      chargeColor: normalizeClanShieldColor(source.chargeColor, defaults.chargeColor),
      secondaryChargeColor: normalizeClanShieldColor(source.secondaryChargeColor, defaults.secondaryChargeColor),
      chargeLayout: normalizeClanShieldChoice(source.chargeLayout, OPTIONS.layouts, defaults.chargeLayout),
      trim: normalizeClanShieldChoice(source.trim, OPTIONS.trims, defaults.trim), finish: normalizeClanShieldChoice(source.finish, OPTIONS.finishes, defaults.finish),
    };
  }
  function getClanShieldPath(shape = "castilian") {
    return { castilian: "M10 8 Q50 2 90 8 L90 56 Q88 82 50 99 Q12 82 10 56 Z", heater: "M12 8 H88 V51 Q86 78 50 98 Q14 78 12 51 Z", kite: "M18 7 Q50 2 82 7 V43 Q78 73 50 100 Q22 73 18 43 Z", round: "M12 8 Q50 1 88 8 V61 Q86 89 50 98 Q14 89 12 61 Z" }[shape] || "M10 8 Q50 2 90 8 L90 56 Q88 82 50 99 Q12 82 10 56 Z";
  }
  function renderClanShieldField(shield, clipId) {
    const primary = escapeHtml(shield.primary); const secondary = escapeHtml(shield.secondary); let division = "";
    if (shield.division === "pale") division = `<rect x="50" width="50" height="106" fill="${secondary}"/>`;
    else if (shield.division === "fess") division = `<rect y="51" width="100" height="55" fill="${secondary}"/>`;
    else if (shield.division === "quartered") division = `<rect x="50" width="50" height="53" fill="${secondary}"/><rect y="53" width="50" height="53" fill="${secondary}"/>`;
    else if (shield.division === "stripes") division = Array.from({ length: 5 }, (_, index) => `<rect x="${10 + index * 18}" width="9" height="106" fill="${secondary}"/>`).join("");
    else if (shield.division === "bend") division = `<path d="M-18 13 L2 -7 L118 86 L98 106 Z" fill="${secondary}"/>`;
    else if (shield.division === "saltire") division = `<path d="M-13 2 L1 -10 L113 96 L99 108 Z M99 -10 L113 2 L1 108 L-13 96 Z" fill="${secondary}"/>`;
    else if (shield.division === "chevron") division = `<path d="M4 70 L50 35 L96 70 L86 82 L50 54 L14 82 Z" fill="${secondary}"/>`;
    return `<g clip-path="url(#${clipId})"><rect width="100" height="106" fill="${primary}"/>${division}</g>`;
  }
  function renderClanShieldCharge(charge, color, x, y, scale = 1) {
    if (charge === "none") return ""; const fill = escapeHtml(color); let art = "";
    if (charge === "castle") art = `<path d="M23 28h12v9h9V24h12v13h9v-9h12v17h-6v32H29V45h-6zm14 17v22h9V53h8v14h9V45z" fill="${fill}"/><path d="M20 21h18v9H20zm30-4h18v13H50zm12 4h18v9H62z" fill="${fill}"/>`;
    else if (charge === "lion") art = `<circle cx="57" cy="28" r="8" fill="${fill}"/><path d="M50 34c-13 1-21 10-18 24l-9 11 7 5 11-12 7 4-5 16 8 2 7-18 9-6 8 14 8-3-8-20c-3-8-8-15-16-17l5-8-7-4z" fill="${fill}"/><path d="M38 49C20 43 29 24 16 22c8 8-1 19 6 28 4 5 10 7 16 7M60 40l16-8M58 44l19 2" fill="none" stroke="${fill}" stroke-width="5" stroke-linecap="round"/>`;
    else if (charge === "eagle") art = `<path d="M50 28l-8-10 8 3 8-3-8 10zm-4 5c-12-12-22-10-34-19 2 17 12 29 28 35l-20 2c5 11 15 16 27 14l3 20 3-20c12 2 22-3 27-14l-20-2c16-6 26-18 28-35-12 9-22 7-34 19l-4 9z" fill="${fill}"/><circle cx="46" cy="27" r="2" fill="${fill}"/><circle cx="54" cy="27" r="2" fill="${fill}"/>`;
    else if (charge === "crown") art = `<path d="M20 34l13 10 16-25 17 25 14-10-7 34H27zm8 39h44v9H28z" fill="${fill}"/><circle cx="20" cy="31" r="5" fill="${fill}"/><circle cx="50" cy="17" r="5" fill="${fill}"/><circle cx="80" cy="31" r="5" fill="${fill}"/>`;
    else if (charge === "swords") art = `<path d="M21 18l9 3 47 52-8 8-48-52zm58 0l-9 3-47 52 8 8 48-52z" fill="${fill}"/><path d="M17 72l19 19 5-5-19-19zm66 0L64 91l-5-5 19-19z" fill="${fill}"/>`;
    else if (charge === "fleur") art = `<path d="M50 15c-15 12-17 25-7 35-9-8-19-8-27 1 7 3 9 10 8 18 8-5 14-4 19 1l-6 16h26l-6-16c5-5 11-6 19-1-1-8 1-15 8-18-8-9-18-9-27-1 10-10 8-23-7-35z" fill="${fill}"/>`;
    else if (charge === "sun") art = `<circle cx="50" cy="50" r="19" fill="${fill}"/><path d="M50 12v15M50 73v15M12 50h15M73 50h15M23 23l11 11M66 66l11 11M77 23L66 34M34 66L23 77" fill="none" stroke="${fill}" stroke-width="7" stroke-linecap="round"/>`;
    return `<g transform="translate(${x} ${y}) scale(${scale}) translate(-50 -50)">${art}</g>`;
  }
  function renderClanShieldCharges(shield, clipId) {
    const placements = shield.chargeLayout === "paired" ? [[shield.charge, shield.chargeColor, 32, 53, .52], [shield.secondaryCharge, shield.secondaryChargeColor, 68, 53, .52]] : shield.chargeLayout === "quartered" ? [[shield.charge, shield.chargeColor, 31, 31, .38], [shield.secondaryCharge, shield.secondaryChargeColor, 69, 31, .38], [shield.secondaryCharge, shield.secondaryChargeColor, 31, 68, .38], [shield.charge, shield.chargeColor, 69, 68, .38]] : shield.chargeLayout === "chief" ? [[shield.charge, shield.chargeColor, 25, 29, .3], [shield.charge, shield.chargeColor, 50, 27, .3], [shield.charge, shield.chargeColor, 75, 29, .3], [shield.secondaryCharge, shield.secondaryChargeColor, 50, 67, .55]] : [[shield.charge, shield.chargeColor, 50, 53, .74]];
    return `<g clip-path="url(#${clipId})">${placements.map(placement => renderClanShieldCharge(...placement)).join("")}</g>`;
  }
  function getClanShieldRenderId(shield) {
    const signature = [shield.shape, shield.division, shield.primary, shield.secondary, shield.borderColor, shield.charge, shield.secondaryCharge, shield.chargeColor, shield.secondaryChargeColor, shield.chargeLayout, shield.trim, shield.finish].join("|");
    let hash = 2166136261; for (let index = 0; index < signature.length; index += 1) { hash ^= signature.charCodeAt(index); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(36);
  }
  function renderClanShield(value = null, options = {}) {
    const shield = normalizeClanShield(value); const instance = String(options.instance || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 32);
    const renderId = `${getClanShieldRenderId(shield)}${instance ? `-${instance}` : ""}`; const clipId = `clanShieldClip${renderId}`; const textureId = `clanShieldTexture${renderId}`; const path = getClanShieldPath(shield.shape);
    const label = escapeHtml(options.label || "Clan heraldic shield"); const size = ["mini", "small", "large", "editor"].includes(options.size) ? options.size : "large";
    const textureOpacity = shield.finish === "battleworn" ? .29 : shield.finish === "weathered" ? .18 : .075;
    const doubleTrim = shield.trim === "double" ? `<path d="${path}" transform="translate(50 53) scale(.9) translate(-50 -53)" fill="none" stroke="${escapeHtml(shield.borderColor)}" stroke-width="1.8" opacity=".9"/>` : "";
    const rivets = shield.trim === "riveted" ? [[21,16],[39,11],[61,11],[79,16],[83,40],[76,69],[50,89],[24,69],[17,40]].map(([x,y]) => `<circle cx="${x}" cy="${y}" r="2.1" fill="${escapeHtml(shield.borderColor)}" stroke="#1b1711" stroke-width=".7"/>`).join("") : "";
    return `<span class="clan-shield clan-shield-size-${size} clan-shield-${escapeHtml(shield.finish)}">
    <svg viewBox="0 0 100 106" role="img" aria-label="${label}" focusable="false" overflow="hidden">
      <defs>
        <clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><path d="${path}"/></clipPath>
        <pattern id="${textureId}" width="17" height="19" patternUnits="userSpaceOnUse">
          <path d="M1 4c4-2 7 1 11-1M2 11c4 2 8-1 14 1M1 17c5-2 9 1 15-1" fill="none" stroke="#f2dfb5" stroke-width=".65" opacity=".75"/>
          <path d="M4 1c2 5-1 10 2 17M13 0c-2 5 2 11-1 19" fill="none" stroke="#17110d" stroke-width=".55" opacity=".68"/>
        </pattern>
      </defs>
      <path d="${path}" fill="#2a1c13" stroke="#15100c" stroke-width="7" stroke-linejoin="round"/>
      <g class="clan-shield-boundary" clip-path="url(#${clipId})">
        ${renderClanShieldField(shield, clipId)}
        <g class="clan-shield-planks" fill="none" stroke="#24190f" stroke-width="1.1" opacity=".28">
          <path d="M25 4v91M49 2v98M73 4v91"/>
        </g>
        ${renderClanShieldCharges(shield, clipId)}
        <rect width="100" height="106" fill="url(#${textureId})" opacity="${textureOpacity}"/>
        <g fill="none" stroke="#291b11" stroke-width=".9" opacity="${shield.finish === "polished" ? ".08" : ".2"}"><path d="M18 23l18 13M65 17L49 48M73 56L57 84M22 72l13-9"/></g>
        ${shield.finish === "battleworn" ? `<g fill="none" stroke="#efe2c4" stroke-width="1.2" opacity=".28"><path d="M18 24l24 17M66 15L43 68M71 55L52 90M20 71l15-10"/></g>` : ""}
        <path d="${path}" fill="none" stroke="${escapeHtml(shield.borderColor)}" stroke-width="4.5" stroke-linejoin="round"/>
        ${doubleTrim}${rivets}
        <path d="${path}" fill="none" stroke="#17120d" stroke-width="1.15" opacity=".45" transform="translate(50 53) scale(.96) translate(-50 -53)"/>
        <path d="${path}" fill="none" stroke="#fff4d0" stroke-width=".7" opacity=".18"/>
      </g>
    </svg>
  </span>`;
  }
  return Object.freeze({ createDefaultClanShield, normalizeClanShield, getClanShieldPath, renderClanShieldField, renderClanShieldCharge, renderClanShieldCharges, getClanShieldRenderId, renderClanShield });
});
