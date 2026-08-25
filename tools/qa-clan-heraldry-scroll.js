const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const fixturePath = "/docs/visual-qa/clan-heraldry-scroll/";
const outputDir = path.join(root, "docs", "visual-qa", "clan-heraldry-scroll", "screenshots");
const chromePath = process.env.CROWNLANDS_CHROME_PATH
  || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

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

async function measure(page) {
  return page.evaluate(() => {
    const controls = document.querySelector("[data-qa-controls]");
    const preview = document.querySelector("[data-qa-preview]");
    const actions = document.querySelector("[data-qa-actions]");
    const clanView = document.querySelector(".clan-view");
    const finalControl = document.querySelector(".clan-shield-panel.active [data-qa-final-control]");
    const controlsStyle = getComputedStyle(controls);
    const clanViewStyle = getComputedStyle(clanView);
    const controlsRect = controls.getBoundingClientRect();
    const previewRect = preview.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();
    const finalRect = finalControl?.getBoundingClientRect();
    const styleEvidence = selector => {
      const element = document.querySelector(selector);
      const style = getComputedStyle(element);
      const rgb = value => {
        const match = String(value || "").match(/rgba?\(\s*(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)/i);
        return match ? match.slice(1, 4).map(Number) : null;
      };
      const luminance = color => color.map(channel => {
        const value = channel / 255;
        return value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
      }).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
      const contrast = (foreground, background) => {
        const first = luminance(foreground);
        const second = luminance(background);
        return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
      };
      const foreground = rgb(style.color);
      const backgrounds = [];
      let surface = element;
      while (surface && !backgrounds.length) {
        const surfaceStyle = getComputedStyle(surface);
        backgrounds.push(...[...String(surfaceStyle.backgroundImage || "").matchAll(/rgba?\([^)]*\)/gi)].map(match => rgb(match[0])).filter(Boolean));
        const solidBackground = rgb(surfaceStyle.backgroundColor);
        if (solidBackground && surfaceStyle.backgroundColor !== "rgba(0, 0, 0, 0)") backgrounds.push(solidBackground);
        surface = surface.parentElement;
      }
      const minContrast = foreground && backgrounds.length ? Math.min(...backgrounds.map(background => contrast(foreground, background))) : null;
      return { color: style.color, backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage, borderColor: style.borderColor, opacity: style.opacity, minContrast };
    };
    return {
      actionsVisible: actionsRect.top >= 0 && actionsRect.bottom <= innerHeight,
      clanViewClientHeight: clanView.clientHeight,
      clanViewOverflowY: clanViewStyle.overflowY,
      clanViewScrollHeight: clanView.scrollHeight,
      clanViewScrollTop: clanView.scrollTop,
      clientHeight: controls.clientHeight,
      finalControlReachable: Boolean(finalRect && finalRect.bottom <= controlsRect.bottom + 1 && finalRect.bottom > controlsRect.top),
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      minHeight: controlsStyle.minHeight,
      overflowY: controlsStyle.overflowY,
      pointerEvents: controlsStyle.pointerEvents,
      previewVisible: previewRect.top >= 0 && previewRect.bottom <= innerHeight,
      scrollHeight: controls.scrollHeight,
      scrollTop: controls.scrollTop,
      touchAction: controlsStyle.touchAction,
      readability: {
        fieldTab: styleEvidence('[data-qa-tab="field"]'),
        colorsTab: styleEvidence('[data-qa-tab="colors"]'),
        activeTab: styleEvidence('[data-qa-tab="charges"]'),
        detailsTab: styleEvidence('[data-qa-tab="details"]'),
        sectionLabel: styleEvidence('.clan-shield-panel.active legend'),
        chargeName: styleEvidence('.clan-shield-panel.active .clan-shield-choice-grid button:not(.active) small'),
        selectedChoice: styleEvidence('.clan-shield-panel.active .clan-shield-choice-grid button.active'),
        save: styleEvidence('.clan-shield-save'),
        cancel: styleEvidence('.clan-shield-editor-actions .profile-secondary-btn'),
        inspire: styleEvidence('.clan-shield-editor-actions .profile-secondary-btn:first-child'),
      },
    };
  });
}

