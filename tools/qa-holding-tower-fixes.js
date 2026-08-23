const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const chromePath = process.env.CROWNLANDS_CHROME_PATH
  || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outputDir = path.join(root, "docs", "visual-qa", "holding-towers-final-readability");
const screenshotDir = path.join(outputDir, "screenshots");
const baseUrl = process.env.CROWNLANDS_QA_URL || "http://127.0.0.1:4173/";

const captures = [
  { file: "00-profile-reference-1440x900.jpg", scenario: "profile-reference", width: 1440, height: 900, profile: true },
  { file: "01-clan-owned-tower.jpg", scenario: "owner", width: 1280, height: 900 },
  { file: "02-damaged-wall.jpg", scenario: "damaged", width: 1440, height: 900 },
  { file: "03-repair-active.jpg", scenario: "repair", width: 1440, height: 900 },
  { file: "04-wall-upgrade-and-queue.jpg", scenario: "upgrading", width: 1440, height: 900 },
  { file: "05-veil-of-silence.jpg", scenario: "veil-active", width: 1440, height: 900 },
  { file: "06-clan-treasury.jpg", scenario: "treasury-locked", width: 1440, height: 900 },
  { file: "07-desktop-1440x900.jpg", scenario: "owner", width: 1440, height: 900 },
  { file: "08-landscape-844x390.jpg", scenario: "owner", width: 844, height: 390 },
];

async function main() {
  assert.ok(fs.existsSync(chromePath), `Chrome was not found at ${chromePath}.`);
  fs.mkdirSync(screenshotDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const metrics = [];
  try {
    for (const [index, capture] of captures.entries()) {
      const context = await browser.newContext({
        viewport: { width: capture.width, height: capture.height },
        serviceWorkers: "block",
      });
      const page = await context.newPage();
      const consoleErrors = [];
      const failedResponses = [];
      page.on("console", message => {
        if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) {
          consoleErrors.push(message.text());
        }
      });
      page.on("response", response => {
        const responseUrl = new URL(response.url());
        const knownLocalUpdateProbe = responseUrl.pathname === "/play/" && responseUrl.searchParams.has("updateCheck");
        if (response.status() >= 400 && !responseUrl.pathname.endsWith("/favicon.ico") && !knownLocalUpdateProbe) {
          failedResponses.push(`${response.status()} ${response.url()}`);
        }
      });
      await page.route("https://www.gstatic.com/firebasejs/**", route => route.abort());
      const url = new URL(baseUrl);
      if (!capture.profile) url.searchParams.set("towerQa", capture.scenario);
      url.searchParams.set("qaCapture", String(index + 1));
      try {
        await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
      } catch (error) {
        if (!capture.profile || !String(error?.message || "").includes("ERR_ABORTED")) throw error;
      }
      if (capture.profile) {
        await page.waitForFunction(() => document.querySelectorAll(".city-node").length > 0);
        await page.locator("#profileBtn").click();
      }
      const rootSelector = capture.profile
        ? ".profile-screen.open"
        : capture.scenario.startsWith("treasury")
          ? ".clan-treasury-panel"
          : ".holding-tower-panel";
      await page.locator(rootSelector).waitFor({ state: "visible" });
      await page.waitForTimeout(300);

      const measurement = await page.evaluate(({ rootSelector: selector }) => {
        const rootElement = document.querySelector(selector);
        const modalCard = rootElement?.matches(".profile-screen") ? rootElement : rootElement?.closest(".modal-card");
        const overlay = modalCard?.closest(".modal");
        const rootRect = rootElement?.getBoundingClientRect();
        const cardRect = modalCard?.getBoundingClientRect();
        const viewport = { width: innerWidth, height: innerHeight };
        return {
          body: { scrollHeight: document.body.scrollHeight, scrollWidth: document.body.scrollWidth },
          card: cardRect ? {
            bottom: cardRect.bottom,
            height: cardRect.height,
            left: cardRect.left,
            right: cardRect.right,
            top: cardRect.top,
            width: cardRect.width,
          } : null,
          overlay: overlay ? {
            clientHeight: overlay.clientHeight,
            clientWidth: overlay.clientWidth,
            scrollHeight: overlay.scrollHeight,
            scrollWidth: overlay.scrollWidth,
          } : null,
          root: rootRect ? {
            bottom: rootRect.bottom,
            height: rootRect.height,
            left: rootRect.left,
            right: rootRect.right,
            top: rootRect.top,
            width: rootRect.width,
          } : null,
          viewport,
          clippedText: Array.from(rootElement?.querySelectorAll("h2,h3,strong,small,span,label,button") || [])
            .filter(element => element.textContent.trim() && element.getClientRects().length)
            .filter(element => {
              const style = getComputedStyle(element);
              const clippedX = ["hidden", "clip"].includes(style.overflowX) && element.scrollWidth > element.clientWidth + 4;
              const clippedY = ["hidden", "clip"].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 4;
              return clippedX || clippedY;
            })
            .map(element => element.textContent.trim().replace(/\s+/g, " ").slice(0, 90)),
        };
      }, { rootSelector });

      assert.ok(measurement.root, `${capture.file}: QA root is missing.`);
      assert.equal(measurement.viewport.width, capture.width, `${capture.file}: viewport width drifted.`);
      assert.equal(measurement.viewport.height, capture.height, `${capture.file}: viewport height drifted.`);
      assert.ok(measurement.body.scrollWidth <= capture.width, `${capture.file}: body overflows horizontally.`);
      assert.ok(measurement.card.left >= 0 && measurement.card.right <= capture.width,
        `${capture.file}: modal card clips horizontally.`);
      if (measurement.overlay) {
        assert.ok(measurement.overlay.scrollWidth <= measurement.overlay.clientWidth + 1,
          `${capture.file}: modal content overflows horizontally.`);
      }
      if (!capture.profile) {
        assert.deepEqual(measurement.clippedText, [], `${capture.file}: text clips: ${measurement.clippedText.join(" | ")}`);
      }
      assert.deepEqual(consoleErrors, [], `${capture.file}: browser console errors: ${consoleErrors.join(" | ")}`);
      assert.deepEqual(failedResponses, [], `${capture.file}: failed responses: ${failedResponses.join(" | ")}`);

      const screenshotPath = path.join(screenshotDir, capture.file);
      if (capture.selector) {
        await page.locator(capture.selector).screenshot({ path: screenshotPath, type: "jpeg", quality: 90 });
      } else {
        await page.screenshot({ path: screenshotPath, type: "jpeg", quality: 90, fullPage: false });
      }
      assert.ok(fs.statSync(screenshotPath).size > 5000, `${capture.file}: screenshot output is unexpectedly small.`);
      metrics.push({
        file: `screenshots/${capture.file}`,
        scenario: capture.scenario,
        selector: capture.selector || null,
        ...measurement,
      });
      await context.close();
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(outputDir, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`);
  console.log("Holding Tower final readability QA passed with a fresh Profile reference and eight requested captures, including exact 844x390 landscape.");
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
