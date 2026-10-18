"use strict";
// Prepare a reviewed Caddy edit without changing the running server.
const marker = "\t\t# Canonical game entry; retain asset/cache requests for older installations.\n";
const paths = ["/", "/home.html", "/index.html", "/play", "/play/", "/play/index.html",
  "/Crownlands-current-build", "/Crownlands-current-build/", "/Crownlands-current-build/index.html",
  "/Crownlands-current-build/play", "/Crownlands-current-build/play/", "/Crownlands-current-build/play/index.html",
  "/firebase-hosting-redirect", "/firebase-hosting-redirect/*"];
const redirect = marker + `\t\t@canonicalGameEntry {
\t\t\tmethod GET HEAD
\t\t\tpath ${paths.join(" ")}
\t\t\tnot header Sec-Fetch-Dest empty
\t\t}
\t\troute @canonicalGameEntry {
\t\t\trewrite * /play/
\t\t\tredir https://playcrownlands.com{uri} 308
\t\t}
`;

function prepare(before) {
  const blocks = [...before.matchAll(/^game\.playcrownlands\.com \{\n[\s\S]*?^\}/gm)];
  if (blocks.length !== 1 || before.includes(marker) || before.includes("@canonicalGameEntry")) {
    throw Error("Expected one unchanged alternate-host block; inspect existing redirects");
  }
  const block = blocks[0][0], anchor = "\t\trespond @unsupported 405\n";
  if (!block.includes("\troot * /srv/crownlands/current/game\n") || block.split(anchor).length !== 2
    || !block.includes("\t\t@unsupported not method GET HEAD OPTIONS\n")) {
    throw Error("Alternate-host layout changed; review before preparing routes");
  }
  return before.slice(0, blocks[0].index) + block.replace(anchor, anchor + redirect)
    + before.slice(blocks[0].index + block.length);
}

if (require.main === module) {
  const fs = require("node:fs");
  if (process.argv.length !== 4) throw Error("Usage: node canonical_game_routes.js BEFORE CANDIDATE");
  fs.writeFileSync(process.argv[3], prepare(fs.readFileSync(process.argv[2], "utf8")), { flag: "wx", mode: 0o600 });
}
module.exports = { prepare, redirect, paths };
