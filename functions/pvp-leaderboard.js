"use strict";

// Only server-resolved casualties enter this ledger. Recovery, XP and King
// Power never enter the calculation. Events stay in their original season.
const VERSION = 1;
const integer = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const uidOf = row => typeof row?.ownerUid === "string" && /^[^/]{1,128}$/.test(row.ownerUid) ? row.ownerUid : "";

function participants(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const uid = uidOf(row);
    if (!uid) continue; // A neutral garrison has no player owner.
    const troops = integer(row.startingTroops);
    const previous = grouped.get(uid) || { uid, losses: 0, power: 0 };
    previous.losses += Math.min(troops, integer(row.losses));
    previous.power += (troops ? integer(row.effectivePower) : 0) + integer(row.wallPower);
    grouped.set(uid, previous);
  }
  return [...grouped.values()].sort((a, b) => a.uid < b.uid ? -1 : 1);
}

// Largest remainder rounding conserves every whole troop and is deterministic.
function divide(pool, rows) {
  const eligible = rows.filter(row => row.power > 0);
  const weight = eligible.reduce((total, row) => total + BigInt(row.power), 0n);
  if (!pool || !weight) return [];
  const allocations = eligible.map(row => {
    const numerator = BigInt(pool) * BigInt(row.power);
    return { uid: row.uid, kills: Number(numerator / weight), remainder: numerator % weight };
  });
  let remaining = pool - allocations.reduce((total, row) => total + row.kills, 0);
  allocations.sort((a, b) => a.remainder === b.remainder
    ? (a.uid < b.uid ? -1 : 1) : a.remainder > b.remainder ? -1 : 1);
  for (const row of allocations) if (remaining-- > 0) row.kills += 1;
  return allocations.filter(row => row.kills > 0).map(({uid, kills}) => ({uid, kills}));
}

function creditForBattle(snapshot) {
  if (!snapshot?.battleId || !["city", "camp", "tower"].includes(snapshot.target?.targetType)) return [];
  const attackerClan = snapshot.attacker?.clan?.clanId;
  const defenderClan = snapshot.defender?.clan?.clanId;
  if (attackerClan && attackerClan === defenderClan) return [];
  const attack = participants(snapshot.attackers?.length ? snapshot.attackers : [snapshot.attacker]);
  const owner = {...snapshot.defender, wallPower:snapshot.target.targetType === "city"
    ? integer(snapshot.siege?.startingWallPower) : 0};
  const defense = participants([owner, ...(snapshot.reinforcements || [])]);
  if (!attack.length || !defense.length) return [];
  // A stale/friendly order must never earn self-credit, even if its report is malformed.
  if (attack.some(row => defense.some(other => other.uid === row.uid))) return [];
  const attackLosses = attack.reduce((total, row) => total + row.losses, 0);
  const defenseLosses = defense.reduce((total, row) => total + row.losses, 0);
  if (!Number.isSafeInteger(attackLosses) || !Number.isSafeInteger(defenseLosses)) throw new Error("PvP casualty total exceeds safe integer range.");
  return [...divide(defenseLosses, attack), ...divide(attackLosses, defense)];
}

function eventForBattle(snapshot, realmShardId) {
  const credits = creditForBattle(snapshot);
  if (!credits.length) return null;
  return {
    version: VERSION, battleId: snapshot.battleId,
    worldId: snapshot.worldId, resetGeneration: snapshot.resetGeneration,
    realmShardId, occurredAtMs: integer(snapshot.occurredAtMs), credits,
  };
}

async function processEvent(db, eventRef, nowMs = Date.now()) {
  return db.runTransaction(async transaction => {
    const eventSnap = await transaction.get(eventRef);
    const event = eventSnap.data();
    if (!event || event.processedAtMs) return { replayed: true };
    const boardId = eventRef.parent.parent.id;
    const expectedId = event.realmShardId === "legacy" ? event.resetGeneration
      : event.resetGeneration + "--" + event.realmShardId;
    if (event.version !== VERSION || boardId !== expectedId || !event.worldId
      || !event.occurredAtMs || !Array.isArray(event.credits) || event.credits.length > 200) {
      throw new Error("Invalid server PvP event scope.");
    }
    const unique = new Set();
    for (const credit of event.credits) {
      if (!uidOf({ownerUid:credit.uid}) || !integer(credit.kills) || unique.has(credit.uid)) {
        throw new Error("Invalid or duplicate PvP recipient.");
      }
      unique.add(credit.uid);
    }
    const board = db.doc("pvpLeaderboards/" + boardId);
    const refs = event.credits.map(row => board.collection("entries").doc(row.uid));
    // Every read precedes every write, including concurrently processed battles.
    const snapshots = await transaction.getAll(board, ...refs);
    const identity = {worldId:event.worldId,resetGeneration:event.resetGeneration,realmShardId:event.realmShardId};
    const trackingStartedAtMs = Math.min(snapshots[0].data()?.trackingStartedAtMs || event.occurredAtMs, event.occurredAtMs);
    for (let index = 0; index < refs.length; index += 1) {
      const previous = snapshots[index+1].data() || {};
      const total = integer(previous.pvpKills) + event.credits[index].kills;
      if (!Number.isSafeInteger(total)) throw new Error("PvP total exceeds safe integer range.");
      transaction.set(refs[index], {
        ...identity, uid:event.credits[index].uid, pvpKills:total,
        reachedAtMs:Math.max(integer(previous.reachedAtMs), event.occurredAtMs),
      }, {merge:true});
    }
    // Avoid rewriting one shared document for every battle in a busy realm.
    if (!snapshots[0].exists || snapshots[0].data().trackingStartedAtMs !== trackingStartedAtMs) {
      transaction.set(board, {...identity,version:VERSION,trackingStartedAtMs}, {merge:true});
    }
    // This durable event is also the receipt; do not TTL or rewrite it.
    transaction.update(eventRef, {processedAtMs:nowMs});
    return {replayed:false, recipients:refs.length};
  });
}

module.exports = {VERSION, creditForBattle, eventForBattle, processEvent};
