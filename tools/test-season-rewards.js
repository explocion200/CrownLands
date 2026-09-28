"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const R = require("../functions/season-rewards");
const info = R.seasonInfo("realm-2026-09");
assert.equal(new Date(info.endsAtMs).toISOString(), "2026-10-01T00:00:00.000Z");
assert.equal(new Date(info.honorsExpireAtMs).toISOString(), "2026-11-01T00:00:00.000Z");
assert.equal(R.previousSeason("realm-2027-01"), "realm-2026-12");
assert.throws(() => R.seasonInfo("realm-2026-13"), /Invalid/);
assert.equal(R.supported("realm-2026-08"), false);
for (const [rank, personal, clan] of [
  [1,[8,2],[3,1]],[2,[6,1],[2,1]],[3,[5,1],[2,1]],[4,[4,0],[1,0]],[10,[4,0],[1,0]],
  [11,[3,0],[1,0]],[25,[3,0],[1,0]],[26,[2,0],[0,0]],[50,[2,0],[0,0]],
  [51,[1,0],[0,0]],[100,[1,0],[0,0]],[101,[0,0],[0,0]],[0,[0,0],[0,0]],
]) for (const board of R.BOARDS) assert.deepEqual(Object.values(R.rewardFor(board, rank)), board === "clans" ? clan : personal);
const boards = { players:[{uid:"winner",rank:1,kingPower:100},{uid:"zero",rank:2,kingPower:0}],
  glory:[{uid:"winner",rank:1,pvpKills:20}], clans:[{id:"clan",rank:1,name:"House",memberCount:2}] };
const awards = R.buildAwards(info, boards, new Map([["clan",["winner","inactive-member"]]]));
assert.equal(awards.length, 2);
const winner = awards.find(row => row.uid === "winner");
assert.equal(winner.commonGearBoxes,19); assert.equal(winner.uncommonGearBoxes,5);
assert.equal(winner.placements.length,3); assert.equal(winner.honors.length,3);
assert.deepEqual(awards.find(row=>row.uid==="inactive-member").placements.map(row=>row.board),["clans"]);
assert.equal(winner.honors[0].title,"Sovereign of the Realm");
assert.equal(R.honorFor(info,"glory",2).medal,"silver");
assert.equal(R.honorFor(info,"players",4).decoration,"");
assert.equal(R.honorFor(info,"clans",25).medal,"top25");
assert.throws(()=>R.buildAwards(info,{...boards,clans:[...boards.clans,{id:"other",rank:2}]},new Map([["clan",["winner"]],["other",["winner"]]])),/Duplicate/);
assert.deepEqual(R.publicEntry({email:"private",gold:99,name:"House",memberCount:2,totalKingPower:100},"c","clans",1),{id:"c",rank:1,name:"House",memberCount:2,totalKingPower:100});
const root = path.resolve(__dirname,"..");
const server = fs.readFileSync(path.join(root,"functions/index.js"),"utf8");
assert.match(server,/SEASON_REWARDS\.guardTransaction\(db, transaction, operation, scope\)/);
assert.match(server,/await measuredTransaction\(\s*transaction => runClaimTransaction/);
assert.match(server,/SEASON_REWARDS\.prepareTransition\(db, identity.resetGeneration, nowMs\)/);
assert.match(server,/\["serverMembership", "seasonRewards"\]\.includes/);
for(const name of ["getSeasonRewardStatus","getSeasonLeaderboard","getSeasonHonors","claimSeasonRewards"]) assert(server.includes("exports."+name+" = timedCallable"));
const game = fs.readFileSync(path.join(root,"game.js"),"utf8");
assert.match(game,/seasonResolved: false/);assert.match(game,/season-login-rewards/);
assert.match(game,/a\.uid < b\.uid/);
console.log("Season rewards: rank boundaries, mixed boxes, stacking, roster eligibility, zero scores, honors, privacy and authority integration passed.");
