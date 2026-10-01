"use strict";

// Keep troops reserved for their rally while exposing each ruler's full force to combat.
function groupDefenders(garrisons = [], staged = [], ownerUid = "") {
  const byOwner = new Map(garrisons.map(entry => [entry.ownerUid, {
    ...entry, garrisonTroops: entry.troops, staged: [],
  }]));
  const ownerStaged = [];
  for (const entry of staged) {
    if (entry.ownerUid === ownerUid) { ownerStaged.push(entry); continue; }
    let group = byOwner.get(entry.ownerUid);
    if (!group) {
      group = { id: `rally_staging_${entry.ownerUid}`, ownerUid: entry.ownerUid,
        ownerName: entry.ownerName, ownerFlag: entry.ownerFlag || null,
        troops: 0, garrisonTroops: 0, staged: [] };
      byOwner.set(entry.ownerUid, group);
    }
    group.troops += entry.troops;
    group.staged.push(entry);
  }
  return { contributions: [...byOwner.values()], ownerStaged,
    ownerTroops: ownerStaged.reduce((sum, entry) => sum + entry.troops, 0) };
}

// Reuse combat's integer allocation for the force reserved in each separate rally.
function splitLosses(allocation, groups, allocate) {
  const owner = allocate(allocation.ownerStart - groups.ownerTroops, groups.ownerStaged, allocation.ownerLosses);
  const staged = [...owner.contributions];
  const contributions = allocation.contributions.map(entry => {
    const split = allocate(entry.garrisonTroops ?? entry.troops, entry.staged || [], entry.losses);
    staged.push(...split.contributions);
    return { ...entry, garrisonLosses: split.ownerLosses, garrisonRemaining: split.ownerRemaining };
  });
  return { ...allocation, ownerRemaining: owner.ownerRemaining, ownerGarrisonLosses: owner.ownerLosses,
    contributions, staged,
    alliedRemaining: contributions.reduce((sum, entry) => sum + entry.garrisonRemaining, 0) };
}

module.exports = { groupDefenders, splitLosses };
