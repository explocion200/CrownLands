"use strict";
// Current Core objective identity/art; all personal data is fictional.
const REGIONAL_HOLD_DEFAULTS = Object.freeze({
 level: 50, baseWalls: 1456669, repairMinutes: 30,
 directPercent: 8, clanPercent: 4, neutralStartingTroops: 50000000
});
const STRONGHOLD_DEFINITIONS = Object.freeze({
 gold: Object.freeze({...REGIONAL_HOLD_DEFAULTS,
  id: "core-v2-aurum-keep-m1-p0_gold_stronghold", region: "core-v2-aurum-keep-m1-p0",
  name: "Aurum Keep", kind: "Gold Stronghold", subject: "Gold",
  art: "assets/worlds/core-expansion-v1/art/stronghold-gold-37d993bdce7f.webp",
  artDescription: "Aurum Keep's stone fortress with three towers and a walled courtyard",
  icon: "assets/icons/royal-shop-gold-r1.svg", label: "Base gold production", target: "Base gold production",
  help: "Boosts owned towns while held.", approved: true
 }),
 training: Object.freeze({...REGIONAL_HOLD_DEFAULTS,
  id: "core-v2-greybanner-hold-p0-m1_training_stronghold", region: "core-v2-greybanner-hold-p0-m1",
  name: "Greybanner Hold", kind: "Training Stronghold", subject: "Training",
  art: "assets/worlds/core-expansion-v1/art/stronghold-training-c4a177cc4335.webp",
  artDescription: "Greybanner Hold's walled training courtyard with barracks, practice dummies and archery targets",
  icon: "assets/icons/daily-login-troops-r1.svg", label: "Base troop production", target: "Base troop production",
  help: "Boosts owned towns while held."
 }),
 movement: Object.freeze({...REGIONAL_HOLD_DEFAULTS,
  id: "core-v2-swiftgate-p1-p0_speed_stronghold", region: "core-v2-swiftgate-p1-p0",
  name: "Swiftgate", kind: "Movement Stronghold", subject: "Movement",
  art: "assets/worlds/core-expansion-v1/art/stronghold-movement-b202e3da8557.webp",
  artDescription: "Swiftgate's stone watchtower and stable courtyard with horses and a water trough",
  icon: "assets/icons/skills/marchOrders.svg", label: "March speed", target: "March time",
  help: "Reduces travel time, not attack power."
 }),
 defense: Object.freeze({...REGIONAL_HOLD_DEFAULTS,
  id: "core-v2-ironwatch-p0-p1_defense_stronghold", region: "core-v2-ironwatch-p0-p1",
  name: "Ironwatch", kind: "Defense Stronghold", subject: "Defense",
  art: "assets/worlds/core-expansion-v1/art/stronghold-defense-bc42b1436d02.webp",
  artDescription: "Ironwatch's fortified stone gatehouse, high towers and enclosed defensive courtyard",
  icon: "assets/icons/skills/shieldwallDiscipline.svg", label: "Defending-soldier power", target: "Defending soldiers",
  help: "Adds against each soldier's 1.30 defense base. Walls and city stats are unchanged."
 })
});
function strongholdDetailFixture(sample, hold = STRONGHOLD_DEFINITIONS.gold) {
 const neutral = sample === "neutral" || sample === "legacy-empty";
 const ally = sample === "ally", scouted = sample === "scouted";
 const owned = !neutral && !ally && sample !== "enemy" && !scouted;
 const long = sample === "long", damaged = sample === "damaged";
 const troops = long ? 987654321012 : neutral ? 50000000 : 3250000;
 const fullWalls = owned || scouted ? Math.floor(hold.baseWalls * 1.16) : hold.baseWalls;
 const integrity = damaged ? 60 : 100;
 const wallPower = Math.floor(fullWalls * integrity / 100);
 // Illustrative owner-only estimate: the held Defense objective affects soldiers, never walls.
 const objectiveDefensePercent = hold === STRONGHOLD_DEFINITIONS.defense && !neutral ? hold.directPercent : 0;
 const garrisonDefense = Math.floor(troops * 1.30 * (1 + objectiveDefensePercent / 100));
 return {
  sample, owned, ally, neutral, scouted, long, damaged, cooldown: sample === "cooldown",
  owner: neutral ? "Neutral defenders" : owned ? (long ? "TheNorthernWarden" : "Alden Greywatch") : "Mira Ashford",
  clan: neutral ? "" : long ? "Wardens of the Far North" : owned || ally ? "Ironford Wardens" : "House Redwyvern",
  tag: owned || ally ? "IRON" : "RED", troops, visibleTroops: owned || ally || scouted,
  fullWalls, wallPower, integrity, objectiveDefensePercent, totalDefense: wallPower + garrisonDefense,
  baseDefense: hold.baseWalls + Math.floor(troops * 1.30),
  powerVisible: owned || scouted || neutral,
  support: owned ? [{name:"Mira Ashford",troops:225000,action:"Send Home",source:"Highwinter Vale"},{name:"Oswin Vale",troops:125000,action:"Send Home",source:"Dawncrest"}]
   : ally ? [{name:"Your troops",troops:125000,action:"Recall",source:"Highwinter Vale"}] : [],
  legacyStatus: sample === "legacy-loading" ? "loading" : sample === "legacy-error" ? "error" : sample === "legacy-empty" ? "empty" : "ready"
 };
}
function strongholdLegacyFixture(fixture) {
 const firstNames = ["Elowen Reed","Edric Stone",fixture.owner,"Oswin Vale","Mira Ashford","Rowan Hawke"];
 return Array.from({length:100},(_,i)=>({
  rank:i+1,name:firstNames[i] || `${["Cedric","Isolde","Gareth","Alys","Maeve"][i%5]} ${["Northwell","Westmere","Oakfield","Hillwatch","Reedhall"][Math.floor(i/5)%5]}`,
  seconds: Math.max(60,330240-i*2950), current: !fixture.neutral && i===2
 }));
}
