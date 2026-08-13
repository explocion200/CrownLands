const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const chromePath = process.env.CROWNLANDS_CHROME_PATH
  || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outputDir = path.join(root, "docs", "visual-qa", "focused-ui-correction");

async function main() {
  assert.ok(fs.existsSync(chromePath), `Chrome was not found at ${chromePath}.`);
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  try {
    for (const viewport of [
      { name: "desktop", width: 1440, height: 900 },
      { name: "android-landscape", width: 844, height: 390 },
    ]) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        serviceWorkers: "block",
      });
      const page = await context.newPage();
      await page.route("https://www.gstatic.com/firebasejs/**", route => route.abort());
      await page.goto(`http://127.0.0.1:4178/index.html?focused-ui-qa=${viewport.name}`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(1000);

      const metrics = await page.evaluate(() => {
        const setup = document.querySelector("#setupScreen");
        const setupStyle = getComputedStyle(setup);
        const expectedArtWidth = Math.min(innerWidth, innerHeight * 4 / 3);
        const expectedArtHeight = Math.min(innerHeight, innerWidth * 3 / 4);
        const setupCard = document.querySelector(".setup-card")?.getBoundingClientRect();
        const frameStyle = getComputedStyle(setup, "::before");
        return {
          expectedArtHeight,
          expectedArtWidth,
          frameBorder: frameStyle.borderTopWidth,
          frameHeight: Number.parseFloat(frameStyle.height),
          frameWidth: Number.parseFloat(frameStyle.width),
          setupCard: setupCard ? {
            bottom: setupCard.bottom,
            left: setupCard.left,
            right: setupCard.right,
            top: setupCard.top,
          } : null,
          setupVisible: setupStyle.display !== "none",
          titleOverlayCount: document.querySelectorAll(".login-brand-title").length,
          viewportHeight: innerHeight,
          viewportWidth: innerWidth,
        };
      });

      assert.equal(metrics.setupVisible, true, `${viewport.name}: login screen is not visible.`);
      assert.equal(metrics.titleOverlayCount, 0, `${viewport.name}: typed title overlay still exists.`);
      assert.equal(metrics.frameBorder, "1px", `${viewport.name}: artwork frame is not the intended thin edge.`);
      assert.ok(Math.abs(metrics.frameWidth - metrics.expectedArtWidth) < 1, `${viewport.name}: frame width misses artwork.`);
      assert.ok(Math.abs(metrics.frameHeight - metrics.expectedArtHeight) < 1, `${viewport.name}: frame height misses artwork.`);
      assert.ok(metrics.setupCard, `${viewport.name}: sign-in card is missing.`);
      assert.ok(metrics.setupCard.left >= 0 && metrics.setupCard.right <= metrics.viewportWidth,
        `${viewport.name}: sign-in card clips horizontally.`);
      assert.ok(metrics.setupCard.top >= 0 && metrics.setupCard.bottom <= metrics.viewportHeight,
        `${viewport.name}: sign-in card clips vertically.`);

      await page.screenshot({
        path: path.join(outputDir, `login-${viewport.name}.png`),
        fullPage: false,
      });

      const homeIconMetrics = await page.evaluate(() => {
        const button = document.querySelector("#mainCityReturnBtn");
        const house = button?.querySelector(".main-city-return-house");
        const arrow = button?.querySelector(".main-city-return-arrow");
        if (!button || !house || !arrow) return null;
        button.hidden = false;
        button.classList.remove("hud-home-return");
        button.style.left = "80px";
        button.style.top = "80px";
        button.style.zIndex = "200";
        document.body.appendChild(button);
        const buttonRect = button.getBoundingClientRect();
        return {
          arrow: arrow.textContent.trim(),
          hasImage: Boolean(button.querySelector("img")),
          house: house.textContent.trim(),
          renderedHeight: buttonRect.height,
          renderedWidth: buttonRect.width,
        };
      });
      assert.ok(homeIconMetrics, `${viewport.name}: Home City icon markup is missing.`);
      assert.equal(homeIconMetrics.house, "⌂", `${viewport.name}: previous Home City symbol is missing.`);
      assert.equal(homeIconMetrics.arrow, "►", `${viewport.name}: previous Home City direction arrow is missing.`);
      assert.equal(homeIconMetrics.hasImage, false, `${viewport.name}: PWA artwork still appears in the Home City control.`);
      assert.ok(homeIconMetrics.renderedWidth >= 36 && homeIconMetrics.renderedHeight >= 36,
        `${viewport.name}: Home City icon renders too small.`);
      await page.locator("#mainCityReturnBtn").screenshot({
        path: path.join(outputDir, `home-city-icon-${viewport.name}.png`),
      });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log("Focused UI screenshot QA passed at 1440x900 and Android landscape 844x390.");
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
