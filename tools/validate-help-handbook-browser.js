"use strict";
// Actual game entry in the isolated benchmark; all account state is synthetic.
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
  const artifacts = path.resolve(__dirname, "../release-artifacts/help-handbook-game");
  fs.mkdirSync(artifacts, { recursive: true });
  let browser, client;
  const errors = [];
  try {
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(t => t.type === "page").webSocketDebuggerUrl);
    await Promise.all(["Page.enable", "Runtime.enable"].map(method => client.send(method)));
    client.on("Runtime.exceptionThrown", e => errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
    const evaluate = async expression => {
      const r = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const ready = async expression => {
      for (let i = 0; i < 800; i++) { if (await evaluate(expression)) return; await delay(75); }
      throw Error("Timed out: " + expression);
    };
    const screenshot = async name => fs.writeFileSync(path.join(artifacts, name + ".png"), Buffer.from((await client.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: height < 600 });
      await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
      await ready('document.documentElement?.dataset.crownlandsBenchmarkReady === "true"');
      await evaluate(`window.__CROWNLANDS_BENCHMARK__.closeModal();saveOnboardingPrefs({enabled:false,dismissed:[]});document.querySelector('#helpBtn').click()`);
      await ready('document.querySelector("#modalBody")?.dataset.helpReady === "true"');
      for (const chapter of ["first-steps", "cities", "combat", "clans", "items"]) {
        await evaluate(`document.querySelector('[data-chapter="${chapter}"]').click()`);
        await ready('Array.from(document.images).every(img => img.complete)');
        const geometry = await evaluate(`(() => {
          const dialog = document.querySelector('#modal'), reading = document.querySelector('#readingScroll');
          const bounds = dialog.getBoundingClientRect();
          const visible = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; };
          return { fit: bounds.top >= 0 && bounds.bottom <= innerHeight && bounds.left >= 0 && bounds.right <= innerWidth,
            overflow: dialog.scrollWidth > dialog.clientWidth + 1 || reading.scrollWidth > reading.clientWidth + 1,
            footer: visible('#backToGame') && visible('#tips'), search: visible('#search'),
            broken: Array.from(document.images).filter(img => !img.naturalWidth).map(img => img.src),
            topics: document.querySelectorAll('.topic-card').length,
            active: document.querySelector('[aria-current="page"]').dataset.chapter };
        })()`);
        assert(geometry.fit && !geometry.overflow && geometry.footer && geometry.search, JSON.stringify({ width, height, chapter, ...geometry }));
        assert.deepEqual(geometry.broken, []);
        assert.equal(geometry.active, chapter);
        assert.equal(geometry.topics, chapter === "first-steps" ? 5 : 4);
        await screenshot(`${width}x${height}-${chapter}`);
        const reachable = await evaluate(`(() => { const reading = document.querySelector('#readingScroll'); reading.scrollTop = reading.scrollHeight; const card = document.querySelector('.topic-card:last-child'); const r = card.getBoundingClientRect(), view = reading.getBoundingClientRect(); return r.bottom <= view.bottom + 1 && r.bottom > view.top; })()`);
        assert(reachable, "Last topic must be reachable through the reading pane.");
        await evaluate(`document.querySelector('details').open = true`);
        await delay(30);
        assert(await evaluate(`document.querySelector('details').open`));
      }
      // Search must work across chapters and expose the conditional retaliation rule.
      await evaluate(`document.querySelector('#search').value='reconquer';document.querySelector('#search').dispatchEvent(new Event('input'))`);
      assert(await evaluate(`document.querySelectorAll('.topic-card').length > 0 && /retaliation/i.test(document.querySelector('#article').textContent)`));
      await evaluate(`document.querySelector('#search').value='shield';document.querySelector('#search').dispatchEvent(new Event('input'))`);
      assert(await evaluate(`document.querySelectorAll('.topic-card').length > 1`));
      await screenshot(`${width}x${height}-search`);
      await evaluate(`document.querySelector('#search').value='<img src=x onerror=alert(1)>';document.querySelector('#search').dispatchEvent(new Event('input'))`);
      assert(await evaluate(`document.querySelectorAll('.topic-card').length === 0 && !document.querySelector('#article img[onerror]')`));
      await evaluate(`document.querySelector('#clearSearch').click()`);
      assert.equal(await evaluate(`document.querySelector('[aria-current="page"]').dataset.chapter`), "items");
      await evaluate(`document.querySelector('#tips').click()`);
      assert.equal(await evaluate(`document.querySelector('#tips').getAttribute('aria-pressed')`), "true");
      assert(await evaluate(`getOnboardingPrefs().enabled && getOnboardingPrefs().dismissed.length === 0`));
      await evaluate(`document.querySelector('[data-chapter="items"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}))`);
      assert.equal(await evaluate(`document.activeElement.dataset.chapter`), "first-steps");
      // Expanded explanations and the reader's scroll position survive chapter changes.
      await evaluate(`document.querySelector('details').open=true`);
      await delay(30);
      const savedScroll = await evaluate(`document.querySelector('#readingScroll').scrollTop=120;document.querySelector('#readingScroll').scrollTop`);
      await evaluate(`document.querySelector('[data-chapter="clans"]').click();document.querySelector('[data-chapter="first-steps"]').click()`);
      assert.equal(await evaluate(`document.querySelector('#readingScroll').scrollTop`), savedScroll);
      assert(await evaluate(`document.querySelector('details').open`));
      const target = await evaluate(`document.querySelector('[data-related]').dataset.related`);
      await evaluate(`document.querySelector('[data-related]').click()`);
      assert.equal(await evaluate(`document.querySelector('[aria-current="page"]').dataset.chapter`), target);
      await evaluate(`document.querySelector('#backToGame').click()`);
      assert.equal(await evaluate(`document.querySelector('#modal').open`), false);
      await delay(50);
      await evaluate(`document.querySelector('#helpBtn').click()`);
      assert.equal(await evaluate(`document.querySelector('#tips').getAttribute('aria-pressed')`), 'true');
      assert.equal(await evaluate(`document.querySelector('#modal').open`), true);
      console.log(`Game Help ${width}x${height}: all five chapters, artwork, scrolling, search, keyboard navigation, tips and close/reopen passed.`);
    }
    // Stale Help from a previous account must not write preferences for the new user.
    assert(await evaluate(`(() => {
      const original=getOnlineRequestScope, before=JSON.stringify(getOnboardingPrefs());
      getOnlineRequestScope=()=>original()+'-other';
      try {document.querySelector('#tips').click();} finally {getOnlineRequestScope=original;}
      return JSON.stringify(getOnboardingPrefs())===before;
    })()`));
    await evaluate(`document.querySelector('#tips').click()`);
    assert.equal(await evaluate(`getOnboardingPrefs().enabled`), false);
    await evaluate(`modal.close()`);await delay(50);
    assert.equal(await evaluate(`modal.classList.contains('help-handbook-modal')`), false);
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
main().catch(error => { console.error(error); process.exitCode = 1; });
