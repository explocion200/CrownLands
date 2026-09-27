(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CROWNLANDS_COMMON_GEAR = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SCHEMA_VERSION = 3;
  const RARITY = "common";
  const RARITIES = Object.freeze(["common", "uncommon", "rare", "epic", "legendary"]);
  const INVENTORY_LIMIT = 2000;
  const BONUS_CAPS = Object.freeze({ attack: 100, defense: 100, walls: 150, marchSpeed: 150, wallRepair: 50 });
  const MAX_LEVEL = 5;
  const BOX_REVEAL_COUNT = 3;
  const SHOP_DAILY_LIMIT = 1;
  const SHOP_PRICE_HOURS = 1;
  const RELIC_BONUS_CHANCE_PERCENT = 1;
  const CASUALTY_RECOVERY_CAP_PERCENT = 75;
  const UPGRADE_RECEIPT_LIMIT = 24;
  const BONUS_BY_LEVEL = Object.freeze({ 1: 0.25, 2: 0.5, 3: 0.8, 4: 1.15, 5: 1.5 });
  const BONUS_MAXIMA = Object.freeze({
    troopProductionAllCities: [1.5, 3, 5, 7.5, 10],
    attackStrength: [1.5, 5, 12, 20, 30],
    casualtyEfficiency: [1.5, 3, 5, 7.5, 10],
    goldProductionMainCity: [1.5, 3, 5, 7.5, 10],
    goldProductionAllCities: [1.5, 4, 8, 13, 20],
    ownedMarchSpeed: [1.5, 3, 5, 7.5, 10],
    enemyMarchSpeed: [1.5, 5, 12, 20, 30],
    scoutSpeed: [1.5, 6, 15, 30, 50],
    wallStrength: [1.5, 3, 5.5, 8.5, 12.5],
    defenderStrength: [1.5, 5, 12, 20, 30],
    wallRepairSpeed: [1.5, 5, 12, 20, 30],
  });
  // Each row contains Levels 1→2, 2→3, 3→4, 4→5 and promotion to the next rarity.
  const UPGRADE_GOLD_COSTS = Object.freeze({
    common: Object.freeze([100_000, 170_000, 300_000, 500_000, 850_000]),
    uncommon: Object.freeze([1_500_000, 2_500_000, 4_000_000, 7_000_000, 50_000_000]),
    rare: Object.freeze([100_000_000, 200_000_000, 350_000_000, 600_000_000, 1_000_000_000]),
    epic: Object.freeze([1_500_000_000, 2_500_000_000, 4_000_000_000, 6_000_000_000, 9_000_000_000]),
    legendary: Object.freeze([14_000_000_000, 22_000_000_000, 34_000_000_000, 50_000_000_000, null]),
  });
  const SLOTS = Object.freeze(["head", "chest", "pants", "boots", "gloves", "belt", "weapon", "necklace"]);
  const ARMOR_SLOTS = new Set(["head", "chest", "pants", "boots", "gloves", "belt"]);
  const BUILDINGS = Object.freeze({
    barracks: Object.freeze({
      id: "barracks",
      name: "Barracks",
      characterRole: "War Captain",
      gender: "male",
      characterArt: "assets/optimized/gear-war-captain-768x1024-874eece78b2b.webp",
    }),
    treasury: Object.freeze({
      id: "treasury",
      name: "Treasury",
      characterRole: "Master of Coin",
      gender: "male",
      characterArt: "assets/optimized/gear-master-of-coin-768x1024-c419371e4af4.webp",
    }),
    "royal-stables": Object.freeze({
      id: "royal-stables",
      name: "Royal Stables",
      characterRole: "Cavalry Master",
      gender: "male",
      characterArt: "assets/optimized/gear-cavalry-master-768x1024-8fb4bc09583d.webp",
    }),
    gatehouse: Object.freeze({
      id: "gatehouse",
      name: "Gatehouse",
      characterRole: "Defensive Commander",
      gender: "male",
      characterArt: "assets/optimized/gear-defensive-commander-768x1024-d70e34617770.webp",
    }),
  });

  const NAMES = Object.freeze({
    barracks: Object.freeze({
      head: "War Captain's Iron Helm",
      chest: "War Captain's Scale Cuirass",
      pants: "War Captain's Battle Greaves",
      boots: "War Captain's Marching Boots",
      gloves: "War Captain's Officer Gauntlets",
      belt: "War Captain's Campaign Belt",
      weapon: "War Captain's Officer Sword",
      necklace: "War Captain's Valor Medallion",
    }),
    treasury: Object.freeze({
      head: "Master of Coin's Velvet Cap",
      chest: "Master of Coin's Counting Robe",
      pants: "Master of Coin's Court Breeches",
      boots: "Master of Coin's Sealed Shoes",
      gloves: "Master of Coin's Ledger Gloves",
      belt: "Master of Coin's Tax Sash",
      weapon: "Master of Coin's Royal Ledger",
      necklace: "Master of Coin's Treasury Chain",
    }),
    "royal-stables": Object.freeze({
      head: "Cavalry Master's Riding Helm",
      chest: "Cavalry Master's Brigandine",
      pants: "Cavalry Master's Riding Breeches",
      boots: "Cavalry Master's Silver Spurs",
      gloves: "Cavalry Master's Rein Gloves",
      belt: "Cavalry Master's Courier Belt",
      weapon: "Cavalry Master's Lance",
      necklace: "Cavalry Master's Wayfinder Pendant",
    }),
    gatehouse: Object.freeze({
      head: "Defensive Commander's Wallwarden Helm",
      chest: "Defensive Commander's Guard Cuirass",
      pants: "Defensive Commander's Gate Legguards",
      boots: "Defensive Commander's Mason Boots",
      gloves: "Defensive Commander's Repair Gauntlets",
      belt: "Defensive Commander's Key Belt",
      weapon: "Defensive Commander's Fortress Shield",
      necklace: "Defensive Commander's Masonry Seal",
    }),
  });

  const ART = Object.freeze({
  "barracks_head_common_01": "assets/optimized/gear-barracks-head-192x192-313e5e656540.webp",
  "barracks_head_uncommon_01": "assets/optimized/gear-barracks-head-uncommon-192x192-f6710aab3804.webp",
  "barracks_head_rare_01": "assets/optimized/gear-barracks-head-rare-192x192-27097380c169.webp",
  "barracks_head_epic_01": "assets/optimized/gear-barracks-head-epic-192x192-f73151c997a4.webp",
  "barracks_head_legendary_01": "assets/optimized/gear-barracks-head-legendary-192x192-aa021d01db29.webp",
  "barracks_chest_common_01": "assets/optimized/gear-barracks-chest-192x192-3c118f02d53d.webp",
  "barracks_chest_uncommon_01": "assets/optimized/gear-barracks-chest-uncommon-192x192-1d694759d3e4.webp",
  "barracks_chest_rare_01": "assets/optimized/gear-barracks-chest-rare-192x192-faa4fc288019.webp",
  "barracks_chest_epic_01": "assets/optimized/gear-barracks-chest-epic-192x192-1f86eb3b775b.webp",
  "barracks_chest_legendary_01": "assets/optimized/gear-barracks-chest-legendary-192x192-f62212d6f77c.webp",
  "barracks_pants_common_01": "assets/optimized/gear-barracks-pants-192x192-cc003c18ee38.webp",
  "barracks_pants_uncommon_01": "assets/optimized/gear-barracks-pants-uncommon-192x192-5005fe21afe3.webp",
  "barracks_pants_rare_01": "assets/optimized/gear-barracks-pants-rare-192x192-7d37b9002f19.webp",
  "barracks_pants_epic_01": "assets/optimized/gear-barracks-pants-epic-192x192-5f7a1fda8af8.webp",
  "barracks_pants_legendary_01": "assets/optimized/gear-barracks-pants-legendary-192x192-b6940fc5f92f.webp",
  "barracks_boots_common_01": "assets/optimized/gear-barracks-boots-192x192-edf8a1babad2.webp",
  "barracks_boots_uncommon_01": "assets/optimized/gear-barracks-boots-uncommon-192x192-32168c240e6d.webp",
  "barracks_boots_rare_01": "assets/optimized/gear-barracks-boots-rare-192x192-8b080c70ab5c.webp",
  "barracks_boots_epic_01": "assets/optimized/gear-barracks-boots-epic-192x192-2115a5abe6ff.webp",
  "barracks_boots_legendary_01": "assets/optimized/gear-barracks-boots-legendary-192x192-7449cd9a9987.webp",
  "barracks_gloves_common_01": "assets/optimized/gear-barracks-gloves-192x192-c9d001327abd.webp",
  "barracks_gloves_uncommon_01": "assets/optimized/gear-barracks-gloves-uncommon-192x192-2d1cfa191d80.webp",
  "barracks_gloves_rare_01": "assets/optimized/gear-barracks-gloves-rare-192x192-9ff6ce2bc034.webp",
  "barracks_gloves_epic_01": "assets/optimized/gear-barracks-gloves-epic-192x192-3b91976af778.webp",
  "barracks_gloves_legendary_01": "assets/optimized/gear-barracks-gloves-legendary-192x192-fbf9b2528b4f.webp",
  "barracks_belt_common_01": "assets/optimized/gear-barracks-belt-192x192-89fcd0993176.webp",
  "barracks_belt_uncommon_01": "assets/optimized/gear-barracks-belt-uncommon-192x192-cf258f471486.webp",
  "barracks_belt_rare_01": "assets/optimized/gear-barracks-belt-rare-192x192-2d8805fecf96.webp",
  "barracks_belt_epic_01": "assets/optimized/gear-barracks-belt-epic-192x192-e2ffff6bc3eb.webp",
  "barracks_belt_legendary_01": "assets/optimized/gear-barracks-belt-legendary-192x192-7ade4a9a216c.webp",
  "barracks_weapon_common_01": "assets/optimized/gear-barracks-weapon-192x192-204241e66c5f.webp",
  "barracks_weapon_uncommon_01": "assets/optimized/gear-barracks-weapon-uncommon-192x192-934aa1357730.webp",
  "barracks_weapon_rare_01": "assets/optimized/gear-barracks-weapon-rare-192x192-4e82b29dce44.webp",
  "barracks_weapon_epic_01": "assets/optimized/gear-barracks-weapon-epic-192x192-cd72dc1bafbb.webp",
  "barracks_weapon_legendary_01": "assets/optimized/gear-barracks-weapon-legendary-192x192-48ec25e21677.webp",
  "barracks_necklace_common_01": "assets/optimized/gear-barracks-necklace-192x192-6d44b03273e9.webp",
  "barracks_necklace_uncommon_01": "assets/optimized/gear-barracks-necklace-uncommon-192x192-d0fde6b87a48.webp",
  "barracks_necklace_rare_01": "assets/optimized/gear-barracks-necklace-rare-192x192-ffc3b1eb28e2.webp",
  "barracks_necklace_epic_01": "assets/optimized/gear-barracks-necklace-epic-192x192-2067b0c7b49b.webp",
  "barracks_necklace_legendary_01": "assets/optimized/gear-barracks-necklace-legendary-192x192-99c0167f18fb.webp",
  "treasury_head_common_01": "assets/optimized/gear-treasury-head-192x192-99b76757361b.webp",
  "treasury_head_uncommon_01": "assets/optimized/gear-treasury-head-uncommon-192x192-2c55e5f58d40.webp",
  "treasury_head_rare_01": "assets/optimized/gear-treasury-head-rare-192x192-4e794978c0cb.webp",
  "treasury_head_epic_01": "assets/optimized/gear-treasury-head-epic-192x192-cf1bb8c158b9.webp",
  "treasury_head_legendary_01": "assets/optimized/gear-treasury-head-legendary-192x192-7de464ce7d4f.webp",
  "treasury_chest_common_01": "assets/optimized/gear-treasury-chest-192x192-e09d99d13b52.webp",
  "treasury_chest_uncommon_01": "assets/optimized/gear-treasury-chest-uncommon-192x192-573cb52c75a4.webp",
  "treasury_chest_rare_01": "assets/optimized/gear-treasury-chest-rare-192x192-21d5f74adb4d.webp",
  "treasury_chest_epic_01": "assets/optimized/gear-treasury-chest-epic-192x192-f42f42ac501b.webp",
  "treasury_chest_legendary_01": "assets/optimized/gear-treasury-chest-legendary-192x192-fff086f47591.webp",
  "treasury_pants_common_01": "assets/optimized/gear-treasury-pants-192x192-b449daa6a170.webp",
  "treasury_pants_uncommon_01": "assets/optimized/gear-treasury-pants-uncommon-192x192-711030c4603f.webp",
  "treasury_pants_rare_01": "assets/optimized/gear-treasury-pants-rare-192x192-4ddd0d1d02f0.webp",
  "treasury_pants_epic_01": "assets/optimized/gear-treasury-pants-epic-192x192-3c9037623626.webp",
  "treasury_pants_legendary_01": "assets/optimized/gear-treasury-pants-legendary-192x192-d68f62ed56ff.webp",
  "treasury_boots_common_01": "assets/optimized/gear-treasury-boots-192x192-3ae2ba9aca41.webp",
  "treasury_boots_uncommon_01": "assets/optimized/gear-treasury-boots-uncommon-192x192-5cef8ffb09c5.webp",
  "treasury_boots_rare_01": "assets/optimized/gear-treasury-boots-rare-192x192-98b86269563b.webp",
  "treasury_boots_epic_01": "assets/optimized/gear-treasury-boots-epic-192x192-e5af32e68587.webp",
  "treasury_boots_legendary_01": "assets/optimized/gear-treasury-boots-legendary-192x192-0bc86f42e43f.webp",
  "treasury_gloves_common_01": "assets/optimized/gear-treasury-gloves-192x192-e79032fce3be.webp",
  "treasury_gloves_uncommon_01": "assets/optimized/gear-treasury-gloves-uncommon-192x192-4eab3a75c1cc.webp",
  "treasury_gloves_rare_01": "assets/optimized/gear-treasury-gloves-rare-192x192-968238b2feb2.webp",
  "treasury_gloves_epic_01": "assets/optimized/gear-treasury-gloves-epic-192x192-912a71fd66f8.webp",
  "treasury_gloves_legendary_01": "assets/optimized/gear-treasury-gloves-legendary-192x192-925a750373e6.webp",
  "treasury_belt_common_01": "assets/optimized/gear-treasury-belt-192x192-9cc72c01d629.webp",
  "treasury_belt_uncommon_01": "assets/optimized/gear-treasury-belt-uncommon-192x192-63ceef9ceef7.webp",
  "treasury_belt_rare_01": "assets/optimized/gear-treasury-belt-rare-192x192-1025ae093845.webp",
  "treasury_belt_epic_01": "assets/optimized/gear-treasury-belt-epic-192x192-83a132fa2c08.webp",
  "treasury_belt_legendary_01": "assets/optimized/gear-treasury-belt-legendary-192x192-f295cf848c4c.webp",
  "treasury_weapon_common_01": "assets/optimized/gear-treasury-weapon-192x192-4d99f0d7a990.webp",
  "treasury_weapon_uncommon_01": "assets/optimized/gear-treasury-weapon-uncommon-192x192-75d84eb482af.webp",
  "treasury_weapon_rare_01": "assets/optimized/gear-treasury-weapon-rare-192x192-98c2b9e23ec2.webp",
  "treasury_weapon_epic_01": "assets/optimized/gear-treasury-weapon-epic-192x192-ed11c6c58388.webp",
  "treasury_weapon_legendary_01": "assets/optimized/gear-treasury-weapon-legendary-192x192-148aa4a08d46.webp",
  "treasury_necklace_common_01": "assets/optimized/gear-treasury-necklace-192x192-7542effaafd5.webp",
  "treasury_necklace_uncommon_01": "assets/optimized/gear-treasury-necklace-uncommon-192x192-e9c0ec40bb72.webp",
  "treasury_necklace_rare_01": "assets/optimized/gear-treasury-necklace-rare-192x192-d7b958824786.webp",
  "treasury_necklace_epic_01": "assets/optimized/gear-treasury-necklace-epic-192x192-1cb1a1336fbe.webp",
  "treasury_necklace_legendary_01": "assets/optimized/gear-treasury-necklace-legendary-192x192-47fa38932808.webp",
  "royal_stables_head_common_01": "assets/optimized/gear-royal-stables-head-192x192-c87ab2695304.webp",
  "royal_stables_head_uncommon_01": "assets/optimized/gear-royal-stables-head-uncommon-192x192-be868db9ae56.webp",
  "royal_stables_head_rare_01": "assets/optimized/gear-royal-stables-head-rare-192x192-e4ea53f3b1f7.webp",
  "royal_stables_head_epic_01": "assets/optimized/gear-royal-stables-head-epic-192x192-476851aebf61.webp",
  "royal_stables_head_legendary_01": "assets/optimized/gear-royal-stables-head-legendary-192x192-b1471b4d2294.webp",
  "royal_stables_chest_common_01": "assets/optimized/gear-royal-stables-chest-192x192-28625e1529a1.webp",
  "royal_stables_chest_uncommon_01": "assets/optimized/gear-royal-stables-chest-uncommon-192x192-0d6cdb128181.webp",
  "royal_stables_chest_rare_01": "assets/optimized/gear-royal-stables-chest-rare-192x192-0dcf9f30c7a6.webp",
  "royal_stables_chest_epic_01": "assets/optimized/gear-royal-stables-chest-epic-192x192-a9050548a7d8.webp",
  "royal_stables_chest_legendary_01": "assets/optimized/gear-royal-stables-chest-legendary-192x192-fb2cd23bd017.webp",
  "royal_stables_pants_common_01": "assets/optimized/gear-royal-stables-pants-192x192-7c23a0e5bba4.webp",
  "royal_stables_pants_uncommon_01": "assets/optimized/gear-royal-stables-pants-uncommon-192x192-c74ede862fc9.webp",
  "royal_stables_pants_rare_01": "assets/optimized/gear-royal-stables-pants-rare-192x192-a960f4d7afa5.webp",
  "royal_stables_pants_epic_01": "assets/optimized/gear-royal-stables-pants-epic-192x192-ad484c6b705d.webp",
  "royal_stables_pants_legendary_01": "assets/optimized/gear-royal-stables-pants-legendary-192x192-9df0e23ee691.webp",
  "royal_stables_boots_common_01": "assets/optimized/gear-royal-stables-boots-192x192-68ed5c227b42.webp",
  "royal_stables_boots_uncommon_01": "assets/optimized/gear-royal-stables-boots-uncommon-192x192-d5b2c02b8c9d.webp",
  "royal_stables_boots_rare_01": "assets/optimized/gear-royal-stables-boots-rare-192x192-5f77e144c380.webp",
  "royal_stables_boots_epic_01": "assets/optimized/gear-royal-stables-boots-epic-192x192-0d0dd835e9c8.webp",
  "royal_stables_boots_legendary_01": "assets/optimized/gear-royal-stables-boots-legendary-192x192-25d1a2ef0659.webp",
  "royal_stables_gloves_common_01": "assets/optimized/gear-royal-stables-gloves-192x192-07bab48ef44c.webp",
  "royal_stables_gloves_uncommon_01": "assets/optimized/gear-royal-stables-gloves-uncommon-192x192-aeca23d87895.webp",
  "royal_stables_gloves_rare_01": "assets/optimized/gear-royal-stables-gloves-rare-192x192-43637f150afd.webp",
  "royal_stables_gloves_epic_01": "assets/optimized/gear-royal-stables-gloves-epic-192x192-5627bad1413b.webp",
  "royal_stables_gloves_legendary_01": "assets/optimized/gear-royal-stables-gloves-legendary-192x192-81136582cc81.webp",
  "royal_stables_belt_common_01": "assets/optimized/gear-royal-stables-belt-192x192-d251726672f7.webp",
  "royal_stables_belt_uncommon_01": "assets/optimized/gear-royal-stables-belt-uncommon-192x192-7fa7006d9ae6.webp",
  "royal_stables_belt_rare_01": "assets/optimized/gear-royal-stables-belt-rare-192x192-1f3f3fefd680.webp",
  "royal_stables_belt_epic_01": "assets/optimized/gear-royal-stables-belt-epic-192x192-67f095a59e2e.webp",
  "royal_stables_belt_legendary_01": "assets/optimized/gear-royal-stables-belt-legendary-192x192-4b2610248dff.webp",
  "royal_stables_weapon_common_01": "assets/optimized/gear-royal-stables-weapon-192x192-dccfc5c662d6.webp",
  "royal_stables_weapon_uncommon_01": "assets/optimized/gear-royal-stables-weapon-uncommon-192x192-181b090cb512.webp",
  "royal_stables_weapon_rare_01": "assets/optimized/gear-royal-stables-weapon-rare-192x192-55e8c6acc6b0.webp",
  "royal_stables_weapon_epic_01": "assets/optimized/gear-royal-stables-weapon-epic-192x192-e3f8d7733999.webp",
  "royal_stables_weapon_legendary_01": "assets/optimized/gear-royal-stables-weapon-legendary-192x192-98e3648a7db5.webp",
  "royal_stables_necklace_common_01": "assets/optimized/gear-royal-stables-necklace-192x192-913484e0967b.webp",
  "royal_stables_necklace_uncommon_01": "assets/optimized/gear-royal-stables-necklace-uncommon-192x192-ee649f1a3f39.webp",
  "royal_stables_necklace_rare_01": "assets/optimized/gear-royal-stables-necklace-rare-192x192-0208bfef5d0b.webp",
  "royal_stables_necklace_epic_01": "assets/optimized/gear-royal-stables-necklace-epic-192x192-504361961842.webp",
  "royal_stables_necklace_legendary_01": "assets/optimized/gear-royal-stables-necklace-legendary-192x192-903265a2bd12.webp",
  "gatehouse_head_common_01": "assets/optimized/gear-gatehouse-head-192x192-b5a59680fd65.webp",
  "gatehouse_head_uncommon_01": "assets/optimized/gear-gatehouse-head-uncommon-192x192-cac04d605ca2.webp",
  "gatehouse_head_rare_01": "assets/optimized/gear-gatehouse-head-rare-192x192-6b7765bacb0d.webp",
  "gatehouse_head_epic_01": "assets/optimized/gear-gatehouse-head-epic-192x192-1595b2cae67f.webp",
  "gatehouse_head_legendary_01": "assets/optimized/gear-gatehouse-head-legendary-192x192-abd29e6bc9aa.webp",
  "gatehouse_chest_common_01": "assets/optimized/gear-gatehouse-chest-192x192-1e72532be259.webp",
  "gatehouse_chest_uncommon_01": "assets/optimized/gear-gatehouse-chest-uncommon-192x192-b77000778d73.webp",
  "gatehouse_chest_rare_01": "assets/optimized/gear-gatehouse-chest-rare-192x192-8c9ab34cd6bd.webp",
  "gatehouse_chest_epic_01": "assets/optimized/gear-gatehouse-chest-epic-192x192-a89c14575650.webp",
  "gatehouse_chest_legendary_01": "assets/optimized/gear-gatehouse-chest-legendary-192x192-3376100c2eee.webp",
  "gatehouse_pants_common_01": "assets/optimized/gear-gatehouse-pants-192x192-6ebd3a25d081.webp",
  "gatehouse_pants_uncommon_01": "assets/optimized/gear-gatehouse-pants-uncommon-192x192-45e3079f923d.webp",
  "gatehouse_pants_rare_01": "assets/optimized/gear-gatehouse-pants-rare-192x192-be933d2fd8da.webp",
  "gatehouse_pants_epic_01": "assets/optimized/gear-gatehouse-pants-epic-192x192-7eaabcfae352.webp",
  "gatehouse_pants_legendary_01": "assets/optimized/gear-gatehouse-pants-legendary-192x192-235f41f0a6c2.webp",
  "gatehouse_boots_common_01": "assets/optimized/gear-gatehouse-boots-192x192-6de5454174c7.webp",
  "gatehouse_boots_uncommon_01": "assets/optimized/gear-gatehouse-boots-uncommon-192x192-2af24b8d0253.webp",
  "gatehouse_boots_rare_01": "assets/optimized/gear-gatehouse-boots-rare-192x192-82a19bdc26d6.webp",
  "gatehouse_boots_epic_01": "assets/optimized/gear-gatehouse-boots-epic-192x192-8ce461e8b47f.webp",
  "gatehouse_boots_legendary_01": "assets/optimized/gear-gatehouse-boots-legendary-192x192-e75dc9baa08b.webp",
  "gatehouse_gloves_common_01": "assets/optimized/gear-gatehouse-gloves-192x192-5f16827310cb.webp",
  "gatehouse_gloves_uncommon_01": "assets/optimized/gear-gatehouse-gloves-uncommon-192x192-c50a728464d9.webp",
  "gatehouse_gloves_rare_01": "assets/optimized/gear-gatehouse-gloves-rare-192x192-6d1538d76e8c.webp",
  "gatehouse_gloves_epic_01": "assets/optimized/gear-gatehouse-gloves-epic-192x192-e41770319c61.webp",
  "gatehouse_gloves_legendary_01": "assets/optimized/gear-gatehouse-gloves-legendary-192x192-840651b3b1ef.webp",
  "gatehouse_belt_common_01": "assets/optimized/gear-gatehouse-belt-192x192-918a7dd7576c.webp",
  "gatehouse_belt_uncommon_01": "assets/optimized/gear-gatehouse-belt-uncommon-192x192-f5ba4f8c727d.webp",
  "gatehouse_belt_rare_01": "assets/optimized/gear-gatehouse-belt-rare-192x192-c14e54570cb3.webp",
  "gatehouse_belt_epic_01": "assets/optimized/gear-gatehouse-belt-epic-192x192-d010bfc95e77.webp",
  "gatehouse_belt_legendary_01": "assets/optimized/gear-gatehouse-belt-legendary-192x192-b63a4768ef7d.webp",
  "gatehouse_weapon_common_01": "assets/optimized/gear-gatehouse-weapon-192x192-c0eee067f541.webp",
  "gatehouse_weapon_uncommon_01": "assets/optimized/gear-gatehouse-weapon-uncommon-192x192-44ba1ed92fb4.webp",
  "gatehouse_weapon_rare_01": "assets/optimized/gear-gatehouse-weapon-rare-192x192-565d76e8a258.webp",
  "gatehouse_weapon_epic_01": "assets/optimized/gear-gatehouse-weapon-epic-192x192-5dfcda3e546f.webp",
  "gatehouse_weapon_legendary_01": "assets/optimized/gear-gatehouse-weapon-legendary-192x192-07be2a7776a7.webp",
  "gatehouse_necklace_common_01": "assets/optimized/gear-gatehouse-necklace-192x192-837482be4074.webp",
  "gatehouse_necklace_uncommon_01": "assets/optimized/gear-gatehouse-necklace-uncommon-192x192-53800d619928.webp",
  "gatehouse_necklace_rare_01": "assets/optimized/gear-gatehouse-necklace-rare-192x192-2d3cdb1e95c9.webp",
  "gatehouse_necklace_epic_01": "assets/optimized/gear-gatehouse-necklace-epic-192x192-34da78e63855.webp",
  "gatehouse_necklace_legendary_01": "assets/optimized/gear-gatehouse-necklace-legendary-192x192-1a7c4fd8d2c5.webp"
});

  function getEffect(buildingId, slot) {
    if (buildingId === "barracks") {
      if (ARMOR_SLOTS.has(slot)) return ["troopProductionAllCities", "troop production in all owned cities"];
      if (slot === "weapon") return ["attackStrength", "attack strength for all attacks"];
      return ["casualtyEfficiency", "casualty recovery with Field Medics (75% combined cap; recovered troops return to the main city)"];
    }
    if (buildingId === "treasury") {
      if (slot === "necklace") return ["goldProductionAllCities", "gold production in all owned cities"];
      return ["goldProductionMainCity", "gold production in the main city"];
    }
    if (buildingId === "royal-stables") {
      if (ARMOR_SLOTS.has(slot)) return ["ownedMarchSpeed", "owned-city transfer and reinforcement speed"];
      if (slot === "weapon") return ["enemyMarchSpeed", "attack and rally march speed"];
      return ["scoutSpeed", "scout speed"];
    }
    if (ARMOR_SLOTS.has(slot)) return ["wallStrength", "wall strength in all owned cities"];
    if (slot === "weapon") return ["defenderStrength", "defending soldier strength in all owned cities"];
    return ["wallRepairSpeed", "reduction to repair time added by new wall damage"];
  }

  const DEFINITIONS = Object.freeze(Object.values(BUILDINGS).flatMap(building => (
    SLOTS.flatMap(slot => RARITIES.map((rarity, rarityIndex) => {
      const [statType, statLabel] = getEffect(building.id, slot);
      const maximums = BONUS_MAXIMA[statType];
      const bonusByLevel = rarityIndex === 0 ? BONUS_BY_LEVEL : Object.freeze(Object.fromEntries(
        [1, 2, 3, 4, 5].map(level => [level, Number((maximums[rarityIndex - 1]
          + (maximums[rarityIndex] - maximums[rarityIndex - 1]) * level / MAX_LEVEL).toFixed(2))])
      ));
      return Object.freeze({
        gearKey: `${building.id.replace(/-/g, "_")}_${slot}_${rarity}_01`,
        familyKey: `${building.id.replace(/-/g, "_")}_${slot}`,
        gearName: NAMES[building.id][slot],
        art: ART[`${building.id.replace(/-/g, "_")}_${slot}_${rarity}_01`],
        buildingId: building.id,
        buildingName: building.name,
        characterRole: building.characterRole,
        slot,
        category: ARMOR_SLOTS.has(slot) ? "armor" : slot === "weapon" ? "weapon" : "jewelry",
        rarity,
        maxLevel: MAX_LEVEL,
        statType,
        statScope: statType,
        statLabel,
        bonusByLevel,
        isToolInsteadOfWeapon: building.id === "treasury" && slot === "weapon",
      });
    }))
  )));
  const COMMON_DEFINITIONS = Object.freeze(DEFINITIONS.filter(definition => definition.rarity === RARITY));
  const DEFINITIONS_BY_KEY = new Map(DEFINITIONS.map(definition => [definition.gearKey, definition]));

  function timestampToMs(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return Math.max(0, value.toMillis());
    if (Number.isFinite(Number(value))) return Math.max(0, Math.floor(Number(value)));
    if (Number.isFinite(Number(value.seconds))) {
      return Math.max(0, Math.floor(Number(value.seconds) * 1000 + Number(value.nanoseconds || 0) / 1000000));
    }
    return 0;
  }

  function cleanId(value, maximum = 128) {
    return String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, maximum);
  }

  function createEmptyEquipped() {
    return Object.fromEntries(Object.keys(BUILDINGS).map(buildingId => [
      buildingId,
      Object.fromEntries(SLOTS.map(slot => [slot, ""])),
    ]));
  }

  function createDefaultState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      commonGearBoxes: 0,
      instances: {},
      equipped: createEmptyEquipped(),
      newMarkers: Object.fromEntries(Object.keys(BUILDINGS).map(buildingId => [buildingId, false])),
      shopPurchase: { utcDate: "", purchaseCount: 0 },
      lastOpenRequestId: "",
      lastOpenReceipt: null,
      recentUpgradeReceipts: [],
      updatedAtMs: 0,
    };
  }

  function normalizeInstance(raw, fallbackId = "") {
    if (!raw || typeof raw !== "object") return null;
    const instanceId = cleanId(raw.instanceId || raw.id || fallbackId, 128);
    const gearKey = cleanId(raw.gearKey, 128);
    const definition = DEFINITIONS_BY_KEY.get(gearKey);
    if (!instanceId || !definition) return null;
    const level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(raw.level) || 1)));
    return {
      instanceId,
      gearKey,
      buildingId: definition.buildingId,
      slot: definition.slot,
      rarity: definition.rarity,
      level,
      isEquipped: false,
      isNew: raw.isNew === true,
      acquiredAtMs: timestampToMs(raw.acquiredAtMs || raw.acquiredAt),
      upgradedAtMs: timestampToMs(raw.upgradedAtMs || raw.upgradedAt),
    };
  }

  function normalizeState(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const state = createDefaultState();
    state.schemaVersion = Math.max(SCHEMA_VERSION, Math.floor(Number(source.schemaVersion) || 0));
    state.commonGearBoxes = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(Number(source.commonGearBoxes) || 0)));
    Object.entries(source.instances && typeof source.instances === "object" ? source.instances : {})
      .forEach(([instanceId, value]) => {
        const instance = normalizeInstance(value, instanceId);
        if (instance) state.instances[instance.instanceId] = instance;
        // Preserve future/unsupported records for server-authoritative persistence.
        // They cannot be equipped, consumed, or contribute effects in this version.
        else if (value && typeof value === "object" && !["__proto__", "constructor", "prototype"].includes(instanceId)) {
          state.instances[instanceId] = { ...value };
        }
      });
    Object.keys(BUILDINGS).forEach(buildingId => {
      SLOTS.forEach(slot => {
        const instanceId = cleanId(source.equipped?.[buildingId]?.[slot], 128);
        const instance = state.instances[instanceId];
        if (!instance || !getDefinition(instance.gearKey) || instance.buildingId !== buildingId || instance.slot !== slot) return;
        state.equipped[buildingId][slot] = instanceId;
        instance.isEquipped = true;
      });
      state.newMarkers[buildingId] = source.newMarkers?.[buildingId] === true
        || Object.values(state.instances).some(instance => instance.buildingId === buildingId && instance.isNew);
    });
    const purchaseDate = String(source.shopPurchase?.utcDate || "").slice(0, 10);
    state.shopPurchase = {
      utcDate: /^\d{4}-\d{2}-\d{2}$/.test(purchaseDate) ? purchaseDate : "",
      purchaseCount: Math.max(0, Math.min(SHOP_DAILY_LIMIT, Math.floor(Number(source.shopPurchase?.purchaseCount) || 0))),
    };
    state.lastOpenRequestId = cleanId(source.lastOpenRequestId, 96);
    const receipt = source.lastOpenReceipt && typeof source.lastOpenReceipt === "object" ? source.lastOpenReceipt : null;
    state.lastOpenReceipt = receipt ? {
      requestId: cleanId(receipt.requestId, 96),
      openedAtMs: timestampToMs(receipt.openedAtMs),
      instanceIds: (Array.isArray(receipt.instanceIds) ? receipt.instanceIds : []).map(id => cleanId(id, 128)).filter(id => state.instances[id]).slice(0, BOX_REVEAL_COUNT),
    } : null;
    state.recentUpgradeReceipts = (Array.isArray(source.recentUpgradeReceipts) ? source.recentUpgradeReceipts : [])
      .map(rawReceipt => ({
        requestId: cleanId(rawReceipt?.requestId, 96),
        upgradedAtMs: timestampToMs(rawReceipt?.upgradedAtMs),
        upgradedInstanceId: cleanId(rawReceipt?.upgradedInstanceId, 128),
        consumedInstanceIds: (Array.isArray(rawReceipt?.consumedInstanceIds) ? rawReceipt.consumedInstanceIds : [])
          .map(id => cleanId(id, 128))
          .filter(Boolean)
          .slice(0, 8),
        previousLevel: Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(rawReceipt?.previousLevel) || 1))),
        newLevel: Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(rawReceipt?.newLevel) || 1))),
        targetInstanceId: cleanId(rawReceipt?.targetInstanceId || rawReceipt?.consumedInstanceIds?.[0], 128),
        previousRarity: RARITIES.includes(rawReceipt?.previousRarity) ? rawReceipt.previousRarity : RARITY,
        newRarity: RARITIES.includes(rawReceipt?.newRarity) ? rawReceipt.newRarity : RARITY,
        resultGearKey: cleanId(rawReceipt?.resultGearKey, 128),
        spentGold: Math.max(0, Math.floor(Number(rawReceipt?.spentGold) || 0)),
      }))
      .filter(rawReceipt => rawReceipt.requestId && rawReceipt.upgradedInstanceId)
      .slice(-UPGRADE_RECEIPT_LIMIT);
    state.updatedAtMs = timestampToMs(source.updatedAtMs || source.updatedAt);
    return state;
  }

  function getDefinition(gearKey) {
    return DEFINITIONS_BY_KEY.get(String(gearKey || "")) || null;
  }

  function getBonusPercent(instance) {
    const definition = getDefinition(instance?.gearKey);
    return definition?.bonusByLevel[Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(instance?.level) || 1)))] || 0;
  }

  function getBonuses(profileOrGear) {
    const gear = normalizeState(profileOrGear?.gear || profileOrGear);
    const bonuses = {
      troopProductionAllCities: 0,
      attackStrength: 0,
      casualtyEfficiency: 0,
      goldProductionMainCity: 0,
      goldProductionAllCities: 0,
      ownedMarchSpeed: 0,
      enemyMarchSpeed: 0,
      scoutSpeed: 0,
      wallStrength: 0,
      defenderStrength: 0,
      wallRepairSpeed: 0,
    };
    Object.values(gear.equipped).forEach(slots => Object.values(slots).forEach(instanceId => {
      const instance = gear.instances[instanceId];
      const definition = instance ? getDefinition(instance.gearKey) : null;
      if (!definition || !Object.prototype.hasOwnProperty.call(bonuses, definition.statType)) return;
      bonuses[definition.statType] += getBonusPercent(instance);
    }));
    Object.keys(bonuses).forEach(key => { bonuses[key] = Number(bonuses[key].toFixed(2)); });
    return bonuses;
  }

  function getUpgradeRequirement(level, rarity = RARITY) {
    if (level && typeof level === "object") {
      const definition = getDefinition(level.gearKey);
      if (!definition) return null;
      rarity = definition.rarity;
      level = level.level;
    }
    const rarityIndex = RARITIES.indexOf(rarity);
    const normalizedLevel = Math.floor(Number(level));
    if (rarityIndex < 0 || normalizedLevel < 1 || normalizedLevel > MAX_LEVEL || !Number.isInteger(normalizedLevel)
      || (rarityIndex === RARITIES.length - 1 && normalizedLevel === MAX_LEVEL)) return null;
    const promotion = normalizedLevel === MAX_LEVEL;
    return {
      duplicates: 1,
      goldCost: UPGRADE_GOLD_COSTS[rarity][normalizedLevel - 1],
      promotion,
      nextLevel: promotion ? 1 : normalizedLevel + 1,
      nextRarity: RARITIES[rarityIndex + (promotion ? 1 : 0)],
    };
  }

  function capBonus(category, percent) {
    const cap = BONUS_CAPS[category];
    if (cap === undefined) throw new RangeError("Unknown gear bonus category");
    return Math.min(cap, Math.max(0, Number(percent) || 0));
  }

  function getUpgradeResult(instance) {
    const definition = getDefinition(instance?.gearKey);
    const requirement = getUpgradeRequirement(instance);
    if (!definition || !requirement) return null;
    return { ...instance, gearKey: `${definition.familyKey}_${requirement.nextRarity}_01`,
      rarity: requirement.nextRarity, level: requirement.nextLevel };
  }

  function getUpgradeGoldCost(level = 1, rarity = RARITY) {
    return getUpgradeRequirement(level, rarity)?.goldCost || 0;
  }

  function getBaseCopyCountForLevel(level = 1, rarity = RARITY) {
    const targetLevel = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(level) || 1)));
    let copies = 2 ** (Math.max(0, RARITIES.indexOf(rarity)) * MAX_LEVEL);
    for (let currentLevel = 1; currentLevel < targetLevel; currentLevel += 1) {
      copies *= 1 + (getUpgradeRequirement(currentLevel)?.duplicates || 0);
    }
    return copies;
  }

  function getCumulativeGoldCostForLevel(level = 1, rarity = RARITY) {
    const targetLevel = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(level) || 1)));
    let gold = 0;
    const rank = Math.max(0, RARITIES.indexOf(rarity)) * MAX_LEVEL + targetLevel - 1;
    for (let step = 0; step < rank; step += 1) {
      const requirement = getUpgradeRequirement(step % MAX_LEVEL + 1, RARITIES[Math.floor(step / MAX_LEVEL)]);
      if (!requirement) break;
      gold = gold * (1 + requirement.duplicates) + requirement.goldCost;
    }
    return gold;
  }

  function getUpgradeMaterialInstances(target, instances = []) {
    if (!target || typeof target !== "object") return [];
    const candidates = Array.isArray(instances)
      ? instances
      : Object.values(instances && typeof instances === "object" ? instances : {});
    return candidates
      .filter(candidate => candidate
        && candidate.instanceId !== target.instanceId
        && candidate.gearKey === target.gearKey
        && candidate.level === target.level
        && !candidate.isEquipped)
      .sort((a, b) => a.acquiredAtMs - b.acquiredAtMs || a.instanceId.localeCompare(b.instanceId));
  }

  function consumeUpgradeInputs(gear, targetInstanceId = "", resultInstanceId = "", upgradedAtMs = 0) {
    if (!gear || typeof gear !== "object" || !gear.instances || typeof gear.instances !== "object") return null;
    const targetId = cleanId(targetInstanceId, 128);
    const resultId = cleanId(resultInstanceId, 128);
    const target = gear.instances[targetId];
    const requirement = target ? getUpgradeRequirement(target) : null;
    if (!target || !requirement || !resultId || gear.instances[resultId]) return null;
    const materials = getUpgradeMaterialInstances(target, gear.instances).slice(0, requirement.duplicates);
    if (materials.length !== requirement.duplicates) return null;
    const beforeCount = Object.keys(gear.instances).length;
    const previousLevel = target.level;
    const wasEquipped = target.isEquipped === true;
    const craftedAtMs = timestampToMs(upgradedAtMs) || target.upgradedAtMs || target.acquiredAtMs;
    const consumedInstanceIds = [target.instanceId, ...materials.map(material => material.instanceId)];
    const upgradedInstance = normalizeInstance({
      instanceId: resultId,
      gearKey: getUpgradeResult(target).gearKey,
      level: requirement.nextLevel,
      isNew: false,
      acquiredAtMs: craftedAtMs,
      upgradedAtMs: craftedAtMs,
    });
    if (!upgradedInstance) return null;
    upgradedInstance.isEquipped = wasEquipped;
    consumedInstanceIds.forEach(instanceId => { delete gear.instances[instanceId]; });
    gear.instances[resultId] = upgradedInstance;
    if (wasEquipped) gear.equipped[target.buildingId][target.slot] = resultId;
    const afterCount = Object.keys(gear.instances).length;
    if (afterCount !== beforeCount - requirement.duplicates) return null;
    return {
      upgradedInstance,
      upgradedInstanceId: resultId,
      consumedInstanceIds,
      previousLevel,
      newLevel: upgradedInstance.level,
      previousRarity: target.rarity,
      newRarity: upgradedInstance.rarity,
      beforeCount,
      afterCount,
    };
  }

  return Object.freeze({
    SCHEMA_VERSION,
    RARITY,
    RARITIES,
    INVENTORY_LIMIT,
    BONUS_CAPS,
    capBonus,
    MAX_LEVEL,
    BOX_REVEAL_COUNT,
    SHOP_DAILY_LIMIT,
    SHOP_PRICE_HOURS,
    RELIC_BONUS_CHANCE_PERCENT,
    CASUALTY_RECOVERY_CAP_PERCENT,
    UPGRADE_RECEIPT_LIMIT,
    BONUS_BY_LEVEL,
    UPGRADE_GOLD_COSTS,
    SLOTS,
    BUILDINGS,
    DEFINITIONS,
    COMMON_DEFINITIONS,
    createDefaultState,
    normalizeState,
    normalizeInstance,
    getDefinition,
    getBonusPercent,
    getBonuses,
    getUpgradeRequirement,
    getUpgradeResult,
    getUpgradeGoldCost,
    getBaseCopyCountForLevel,
    getCumulativeGoldCostForLevel,
    getUpgradeMaterialInstances,
    consumeUpgradeInputs,
  });
});
