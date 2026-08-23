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
    };
  });
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
      await page.goto(`http://127.0.0.1:${port}${fixturePath}`, { waitUntil: "load" });
      const controls = page.locator("[data-qa-controls]");
      const top = await measure(page);
      assert.notEqual(top.touchAction, "none", `${viewport.name}: controls block native touch scrolling.`);
      assert.notEqual(top.pointerEvents, "none", `${viewport.name}: controls block pointer input.`);
      assert.equal(top.horizontalOverflow, false, `${viewport.name}: page overflows horizontally.`);
      assert.equal(top.previewVisible, true, `${viewport.name}: preview is not visible at the top.`);
      if (!viewport.compact) {
        assert.ok(top.clanViewScrollHeight > top.clanViewClientHeight, `${viewport.name}: overflowing desktop editor has no scroll range.`);
        await page.screenshot({ path: path.join(outputDir, `${viewport.name}.png`) });
        await page.locator(".clan-view").evaluate(element => { element.scrollTop = element.scrollHeight; });
        const desktopBottom = await measure(page);
        assert.ok(desktopBottom.clanViewScrollTop > 0, `${viewport.name}: desktop editor did not scroll.`);
        assert.equal(desktopBottom.actionsVisible, true, `${viewport.name}: desktop actions cannot be reached.`);
        results[viewport.name] = { top, bottom: desktopBottom };
        await context.close();
        continue;
      }

      assert.equal(top.actionsVisible, true, `${viewport.name}: actions are not visible at the top.`);
      assert.ok(top.scrollHeight > top.clientHeight, `${viewport.name}: controls do not have a real scroll range.`);
      assert.equal(top.overflowY, "auto", `${viewport.name}: controls are not the vertical scroller.`);
      assert.equal(top.minHeight, "0px", `${viewport.name}: controls retain the grid min-height:auto trap.`);
      assert.equal(top.clanViewOverflowY, "hidden", `${viewport.name}: outer Clan view still owns scrolling.`);
      await page.screenshot({ path: path.join(outputDir, `${viewport.name}-top.png`) });

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
      await page.screenshot({ path: path.join(outputDir, `${viewport.name}-bottom.png`) });

      await page.getByRole("tab", { name: "Details" }).click();
      assert.equal(await page.getByRole("tab", { name: "Details" }).getAttribute("aria-selected"), "true", `${viewport.name}: Details tab is unusable.`);
      results[viewport.name] = {
        top,
        wheelScrollTop: wheel.scrollTop,
        touchScrollTop,
        middleScrollTop: middle.scrollTop,
        previewStayedFixed: bottom.previewVisible,
        actionsStayedFixed: bottom.actionsVisible,
        bottom,
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
