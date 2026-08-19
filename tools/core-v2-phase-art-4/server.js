"use strict";

const b1Fixture = require("../core-v2-phase-b1/fixture.js");
const { createFixture } = require("./fixture.js");

b1Fixture.createFixture = createFixture;
delete require.cache[require.resolve("../core-v2-phase-b1/server.js")];
const { createCoreB1Server } = require("../core-v2-phase-b1/server.js");

function createArt4Server() {
  return createCoreB1Server();
}

if (require.main === module) {
  const portArgument = process.argv.find(argument => argument.startsWith("--port="));
  const port = portArgument ? Number(portArgument.split("=")[1]) : 8816;
  createArt4Server().listen(port).then(address => {
    console.log(`Crownlands Core v2 Phase ART-4 runtime QA: ${address.url}/__core_b1__/`);
  });
}

module.exports = Object.freeze({ createArt4Server });
