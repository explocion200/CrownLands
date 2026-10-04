"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");

function fixture() {
  CrownlandsCrownPaymentsUI.reset(null);
  sessionStorage.removeItem("crownlands-stripe-test:owner");
  const qa = window.crownQA = { calls: [], popups: [], paid: false, lose: false, blocked: false, latest: null, enabled: true };
  window.open = () => {
    if (qa.blocked) return null;
    const popup = { document: { body: {} }, location: { replace(url) { popup.url = url; } }, close() { popup.closed = true; } };
    qa.popups.push(popup); return popup;
  };
  cosmeticUid = "owner"; cosmeticState = COSMETIC_CATALOG.normalize({ crowns: 2000 }); cosmeticError = "";
  cosmeticOffset = Date.UTC(2026, 9, 12) - Date.now();
  getCurrentOnlineUid = () => "owner";
  qa.api = {
    getUser: () => ({ uid: "owner" }),
    getCosmeticsState: async () => ({ state: cosmeticState, serverNowMs: Date.UTC(2026, 9, 12) }),
    getCrownPaymentCatalog: async () => ({ enabled: qa.enabled, mode: "test", packs: [{ id: "fixture", crowns: 600, amountMinor: 499, currency: "usd" }], latestOrder: qa.latest }),
    createCrownCheckout: async request => {
      qa.calls.push(request);
      qa.latest = { orderId: "a".repeat(64), requestId: request.requestId, packId: "fixture", crowns: 600, amountMinor: 499, currency: "usd", status: "awaiting_payment", mode: "test" };
      if (qa.defer) await new Promise(resolve => { qa.resolve = resolve; });
      if (qa.lose) { qa.lose = false; throw Error("Connection lost. Check the same test order."); }
      return { order: qa.latest, url: qa.badUrl || "https://checkout.stripe.com/c/pay/cs_test_fixture" };
    },
    getCrownCheckoutStatus: async () => ({ order: { ...qa.latest, status: qa.paid ? "confirmed" : "awaiting_payment" } }),
  };
  getOnlineApi = () => qa.api;
  cosmeticCategory = "all"; cosmeticSelected = "halloween_city"; cosmeticOpenShopRequested = true; showShopModal();
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(value => value && fs.existsSync(value));
  assert(executable, "Chromium is required");
  const server = createMapBenchmarkServer(), address = await server.listen();
  const output = path.join(root, "release-artifacts/crown-payments"); fs.mkdirSync(output, { recursive: true });
  let browser, client; const errors = [];
  try {
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await client.send("Runtime.enable"); await client.send("Page.enable");
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const wait = async expression => {
      for (let i = 0; i < 400; i++) {
        if (await evaluate(expression)) return;
        await new Promise(resolve => setTimeout(resolve, 125));
      }
      throw Error("Timed out: " + expression + "; " + JSON.stringify(errors));
    };
    const click = async selector => {
      await wait(`!!document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled`);
      const point = await evaluate(`(() => {
        const e = document.querySelector(${JSON.stringify(selector)});
        e.scrollIntoView({ block: "center", behavior: "instant" });
        const r = e.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        if (hit !== e && !e.contains(hit)) throw Error("Checkout control is obscured: " + e.outerHTML);
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })()`);
      await client.send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
      await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
    };
    const statusContains = text => wait(`document.querySelector('.crown-payments-dialog [role=status]')?.textContent.includes(${JSON.stringify(text)})`);
    await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
    await wait("window.__CROWNLANDS_BENCHMARK__?.getStatus().status === 'ready'");
    for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }]) {
      await client.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1, mobile: false });
      await evaluate(`(${fixture.toString()})()`);
      await click("[data-crown-checkout]");
      assert(await evaluate("document.querySelector('.crown-test-notice').textContent.includes('Sandbox only.')"));
      assert.equal(await evaluate("document.querySelector('[data-crown-pack]').value"), "fixture");
      assert.deepEqual(await evaluate("[document.querySelector('.crown-payments-dialog label'), document.querySelector('[data-crown-pack]')].map(node => getComputedStyle(node).color)"),
        ["rgb(48, 40, 31)", "rgb(48, 40, 31)"], "Game-wide label styling must not make checkout prices unreadable");
      await evaluate("crownQA.blocked = true");
      await click("[data-crown-pay]"); await statusContains("Allow a new tab");
      assert.equal(await evaluate("crownQA.calls.length"), 0);
      await evaluate("crownQA.blocked = false; crownQA.lose = true");
      await click("[data-crown-pay]"); await statusContains("Connection lost");
      await click("[data-crown-pay]");
      await wait("crownQA.calls.length === 2 && !!crownQA.popups.at(-1).url");
      assert.equal(await evaluate("new Set(crownQA.calls.map(call => call.requestId)).size"), 1);
      assert.equal(await evaluate("crownQA.popups.at(-1).opener"), null);
      await click("[data-crown-check]"); await statusContains("Payment has not been confirmed.");
      await evaluate("crownQA.paid = true");
      await click("[data-crown-check]"); await statusContains("Test payment confirmed:");
      assert(await evaluate("document.querySelector('.crown-payments-dialog [role=status]').textContent.includes('playable Crown balance is unchanged')"));
      assert.equal(await evaluate("cosmeticState.crowns"), 2000);
      const bounds = await evaluate("document.querySelector('.crown-payments-dialog').getBoundingClientRect().toJSON()");
      assert(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.height <= viewport.height, "Dialog fits the viewport");
      const screenshot = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(output, `checkout-${viewport.width}.png`), Buffer.from(screenshot.data, "base64"));
      await click("[data-crown-again]");
      await evaluate('crownQA.badUrl = "https://checkout.stripe.com.evil.test/"');
      await click("[data-crown-pay]"); await statusContains("Checkout returned an invalid address.");
      assert.equal(await evaluate("crownQA.popups.at(-1).closed"), true);
      assert.equal(await evaluate("crownQA.popups.at(-1).url"), undefined);
      await evaluate("crownQA.badUrl = null; crownQA.defer = true");
      await click("[data-crown-pay]"); await wait("!!crownQA.resolve");
      await evaluate('CrownlandsCrownPaymentsUI.reset("other-account"); document.querySelector("[data-crown-payments]").replaceChildren(); crownQA.resolve()');
      await wait("crownQA.popups.at(-1).closed === true");
      assert.equal(await evaluate("document.querySelectorAll('.crown-payments-dialog').length"), 0, "Account changes remove purchase details and reject late responses");
      await evaluate('crownQA.enabled = false; CrownlandsCrownPaymentsUI.mount(document.querySelector("[data-crown-payments]"), { uid: "other-account", api: crownQA.api })');
      assert.equal(await evaluate("document.querySelectorAll('[data-crown-checkout]').length"), 0);
      await evaluate("modal.close()");
    }
    assert.deepEqual(errors, []);
    console.log("Crown checkout browser passed in the real Shop at desktop and landscape mobile: sandbox disclosure, blocked popup, lost response, same-order retry, pending/confirmed status, unchanged wallet, hostile URL and account-switch isolation.");
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (browser) { await waitForProcessExit(browser.browserProcess); await removeBrowserProfile(browser.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
