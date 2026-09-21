"use strict";
const BUILDINGS = require("./clan-tower-buildings");
const FULL = 10000, LEGACY_WALL_MS = 600000;
const integer = value => Math.max(0, Math.floor(Number(value) || 0));
function normalizeProject(raw, tower) {
  if (!raw || !BUILDINGS.definition(raw.buildingId) || raw.clanId !== tower.clanId
      || integer(raw.ownershipRevision) !== integer(tower.ownershipRevision)) return null;
  const fromLevel = BUILDINGS.level(tower.buildings?.[raw.buildingId]);
  if (fromLevel >= 10 || raw.targetLevel !== fromLevel + 1) return null;
  const durationMs = BUILDINGS.duration(raw.targetLevel);
  return { id: String(raw.id || ""), buildingId: raw.buildingId, fromLevel, targetLevel: raw.targetLevel,
    paidCost: integer(raw.paidCost), durationMs, remainingMs: Math.min(durationMs, Math.max(1, integer(raw.remainingMs))),
    progressStartedAtMs: integer(raw.progressStartedAtMs), orderedAtMs: integer(raw.orderedAtMs),
    startedByUid: String(raw.startedByUid || ""), clanId: String(raw.clanId), ownershipRevision: integer(raw.ownershipRevision) };
}
function canBuild(state) { return !state.attackBlocked && state.wallIntegrityBps === FULL && !state.repair; }
function pause(job, nowMs) {
  if (!job?.progressStartedAtMs) return job;
  return { ...job, remainingMs: Math.max(1, job.remainingMs - Math.max(0, nowMs - job.progressStartedAtMs)), progressStartedAtMs: 0 };
}
function advance(state, nowMs, resumeAtMs = nowMs) {
  const buildingsBefore = state.buildings;
  let completedAtMs = 0, project = state.buildingProject && { ...state.buildingProject };
  if (project) {
    if (!canBuild(state)) project = pause(project, nowMs);
    else {
      project.progressStartedAtMs ||= resumeAtMs;
      if (project.progressStartedAtMs + project.remainingMs <= nowMs) {
        completedAtMs = project.progressStartedAtMs + project.remainingMs;
        state = { ...state, buildings: { ...state.buildings, [project.buildingId]: project.targetLevel } };
        project = null;
      }
    }
  }
  const queue = state.upgradeQueue.map(entry => ({ ...entry }));
  let wallLevel = state.wallLevel;
  if (!canBuild(state)) {
    if (queue.length) queue[0] = pause(queue[0], nowMs);
  } else {
    let cursorMs = resumeAtMs;
    while (queue.length) {
      const active = queue[0], start = active.progressStartedAtMs || cursorMs;
      if (!active.durationMs) {
        const workshop = completedAtMs && start < completedAtMs ? buildingsBefore.workshop : state.buildings.workshop;
        active.durationMs = active.timingVersion === 2 ? BUILDINGS.wallDuration(active.targetLevel, workshop) : LEGACY_WALL_MS;
        active.remainingMs = active.durationMs;
      }
      const remainingMs = active.remainingMs || active.durationMs;
      const end = start + remainingMs;
      if (end > nowMs) { active.remainingMs = remainingMs; active.progressStartedAtMs = start; break; }
      wallLevel = active.targetLevel;
      queue.shift();
      cursorMs = end;
    }
  }
  return { ...state, buildingProject: project, upgradeQueue: queue, wallLevel };
}
function start(state, buildingId, balance, actor, nowMs, operationId) {
  if (state.ownerKind !== "clan") throw new Error("tower-not-owned");
  if (!BUILDINGS.definition(buildingId)) throw new Error("unknown-building");
  if (state.buildingProject) throw new Error("building-project-active");
  if (state.attackBlocked) throw new Error("tower-under-rally-attack");
  if (state.wallIntegrityBps !== FULL || state.repair) throw new Error("tower-wall-damaged");
  const fromLevel = state.buildings[buildingId];
  if (fromLevel >= 10) throw new Error("building-level-limit");
  const targetLevel = fromLevel + 1, cost = BUILDINGS.cost(targetLevel), durationMs = BUILDINGS.duration(targetLevel);
  if (!Number.isSafeInteger(balance) || balance < cost) throw new Error("insufficient-clan-treasury");
  return { cost, treasuryBalance: balance - cost, state: { ...state, buildingProject: {
    id: String(operationId), buildingId, fromLevel, targetLevel, paidCost: cost, durationMs, remainingMs: durationMs,
    progressStartedAtMs: nowMs, orderedAtMs: nowMs, startedByUid: String(actor?.uid || ""),
    clanId: state.clanId, ownershipRevision: state.ownershipRevision,
  } } };
}
module.exports = Object.freeze({ normalizeProject, advance, start });
