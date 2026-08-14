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

      const homeHudMetrics = await page.evaluate(() => {
        const bar = document.querySelector(".resource-bar");
        const button = document.querySelector("#mainCityReturnBtn");
        const fullscreen = document.querySelector("#fullscreenBtn");
        if (!bar || !button || !fullscreen) return null;
        bar.classList.add("has-home-return");
        button.classList.add("hud-home-return");
        button.hidden = false;
        bar.insertBefore(button, fullscreen);
        window.dispatchEvent(new Event("crownlands:ui-layout-refresh"));
        const buttonRect = button.getBoundingClientRect();
        const fullscreenRect = fullscreen.getBoundingClientRect();
        const barRect = bar.getBoundingClientRect();
        return {
          barPosition: getComputedStyle(bar).position,
          gap: fullscreenRect.left - buttonRect.right,
          homeHeight: buttonRect.height,
          homeTop: buttonRect.top,
          homeWidth: buttonRect.width,
          fullscreenHeight: fullscreenRect.height,
          fullscreenPosition: getComputedStyle(fullscreen).position,
          fullscreenTop: fullscreenRect.top,
          fullscreenWidth: fullscreenRect.width,
          rightInset: innerWidth - barRect.right,
        };
      });
      assert.ok(homeHudMetrics, `${viewport.name}: top-right Home/fullscreen controls are missing.`);
      assert.equal(homeHudMetrics.barPosition, "absolute", `${viewport.name}: the combined controls are not anchored to the HUD editor slot.`);
      assert.ok(homeHudMetrics.rightInset >= 0 && homeHudMetrics.rightInset <= 40, `${viewport.name}: the combined controls are not in the top-right corner.`);
      assert.equal(homeHudMetrics.fullscreenPosition, "static", `${viewport.name}: fullscreen remains detached from the Home control row.`);
      assert.ok(homeHudMetrics.gap >= 0 && homeHudMetrics.gap <= 8, `${viewport.name}: Home is not directly beside fullscreen.`);
      assert.ok(Math.abs(homeHudMetrics.homeTop - homeHudMetrics.fullscreenTop) < 1, `${viewport.name}: Home and fullscreen are not vertically aligned.`);
      assert.equal(homeHudMetrics.homeWidth, 38, `${viewport.name}: Home has the wrong HUD width.`);
      assert.equal(homeHudMetrics.homeHeight, 38, `${viewport.name}: Home has the wrong HUD height.`);
      assert.equal(homeHudMetrics.fullscreenWidth, 38, `${viewport.name}: fullscreen has the wrong grouped width.`);
      assert.equal(homeHudMetrics.fullscreenHeight, 38, `${viewport.name}: fullscreen has the wrong grouped height.`);

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
