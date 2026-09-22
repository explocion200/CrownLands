"use strict";
// Local design fixture only; no accounts, saved preferences, or backend calls.
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
  const artifacts = path.resolve(__dirname, "../release-artifacts/help-first-steps-draft");
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
      for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await delay(75); }
      throw Error("Timed out: " + expression);
    };
    const screenshot = async name => fs.writeFileSync(path.join(artifacts, name + ".png"), Buffer.from((await client.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
    for (const [width, height] of [[1440, 900], [844, 390], [568, 320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: height < 600 });
      await client.send("Page.navigate", { url: address.url + "/docs/visual-qa/help-first-steps/preview.html" });
      await ready('document.documentElement?.dataset.helpReady === "true"');
      for (const chapter of ["first-steps", "cities", "combat", "clans", "items"]) {
        await evaluate(`document.querySelector('[data-chapter="${chapter}"]').click()`);
        await ready('Array.from(document.images).every(img => img.complete)');
        const geometry = await evaluate(`(() => {
          const dialog = document.querySelector('#helpDialog'), reading = document.querySelector('#readingScroll');
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
      assert(await evaluate(`document.querySelector('#liveStatus').textContent.includes('preview only')`));
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
      assert.equal(await evaluate(`document.querySelector('#helpDialog').open`), false);
      await evaluate(`document.querySelector('#reopen').click()`);
      assert.equal(await evaluate(`document.querySelector('#helpDialog').open`), true);
      console.log(`Help draft ${width}x${height}: all five chapters, artwork, scrolling, search, keyboard navigation, tips and close/reopen passed.`);
    }
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await client.send("Page.navigate", { url: address.url + "/docs/visual-qa/help-first-steps/index.html?viewport=landscape&chapter=combat" });
    await ready(`document.querySelector('#preview')?.contentDocument?.documentElement.dataset.helpReady === 'true'`);
    await ready(`document.querySelector('#preview').contentDocument.querySelector('[aria-current="page"]').dataset.chapter === 'combat'`);
    await evaluate(`document.querySelector('#chapter').value='clans';document.querySelector('#chapter').dispatchEvent(new Event('change'))`);
    await ready(`document.querySelector('#preview').contentDocument.querySelector('[aria-current="page"]').dataset.chapter === 'clans'`);
    await screenshot("review-landscape");
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
