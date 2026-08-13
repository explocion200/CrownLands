const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "docs", "visual-qa", "ui-readability");
const chromePath = process.env.CROWNLANDS_CHROME_PATH
  || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  try {
    for (const viewport of [
      { name: "desktop", width: 1440, height: 900 },
      { name: "android-landscape", width: 844, height: 390 },
    ]) {
      const context = await browser.newContext({ viewport, serviceWorkers: "block" });
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:4178/docs/visual-qa/ui-readability/index.html", { waitUntil: "networkidle" });

      const result = await page.evaluate(() => {
        const visible = element => {
          const style = getComputedStyle(element);
          return style.display !== "none" && style.visibility !== "hidden";
        };
        const clipped = [...document.querySelectorAll("button, strong, small, p, .qa-row, .shop-item, .daily-mission-row, .seasonal-achievement-row")]
          .filter(visible)
          .filter(element => element.scrollWidth > element.clientWidth + 2)
          .map(element => ({ className: element.className, text: element.textContent.trim().slice(0, 60) }));
        const minCompact = Math.min(...[...document.querySelectorAll("small")].filter(visible).map(element => parseFloat(getComputedStyle(element).fontSize)));
        const cityColors = Object.fromEntries([
          ["owned", ".qa-city-node.player .city-owner-column"],
          ["ownedTroops", ".qa-city-node.player .city-army-count"],
          ["enemy", ".qa-city-node.enemy .foreign-city-shield"],
          ["player2", ".qa-city-node.player2 .foreign-city-shield"],
          ["friendly", ".qa-city-node.player3 .foreign-city-shield"],
          ["clanAlly", ".qa-city-node.clan-ally .foreign-city-shield"],
          ["neutral", ".qa-city-node.neutral .foreign-city-shield"],
        ].map(([key, selector]) => [key, getComputedStyle(document.querySelector(selector)).backgroundColor]));
        return { clipped, minCompact, cityColors, title: document.querySelector("h1")?.textContent };
      });

      assert.equal(result.title, "Crownlands Readability Contract");
      assert.deepEqual(result.clipped, [], `${viewport.name}: clipped QA content ${JSON.stringify(result.clipped)}`);
      assert.ok(result.minCompact >= 10, `${viewport.name}: compact copy fell below 10px (${result.minCompact}px).`);
      assert.deepEqual(result.cityColors, {
        owned: "rgb(23, 108, 183)",
        ownedTroops: "rgb(36, 125, 206)",
        enemy: "rgb(225, 38, 53)",
        player2: "rgb(105, 70, 169)",
        friendly: "rgb(40, 126, 76)",
        clanAlly: "rgb(38, 122, 67)",
        neutral: "rgb(107, 101, 91)",
      }, `${viewport.name}: city ownership colors drifted.`);
      await page.screenshot({ path: path.join(output, `${viewport.name}.png`), fullPage: true });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log("UI readability screenshot QA passed at 1440x900 and Android landscape 844x390.");
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
