"use strict";
const assert = require("node:assert/strict");

// Source tokens may advance independently of historical feature dates. The
// production-artifact validator separately checks generated content hashes.
function assertShellAssetVersions(index, worker, assets) {
  assert.match(worker, /const CACHE_VERSION = "[^"\s]+";/, "The service worker needs a nonempty cache namespace.");
  for (const asset of assets) {
    const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const page = index.match(new RegExp(`["']/?${escaped}\\?v=([^"'\\s]+)["']`));
    const cached = worker.match(new RegExp(`["']/${escaped}\\?v=([^"'\\s]+)["']`));
    assert.ok(page, `The page must load versioned ${asset}.`);
    assert.ok(cached, `The offline shell must cache versioned ${asset}.`);
    assert.equal(cached[1], page[1], `The page and offline shell disagree on ${asset}.`);
  }
}

module.exports = { assertShellAssetVersions };
