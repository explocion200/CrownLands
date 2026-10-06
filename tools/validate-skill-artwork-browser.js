"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "docs/art-sources/skill-atlas-icons/manifest.json"), "utf8"));
const ids = ["swordmastery", "shieldwallDiscipline", "stoneworks", "taxStewardship", "royalGranaries", "guildCharters", "marchOrders", "fieldMedics"];
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");

function validateSources() {
  assert.deepEqual(manifest.assets.map(asset => asset.id), ids);
  for (const asset of manifest.assets) {
    assert.equal(hash(asset.source), asset.sourceSha256, `${asset.id}: approved master changed`);
    assert.equal(hash(asset.runtime), asset.runtimeSha256, `${asset.id}: delivery pixels changed`);
    assert.equal(fs.statSync(path.join(root, asset.runtime)).size, asset.runtimeBytes);
    assert.deepEqual(asset.runtimeSize, [320, 320]);
  }
  const allowed = new Set(ids);
  let consumers = 0;
  for (const name of fs.readdirSync(root)) {
    if (!/^[^.].*\.(?:js|css|html)$/.test(name)) continue;
    const source = fs.readFileSync(path.join(root, name), "utf8");
    if (!source.includes("skills/atlas-v1/")) continue;
    consumers++;
    assert.doesNotMatch(source, /assets\/icons\/skills\/(?!atlas-v1\/)/, `${name}: old skill path remains`);
    for (const id of ids) assert(!source.includes(`skills/${id}.svg`), `${name}: old nested skill path remains`);
    for (const match of source.matchAll(/skills\/atlas-v1\/([A-Za-z]+)\.webp/g)) {
      assert(allowed.has(match[1]), `${name}: unregistered emblem ${match[1]}`);
      assert(fs.existsSync(path.join(root, "assets/icons/skills/atlas-v1", `${match[1]}.webp`)));
    }
  }
  assert(consumers >= 17, "An existing skill-emblem consumer was missed.");
  const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
  assert(!worker.includes("assets/icons/skills/atlas-v1"), "Painted emblems must stay outside the installation preload.");
  console.log(`Approved sources, delivery hashes and ${consumers} active presentation consumers passed.`);
}

async function main() {
  validateSources();
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Set CHROME_PATH to Chromium.");
  const server = createMapBenchmarkServer(), address = await server.listen();
  const artifacts = path.join(root, "release-artifacts/skill-atlas-artwork");
  fs.mkdirSync(artifacts, { recursive: true });
  let session, client;
  const errors = [], results = [];
  try {
    session = await startBrowserSession(executable);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all([client.send("Page.enable"), client.send("Runtime.enable")]);
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const evaluate = async expression => {
      const response = await client.send("Runtime.evaluate", {
        expression: typeof expression === "function" ? `(${expression.toString()})()` : expression,
        awaitPromise: true, returnByValue: true,
      });
      if (response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
      return response.result.value;
    };
    const ready = async expression => {
      for (let attempt = 0; attempt < 400; attempt++) {
        if (await evaluate(expression)) return;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw Error(`Timed out: ${expression}\n${errors.join("\n")}`);
    };
    for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 568, height: 320 }]) {
      await client.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1, mobile: false });
      await client.send("Page.navigate", { url: `${address.url}/__benchmark__/?scenario=A&visualMarches=0` });
      await ready("window.__CROWNLANDS_BENCHMARK__?.getStatus().status === 'ready'");
      await evaluate(async () => {
        __CROWNLANDS_BENCHMARK__.closeModal();
        const script = document.createElement("script");
        script.src = "docs/visual-qa/skills-ledger/runtime-fixture.js";
        document.body.append(script);
      });
      await ready("document.documentElement.dataset.skillsRuntimeReady === 'true'");
      await ready("getComputedStyle(profileScreen).opacity === '1'");
      const images = await evaluate(async () => {
        const images = [...document.querySelectorAll("#profileScreen .skill-emblem")];
        await Promise.all(images.map(image => image.decode()));
        return images.map(image => {
          const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
          const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let transparent = false, opaque = false;
          for (let i = 3; i < pixels.length; i += 4) { transparent ||= pixels[i] === 0; opaque ||= pixels[i] === 255; }
          const box = image.getBoundingClientRect();
          return { id: image.closest("[data-skill-row]").dataset.skillRow, src: new URL(image.src).pathname,
            width: image.naturalWidth, height: image.naturalHeight, transparent, opaque,
            displayWidth: box.width, displayHeight: box.height, fit: getComputedStyle(image).objectFit };
        });
      });
      assert.equal(images.length, 8);
      assert.deepEqual(images.map(image => image.id).sort(), [...ids].sort());
      for (const image of images) {
        assert.equal(image.src, `/assets/icons/skills/atlas-v1/${image.id}.webp`);
        assert.equal(image.width, 320); assert.equal(image.height, 320);
        assert(image.transparent && image.opaque, `${image.id}: alpha was lost`);
        assert(image.displayWidth > 0 && image.displayWidth <= 64 && image.displayHeight > 0 && image.displayHeight <= 64);
        assert.equal(image.fit, "contain", `${image.id}: icon may be stretched or cropped`);
      }
      const header = await evaluate(() => getComputedStyle(document.querySelector("#profileScreen .profile-screen-heading"), "::before").backgroundImage);
      assert(header.includes("assets/icons/skills/atlas-v1/guildCharters.webp"), "CSS header still uses prior art.");
      const screenshot = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(artifacts, `skills-${viewport.width}.png`), Buffer.from(screenshot.data, "base64"));
      results.push({ viewport, images, header });
      console.log(`All eight painted skill cards and CSS header passed at ${viewport.width}x${viewport.height}.`);
    }
    assert.deepEqual(errors, [], "Unexpected browser errors.");
    fs.writeFileSync(path.join(artifacts, "browser-validation.json"), JSON.stringify({ results, errors }, null, 2) + "\n");
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (session) {
      if (!await waitForProcessExit(session.browserProcess)) { session.browserProcess.kill(); await waitForProcessExit(session.browserProcess); }
      await removeBrowserProfile(session.profilePath);
    }
    await server.close();
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
