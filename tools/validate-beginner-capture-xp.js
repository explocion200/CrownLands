"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const server = fs.readFileSync("functions/index.js", "utf8"), client = fs.readFileSync("game.js", "utf8");
function extract(source, name) {
  const start = source.indexOf(`function ${name}(`); assert(start >= 0, name);
  let i = source.indexOf("(", start), depth = 0;
  for (; i < source.length; i++) { if (source[i] === "(") depth++; if (source[i] === ")" && !--depth) break; }
  const body = source.indexOf("{", i); depth = 0;
  for (i = body; i < source.length; i++) { if (source[i] === "{") depth++; if (source[i] === "}" && !--depth) return source.slice(start, i + 1); }
  throw Error(name);
}
function load(source) {
  const context = { Math, Number }; vm.createContext(context);
  for (const name of ["HERO_XP_EXPONENTIAL_START_LEVEL", "HERO_XP_EXPONENTIAL_GROWTH_RATE", "BEGINNER_CAPTURE_XP_TARGET_LEVEL", "BEGINNER_CAPTURE_XP_COUNT", "CHARACTER_START_LEVEL", "CHARACTER_START_XP"]) {
    const declaration = source.match(new RegExp(`const ${name} = [^;]+;`)); assert(declaration); vm.runInContext(declaration[0], context);
  }
  if (source === client) vm.runInContext(extract(source, "createCharacterProgress"), context);
  else vm.runInContext(extract(source, "safeNumber"), context);
  for (const name of ["getXpRequiredForLevel", "normalizeCharacterProgress", "getBeginnerCaptureXpBonus"]) vm.runInContext(extract(source, name), context);
  return context;
}
const s = load(server), c = load(client), required = s.getXpRequiredForLevel;
assert.equal(extract(server, "getBeginnerCaptureXpBonus"), extract(client, "getBeginnerCaptureXpBonus"));
for (let level = 1; level <= 200; level++) {
  assert.equal(required(level), c.getXpRequiredForLevel(level));
  for (const captures of [0, 1, 14, 28, 29, 100]) {
    const character = { level, xp: 1, skillPoints: level - 1, beginnerNpcCaptures: captures };
    for (const context of [s, c]) {
      assert.equal(context.normalizeCharacterProgress(character).beginnerNpcCaptures, Math.min(29, captures));
      assert.equal(character.beginnerNpcCaptures, captures, "Normalization must not mutate saved state");
    }
  }
}
let bonuses = 0;
for (let captures = 0; captures < 29; captures++) {
  const bonus = s.getBeginnerCaptureXpBonus(captures);
  assert.equal(bonus, c.getBeginnerCaptureXpBonus(captures));
  assert(Number.isSafeInteger(bonus) && bonus > 0); bonuses += bonus;
}
assert.equal(bonuses, 48859, "29 bonuses alone must cover Level 1 through Level 15");
for (const captures of [undefined, null, -1, 1.5, 29, 30, "0", NaN, Infinity]) {
  assert.equal(s.getBeginnerCaptureXpBonus(captures), 0);
  assert.equal(c.getBeginnerCaptureXpBonus(captures), 0);
}
for (const context of [s,c]) assert(!Object.hasOwn(context.normalizeCharacterProgress({level:10,xp:0}), "beginnerNpcCaptures"), "Old saves must not silently gain a fresh set of bonuses");
function simulate(extraXp = 0, normalXp = true) {
  const character = { level: 1, xp: extraXp, beginnerNpcCaptures: 0 }, rows = []; let total = extraXp;
  for (let captures = 1; captures <= 29; captures++) {
    Object.assign(character, s.normalizeCharacterProgress(character));
    const efficiency = Number(Math.min(2, Math.max(.25, .35 + 22 / (48 + character.level * 20 + captures * 2))).toFixed(2));
    const ordinary = normalXp ? Math.floor(165 * efficiency) : 0;
    const bonus = s.getBeginnerCaptureXpBonus(character.beginnerNpcCaptures);
    character.xp += ordinary + bonus; total += ordinary + bonus; character.beginnerNpcCaptures++;
    Object.assign(character, s.normalizeCharacterProgress(character));
    rows.push({ captures, cities: captures + 1, level: character.level, xp: character.xp, bonus, total });
  }
  assert(character.level >= 15); assert.equal(character.beginnerNpcCaptures,29); return rows;
}
const rows = simulate();
assert.equal(simulate(0,false)[28].level,15);assert.equal(simulate(0,false)[28].xp,0);
for (const extra of [1, 200, 1000, 10000, 100000]) assert.equal(simulate(extra).reduce((sum,row)=>sum+row.bonus,0),48859);
// The client preview's actual win/defeat entry points must agree on eligibility.
Object.assign(c, { state: { character: { level: 10, xp: 0, beginnerNpcCaptures: 0 } }, isGivenUpNeutralCity: t => !!t.givenUp,
  clampCityLevel: t => t, getBattleXpTroopCredit: (_t, losses) => losses, getCaptureXpEfficiency: () => .4,
  capBattleXpForCurrentLevel: xp => xp, isStronghold: t => t.kind === "stronghold", isRewardCampTarget: t => t.kind === "camp" });
vm.runInContext("const CAPTURE_XP_BASE=120,CAPTURE_XP_PER_CITY_LEVEL=45,CAPTURE_XP_PER_DEFENDER=1.5,ENEMY_CAPTURE_XP_BONUS=300,FAILED_BATTLE_XP_RATE=1/3;", c);
for (const name of ["getCaptureXpAward", "getPartialBattleXpAward", "getFailedAttackXpAward"]) vm.runInContext(extract(client, name), c);
assert.equal(c.getCaptureXpAward({ level: 1 }, "neutral", 0), 186);
assert.equal(c.getFailedAttackXpAward({ level: 1 }, "neutral", 0), 22);
assert.equal(c.getCaptureXpAward({ level: 1, givenUp: true }, "neutral", 0), 0);
for (const kind of ["stronghold", "camp"]) assert.equal(c.getCaptureXpAward({ level: 1, kind }, "neutral", 0), 66);
assert.equal(c.getCaptureXpAward({ level: 1 }, "enemy", 0), 186);
assert.equal(c.getCaptureXpAward({ level: 1 }, "neutral", 0, "enemy"), 165);
c.state.character.level=20;
assert.equal(c.getCaptureXpAward({level:1}, "neutral", 0),186,"Other XP must not end the first-29 bonus early");
c.state.character.beginnerNpcCaptures=29;
assert.equal(c.getCaptureXpAward({level:1}, "neutral", 0),66,"Capture 30 must receive ordinary XP only");
assert.match(server,/const beginnerCaptureBonus = cityCaptured && !oldOwnerUid && !attackProtection && !givenUpNeutralTarget[\s\S]*?getBeginnerCaptureXpBonus\(attackerProfile.character\?\.beginnerNpcCaptures\)/);
assert.match(server,/if \(beginnerCaptureBonus > 0\) attackerProgress.character.beginnerNpcCaptures \+= 1/);
for (const [level, xp] of [[25,27469],[50,297618],[75,3224609],[100,34937693],[150,4101365691]]) assert.equal(required(level), xp);
console.log("Beginner XP passed: server/client parity, first 29 bonuses, independent extra XP, persistent counter, failed/PvP/objective/abandoned exclusions and unchanged later curve.");
module.exports = { extract, rows };
