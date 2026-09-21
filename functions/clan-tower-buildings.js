(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CrownlandsClanTowerBuildings = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  const MAX_LEVEL = 10;
  const MINUTE = 60_000;
  const SHIELD_COOLDOWN_MS = 72 * 60 * MINUTE;
  const DEFINITIONS = Object.freeze([
    { id: "shop", name: "Clan Shop", description: "Extra personal purchases shared across your clan's Shops.", x: -0.37, y: -0.03 },
    { id: "workshop", name: "Engineers’ Workshop", description: "Shortens this Tower's wall construction and repairs.", x: 0.37, y: -0.03 },
    { id: "infirmary", name: "Infirmary", description: "Recovers more of each ruler's casualties when defending this Tower.", x: -0.23, y: 0.23 },
    { id: "training", name: "Training Grounds", description: "Adds attack strength to all participants in rallies launched here.", x: 0.23, y: 0.23 },
  ].map(Object.freeze));
  const DURATION_MINUTES = Object.freeze([0, 30, 60, 120, 240, 360, 480, 600, 720, 1080, 1440]);
  const SHOP_ITEMS = Object.freeze([
    { id: "recall_horn", name: "Recall Horn", unlockLevel: 1, increaseLevel: 0 },
    { id: "swift_march_order", name: "Swift March Order", unlockLevel: 1, increaseLevel: 4 },
    { id: "royal_tax_decree_30m", name: "Royal Tax Decree", unlockLevel: 2, increaseLevel: 6 },
    { id: "war_drums_30m", name: "War Drums", unlockLevel: 3, increaseLevel: 7 },
    { id: "veil_of_silence_30m", name: "Veil of Silence", unlockLevel: 5, increaseLevel: 8 },
    { id: "common_gear_box", name: "Common Gear Box", unlockLevel: 9, increaseLevel: 0 },
    { id: "shield_12h", name: "Royal Peace Shield", unlockLevel: 10, increaseLevel: 0 },
  ].map(Object.freeze));
  function level(value) { return Math.min(MAX_LEVEL, Math.max(0, Math.floor(Number(value) || 0))); }
  function normalizeLevels(raw = {}) { return Object.fromEntries(DEFINITIONS.map(d => [d.id, level(raw?.[d.id])])); }
  function definition(id) { return DEFINITIONS.find(d => d.id === id) || null; }
  function cost(targetLevel) {
    if (!Number.isInteger(targetLevel) || targetLevel < 1 || targetLevel > MAX_LEVEL) throw new RangeError("Invalid building level");
    return 5_000_000 * 2 ** (targetLevel - 1);
  }
  function duration(targetLevel) { cost(targetLevel); return DURATION_MINUTES[targetLevel] * MINUTE; }
  function bonus(id, value) { return level(value) * ({ workshop: 5, infirmary: 1.5, training: 1 }[id] || 0); }
  function benefit(id, value) {
    const current = level(value);
    if (!current) return "Not built";
    if (id === "shop") return `Shop Level ${current} catalogue`;
    const amount = bonus(id, current);
    return id === "workshop" ? `${amount}% shorter wall construction and repairs`
      : id === "infirmary" ? `+${amount}% recovery for Tower defenders (90% combined cap)`
        : `+${amount}% rally attack strength at launch`;
  }
  function artStage(value) { const current = level(value); return current === 10 ? 4 : current >= 7 ? 3 : current >= 4 ? 2 : 1; }
  function art(id, value) { return `assets/clan-buildings/${id}-${artStage(value)}.webp`; }
  function wallDuration(targetLevel, workshopLevel = 0) {
    if (!Number.isSafeInteger(targetLevel) || targetLevel < 2) throw new RangeError("Invalid wall level");
    const ms = (10 + 2 * (targetLevel - 2)) * MINUTE * (1 - bonus("workshop", workshopLevel) / 100);
    if (!Number.isSafeInteger(Math.round(ms))) throw new RangeError("Wall duration exceeds the safe-integer range");
    return Math.max(1, Math.round(ms));
  }
  function shopStatus(shopLevel, raw = {}, nowMs = Date.now()) {
    const utcDate = new Date(nowMs).toISOString().slice(0, 10);
    const resetAtMs = Date.parse(`${utcDate}T00:00:00Z`) + 24 * 60 * MINUTE;
    const sameDay = raw.utcDate === utcDate;
    const shieldReadyAtMs = Math.max(0, Number(raw.shieldReadyAtMs) || 0);
    return SHOP_ITEMS.map(item => {
      const unlocked = level(shopLevel) >= item.unlockLevel;
      const limit = unlocked ? item.increaseLevel && level(shopLevel) >= item.increaseLevel ? 2 : 1 : 0;
      const shield = item.id === "shield_12h";
      const count = shield ? Number(shieldReadyAtMs > nowMs) : sameDay ? Math.max(0, Math.floor(Number(raw.counts?.[item.id]) || 0)) : 0;
      return { ...item, unlocked, limit, count, remaining: Math.max(0, limit - count), resetAtMs: shield ? shieldReadyAtMs : resetAtMs };
    });
  }
  function purchaseUsage(shopLevel, raw, itemId, quantity, nowMs = Date.now()) {
    const item = shopStatus(shopLevel, raw, nowMs).find(row => row.id === itemId);
    if (!item || !item.unlocked) throw new Error("clan-shop-item-locked");
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > item.remaining) throw new Error("clan-shop-purchase-limit");
    const utcDate = new Date(nowMs).toISOString().slice(0, 10);
    const usage = { utcDate, counts: raw?.utcDate === utcDate ? { ...raw.counts } : {}, shieldReadyAtMs: Math.max(0, Number(raw?.shieldReadyAtMs) || 0) };
    if (itemId === "shield_12h") usage.shieldReadyAtMs = nowMs + SHIELD_COOLDOWN_MS;
    else usage.counts[itemId] = item.count + quantity;
    return usage;
  }
  return Object.freeze({ MAX_LEVEL, SHIELD_COOLDOWN_MS, DEFINITIONS, DURATION_MINUTES, SHOP_ITEMS, level, normalizeLevels, definition, cost, duration, bonus, benefit, artStage, art, wallDuration, shopStatus, purchaseUsage });
});
