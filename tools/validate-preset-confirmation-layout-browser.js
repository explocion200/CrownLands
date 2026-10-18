"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const executable = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Set CHROME_PATH to a Chromium browser.");
  const server = createMapBenchmarkServer(), address = await server.listen();
  const artifacts = path.resolve(__dirname, "../release-artifacts/preset-confirmation-layout");
  fs.mkdirSync(artifacts, { recursive: true });
  const errors = [], evidence = [];
  let browser, client;
  try {
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
      for (let i = 0; i < 600; i++) {
        if (await evaluate(expression)) return;
        await delay(100);
      }
      throw Error(`Timed out: ${expression}\n${errors.join("\n")}`);
    };
    await client.send("Page.navigate", { url: `${address.url}/__benchmark__/?scenario=A&visualMarches=0` });
    await wait('document.documentElement?.dataset.crownlandsBenchmarkReady === "true"');
    await evaluate(`(() => {
      const fixture = document.createElement('script');
      fixture.src = 'docs/visual-qa/skills-ledger/runtime-fixture.js';
      document.body.append(fixture);
    })()`);
    await wait('document.documentElement?.dataset.skillsRuntimeReady === "true"');
    // Visited screens keep their optional styles loaded for the rest of a session.
    await evaluate(`Promise.all([...document.querySelectorAll('link[rel="crownlands-optional-stylesheet"]')].map(link => new Promise((resolve, reject) => {
      link.onload = resolve; link.onerror = () => reject(Error('Unable to load ' + link.href)); link.rel = 'stylesheet';
    })))`);
    await evaluate(`(() => {
      getCurrentOnlineUid = () => 'preset-layout-fixture';
      cosmeticUid = getCurrentOnlineUid();
      cosmeticState = { crowns: 1500, revision: 1 };
      window.presetLayoutResult = null;
    })()`);
    await evaluate("document.fonts.ready");
    for (const [width, height] of [[1920, 1080], [1440, 900], [1280, 591], [960, 540], [844, 390], [568, 320], [390, 844]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      for (const action of ["cancel", "accept", "retry", "close"]) {
        const retry = action === "retry";
        // Resolve only the real confirmation dialog: no apply handler or live purchase is called.
        await evaluate(`window.presetLayoutResult = null; void confirmSkillPresetAction(1, ${retry}).then(value => { window.presetLayoutResult = value; });`);
        await delay(400);
        const layout = await evaluate(`(() => {
          const bounds = node => { const r = node.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, bottom:r.bottom, right:r.right }; };
          const card = bounds(modal.querySelector('.modal-card'));
          const body = bounds(modalBody);
          const allocation = modalBody.querySelector('.skill-preset-allocation');
          const controls = [...modal.querySelectorAll('[data-skill-preset-confirm], #closeModalBtn')].map(node => {
            const r = bounds(node), x = r.x + r.width/2, y = r.y + r.height/2;
            return { action:node.dataset.skillPresetConfirm || 'close', ...r, xCenter:x, yCenter:y,
              visible:r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && r.bottom <= card.bottom,
              usable:!node.disabled && node.contains(document.elementFromPoint(x,y)) };
          });
          return { card, body, controls, text:modalBody.textContent,
            allocation:bounds(allocation), scrollHeight:allocation.scrollHeight, clientHeight:allocation.clientHeight,
            balance:bounds(modalBody.querySelector('.skill-preset-confirmation > p:last-of-type')),
            bodyOverflow:modalBody.scrollHeight > modalBody.clientHeight + 1,
            horizontalOverflow:modalBody.scrollWidth > modalBody.clientWidth + 1 };
        })()`);
        evidence.push({ width, height, action, ...layout });
        if (action === "accept" || retry) fs.writeFileSync(path.join(artifacts, `${width}-${height}-${retry ? 'retry' : 'apply'}.png`), Buffer.from((await client.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
        assert.equal(layout.controls.length, 3);
        assert(layout.controls.every(button => button.visible && button.usable && button.height >= 44), `Controls clipped at ${width}x${height}, retry=${retry}: ${JSON.stringify(layout)}`);
        assert(!layout.bodyOverflow && !layout.horizontalOverflow, `Dialog body clips content at ${width}x${height}: ${JSON.stringify(layout)}`);
        assert(layout.allocation.height > 30, "Allocation must retain a usable scroll area.");
        assert(layout.balance.height >= 25 && layout.balance.height < 80 && layout.balance.bottom <= layout.allocation.y + 1, `The balance/retry text must neither collapse nor expand into empty space at ${width}x${height}.`);
        if (width >= 960) assert(layout.card.height < 520, "Desktop confirmation should fit its content without a large empty gap.");
        assert(layout.text.includes("10 Crowns"));
        assert(layout.text.includes(retry ? "not be charged again" : "After Apply:"));
        if (layout.scrollHeight > layout.clientHeight + 1) {
          assert(await evaluate(`(() => {
            const list = modalBody.querySelector('.skill-preset-allocation');
            list.scrollTop = list.scrollHeight;
            return list.scrollTop > 0 && list.scrollTop + list.clientHeight >= list.scrollHeight - 1;
          })()`), "The full allocation must remain reachable by scrolling.");
        }
        // No scrollIntoView: it can scroll overflow:hidden ancestors and hide this regression.
        const control = layout.controls.find(button => button.action === (retry ? "accept" : action));
        const point = { x: control.xCenter, y: control.yCenter };
        await client.send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
        await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
        await wait("window.presetLayoutResult !== null");
        assert.equal(await evaluate("window.presetLayoutResult"), retry || action === "accept");
        assert.equal(await evaluate("modal.open"), false);
        assert.equal(await evaluate("cosmeticState.crowns"), 1500);
      }
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(artifacts, "layout.json"), JSON.stringify(evidence, null, 2));
    console.log("Preset confirmation: visible, clickable controls and scrollable allocations at seven desktop/mobile sizes, including payment retries; no Crowns spent.");
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (browser) {
      if (!await waitForProcessExit(browser.browserProcess)) { browser.browserProcess.kill(); await waitForProcessExit(browser.browserProcess); }
      await removeBrowserProfile(browser.profilePath);
    }
    await server.close();
  }
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
