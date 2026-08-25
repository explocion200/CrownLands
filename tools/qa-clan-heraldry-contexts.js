const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const fixturePath = "/docs/visual-qa/clan-heraldry-contexts/";
const chromePath = process.env.CROWNLANDS_CHROME_PATH
  || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const expectedContexts = [
  "editor-full", "editor-micro", "editor-option", "public-player", "public-clan", "objective",
  "hud", "own-profile", "overview", "discovery", "leaderboard-current", "objective-citadel",
];
const expectedColors = Object.freeze({
  primary: "rgb(122, 38, 56)",
  secondary: "rgb(36, 68, 95)",
  charge: "rgb(216, 189, 120)",
  secondaryCharge: "rgb(183, 195, 191)",
  border: "rgb(37, 63, 58)",
});
const expectedVariables = Object.freeze({
  "--clan-heraldry-primary": "#7a2638",
  "--clan-heraldry-secondary": "#24445f",
  "--clan-heraldry-charge": "#d8bd78",
  "--clan-heraldry-secondary-charge": "#b7c3bf",
  "--clan-heraldry-border": "#253f3a",
});

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function startServer() {
  const server = http.createServer((request, response) => {
    const requestedPath = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const relativePath = requestedPath.endsWith("/") ? `${requestedPath}index.html` : requestedPath;
    const filePath = path.resolve(root, `.${relativePath}`);
    if (!filePath.startsWith(root) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(response);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

async function readContextEvidence(page) {
  return page.evaluate(({ variableNames }) => [...document.querySelectorAll("[data-shield-context]")].map(slot => {
    const root = slot.matches(".clan-heraldry-v2") ? slot : slot.querySelector(".clan-heraldry-v2");
    const rootStyle = getComputedStyle(root);
    const field = root.querySelector(".clan-heraldry-field");
    const division = root.querySelector(".clan-heraldry-division");
    const charges = [...root.querySelectorAll(".clan-heraldry-charge")];
    const border = root.querySelector(".clan-heraldry-border");
    const innerTrim = root.querySelector(".clan-heraldry-inner-trim");
    const rivets = root.querySelector(".clan-heraldry-rivets");
    const boundary = root.querySelector(".clan-heraldry-boundary");
    const box = root.getBoundingClientRect();
    const lineage = [];
    let ancestor = root;
    while (ancestor && ancestor !== document.body) {
      const style = getComputedStyle(ancestor);
      if (style.filter !== "none") lineage.push({ tag: ancestor.tagName, className: ancestor.className, filter: style.filter });
      ancestor = ancestor.parentElement;
    }
    return {
      context: slot.dataset.shieldContext,
      requestedVariant: slot.dataset.variant,
      renderedVariant: root.dataset.heraldryVariant,
      trim: slot.dataset.trim,
      variables: Object.fromEntries(variableNames.map(name => [name, rootStyle.getPropertyValue(name).trim()])),
      field: getComputedStyle(field).fill,
      division: getComputedStyle(division).fill,
      charges: charges.map(charge => ({ color: getComputedStyle(charge).color, fill: getComputedStyle(charge).fill })),
      border: getComputedStyle(border).stroke,
      innerTrim: innerTrim ? getComputedStyle(innerTrim).stroke : null,
      rivets: rivets ? getComputedStyle(rivets).fill : null,
      clipPath: getComputedStyle(boundary).clipPath,
      visible: box.width > 0 && box.height > 0 && rootStyle.visibility !== "hidden" && rootStyle.display !== "none" && Number(rootStyle.opacity) > 0,
      box: { width: box.width, height: box.height },
      lineage,
    };
  }), { variableNames: Object.keys(expectedVariables) });
}

function assertContextEvidence(evidence, viewportName) {
  assert.deepEqual(evidence.map(entry => entry.context), expectedContexts, `${viewportName}: the production context inventory changed.`);
  for (const entry of evidence) {
    const prefix = `${viewportName}/${entry.context}`;
    assert.equal(entry.visible, true, `${prefix}: shield is not visible.`);
    assert.ok(entry.box.width >= 24 && entry.box.height >= 25, `${prefix}: shield collapsed to ${entry.box.width}x${entry.box.height}.`);
    assert.equal(entry.renderedVariant, entry.requestedVariant, `${prefix}: wrong artwork variant.`);
    assert.deepEqual(entry.variables, expectedVariables, `${prefix}: one or more saved color variables changed in the production cascade.`);
    assert.equal(entry.field, expectedColors.primary, `${prefix}: primary field color changed.`);
    assert.equal(entry.division, expectedColors.secondary, `${prefix}: secondary field color changed.`);
    assert.ok(entry.charges.length >= 2, `${prefix}: both charge color channels are not represented.`);
    assert.deepEqual(entry.charges[0], { color: expectedColors.charge, fill: expectedColors.charge }, `${prefix}: primary charge color changed.`);
    assert.deepEqual(entry.charges[1], { color: expectedColors.secondaryCharge, fill: expectedColors.secondaryCharge }, `${prefix}: secondary charge color changed.`);
    assert.equal(entry.border, expectedColors.border, `${prefix}: border color changed.`);
    if (entry.trim === "double") assert.equal(entry.innerTrim, expectedColors.border, `${prefix}: inner trim color changed.`);
    else assert.equal(entry.rivets, expectedColors.border, `${prefix}: rivet color changed.`);
    assert.notEqual(entry.clipPath, "none", `${prefix}: shape clipping is missing.`);
    assert.equal(entry.lineage.some(item => /brightness|saturate|grayscale|contrast/i.test(item.filter)), false, `${prefix}: a surrounding state filter recolors the saved heraldry.`);
  }
}

async function verifyInteractiveStates(page, viewportName) {
  const selectors = [
    '[data-shield-context="editor-option"]',
    '[data-shield-context="public-player"]',
    '[data-shield-context="objective"]',
    '[data-shield-context="hud"]',
    '[data-shield-context="own-profile"]',
    '[data-shield-context="overview"]',
    '[data-shield-context="discovery"]',
    '[data-shield-context="leaderboard-current"]',
  ];
  const states = [];
  for (const selector of selectors) {
    const slot = page.locator(selector);
    const control = slot.locator("xpath=ancestor::button[1]");
    await control.hover();
    const hover = await control.evaluate(element => getComputedStyle(element).filter);
    assert.doesNotMatch(hover, /brightness|saturate|grayscale|contrast/i, `${viewportName}/${selector}: hover recolors the shield (${hover}).`);
    const box = await control.boundingBox();
    assert.ok(box, `${viewportName}/${selector}: interactive shield has no hit target.`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const active = await control.evaluate(element => getComputedStyle(element).filter);
    await page.mouse.up();
    assert.doesNotMatch(active, /brightness|saturate|grayscale|contrast/i, `${viewportName}/${selector}: active state recolors the shield (${active}).`);
    states.push({ context: await slot.getAttribute("data-shield-context"), hover, active });
  }
  return states;
}

async function main() {
  assert.ok(fs.existsSync(chromePath), `Chrome was not found at ${chromePath}.`);
  const { server, port } = await startServer();
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const results = {};
  try {
    for (const viewport of [
      { name: "568x320", width: 568, height: 320 },
      { name: "844x390", width: 844, height: 390 },
      { name: "1440x900", width: 1440, height: 900 },
    ]) {
      const context = await browser.newContext({
        serviceWorkers: "block",
        viewport: { width: viewport.width, height: viewport.height },
      });
      const page = await context.newPage();
      const consoleErrors = [];
      const requestFailures = [];
      page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
      page.on("requestfailed", request => requestFailures.push(`${request.url()} :: ${request.failure()?.errorText || "failed"}`));
      await page.goto(`http://127.0.0.1:${port}${fixturePath}`, { waitUntil: "load" });
      await page.waitForFunction(() => document.documentElement.dataset.contextProofReady === "true");
      const evidence = await readContextEvidence(page);
      assertContextEvidence(evidence, viewport.name);
      const states = await verifyInteractiveStates(page, viewport.name);
      assert.deepEqual(consoleErrors, [], `${viewport.name}: console errors: ${consoleErrors.join(" | ")}`);
      assert.deepEqual(requestFailures, [], `${viewport.name}: failed requests: ${requestFailures.join(" | ")}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, `${viewport.name}: context proof overflows horizontally.`);
      results[viewport.name] = { contexts: evidence.length, states };
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  console.log(JSON.stringify(results, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
