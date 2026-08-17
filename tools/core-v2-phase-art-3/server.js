"use strict";

const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const b1Fixture = require("../core-v2-phase-b1/fixture.js");
const createB1Fixture = b1Fixture.createFixture;

const ART3_CANDIDATE_BY_KEY = Object.freeze({
  "northwest-warband-camp": "benchmark-results/map/core-v2-phase-art-3/candidates/northwest-warband-camp/map-final-candidate.png",
  "northwest-relic-camp": "benchmark-results/map/core-v2-phase-art-3/candidates/northwest-relic-camp/map-final-candidate.png",
  "west-north-relic-camp": "benchmark-results/map/core-v2-phase-art-3/candidates/west-north-relic-camp/map-final-candidate.png",
  "northwest-holding-tower": "benchmark-results/map/core-v2-phase-art-3/candidates/northwest-holding-tower/map-final-candidate.png",
  "aurum-keep": "benchmark-results/map/core-v2-phase-art-3/candidates/aurum-keep/map-final-candidate.png",
});

const APPROVED_ART2_V2_BY_KEY = Object.freeze({
  "crown-citadel": "benchmark-results/map/core-v2-phase-art-2-v2/candidates/crown-citadel/map-final-candidate-v2.png",
  "southwest-holding-tower": "benchmark-results/map/core-v2-phase-art-2-v2/candidates/southwest-holding-tower/map-final-candidate-v2.png",
  "west-support": "benchmark-results/map/core-v2-phase-art-2-v2/candidates/west-support/map-final-candidate-v2.png",
});

function createArt3Fixture() {
  const fixture = createB1Fixture();
  const prototypeByRegion = new Map(fixture.prototypes.map(prototype => [prototype.regionId, prototype]));
  for (const map of fixture.mapData.maps) {
    const prototype = prototypeByRegion.get(map.id);
    const imageSrc = ART3_CANDIDATE_BY_KEY[prototype?.key] || APPROVED_ART2_V2_BY_KEY[prototype?.key];
    if (!imageSrc) throw new Error(`Missing ART-3 runtime candidate mapping for ${prototype?.key || map.id}.`);
    map.imageSrc = imageSrc;
  }
  for (const region of fixture.regionCatalog.regions) {
    const map = fixture.mapData.maps.find(candidate => candidate.id === region.id);
    region.mapAsset = map.imageSrc;
  }
  fixture.scenario = {
    ...fixture.scenario,
    id: "CORE_ART3",
    slug: "b1-final-art-runtime-qa",
    label: "Core v2 Phase ART-3",
  };
  fixture.art3 = Object.freeze({
    developmentOnly: true,
    productionActivated: false,
    candidateByKey: ART3_CANDIDATE_BY_KEY,
    approvedArt2V2ByKey: APPROVED_ART2_V2_BY_KEY,
  });
  return fixture;
}

b1Fixture.createFixture = createArt3Fixture;
delete require.cache[require.resolve("../core-v2-phase-b1/server.js")];
const { createCoreB1Server } = require("../core-v2-phase-b1/server.js");

function createArt3Server() {
  return createCoreB1Server();
}

if (require.main === module) {
  const portArgument = process.argv.find(argument => argument.startsWith("--port="));
  const port = portArgument ? Number(portArgument.split("=")[1]) : 8814;
  createArt3Server().listen(port).then(address => {
    console.log(`Crownlands Core v2 Phase ART-3 runtime QA: ${address.url}/__core_b1__/`);
  });
}

module.exports = Object.freeze({
  APPROVED_ART2_V2_BY_KEY,
  ART3_CANDIDATE_BY_KEY,
  ROOT_DIR,
  createArt3Fixture,
  createArt3Server,
});
