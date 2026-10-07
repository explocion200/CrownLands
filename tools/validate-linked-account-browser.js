"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, ".."), source = fs.readFileSync(path.join(root, "game.js"), "utf8");
function extract(name) {
  const start = source.indexOf(`function ${name}(`), end = source.indexOf("\nfunction ", start + 9);
  assert(start >= 0); return source.slice(start, end < 0 ? source.length : end);
}
async function main() {
  const executablePath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"]
    .find(file => file && fs.existsSync(file));
  const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), headless: true });
  const output = path.resolve(root, "..", "..", "output", "linked-account-browser"); fs.mkdirSync(output, { recursive: true });
  const css = [...fs.readFileSync(path.join(root, "index.html"), "utf8").matchAll(/<link[^>]*href="([^"?]+\.css)(?:[^"]*)"/g)].map(match => match[1]).filter(file => fs.existsSync(path.join(root, file)))
    .map(file => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
  // Reuse the established full-report renderer fixture and render the actual
  // linked-account labels rather than inventing a second report presentation.
  const established = fs.readFileSync(path.join(__dirname, "validate-battle-report-detail.js"), "utf8");
  const prefix = established.slice(0, established.indexOf("const before=JSON.stringify(options)"));
  const fixture = new Function("require", "__dirname", `${prefix}\nreturn {ui,options};`)(require, __dirname);
  const labelContext = vm.createContext({});
  for (const name of ["getBattleRuleLabel", "getLegacyBattleResultLabel"]) vm.runInContext(extract(name), labelContext);
  try {
    for (const viewport of [{ width: 1366, height: 768 }, { width: 844, height: 390 }]) {
      const page = await browser.newPage({ viewport });
      await page.route("**/*", route => route.abort());
      await page.setContent(`<style>${css}</style><dialog id="modal" class="troop-slider-modal" open><div class="modal-card"><h2>Attack city</h2><div id="modalBody"><div id="troopSliderActionNotice" role="status"></div><div id="troopSliderPreview"></div><button>Send troops</button></div></div></dialog>`);
      await page.addScriptTag({ content: `const modalBody=document.querySelector('#modalBody');
        const isRallyTroopOrderKind=()=>false,isRewardCampTarget=()=>false,getScoutReportForTarget=()=>null;
        const getAttackProtectionNotice=()=>'',normalizeAttackProtectionSnapshot=x=>x,createAttackProtectionSnapshot=()=>null;
        ${extract("normalizeLinkedCaptureRestriction")}
        ${extract("updateTroopOrderPreview")}
        updateTroopOrderPreview({}, {kind:'city'}, [], {orderKind:'attack',amount:20000,retaliationId:'',travelSummary:'',
          combatForecast:{captureRestriction:{blocked:true,reason:'linked_account_capture',expiresAtMs:null}}});` });
      const notice = page.locator("#troopSliderActionNotice"); assert(await notice.isVisible());
      assert.match(await notice.textContent(), /Battle allowed; city capture restricted/);
      assert(!/null|NaN|30 days|expires/.test(await notice.textContent()));
      const bounds = await notice.boundingBox(); assert(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width);
      await page.screenshot({ path: path.join(output, `preview-${viewport.width}.png`) });
      for (const type of ["attack", "defense"]) {
        const report = { ...fixture.options.report, type, captureBlockedReason: "linked_account_capture" };
        const html = fixture.ui.render({ ...fixture.options, report,
          left: type === "defense" ? fixture.options.right : fixture.options.left,
          right: type === "defense" ? fixture.options.left : fixture.options.right,
          viewerRole: type === "defense" ? "defender" : "attacker",
          badge: { tone: "victory", label: type === "defense" ? "HELD" : "VICTORY" },
          ruleLabel: labelContext.getBattleRuleLabel({ combatRule: { id: "linked_account_capture" } }),
          resultLabel: labelContext.getLegacyBattleResultLabel(report) });
        await page.setContent(`<style>${css}</style><dialog id="modal" class="battle-report-detail-ledger" open><div class="modal-card"><div id="modalBody">${html}</div></div></dialog>`);
        assert.match(await page.locator(".rule-note").textContent(), /city capture restricted/);
        assert(await page.locator(".rule-note").isVisible());
        assert((await page.locator("body").textContent()).includes(type === "defense" ? "you keep the city" : "ownership unchanged"));
        await page.screenshot({ path: path.join(output, `${type}-report-${viewport.width}.png`), fullPage: true });
      }
      await page.close();
    }
    console.log("Linked-account browser checks passed at 1366x768 and 844x390: actual order preview, permanent warning, and both full-report perspectives.");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
