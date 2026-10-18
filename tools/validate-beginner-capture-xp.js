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
  for (const name of ["HERO_XP_EXPONENTIAL_START_LEVEL", "HERO_XP_EXPONENTIAL_GROWTH_RATE", "BEGINNER_CAPTURE_XP_TARGET_LEVEL", "CHARACTER_START_LEVEL", "CHARACTER_START_XP"]) {
    const declaration = source.match(new RegExp(`const ${name} = [^;]+;`)); assert(declaration); vm.runInContext(declaration[0], context);
  }
  if (source === client) vm.runInContext(extract(source, "createCharacterProgress"), context);
  else vm.runInContext(extract(source, "safeNumber"), context);
  for (const name of ["getXpRequiredForLevel", "normalizeCharacterProgress", "getBeginnerCaptureXpAward"]) vm.runInContext(extract(source, name), context);
  return context;
}
const s = load(server), c = load(client), required = s.getXpRequiredForLevel;
assert.equal(extract(server, "getBeginnerCaptureXpAward"), extract(client, "getBeginnerCaptureXpAward"));
for (let level = 1; level <= 200; level++) {
  assert.equal(required(level), c.getXpRequiredForLevel(level));
  for (const xp of [0, 1, Math.floor(required(level) / 2), required(level) - 1]) {
    for (const ordinary of [0, 66, 108, 500, 10000]) for (const eligible of [false, true]) {
      const character = { level, xp, skillPoints: level - 1 }, snapshot = structuredClone(character);
      const award = s.getBeginnerCaptureXpAward(ordinary, character, eligible);
      assert.equal(award, c.getBeginnerCaptureXpAward(ordinary, character, eligible));
      assert(Number.isSafeInteger(award) && award >= ordinary);
      if (!eligible || level >= 15) assert.equal(award, ordinary);
      else assert(award <= Math.max(ordinary, Math.ceil(required(level) / 2)));
      assert.deepEqual(character, snapshot, "Quotes must not change saved progress");
    }
  }
}
assert.equal(s.getBeginnerCaptureXpAward(66, { level: 14, xp: required(14) - 100 }, true), 100);
assert.equal(s.getBeginnerCaptureXpAward(66, { level: 14, xp: required(14) - 10 }, true), 66, "Keep larger ordinary awards at the boundary");
assert.equal(s.getBeginnerCaptureXpAward(66, { level: 14, xp: required(14) }, true), 66, "Normalize already-earned levels before eligibility");
function simulate(extraXp = 0) {
  const character = { level: 1, xp: extraXp }, rows = []; let total = extraXp;
  for (let captures = 1; captures <= 29; captures++) {
    Object.assign(character, s.normalizeCharacterProgress(character));
    const efficiency = Number(Math.min(2, Math.max(.25, .35 + 22 / (48 + character.level * 20 + captures * 2))).toFixed(2));
    const ordinary = Math.floor(165 * efficiency);
    const award = s.getBeginnerCaptureXpAward(ordinary, character, true);
    character.xp += award; total += award; Object.assign(character, s.normalizeCharacterProgress(character));
    rows.push({ captures, cities: captures + 1, level: character.level, xp: character.xp, total });
  }
  assert(character.level >= 15); return rows;
}
const rows = simulate();
assert.equal(rows[27].level, 15); assert.equal(rows[27].xp, 0); assert.equal(rows[27].total, 48859);
assert.deepEqual(rows[28], { captures: 29, cities: 30, level: 15, xp: 66, total: 48925 });
for (const extra of [1, 200, 1000, 10000]) simulate(extra);
// The client preview's actual win/defeat entry points must agree on eligibility.
Object.assign(c, { state: { character: { level: 10, xp: 0 } }, isGivenUpNeutralCity: t => !!t.givenUp,
  clampCityLevel: t => t, getBattleXpTroopCredit: (_t, losses) => losses, getCaptureXpEfficiency: () => .4,
  capBattleXpForCurrentLevel: xp => xp, isStronghold: t => t.kind === "stronghold", isRewardCampTarget: t => t.kind === "camp" });
vm.runInContext("const CAPTURE_XP_BASE=120,CAPTURE_XP_PER_CITY_LEVEL=45,CAPTURE_XP_PER_DEFENDER=1.5,ENEMY_CAPTURE_XP_BONUS=300,FAILED_BATTLE_XP_RATE=1/3;", c);
for (const name of ["getCaptureXpAward", "getPartialBattleXpAward", "getFailedAttackXpAward"]) vm.runInContext(extract(client, name), c);
assert.equal(c.getCaptureXpAward({ level: 1 }, "neutral", 0), 2364);
assert.equal(c.getFailedAttackXpAward({ level: 1 }, "neutral", 0), 22);
assert.equal(c.getCaptureXpAward({ level: 1, givenUp: true }, "neutral", 0), 0);
for (const kind of ["stronghold", "camp"]) assert.equal(c.getCaptureXpAward({ level: 1, kind }, "neutral", 0), 66);
assert.equal(c.getCaptureXpAward({ level: 1 }, "enemy", 0), 186);
assert.equal(c.getCaptureXpAward({ level: 1 }, "neutral", 0, "enemy"), 165);
assert.match(server, /getBeginnerCaptureXpAward\(\s*attackWinXp,\s*attackerProfile.character,\s*cityCaptured && !oldOwnerUid && !attackProtection && !givenUpNeutralTarget\s*&& !isStronghold\(target\) && !isRewardCamp\(target\)/);
for (const [level, xp] of [[25,27469],[50,297618],[75,3224609],[100,34937693],[150,4101365691]]) assert.equal(required(level), xp);
console.log("Beginner XP passed: server/client parity, 29-capture journey, extra XP, level-15 boundary, failed/PvP/objective/abandoned exclusions and unchanged later curve.");
module.exports = { extract, rows };
