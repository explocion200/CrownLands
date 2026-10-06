"use strict";

// Actual screens and refresh paths with isolated services; no production account.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Set CHROME_PATH to Chromium.");
  const server = createMapBenchmarkServer(), address = await server.listen();
  const output = path.resolve(__dirname, "../release-artifacts/ui-stutter");
  fs.mkdirSync(output, { recursive: true });
  let session, client;
  const errors = [], results = [];
  try {
    session = await startBrowserSession(executable);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all([client.send("Page.enable"), client.send("Runtime.enable")]);
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const evaluate = async expression => {
      const response = await client.send("Runtime.evaluate", { expression: typeof expression === "function" ? `(${expression.toString()})()` : expression, awaitPromise: true, returnByValue: true });
      if (response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
      return response.result.value;
    };
    const ready = async expression => {
      for (let attempt = 0; attempt < 400; attempt++) { if (await evaluate(expression)) return; await delay(100); }
      throw Error(`Timed out: ${expression}\n${errors.join("\n")}`);
    };
    for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 568, height: 320 }]) {
      await client.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1, mobile: false });
      await client.send("Page.navigate", { url: `${address.url}/__benchmark__/?scenario=A&visualMarches=0` });
      await ready("window.__CROWNLANDS_BENCHMARK__?.getStatus().status === 'ready'");
      await evaluate(() => {
        __CROWNLANDS_BENCHMARK__.closeModal(); usesServerEconomyAuthority = () => true;
        state.character.level = 76; setAnimationModePreference("full");
        showProfileScreen(); showProfileSkills();
      });
      await delay(400);
      const skills = await evaluate(() => {
        const button = skillsView.querySelector('[data-skill="swordmastery"]'), row = button.closest("[data-skill-row]");
        button.focus({ preventScroll: true });
        const observer = new MutationObserver(() => {});
        observer.observe(skillsView, { attributes: true, childList: true, subtree: true, characterData: true });
        for (let i = 0; i < 20; i++) renderHudStatusPanels();
        const unchangedMutations = observer.takeRecords().length; observer.disconnect();
        const level = state.upgrades.swordmastery;
        state.upgrades.swordmastery = getSkillMaxLevel("swordmastery"); renderProfileSkills();
        const updated = row.querySelector("[data-skill-rank]").textContent.includes(String(getSkillMaxLevel("swordmastery"))) && button.disabled;
        const retained = row.isConnected && row.querySelector('[data-skill="swordmastery"]') === button && document.activeElement === button;
        state.upgrades.swordmastery = level; renderProfileSkills();
        return { unchangedMutations, updated, retained };
      });
      assert.equal(skills.unchangedMutations, 0, "An unchanged skill tick rewrote the window.");
      assert(skills.updated && skills.retained, "Live skill eligibility or control identity changed.");
      await evaluate("showProfileView()"); await delay(400);
      const profile = await evaluate(() => {
        const totals = [...profileView.querySelectorAll(".profile-production-total,.profile-production-bonus")];
        const label = profileView.querySelector("[data-achievement-label]");
        profileGoldProductionBtn.focus({ preventScroll: true });
        for (let i = 0; i < 20; i++) renderHudStatusPanels();
        const retained = totals.length === 4 && totals.every(node => node.isConnected) && label?.isConnected && document.activeElement === profileGoldProductionBtn;
        const previous = profileGoldStat.textContent, production = profileGoldProductionStat.textContent;
        state.gold += 100000; state.upgrades.taxStewardship += 1; renderProfileScreen();
        const updated = profileGoldStat.textContent !== previous && profileGoldProductionStat.textContent !== production && totals.every(node => node.isConnected);
        profileGoldProductionBtn.click();
        const popup = document.getElementById("profileProductionDialog"), value = document.getElementById("profileProductionTotal");
        const previousValue = value.textContent; state.upgrades.taxStewardship += 10; renderProfileScreen();
        const livePopup = popup.open && value.isConnected && value.textContent !== previousValue;
        popup.close();
        const data = { summary: getKingdomSummary(), xp: state.character.xp, xpRequired: getXpRequiredForLevel(state.character.level), completed: 3, claimable: 2, format: formatNumber };
        CrownlandsPlayerProfileUI.update(data); const badge = profileView.querySelector(".ready-count");
        CrownlandsPlayerProfileUI.update({ ...data, claimable: 3 });
        const liveBadge = badge.isConnected && badge.textContent === "3 Ready" && label.isConnected;
        CrownlandsPlayerProfileUI.update({ ...data, claimable: 0 });
        return { retained, updated, livePopup, liveBadge, clearedBadge: !badge.isConnected && label.isConnected };
      });
      assert(Object.values(profile).every(Boolean), `Profile refresh regression: ${JSON.stringify(profile)}`);
      await evaluate("closeProfileScreen({ force: true });showCityInfoModal(playerCities()[0].id)"); await delay(400);
      const city = await evaluate(() => {
        const panel = modalBody.querySelector(".cd-panel"), wall = panel.querySelector(".fortification-status"), button = panel.querySelector('[data-cd-amount="0"]');
        button.focus({ preventScroll: true });
        for (let i = 0; i < 20; i++) updateVisibleCityDynamicText();
        const retained = wall.isConnected && button.isConnected && document.activeElement === button;
        const city = playerCities()[0]; city.troops += 1234; updateVisibleCityDynamicText();
        return { retained, liveGarrison: panel.querySelector("[data-live-city-garrison]").textContent === cityDetailsNumber(city.troops) };
      });
      assert(city.retained && city.liveGarrison, `City refresh replaced passive walls/controls or lost live troops: ${JSON.stringify(city)}`);
      const screens = [];
      for (const [name, open] of [
        ["City", "showCityInfoModal(playerCities()[0].id)"], ["Help", "showHelpModal()"], ["Shop", "showShopModal()"], ["Bag", "showInventoryModal()"],
        ["Skills", "showProfileScreen();showProfileSkills()"], ["Profile", "showProfileScreen()"],
      ]) {
        await evaluate(`modal.close();closeProfileScreen({force:true});${open}`);
        await ready("!modalBody.querySelector('.optional-ui-loading') && document.documentElement.classList.contains('game-ui-open')");
        const paused = await evaluate(() => getComputedStyle(outgoingAttackBtn).animationPlayState === "paused");
        assert(paused, `${name}: covered alert animation remained active.`); screens.push(name);
      }
      const overlays = await evaluate(async () => {
        const nextTick = () => new Promise(resolve => setTimeout(resolve, 0));
        closeProfileScreen({ force: true }); await nextTick();
        const resumed = !document.documentElement.classList.contains("game-ui-open") && getComputedStyle(outgoingAttackBtn).animationPlayState === "running";
        const nested = document.createElement("dialog"); document.body.append(nested); nested.showModal(); await nextTick();
        const dynamicCovered = document.documentElement.classList.contains("game-ui-open");
        showProfileScreen(); nested.close(); await nextTick();
        const parentCovered = document.documentElement.classList.contains("game-ui-open");
        closeProfileScreen({ force: true }); await nextTick();
        const closed = !document.documentElement.classList.contains("game-ui-open");
        nested.showModal(); await nextTick(); nested.remove(); await nextTick();
        const removalResumed = !document.documentElement.classList.contains("game-ui-open");
        for (const mode of ["reduced", "off", "full"]) { setAnimationModePreference(mode); showProfileScreen(); await nextTick(); closeProfileScreen({ force: true }); await nextTick(); if (getEffectiveAnimationMode() !== mode) throw Error("An overlay changed the player's motion preference"); }
        return { resumed, dynamicCovered, parentCovered, closed, removalResumed };
      });
      assert(Object.values(overlays).every(Boolean), `Overlay lifecycle regression: ${JSON.stringify(overlays)}`);
      await evaluate("showProfileScreen();showProfileSkills()"); await delay(400);
      const screenshot = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(output, `verified-${viewport.width}.png`), Buffer.from(screenshot.data, "base64"));
      results.push({ viewport, skills, profile, city, coveredScreens: screens, overlays });
      console.log(`Stable content, live counters, covered-HUD pause/resume and nested dialogs passed at ${viewport.width}x${viewport.height}.`);
    }
    assert.deepEqual(errors, [], "Unexpected browser errors.");
    fs.writeFileSync(path.join(output, "validation.json"), JSON.stringify({ results, errors }, null, 2) + "\n");
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (session) { if (!await waitForProcessExit(session.browserProcess)) { session.browserProcess.kill(); await waitForProcessExit(session.browserProcess); } await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