async function verifySpriteRuntime(page, viewportName) {
  const spriteProof = await page.evaluate(async () => {
    const useHrefs = [...document.querySelectorAll('use[href*="clan-heraldry"]')].map(element => element.getAttribute("href"));
    const hrefs = [...new Set(useHrefs.map(href => href.split("#")[0]))];
    const results = [];
    const spriteMarkup = new Map();
    for (const href of hrefs) {
      const response = await fetch(href, { cache: "no-store" });
      spriteMarkup.set(new URL(href, location.href).href, await response.text());
      results.push({ href, status: response.status, contentType: response.headers.get("content-type") || "" });
    }
    const chargeGrids = [...document.querySelectorAll('[data-options="charge"]')];
    const selectorCatalogs = chargeGrids.map(grid => [...grid.querySelectorAll(":scope > button")].map(button => ({
      label: button.querySelector("small")?.textContent.trim() || button.textContent.trim(),
      iconCount: button.querySelectorAll("use").length,
    })));
    const unresolvedUseCount = useHrefs.filter(href => {
      const [file, fragment] = href.split("#");
      const markup = spriteMarkup.get(new URL(file, location.href).href) || "";
      return !fragment || !markup.includes(`id="${fragment}"`);
    }).length;
    return { hrefs, results, selectorCatalogs, unresolvedUseCount };
  });
  assert.ok(spriteProof.hrefs.some(href => href.endsWith("charges-full.svg")), `${viewportName}: full sprite is not referenced.`);
  assert.ok(spriteProof.hrefs.some(href => href.endsWith("charges-micro.svg")), `${viewportName}: micro sprite is not referenced.`);
  for (const result of spriteProof.results) {
    assert.equal(result.status, 200, `${viewportName}: ${result.href} returned ${result.status}.`);
    assert.match(result.contentType, /image\/svg\+xml/i, `${viewportName}: ${result.href} has MIME ${result.contentType}.`);
  }
  assert.equal(spriteProof.unresolvedUseCount, 0, `${viewportName}: sprite <use> elements did not resolve.`);
  assert.equal(spriteProof.selectorCatalogs.length, 2, `${viewportName}: expected primary and secondary charge catalogs.`);
  for (const catalog of spriteProof.selectorCatalogs) {
    assert.equal(catalog.length, 17, `${viewportName}: the v2 selector must expose exactly 17 choices.`);
    assert.equal(catalog.filter(entry => entry.iconCount === 1).length, 16, `${viewportName}: every artwork charge must render one icon.`);
    assert.equal(catalog[0].label, "None", `${viewportName}: None must remain the only icon-free choice.`);
    assert.equal(catalog[0].iconCount, 0, `${viewportName}: None must not emit an unresolved sprite use.`);
  }
  return spriteProof;
}

async function verifyColorSelector(page, viewportName) {
  await page.getByRole("tab", { name: "Colors" }).click();
  const channelCases = [
    { key: "primary", variable: "--clan-heraldry-primary", original: "#24445f", selected: "#d8bd78", selector: ".clan-heraldry-field", property: "fill" },
    { key: "secondary", variable: "--clan-heraldry-secondary", original: "#7a2638", selected: "#547a9a", selector: ".clan-heraldry-division", property: "fill" },
    { key: "chargeColor", variable: "--clan-heraldry-charge", original: "#f2e2bf", selected: "#c69a45", selector: ".clan-heraldry-charge", property: "fill", index: 0 },
    { key: "secondaryChargeColor", variable: "--clan-heraldry-secondary-charge", original: "#d8bd78", selected: "#b7c3bf", selector: ".clan-heraldry-charge", property: "fill", index: 1 },
    { key: "borderColor", variable: "--clan-heraldry-border", original: "#d8bd78", selected: "#253f3a", selector: ".clan-heraldry-border", property: "stroke" },
  ];
  const channelProof = [];
  for (const channel of channelCases) {
    const swatches = page.locator(`[data-color-key="${channel.key}"] [data-color-value]`);
    const evidence = await swatches.evaluateAll(buttons => buttons.map(button => ({
      value: button.dataset.colorValue,
      pressed: button.getAttribute("aria-pressed"),
      backgroundColor: getComputedStyle(button).backgroundColor,
      backgroundImage: getComputedStyle(button).backgroundImage,
    })));
    assert.equal(evidence.length, 16, `${viewportName}/${channel.key}: the selector does not expose all 16 dyes.`);
    assert.equal(new Set(evidence.map(entry => entry.backgroundColor)).size, 16, `${viewportName}/${channel.key}: shared button styling still hides one or more shield dyes.`);
    for (const entry of evidence) {
      const channels = entry.value.slice(1).match(/.{2}/g).map(value => Number.parseInt(value, 16));
      assert.equal(entry.backgroundColor, `rgb(${channels.join(", ")})`, `${viewportName}/${channel.key}: ${entry.value} renders as ${entry.backgroundColor}.`);
      assert.doesNotMatch(entry.backgroundImage, /244, 232, 205|221, 199, 158|199, 171, 121/, `${viewportName}/${channel.key}: the parchment button face still covers ${entry.value}.`);
    }
    const previous = page.locator(`[data-color-key="${channel.key}"] [data-color-value="${channel.original}"]`);
    const selected = page.locator(`[data-color-key="${channel.key}"] [data-color-value="${channel.selected}"]`);
    await selected.click();
    assert.equal(await selected.getAttribute("aria-pressed"), "true", `${viewportName}/${channel.key}: the chosen dye is not selected.`);
    assert.equal(await previous.getAttribute("aria-pressed"), "false", `${viewportName}/${channel.key}: the previous dye remains selected.`);
    const root = page.locator("[data-qa-full-preview] .clan-heraldry-v2");
    const previewStyle = await root.getAttribute("style");
    assert.ok((previewStyle || "").includes(`${channel.variable}:${channel.selected}`), `${viewportName}/${channel.key}: the preview did not receive ${channel.selected}.`);
    const rendered = root.locator(channel.selector).nth(channel.index || 0);
    const renderedColor = await rendered.evaluate((element, property) => getComputedStyle(element)[property], channel.property);
    const selectedChannels = channel.selected.slice(1).match(/.{2}/g).map(value => Number.parseInt(value, 16));
    assert.equal(renderedColor, `rgb(${selectedChannels.join(", ")})`, `${viewportName}/${channel.key}: the rendered SVG channel is ${renderedColor}.`);
    await previous.click();
    assert.equal(await previous.getAttribute("aria-pressed"), "true", `${viewportName}/${channel.key}: the original dye could not be restored.`);
    channelProof.push({
      key: channel.key,
      swatchCount: evidence.length,
      distinctComputedColors: new Set(evidence.map(entry => entry.backgroundColor)).size,
      selectedValue: channel.selected,
      restoredValue: channel.original,
      renderedColor,
    });
  }
  await page.getByRole("tab", { name: "Charges" }).click();
  await page.evaluate(() => document.activeElement?.blur());
  return { channels: channelProof };
}

