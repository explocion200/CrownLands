"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const server = createMapBenchmarkServer();
  const address = await server.listen();
  const artifacts = path.resolve(__dirname, "../release-artifacts/skill-point-efficiency");
  fs.mkdirSync(artifacts, { recursive: true });
  const errors = [];
  let browser, client;
  try {
    const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
    assert(executable, "A Chromium browser is required.");
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const wait = async expression => {
      for (let attempt = 0; attempt < 600; attempt += 1) {
        if (await evaluate(expression)) return;
        await delay(100);
      }
      throw Error(`Timed out: ${expression}\n${errors.join("\n")}`);
    };
    const click = async selector => {
      const point = await evaluate(`(() => {
        const button = document.querySelector(${JSON.stringify(selector)});
        if (!button || button.disabled) throw Error('Expected an enabled control: ' + ${JSON.stringify(selector)});
        button.scrollIntoView({ block: 'nearest' });
        const rect = button.getBoundingClientRect();
        const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
        if (!button.contains(document.elementFromPoint(x, y))) throw Error('Control is obscured');
        return { x, y };
      })()`);
      await client.send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
      await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
    };
    const rowText = (skill, field) => evaluate(`document.querySelector('[data-skill-row="${skill}"] [data-skill-${field}]').textContent`);
    for (const [width, height] of [[1440, 900], [1280, 591], [844, 390]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      await client.send("Page.navigate", { url: `${address.url}/__benchmark__/?scenario=A&visualMarches=0` });
      await wait('document.documentElement?.dataset.crownlandsBenchmarkReady === "true"');
      await evaluate(`(() => {
        const fixture = document.createElement('script');
        fixture.src = 'docs/visual-qa/skills-ledger/runtime-fixture.js';
        document.body.append(fixture);
      })()`);
      await wait('document.documentElement?.dataset.skillsRuntimeReady === "true"');
      await evaluate(`(() => {
        updateEconomy = () => {};
        state.character = { ...state.character, level: 100, xp: 17, skillPoints: 9 };
        state.gold = 2000000;
        const oldBuild = { ...createDefaultSkills(), shieldwallDiscipline: 30, marchOrders: 20, guildCharters: 25 };
        state.upgrades = normalizeUpgrades(oldBuild);
        state.skillPresets = normalizeSkillPresets({ modelVersion: 5, activeSlot: 1, slots: [
          { slot: 1, name: 'Veteran', saved: true, upgrades: oldBuild, spentPoints: 90, savedAtMs: 12345 }
        ] });
        reconcileSkillPoints(state.character, state.upgrades);
        skillPresetDrafts.clear();
        selectedSkillPresetSlot = 0;
        skillPresetMarkupSignature = '';
        renderProfileSkills();
      })()`);
      await evaluate("document.fonts.ready");
      await delay(350);
      assert.equal(await evaluate("document.querySelector('[data-skill-points]').textContent"), "24");
      assert.equal(await evaluate("document.querySelector('[data-skill-spent]').textContent"), "75");
      assert.equal(await rowText("shieldwallDiscipline", "rank"), "Lv 30 / 34");
      assert.equal(await rowText("marchOrders", "rank"), "Lv 20 / 20");
      assert.equal(await rowText("shieldwallDiscipline", "percent"), "+90%");
      assert.equal(await rowText("shieldwallDiscipline", "cost"), "1 PT");
      assert.equal(await rowText("marchOrders", "percent"), "+100%");
      assert.equal(await rowText("marchOrders", "cost"), "MAX");
      assert(await evaluate(`!skillsView.querySelectorAll('.skill-row').length ? false : [...skillsView.querySelectorAll('.skill-row')].every(row => row.scrollWidth <= row.clientWidth + 1)`), "Skill cards overflow horizontally.");
      fs.writeFileSync(path.join(artifacts, `${width}-converted.png`), Buffer.from((await client.send("Page.captureScreenshot", { format: "png" })).data, "base64"));

      for (const [skill, afterRefund] of [["shieldwallDiscipline", "+87%"], ["marchOrders", "+95%"], ["guildCharters", "+48%"]]) {
        await click(`[data-skill-decrement="${skill}"]`);
        assert.equal(await rowText(skill, "percent"), afterRefund);
        assert.equal(await rowText(skill, "cost"), "1 PT");
        assert.equal(await evaluate("state.character.skillPoints"), 25);
        await click(`[data-skill="${skill}"]`);
        assert.equal(await evaluate("state.character.skillPoints"), 24);
        assert.equal(await rowText(skill, "cost"), skill === "shieldwallDiscipline" ? "1 PT" : "MAX");
      }
      assert.equal(await evaluate("state.gold"), 2000000, "Live adjustments spent Gold.");

      await click('[data-skill-preset-slot="1"]');
      assert.equal(await evaluate("document.querySelector('#skillPresetNameInput').value"), "Veteran");
      assert(!await evaluate("document.querySelector('[data-apply-skill-preset]').disabled"), "Converted preset cannot be applied.");
      await click('[data-skill-decrement="marchOrders"]');
      assert.equal(await rowText("marchOrders", "percent"), "+95%");
      assert.equal(await evaluate("state.upgrades.marchOrders"), 20, "Draft editing changed live movement.");
      assert.equal(await evaluate("document.querySelector('[data-skill-points]').textContent"), "25");
      await click('[data-save-skill-preset="1"]');
      await wait("!skillActionInFlight");
      assert.equal(await evaluate("state.skillPresets.slots[0].upgrades.marchOrders"), 19);
      assert.equal(await evaluate("state.gold"), 2000000, "Saving a draft spent Gold.");
      await click('[data-skill-preset-slot="0"]');

      // Exercise the final point of every skill, including the partial 99% -> 100% step.
      const caps = { swordmastery: [50, 100, 98], shieldwallDiscipline: [34, 100, 99],
        stoneworks: [34, 100, 99], taxStewardship: [34, 100, 99], royalGranaries: [34, 100, 99],
        marchOrders: [20, 100, 95], guildCharters: [25, 50, 48], fieldMedics: [25, 50, 48] };
      for (const [skill, [level, cap, before]] of Object.entries(caps)) {
        await evaluate(`state.character.level = ${level + 1}; state.upgrades = { ...createDefaultSkills(), ${skill}: ${level - 1} }; renderProfileSkills()`);
        assert.equal(await rowText(skill, "percent"), `+${before}%`);
        assert.equal(await rowText(skill, "next"), `Next +${cap}%`);
        assert.equal(await rowText(skill, "cost"), "1 PT");
        await click(`[data-skill="${skill}"]`);
        assert.equal(await evaluate("state.character.skillPoints"), 0);
        assert.equal(await evaluate(`getSkillPercent('${skill}')`), cap);
        assert.equal(await rowText(skill, "percent"), `+${cap}%`);
        assert.equal(await rowText(skill, "rank"), `Lv ${level} / ${level}`);
        assert.equal(await rowText(skill, "cost"), "MAX");
        assert(await evaluate(`document.querySelector('[data-skill="${skill}"]').disabled`));
        await click(`[data-skill-decrement="${skill}"]`);
        assert.equal(await evaluate("state.character.skillPoints"), 1);
        assert.equal(await rowText(skill, "percent"), `+${before}%`);
      }
      const maximumBuild = Object.fromEntries(Object.entries(caps).map(([skill, [level]]) => [skill, level]));
      await evaluate(`state.character.level = 257; state.upgrades = ${JSON.stringify(maximumBuild)}; renderProfileSkills()`);
      assert.equal(await evaluate("document.querySelector('[data-skill-spent]').textContent"), "256");
      await evaluate("skillsView.querySelector('.profile-skill-list').scrollTop = 0");
      fs.writeFileSync(path.join(artifacts, `${width}-maximum.png`), Buffer.from((await client.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
      await client.send("Page.navigate", { url: `${address.url}/battle-economy-guide.html` });
      await wait('document.getElementById("cityVictoryPoints")?.textContent !== "0" && document.getElementById("cityGarrisonHelp")?.textContent.includes("applied")');
      for (const [id, maximum] of Object.entries({ taxSkillLevel: 34, granarySkillLevel: 34,
        cityStoneworksLevel: 34, cityShieldwallLevel: 34, battleSwordLevel: 50,
        battleShieldLevel: 34, battleStoneLevel: 34 })) {
        assert.equal(await evaluate(`document.getElementById('${id}').max`), String(maximum));
      }
      await evaluate(`(() => {
        for (const [id, value] of Object.entries({ cityLevelNumber: 50, taxSkillLevel: 34,
          granarySkillLevel: 34, cityStoneworksLevel: 34, cityShieldwallLevel: 34, cityCitadelPackage: '10:10' })) {
          document.getElementById(id).value = value;
        }
        document.getElementById('cityShieldwallLevel').dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('battleSwordLevel').value = 50;
        document.getElementById('battleSwordLevel').dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      assert.equal(await evaluate("document.getElementById('cityShieldwallOutput').textContent"), "Lv 34 · +100%");
      assert.equal(await evaluate("document.getElementById('cityGarrisonDefense').textContent"), "2,730,000");
      assert((await evaluate("document.getElementById('cityGarrisonHelp').textContent")).includes("applied +110%"));
      assert.equal(await evaluate("document.getElementById('battleSwordOutput').textContent"), "Lv 50 · +100%");
      await evaluate("document.fonts.ready");
      await evaluate("document.getElementById('cityGarrisonDefense').scrollIntoView({ block: 'center', behavior: 'instant' })");
      fs.writeFileSync(path.join(artifacts, `${width}-calculator.png`), Buffer.from((await client.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
      console.log(`Skill efficiency UI passed at ${width}x${height}.`);
    }
    assert.deepEqual(errors, []);
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (browser) {
      if (!await waitForProcessExit(browser.browserProcess)) { browser.browserProcess.kill(); await waitForProcessExit(browser.browserProcess); }
      await removeBrowserProfile(browser.profilePath);
    }
    await server.close();
  }
}

main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
