"use strict";

const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const phaseA1Fixture = require("../core-v2-phase-a1/fixture.js");
const createPhaseA1Fixture = phaseA1Fixture.createFixture;

const ART2_V2_CANDIDATE_BY_KEY = Object.freeze({
  "crown-citadel": "benchmark-results/map/core-v2-phase-art-2-v2/candidates/crown-citadel/map-final-candidate-v2.png",
  ironwatch: "benchmark-results/map/core-v2-phase-art-2-v2/candidates/ironwatch/map-final-candidate-v2.png",
  "southwest-holding-tower": "benchmark-results/map/core-v2-phase-art-2-v2/candidates/southwest-holding-tower/map-final-candidate-v2.png",
  "west-south-deed-camp": "benchmark-results/map/core-v2-phase-art-2-v2/candidates/west-south-deed-camp/map-final-candidate-v2.png",
  "west-support": "benchmark-results/map/core-v2-phase-art-2-v2/candidates/west-support/map-final-candidate-v2.png",
});

function createArt2V2Fixture() {
  const fixture = createPhaseA1Fixture();
  const prototypeByRegion = new Map(fixture.prototypes.map(prototype => [prototype.regionId, prototype]));
  for (const map of fixture.mapData.maps) {
    const prototype = prototypeByRegion.get(map.id);
    const imageSrc = ART2_V2_CANDIDATE_BY_KEY[prototype?.key];
    if (!imageSrc) throw new Error(`Missing ART-2 v2 candidate mapping for ${prototype?.key || map.id}.`);
    map.imageSrc = imageSrc;
  }
  for (const region of fixture.regionCatalog.regions) {
    const map = fixture.mapData.maps.find(candidate => candidate.id === region.id);
    region.mapAsset = map.imageSrc;
  }
  fixture.scenario = {
    ...fixture.scenario,
    id: "CORE_ART2_V2",
    slug: "core-prestige-final-art-runtime-qa",
    label: "Core v2 Phase ART-2 v2",
  };
  fixture.art2V2 = Object.freeze({
    developmentOnly: true,
    productionActivated: false,
    candidateByKey: ART2_V2_CANDIDATE_BY_KEY,
  });
  return fixture;
}

phaseA1Fixture.createFixture = createArt2V2Fixture;
delete require.cache[require.resolve("../core-v2-phase-a1/server.js")];
const { createCoreA1Server } = require("../core-v2-phase-a1/server.js");

function createArt2V2Server() {
  return createCoreA1Server();
}

if (require.main === module) {
  const portArgument = process.argv.find(argument => argument.startsWith("--port="));
  const port = portArgument ? Number(portArgument.split("=")[1]) : 8813;
  createArt2V2Server().listen(port).then(address => {
    console.log(`Crownlands Core v2 Phase ART-2 v2 runtime QA: ${address.url}/__core_a1__/`);
  });
}

module.exports = Object.freeze({ ART2_V2_CANDIDATE_BY_KEY, createArt2V2Fixture, createArt2V2Server, ROOT_DIR });
