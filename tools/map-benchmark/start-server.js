"use strict";

const { createMapBenchmarkServer } = require("./server.js");

async function main() {
  const port = Math.max(1, Math.floor(Number(process.argv[2]) || 4173));
  const server = createMapBenchmarkServer();
  const address = await server.listen(port);
  console.log(`Crownlands map benchmark server listening at ${address.url}`);

  const close = async () => {
    await server.close();
    process.exit(0);
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
