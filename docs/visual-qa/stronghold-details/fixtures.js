"use strict";
// Current Core objective identity/art; all personal data is fictional.
const GOLD_HOLD = Object.freeze({
 id: "core-v2-aurum-keep-m1-p0_gold_stronghold", region: "core-v2-aurum-keep-m1-p0",
 name: "Aurum Keep", level: 50, art: "assets/worlds/core-expansion-v1/art/stronghold-gold-37d993bdce7f.webp",
 icon: "assets/icons/royal-shop-gold-r1.svg", baseWalls: 1456669, repairMinutes: 30,
 directPercent: 8, clanPercent: 4, neutralStartingTroops: 50000000
});
function goldDetailFixture(sample) {
 const neutral = sample === "neutral" || sample === "legacy-empty";
 const ally = sample === "ally", scouted = sample === "scouted";
 const owned = !neutral && !ally && sample !== "enemy" && !scouted;
 const long = sample === "long", damaged = sample === "damaged";
 const troops = long ? 987654321012 : neutral ? 50000000 : 3250000;
 const fullWalls = owned || scouted ? Math.floor(GOLD_HOLD.baseWalls * 1.16) : GOLD_HOLD.baseWalls;
 const integrity = damaged ? 60 : 100;
 const wallPower = Math.floor(fullWalls * integrity / 100);
 return {
  sample, owned, ally, neutral, scouted, long, damaged, cooldown: sample === "cooldown",
  owner: neutral ? "Neutral defenders" : owned ? (long ? "TheNorthernWarden" : "Alden Greywatch") : "Mira Ashford",
  clan: neutral ? "" : long ? "Wardens of the Far North" : owned || ally ? "Ironford Wardens" : "House Redwyvern",
  tag: owned || ally ? "IRON" : "RED", troops, visibleTroops: owned || ally || scouted,
  fullWalls, wallPower, integrity, totalDefense: wallPower + Math.floor(troops * 1.30),
  baseDefense: GOLD_HOLD.baseWalls + Math.floor(troops * 1.30),
  powerVisible: owned || scouted || neutral,
  support: owned ? [{name:"Mira Ashford",troops:225000,action:"Send Home",source:"Highwinter Vale"},{name:"Oswin Vale",troops:125000,action:"Send Home",source:"Dawncrest"}]
   : ally ? [{name:"Your troops",troops:125000,action:"Recall",source:"Highwinter Vale"}] : [],
  legacyStatus: sample === "legacy-loading" ? "loading" : sample === "legacy-error" ? "error" : sample === "legacy-empty" ? "empty" : "ready"
 };
}
function goldLegacyFixture(fixture) {
 const firstNames = ["Elowen Reed","Edric Stone",fixture.owner,"Oswin Vale","Mira Ashford","Rowan Hawke"];
 return Array.from({length:100},(_,i)=>({
  rank:i+1,name:firstNames[i] || `${["Cedric","Isolde","Gareth","Alys","Maeve"][i%5]} ${["Northwell","Westmere","Oakfield","Hillwatch","Reedhall"][Math.floor(i/5)%5]}`,
  seconds: Math.max(60,330240-i*2950), current: !fixture.neutral && i===2
 }));
}
