"use strict";
// Identities/art match the current Core. Personal state and all prices are review fixtures.
const TOWER_DEFINITIONS = Object.freeze({
  ravenwatch: {id: "core-v2-holding-tower-1", name: "Ravenwatch Tower", quadrant: "Northwest", map: "Stoneward", region: "core-v2-north-west-holding-tower-m1-m1", art: "assets/worlds/core-expansion-v1/art/tower-ravenwatch-3966d0772018.webp"},
  highguard: {id: "core-v2-holding-tower-2", name: "Highguard Tower", quadrant: "Northeast", map: "Lionwatch", region: "core-v2-north-east-holding-tower-p1-m1", art: "assets/worlds/core-expansion-v1/art/tower-highguard-4ca346633579.webp"},
  blackthorn: {id: "core-v2-holding-tower-3", name: "Blackthorn Tower", quadrant: "Southwest", map: "Oakwatch", region: "core-v2-south-west-holding-tower-m1-p1", art: "assets/worlds/core-expansion-v1/art/tower-blackthorn-a85bdbe2d2b4.webp"},
  stoneward: {id: "core-v2-holding-tower-4", name: "Stoneward Tower", quadrant: "Southeast", map: "Roseguard", region: "core-v2-south-east-holding-tower-p1-p1", art: "assets/worlds/core-expansion-v1/art/tower-stoneward-57c29f4d6846.webp"}
});
const TOWER_SAMPLES = Object.freeze(["owned", "member", "empty", "probation", "neutral", "enemy", "scouted", "veiled", "damaged", "repair", "queue", "full", "incoming", "veil", "spent", "poor", "long", "loading", "error"]);
const TOWER_ICONS = Object.freeze({troops: "assets/icons/daily-login-troops-r1.svg", wall: "assets/icons/skills/stoneworks.svg", gold: "assets/icons/royal-shop-gold-r1.svg", march: "assets/icons/troop-orders/marching-banner.svg", swords: "assets/icons/troop-orders/crossed-swords.svg", veil: "assets/optimized/item-veil-of-silence-384x384-45fcf6e08b34.webp"});
function towerFixture(sample) {
  const member = !["neutral", "enemy", "scouted", "veiled", "loading", "error"].includes(sample);
  const f = {member, manager: member && !["member", "probation"].includes(sample), eligible: sample !== "probation", neutral: sample === "neutral", clan: "The Crimson Watch", tag: "TCW", wall: sample === "neutral" ? 1 : 12, integrity: 100, veil: ["veil", "veiled"].includes(sample), veilUses: sample === "spent" ? 0 : sample === "veil" ? 1 : 2, treasury: 24000000, nextCost: 6250000, veilCost: 1250000, repairCost: 0, queue: [], rows: member ? [{name: "Aldric of Greenrook", troops: 685200, self: true}, {name: "Lady Elowen", troops: 1842150}, {name: "Lord Rowan", troops: 2255000}] : []};
  if (!member && !f.neutral) {f.clan = "The Iron Covenant"; f.tag = "IRON";}
  if (sample === "long") {f.clan = "The Crimson Watch of the Northern Marches"; f.treasury = 1234567890; f.rows = Array.from({length: 12}, (_, i) => ({name: i ? `Warden ${i} of the Far Northern Marches` : "Aldric of the Greenrook Northern Marches", troops: 12345678 + i * 123456, self: i === 0}));}
  if (sample === "empty") f.rows = [];
  if (sample === "probation") f.rows = f.rows.filter(r => !r.self);
  if (["damaged", "repair"].includes(sample)) {f.integrity = sample === "repair" ? 61 : 38; f.repairCost = 3875000; f.repair = sample === "repair";}
  if (["queue", "incoming", "full"].includes(sample)) {
    f.queue = Array.from({length: sample === "full" ? 10 : sample === "queue" ? 5 : 2}, (_, i) => ({from: 12 + i, to: 13 + i, cost: 6250000 * (i + 1)}));
    f.nextCost = 6250000 * (f.queue.length + 1);
  }
  f.incoming = sample === "incoming";
  if (sample === "poor") f.treasury = 10000;
  f.own = f.rows.find(r => r.self)?.troops || 0;
  f.troops = member ? f.rows.reduce((sum, r) => sum + r.troops, 0) : sample === "scouted" ? 4782350 : null;
  f.scouted = sample === "scouted"; f.scoutBlocked = sample === "veiled";
  f.unavailable = ["loading", "error"].includes(sample) ? sample : "";
  return f;
}
