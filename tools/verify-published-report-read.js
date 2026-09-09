"use strict";

// Run in an already signed-in, published game page. No credential extraction,
// sign-in, claims, profile writes, or battle actions are performed by this probe.
async function verifyPublishedReportRead(expectedBuildId) {
  const api = window.CrownlandsOnline;
  const buildId = window.CROWNLANDS_RELEASE_MANIFEST?.buildId;
  if (!expectedBuildId || buildId !== expectedBuildId) throw new Error("Published build does not match the release being verified.");
  if (!api?.isSignedIn?.()) throw new Error("Sign in to the existing game account before verifying report reads.");
  const identity = api.getRealmIdentity();
  const valid = reports => Array.isArray(reports) && reports.every(report =>
    report.resetGeneration === identity.resetGeneration && report.worldId === identity.worldId
    && String(report.realmShardId || "legacy") === identity.realmShardId);
  const reports = await api.loadServerReports(120);
  if (!valid(reports)) throw new Error("The published report query returned another realm's data.");
  const liveCount = await new Promise((resolve, reject) => {
    let stop;
    let settled = false;
    const finish = (error, count) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (stop) stop();
      if (error) reject(error); else resolve(count);
    };
    const timer = setTimeout(() => finish(new Error("The published live report read did not reach the server.")), 15000);
    stop = api.subscribeServerReports({
      onReports: (rows, metadata) => {
        if (metadata?.fromCache) return;
        finish(valid(rows) ? null : new Error("The live report query returned another realm's data."), rows.length);
      },
      onError: () => finish(new Error("The published live report query failed.")),
    });
    if (settled && stop) stop();
  });
  return { buildId, ...identity, authenticated: true, serverRead: true, liveServerRead: true,
    reportCount: reports.length, liveReportCount: liveCount, checkedAt: new Date().toISOString() };
}

if (typeof module !== "undefined") {
  module.exports = verifyPublishedReportRead;
  if (require.main === module) {
    const buildId = process.argv[2];
    if (!/^[a-f0-9]{40}$/.test(buildId || "")) throw new Error("Usage: node tools/verify-published-report-read.js <full merged commit>");
    // Feed the expression to the supported browser developer tool with
    // awaitPromise and returnByValue. Output contains no user data or secrets.
    process.stdout.write(`(${verifyPublishedReportRead.toString()})(${JSON.stringify(buildId)})`);
  }
}
