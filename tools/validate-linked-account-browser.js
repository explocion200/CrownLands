"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const root = path.resolve(__dirname, ".."), source = fs.readFileSync(path.join(root, "game.js"), "utf8");
function extract(name) {
  const start = source.indexOf(`function ${name}(`), end = source.indexOf("\nfunction ", start + 9);
  assert(start >= 0); return source.slice(start, end < 0 ? source.length : end);
}
async function main() {
  const executablePath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"]
    .find(file => file && fs.existsSync(file));
  assert(executablePath, "Set CHROME_PATH to Chromium.");
  const session = await startBrowserSession(executablePath);
  const client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
  await Promise.all(["Page.enable", "Runtime.enable", "Network.enable"].map(method => client.send(method)));
  await client.send("Network.setBlockedURLs", { urls: ["*"] });
  const evaluate = async expression => {
    const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const setContent = async html => evaluate(`(async () => { document.open(); document.write(${JSON.stringify(html)}); document.close();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); })()`);
  const inspect = selector => evaluate(`(() => { const element=document.querySelector(${JSON.stringify(selector)});
    const rect=element?.getBoundingClientRect(); return {text:element?.textContent, visible:Boolean(rect?.width && rect?.height),
    x:rect?.x, width:rect?.width}; })()`);
  const screenshot = async file => fs.writeFileSync(path.join(output, file), Buffer.from((await client.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
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
      await client.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1, mobile: false });
      await setContent(`<style>${css}</style><dialog id="modal" class="troop-slider-modal" open><div class="modal-card"><h2>Attack city</h2><div id="modalBody"><div id="troopSliderActionNotice" role="status"></div><div id="troopSliderPreview"></div><button>Send troops</button></div></div></dialog>`);
      await evaluate(`(() => { const modalBody=document.querySelector('#modalBody');
        const isRallyTroopOrderKind=()=>false,isRewardCampTarget=()=>false,getScoutReportForTarget=()=>null;
        const getAttackProtectionNotice=()=>'',normalizeAttackProtectionSnapshot=x=>x,createAttackProtectionSnapshot=()=>null;
        ${extract("normalizeLinkedCaptureRestriction")}
        ${extract("updateTroopOrderPreview")}
        updateTroopOrderPreview({}, {kind:'city'}, [], {orderKind:'attack',amount:20000,retaliationId:'',travelSummary:'',
          combatForecast:{captureRestriction:{blocked:true,reason:'linked_account_capture',expiresAtMs:null}}}); })()`);
      const notice = await inspect("#troopSliderActionNotice"); assert(notice.visible);
      assert.match(notice.text, /Battle allowed; city capture restricted/);
      assert(!/null|NaN|30 days|expires/.test(notice.text));
      assert(notice.x >= 0 && notice.x + notice.width <= viewport.width);
      await screenshot(`preview-${viewport.width}.png`);
      for (const type of ["attack", "defense"]) {
        const report = { ...fixture.options.report, type, captureBlockedReason: "linked_account_capture" };
        const html = fixture.ui.render({ ...fixture.options, report,
          left: type === "defense" ? fixture.options.right : fixture.options.left,
          right: type === "defense" ? fixture.options.left : fixture.options.right,
          viewerRole: type === "defense" ? "defender" : "attacker",
          badge: { tone: "victory", label: type === "defense" ? "HELD" : "VICTORY" },
          ruleLabel: labelContext.getBattleRuleLabel({ combatRule: { id: "linked_account_capture" } }),
          resultLabel: labelContext.getLegacyBattleResultLabel(report) });
        await setContent(`<style>${css}</style><dialog id="modal" class="battle-report-detail-ledger" open><div class="modal-card"><div id="modalBody">${html}</div></div></dialog>`);
        const rule = await inspect(".rule-note"); assert.match(rule.text, /city capture restricted/); assert(rule.visible);
        assert((await inspect("body")).text.includes(type === "defense" ? "you keep the city" : "ownership unchanged"));
        await screenshot(`${type}-report-${viewport.width}.png`);
      }
    }
    console.log("Linked-account browser checks passed at 1366x768 and 844x390: actual order preview, permanent warning, and both full-report perspectives.");
  } finally {
    await client.send("Browser.close").catch(() => {});
    await waitForProcessExit(session.browserProcess); await removeBrowserProfile(session.profilePath);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
