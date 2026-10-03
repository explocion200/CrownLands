(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CrownlandsCosmetics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const VERSION = 1;
  const CATEGORIES = Object.freeze({ city: "Cities" });
  const ITEMS = Object.freeze([
    { id: "halloween_city", category: "city", name: "Halloween City", price: 600, placeholder: false,
      description: "Pumpkins, warm lanterns and circling bats across all five city stages. Apply in My Skins to change all your regular cities, including newly captured cities. Visible to every player.",
      assets: {
        1: "assets/optimized/halloween-city-stage-1-512x512-2e7107395536.webp",
        2: "assets/optimized/halloween-city-stage-2-512x512-7211d081d4d3.webp",
        3: "assets/optimized/halloween-city-stage-3-512x512-e8a2d852d17c.webp",
        4: "assets/optimized/halloween-city-stage-4-512x512-62288da1de9d.webp",
        5: "assets/optimized/halloween-city-stage-5-512x512-66fd4698ab6b.webp",
      } },
  ].map(item => Object.freeze({ placeholder: true, ...item, assets: Object.freeze(item.assets || {}) })));
  const OFFERS = ITEMS;
  const PICKUP_TYPES = Object.freeze(["gold", "troops", "crowns"]);
  const PICKUP_CAPS = Object.freeze({ gold: 30, troops: 30, crowns: 20 });
  const item = id => ITEMS.find(entry => entry.id === id) || null;
  // Legacy identities remain readable; retired icons are never catalog offers.
  const flagItem = symbol => ["pumpkin", "bat", "skull", "raven"].some(name => symbol === `halloween-${name}`) ? { id: symbol.replace("-", "_"), symbol } : null;
  const dateKey = now => new Date(now).toISOString().slice(0, 10);
  const integer = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
  function normalize(raw = {}) {
    if (raw.version && raw.version !== VERSION) fail("failed-precondition", "Update the game to use this cosmetic collection.");
    const owned = Object.fromEntries(Object.entries(raw.owned || {}).filter(([, value]) => value === true));
    const equipped = {};
    for (const category of ["city"]) {
      const id = raw.equipped?.[category];
      equipped[category] = owned[id] && item(id)?.category === category ? id : "";
    }
    // Empty legacy fields clear old public projections on the next normal Apply.
    equipped.troops = ""; equipped.border = "";
    return { version: VERSION, crowns: integer(raw.crowns), owned, equipped, revision: integer(raw.revision), pickupDay: typeof raw.pickupDay === "string" ? raw.pickupDay : "", crownPickups: Math.min(20, integer(raw.crownPickups)) };
  }
  function countToday(state, now = Date.now()) { return state.pickupDay === dateKey(now) ? state.crownPickups : 0; }
  function availability(now = Date.now()) {
    const date = new Date(now), year = date.getUTCFullYear() + (date.getUTCMonth() > 9 ? 1 : 0);
    return { onSale: date.getUTCMonth() === 9, startsAtMs: Date.UTC(year, 9, 1), endsAtMs: Date.UTC(year, 10, 1) };
  }
  function quote(offerId, state, now = Date.now()) {
    const offer = OFFERS.find(entry => entry.id === offerId);
    if (!offer) fail("invalid-argument", "Choose a cosmetic from the catalog.");
    const missing = (offer.itemIds || [offer.id]).filter(id => !state.owned[id]);
    const price = Math.round(missing.reduce((sum, id) => sum + item(id).price, 0) * (offer.itemIds ? 0.8 : 1));
    return { offerId, catalogVersion: VERSION, missing, price, ...availability(now) };
  }
  function purchase(state, request, now = Date.now()) {
    const offer = quote(request.offerId, state, now);
    if (request.catalogVersion !== VERSION || request.expectedPrice !== offer.price) fail("failed-precondition", "This offer changed. Review its current price before buying.");
    if (!offer.missing.length) fail("already-exists", "You already own these cosmetics.");
    if (!offer.onSale) fail("failed-precondition", "The Halloween collection is available October 1–31 UTC.");
    if (state.crowns < offer.price) fail("resource-exhausted", "Not enough Crowns. Collect Crown pickups on the map.");
    return { state: { ...state, crowns: state.crowns - offer.price, owned: { ...state.owned, ...Object.fromEntries(offer.missing.map(id => [id, true])) }, revision: state.revision + 1 }, receipt: { ...offer, purchasedAtMs: now } };
  }
  function equip(state, category, id) {
    if (category !== "city") fail("invalid-argument", "Only city skins are available.");
    if (id && (!state.owned[id] || item(id)?.category !== category)) fail("permission-denied", "You do not own that cosmetic.");
    return { ...state, equipped: { city: id || "", troops: "", border: "" }, revision: state.revision + 1 };
  }
  function collectCrown(raw, now = Date.now()) {
    const state = normalize(raw), count = countToday(state, now);
    if (count >= 20) fail("resource-exhausted", "Daily Crown pickup limit reached.");
    if (!Number.isSafeInteger(state.crowns + 1)) fail("resource-exhausted", "Crown wallet is full.");
    return { ...state, crowns: state.crowns + 1, pickupDay: dateKey(now), crownPickups: count + 1, revision: state.revision + 1 };
  }
  function nextType(type) { return PICKUP_TYPES[(PICKUP_TYPES.indexOf(type) + 1) % PICKUP_TYPES.length]; }
  function availableType(preferred, remaining) {
    let type = PICKUP_TYPES.includes(preferred) ? preferred : "gold";
    for (let i = 0; i < PICKUP_TYPES.length; i++, type = nextType(type)) if (remaining(type) > 0) return type;
    return "";
  }
  return Object.freeze({ VERSION, CATEGORIES, ITEMS, OFFERS, PICKUP_TYPES, PICKUP_CAPS, item, flagItem, normalize, countToday, availability, quote, purchase, equip, collectCrown, nextType, availableType, dateKey });
});
