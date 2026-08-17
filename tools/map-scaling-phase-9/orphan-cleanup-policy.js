"use strict";

const RETENTION_HOURS = Object.freeze({
  GENERATING: 24,
  ABANDONED_UPLOAD: 168,
  FAILED: 720,
  ROLLED_BACK: 720,
  SUPERSEDED: 720,
});

const NEVER_DELETE = new Set(["PUBLISHING", "PUBLISHED", "ACTIVE"]);

function ageHours(timestamp, now = Date.now()) {
  const value = Date.parse(timestamp || "");
  return Number.isFinite(value) ? Math.max(0, (now - value) / 3_600_000) : 0;
}

function classifyOrphan(candidate, now = Date.now()) {
  const lifecycle = String(candidate.lifecycle || "").toUpperCase();
  const age = ageHours(candidate.updatedAt || candidate.createdAt, now);
  if (candidate.publicationMarkerExists || candidate.immutable || NEVER_DELETE.has(lifecycle)) {
    return { eligible: false, reason: "published-or-protected", lifecycle, ageHours: age };
  }
  const retentionKey = candidate.abandonedUpload ? "ABANDONED_UPLOAD" : lifecycle;
  const retentionHours = RETENTION_HOURS[retentionKey];
  if (!retentionHours) return { eligible: false, reason: "unmanaged-lifecycle", lifecycle, ageHours: age };
  return {
    eligible: age >= retentionHours,
    reason: age >= retentionHours ? "retention-expired" : "retention-active",
    lifecycle,
    retentionKey,
    retentionHours,
    ageHours: age,
  };
}

module.exports = Object.freeze({ RETENTION_HOURS, classifyOrphan });
