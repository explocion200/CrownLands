"use strict";

function assertLocalEmulator(host) {
  const url = new URL(`http://${host || ""}`);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      || !url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Season fixtures require the local Firestore emulator.");
  }
}

function previousSeasonFixture(nowMs = Date.now()) {
  const current = new Date(nowMs);
  const prior = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1) - 1);
  return {
    seasonId: `realm-${prior.toISOString().slice(0, 7)}`,
    armedAtMs: Date.UTC(prior.getUTCFullYear(), prior.getUTCMonth(), 1) + 1,
  };
}

async function main() {
  assertLocalEmulator(process.env.FIRESTORE_EMULATOR_HOST);
  if (process.env.CROWNLANDS_FORCE_CORE_EXPANSION_EMULATOR !== "1") {
    throw new Error("This fixture is only for current Core-realm emulator suites.");
  }
  const { initializeApp, deleteApp } = require("firebase-admin/app");
  const { getFirestore } = require("firebase-admin/firestore");
  const seasons = require("../season-rewards");
  const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT || "crown-land-b15e0" });
  try {
    // Each suite starts with an empty database. Model the prior season being
    // armed on time; the real realm entry still captures it and checks its fence.
    // Season-specific suites retain their own fixtures and do not use this step.
    const prior = previousSeasonFixture();
    await seasons.arm(getFirestore(app), prior.seasonId, prior.armedAtMs);
  } finally {
    await deleteApp(app);
  }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { assertLocalEmulator, previousSeasonFixture };
