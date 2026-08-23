(function initializeClanHeraldryAssets(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.CrownlandsClanHeraldryAssets = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createClanHeraldryAssets() {
  "use strict";

  const ART_SET_VERSION = 1;
  const FULL_SPRITE_URL = "assets/clan-heraldry/art-set-v1/charges-full.svg";
  const MICRO_SPRITE_URL = "assets/clan-heraldry/art-set-v1/charges-micro.svg";
  const SHARED_DEFS_ID = "clan-heraldry-v2-shared-defs";
  const SHARED_DEFS_MARKUP = `<svg id="${SHARED_DEFS_ID}" class="clan-heraldry-shared-defs" aria-hidden="true" focusable="false" width="0" height="0">
    <defs>
      <clipPath id="clan-v2-clip-heater" clipPathUnits="userSpaceOnUse"><path d="M12 8H88V50Q86 78 50 99Q14 78 12 50Z"/></clipPath>
      <clipPath id="clan-v2-clip-castilian" clipPathUnits="userSpaceOnUse"><path d="M9 8Q50 1 91 8V57Q88 83 50 100Q12 83 9 57Z"/></clipPath>
      <clipPath id="clan-v2-clip-kite" clipPathUnits="userSpaceOnUse"><path d="M17 7Q50 1 83 7V43Q79 73 50 103Q21 73 17 43Z"/></clipPath>
      <clipPath id="clan-v2-clip-round" clipPathUnits="userSpaceOnUse"><path d="M11 9Q50 0 89 9V60Q86 90 50 99Q14 90 11 60Z"/></clipPath>
      <pattern id="clan-v2-weathered" width="18" height="20" patternUnits="userSpaceOnUse"><path d="M1 4c5-2 9 1 15-1M2 12c5 2 9-1 15 1M4 1c2 6-1 12 2 18M14 0c-2 6 2 12-1 20" fill="none" stroke="currentColor" stroke-width=".65" opacity=".42"/></pattern>
      <g id="clan-v2-rivets"><circle cx="21" cy="16" r="2"/><circle cx="39" cy="11" r="2"/><circle cx="61" cy="11" r="2"/><circle cx="79" cy="16" r="2"/><circle cx="82" cy="42" r="2"/><circle cx="74" cy="70" r="2"/><circle cx="50" cy="90" r="2"/><circle cx="26" cy="70" r="2"/><circle cx="18" cy="42" r="2"/></g>
    </defs>
  </svg>`;

  function spriteUrl(variant = "full") { return variant === "micro" ? MICRO_SPRITE_URL : FULL_SPRITE_URL; }
  function symbolHref(chargeId, variant = "full") {
    if (!chargeId || chargeId === "none") return "";
    const safeId = String(chargeId).replace(/[^a-z0-9-]/g, "");
    return `${spriteUrl(variant)}#clan-charge-v1-${variant === "micro" ? "micro" : "full"}-${safeId}`;
  }
  function installSharedDefs(documentRef = globalThis.document) {
    if (!documentRef?.body || documentRef.getElementById(SHARED_DEFS_ID)) return false;
    documentRef.body.insertAdjacentHTML("afterbegin", SHARED_DEFS_MARKUP);
    return true;
  }
  return Object.freeze({ ART_SET_VERSION, FULL_SPRITE_URL, MICRO_SPRITE_URL, SHARED_DEFS_ID, SHARED_DEFS_MARKUP, spriteUrl, symbolHref, installSharedDefs });
});
