"use strict";
const path = require("node:path");
const root = path.resolve(__dirname, "..");
// Netlify installs root tooling; the classified CI gate installs functions tooling.
const { minify_sync } = require(require.resolve("terser", { paths: [root, path.join(root, "functions")] }));
function minifyEstate(source) {
  // Remove whitespace/comments and shorten local names without optimizing expressions.
  return minify_sync(source.replace(/\r\n/g, "\n"), { compress: false, mangle: true, format: { comments: false } }).code + "\n";
}
module.exports = { minifyEstate };
