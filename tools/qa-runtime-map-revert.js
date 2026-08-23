const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const chromePath = process.env.CROWNLANDS_CHROME_PATH
  || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const baseUrl = process.env.CROWNLANDS_QA_URL || "http://127.0.0.1:4178";
const cacheName = "crownlands-cache-20260812-pre-pass-4a-gameplay-maps-r2";
const outputDir = path.join(root, "docs", "visual-qa", "map-runtime-revert");

async function main() {
  assert.ok(fs.existsSync(chromePath), `Chrome was not found at ${chromePath}.`);
  fs.mkdirSync(outputDir, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(
    path.join(root, "assets", "worlds", "world_01", "map-manifest.json"),
    "utf8",
  ));
  assert.equal(manifest.maps?.length, 20, "Expected 20 immutable gameplay maps.");

  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      serviceWorkers: "allow",
    });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/index.html?map-cache-qa=1`, { waitUntil: "domcontentloaded" });
    await page.evaluate(async () => navigator.serviceWorker?.ready);
    await page.reload({ waitUntil: "networkidle" });

    const cacheState = await page.evaluate(async expectedCacheName => ({
      cacheKeys: await caches.keys(),
      controller: navigator.serviceWorker?.controller?.scriptURL || "",
      expectedCacheName,
    }), cacheName);
    assert.ok(cacheState.controller.endsWith("/service-worker.js"), "The clean QA page has no active service worker.");
    assert.deepEqual(
      cacheState.cacheKeys.filter(name => name.startsWith("crownlands-cache-")),
      [cacheName],
      "An obsolete Crownlands application cache survived activation.",
    );

    const responses = await page.evaluate(async urls => Promise.all(urls.map(async url => {
      const response = await fetch(new URL(url, document.baseURI));
      return { bytes: (await response.arrayBuffer()).byteLength, ok: response.ok, url };
    })), manifest.maps.map(entry => entry.output));
    for (const [index, response] of responses.entries()) {
      assert.equal(response.ok, true, `${response.url} did not load through the installed-PWA service worker.`);
      assert.equal(response.bytes, manifest.maps[index].bytes, `${response.url} returned unexpected bytes.`);
    }

    const screenshotRegions = new Set(["center", "north", "south"]);
    for (const expected of manifest.maps) {
      const regionId = expected.id;
      await page.evaluate(targetRegionId => {
        if (!state) state = createOnlineEntryState("Map QA");
        state.activeRegionId = targetRegionId;
        onlineActiveRegionId = targetRegionId;
        onlineWorldConnected = false;
        document.querySelector("#setupScreen")?.classList.remove("visible");
        renderAll();
        centerOnRegion(targetRegionId);
      }, regionId);
      await page.waitForFunction(expectedUrl => (
        [...document.images].some(image => image.getAttribute("src") === expectedUrl && image.complete)
      ), expected.output);
      const actualUrl = await page.evaluate(() => (
        [...document.images].find(image => String(image.getAttribute("src")).includes("/maps/versioned/"))
          ?.getAttribute("src") || ""
      ));
      assert.equal(actualUrl, expected.output, `${regionId} renderer selected the wrong gameplay map.`);
      if (screenshotRegions.has(regionId)) {
        await page.screenshot({
          path: path.join(outputDir, `${regionId}-gameplay-renderer-desktop.png`),
          fullPage: false,
        });
      }
    }

    await context.close();
  } finally {
    await browser.close();
  }
  console.log(`Clean installed-PWA cache and gameplay-renderer QA passed for ${manifest.maps.length} immutable maps (${cacheName}).`);
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
