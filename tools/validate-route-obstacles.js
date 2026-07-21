const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const workerPath = path.resolve(__dirname, "..", "route-worker.js");
let workerResponse = null;
const context = {
  self: {
    postMessage(message) {
      workerResponse = message;
    },
  },
};

vm.createContext(context);
vm.runInContext(fs.readFileSync(workerPath, "utf8"), context, { filename: workerPath });

function createJob(obstacles = [], start = { id: "source", x: 120, y: 500 }, end = { id: "target", x: 880, y: 500 }) {
  return {
    defaultRegionId: "test",
    constants: {
      worldWidth: 1000,
      worldHeight: 1000,
      gridSize: 25,
      fallbackRadius: 32,
      fallbackCandidates: 24,
      fallbackPairLimit: 16,
      searchMaxVisitedCells: 50000,
    },
    regions: {
      test: {
        id: "test",
        isBitmap: false,
        region: { id: "test", x: 500, y: 500, rx: 490, ry: 490, rot: 0 },
        bounds: { left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000 },
        dimensions: { width: 1000, height: 1000 },
        landPolygon: [],
        terrainBlockers: [],
      },
    },
    obstaclesByRegion: { test: obstacles },
    legs: [{ regionId: "test", start, end }],
  };
}

function calculate(job) {
  workerResponse = null;
  context.self.onmessage({ data: { type: "route", id: "route-test", job } });
  assert.equal(workerResponse?.ok, true, workerResponse?.error || "Route worker did not respond.");
  return workerResponse.route;
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const projection = lengthSquared
    ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
    : 0;
  return Math.hypot(point.x - (start.x + projection * dx), point.y - (start.y + projection * dy));
}

const blockingStructure = { id: "camp", x: 500, y: 500, radius: 110 };
const routedAroundCamp = calculate(createJob([blockingStructure]));
assert.ok(routedAroundCamp?.points?.length > 2, "The route should bend around a camp or stronghold.");
for (let index = 1; index < routedAroundCamp.points.length; index += 1) {
  assert.ok(
    distanceToSegment(blockingStructure, routedAroundCamp.points[index - 1], routedAroundCamp.points[index]) >= blockingStructure.radius,
    "The route crossed the camp or stronghold clearance radius."
  );
}

const impossibleRoute = calculate(createJob(
  [{ id: "blocked-area", x: 500, y: 500, radius: 1000 }],
  { id: "source-impossible", x: 120, y: 500 },
  { id: "target-impossible", x: 880, y: 500 }
));
assert.equal(impossibleRoute, null, "The worker must not fall back to a route through structures.");

const endpointRoute = calculate(createJob(
  [{ id: "target-endpoint", x: 880, y: 500, radius: 120 }],
  { id: "source-endpoint", x: 120, y: 500 },
  { id: "target-endpoint", x: 880, y: 500 }
));
assert.ok(endpointRoute?.points?.length >= 2, "The selected destination must remain a valid route endpoint.");

console.log("Validated camp, stronghold, and endpoint route obstacle behavior.");