async function swipeControls(context, page) {
  const controls = page.locator("[data-qa-controls]");
  const box = await controls.boundingBox();
  assert.ok(box && box.height > 12, "The controls body has no usable touch target.");
  const cdp = await context.newCDPSession(page);
  const x = Math.round(box.x + box.width / 2);
  const startY = Math.round(box.y + box.height - 5);
  const endY = Math.round(box.y + 5);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: startY }] });
  for (let step = 1; step <= 8; step += 1) {
    const y = Math.round(startY + (endY - startY) * (step / 8));
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
    await page.waitForTimeout(18);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(100);
}

async function main() {
  assert.ok(fs.existsSync(chromePath), `Chrome was not found at ${chromePath}.`);
  fs.mkdirSync(outputDir, { recursive: true });
  const { server, port } = await startServer();
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const results = {};
  try {
    for (const viewport of [
      { name: "568x320", width: 568, height: 320, compact: true },
      { name: "844x390", width: 844, height: 390, compact: true },
      { name: "1440x900", width: 1440, height: 900, compact: false },
    ]) {
      const context = await browser.newContext({
        hasTouch: viewport.compact,
        isMobile: false,
        serviceWorkers: "block",
        viewport: { width: viewport.width, height: viewport.height },
      });
      const page = await context.newPage();
      const consoleErrors = [];
      const requestFailures = [];
      page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
      page.on("requestfailed", request => requestFailures.push(`${request.url()} :: ${request.failure()?.errorText || "failed"}`));
      await page.goto(`http://127.0.0.1:${port}${fixturePath}`, { waitUntil: "load" });
      await page.waitForTimeout(120);
      const controls = page.locator("[data-qa-controls]");
      const top = await measure(page);
      const spriteProof = await verifySpriteRuntime(page, viewport.name);
      const colorProof = await verifyColorSelector(page, viewport.name);
      assert.deepEqual(consoleErrors, [], `${viewport.name}: console errors: ${consoleErrors.join(" | ")}`);
      assert.deepEqual(requestFailures, [], `${viewport.name}: failed requests: ${requestFailures.join(" | ")}`);
      assert.notEqual(top.touchAction, "none", `${viewport.name}: controls block native touch scrolling.`);
      assert.notEqual(top.pointerEvents, "none", `${viewport.name}: controls block pointer input.`);
      assert.equal(top.horizontalOverflow, false, `${viewport.name}: page overflows horizontally.`);
      assert.equal(top.previewVisible, true, `${viewport.name}: preview is not visible at the top.`);
      for (const [label, evidence] of Object.entries(top.readability)) {
        assert.ok(Number(evidence.minContrast) >= 4.5, `${viewport.name}: ${label} contrast is ${evidence.minContrast ?? "unresolved"}.`);
      }
      assert.notEqual(top.readability.activeTab.backgroundImage, top.readability.fieldTab.backgroundImage, `${viewport.name}: selected tab has no non-color state distinction.`);
      assert.notEqual(top.readability.activeTab.borderColor, top.readability.fieldTab.borderColor, `${viewport.name}: selected tab border is indistinguishable.`);
      if (!viewport.compact) {
        assert.ok(top.scrollHeight > top.clientHeight, `${viewport.name}: desktop Charges panel has no scroll range.`);
        assert.equal(top.actionsVisible, true, `${viewport.name}: desktop actions are not visible.`);
        await page.screenshot({ path: path.join(outputDir, `${viewport.name}-charges.png`) });
        await controls.evaluate(element => { element.scrollTop = element.scrollHeight; });
        const desktopBottom = await measure(page);
        assert.ok(desktopBottom.scrollTop > 0, `${viewport.name}: desktop Charges panel did not scroll.`);
        assert.equal(desktopBottom.actionsVisible, true, `${viewport.name}: desktop actions cannot be reached.`);
        results[viewport.name] = { top, bottom: desktopBottom, spriteProof, colorProof, consoleErrors, requestFailures };
        await context.close();
        continue;
      }

      assert.equal(top.actionsVisible, true, `${viewport.name}: actions are not visible at the top.`);
      assert.ok(top.scrollHeight > top.clientHeight, `${viewport.name}: controls do not have a real scroll range.`);
      assert.equal(top.overflowY, "auto", `${viewport.name}: controls are not the vertical scroller.`);
      assert.equal(top.minHeight, "0px", `${viewport.name}: controls retain the grid min-height:auto trap.`);
      assert.equal(top.clanViewOverflowY, "hidden", `${viewport.name}: outer Clan view still owns scrolling.`);
      await page.screenshot({ path: path.join(outputDir, `${viewport.name}-charges-top.png`) });

      await page.getByRole("tab", { name: "Field" }).click();
      await page.screenshot({ path: path.join(outputDir, `${viewport.name}-field.png`) });
      await page.getByRole("tab", { name: "Charges" }).click();

      await controls.hover();
      await page.mouse.wheel(0, 420);
      await page.waitForTimeout(80);
      const wheel = await measure(page);
      assert.ok(wheel.scrollTop > 0, `${viewport.name}: mouse wheel/trackpad scrolling did not move controls.`);

      await controls.evaluate(element => { element.scrollTop = 0; });
      let touchScrollTop = 0;
      if (viewport.compact) {
        await swipeControls(context, page);
        const touch = await measure(page);
        assert.ok(touch.scrollTop > 0, `${viewport.name}: native touch scrolling did not move controls.`);
        touchScrollTop = touch.scrollTop;
      }

      await controls.evaluate(element => { element.scrollTop = Math.floor((element.scrollHeight - element.clientHeight) / 2); });
      const middle = await measure(page);
      assert.ok(middle.scrollTop > 0, `${viewport.name}: middle scroll state was not reached.`);

      await controls.evaluate(element => { element.scrollTop = element.scrollHeight; });
      const bottom = await measure(page);
      assert.ok(bottom.scrollTop > 0, `${viewport.name}: bottom scroll state was not reached.`);
      assert.equal(bottom.finalControlReachable, true, `${viewport.name}: final control is unreachable.`);
      assert.equal(bottom.previewVisible, true, `${viewport.name}: preview moved off-screen at the bottom.`);
      assert.equal(bottom.actionsVisible, true, `${viewport.name}: actions moved off-screen at the bottom.`);
      await page.screenshot({ path: path.join(outputDir, `${viewport.name}-charges-bottom.png`) });

      await page.getByRole("tab", { name: "Details" }).click();
      assert.equal(await page.getByRole("tab", { name: "Details" }).getAttribute("aria-selected"), "true", `${viewport.name}: Details tab is unusable.`);
      await page.screenshot({ path: path.join(outputDir, `${viewport.name}-details.png`) });
      results[viewport.name] = {
        top,
        wheelScrollTop: wheel.scrollTop,
        touchScrollTop,
        middleScrollTop: middle.scrollTop,
        previewStayedFixed: bottom.previewVisible,
        actionsStayedFixed: bottom.actionsVisible,
        bottom,
        spriteProof,
        colorProof,
        consoleErrors,
        requestFailures,
      };
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  fs.writeFileSync(path.join(outputDir, "metrics.json"), `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify(results, null, 2));
  console.log("Clan Heraldry native scrolling QA passed at 568x320, 844x390, and 1440x900.");
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
