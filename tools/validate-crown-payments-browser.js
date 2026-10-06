"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");

function fixture(mode = "test") {
  CrownlandsCrownPaymentsUI.reset(null);
  sessionStorage.removeItem("crownlands-stripe-test:owner");
  sessionStorage.removeItem("crownlands-stripe-live:owner");
  const qa = window.crownQA = { calls: [], popups: [], paid: false, lose: false, blocked: false, latest: null, enabled: true, mode };
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
    getCrownPaymentCatalog: async () => ({ enabled: qa.enabled, mode: qa.mode, packs: [{ id: "fixture", crowns: 1000, amountMinor: 499, currency: "usd" }], latestOrder: qa.latest }),
    createCrownCheckout: async request => {
      qa.calls.push(request);
      qa.latest = { orderId: "a".repeat(64), requestId: request.requestId, packId: "fixture", crowns: 1000, amountMinor: 499, currency: "usd", status: "awaiting_payment", mode: qa.mode };
      if (qa.defer) await new Promise(resolve => { qa.resolve = resolve; });
      if (qa.lose) { qa.lose = false; throw Error("Connection lost. Check the same test order."); }
      return { order: qa.latest, url: qa.badUrl || "https://checkout.stripe.com/c/pay/cs_test_fixture" };
    },
    getCrownCheckoutStatus: async () => ({ order: { ...qa.latest, status: qa.paid ? "confirmed" : "awaiting_payment" } }),
  };
  if (mode === "live") {
    qa.api.getLiveCrownPaymentCatalog = qa.api.getCrownPaymentCatalog;
    qa.api.createLiveCrownCheckout = qa.api.createCrownCheckout;
    qa.api.getLiveCrownCheckoutStatus = qa.api.getCrownCheckoutStatus;
    qa.api.getCrownPaymentCatalog = async () => { throw Error("Live catalog must use the live callable"); };
    qa.api.createCrownCheckout = async () => { throw Error("Live orders must use the live callable"); };
    qa.api.getCrownCheckoutStatus = async () => { throw Error("Live status must use the live callable"); };
  }
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
    for (const mode of ["test", "live"]) for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }]) {
      await client.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1, mobile: false });
      await evaluate(`(${fixture.toString()})(${JSON.stringify(mode)})`);
      await wait("!!document.querySelector('[data-skins-mode=shop]')");
      assert.equal(await evaluate("document.querySelectorAll('[data-skin-earn],[data-crown-payments]').length"), 0, "Skins no longer hosts earning or checkout buttons");
      assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-rs-section]')].map(tab => tab.dataset.rsSection)"), ["provisions", "skins", "crowns", "rewards"]);
      await click('[data-rs-section="crowns"]');
      await wait("!!document.querySelector('[data-crown-checkout]')");
      assert(await evaluate("(() => { const button = document.querySelector('[data-crown-checkout]'); button.focus(); refreshCosmeticPanels(); return button === document.activeElement && button.isConnected; })()"), "Wallet refreshes preserve the offer and keyboard focus");
      await click('[data-rs-section="crowns"]');
      assert.equal(await evaluate("crownQA.calls.length"), 0, "Opening the tab must not create an order");
      assert.equal(await evaluate("document.querySelector('.crown-pack h2').textContent"), "1,000 Crowns");
      assert.equal(await evaluate("document.querySelector('.crown-pack-price').textContent"), "$4.99 USD");
      assert.equal(await evaluate("document.querySelector('[data-crown-checkout]').textContent"), mode === "live" ? "Buy" : "Test checkout");
      assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-crown-checkout]')).color"), "rgb(255, 255, 255)", "Shop styles preserve the Buy button's readable contrast");
      await evaluate("document.querySelector('.crown-pack img').decode()");
      assert(await evaluate("document.querySelector('.crown-pack img').naturalWidth > 0"), "Existing Crown art loads");
      for (const [key, selected] of [["ArrowLeft", "skins"], ["ArrowRight", "crowns"], ["End", "rewards"], ["ArrowRight", "provisions"], ["ArrowLeft", "rewards"], ["Home", "provisions"]]) {
        await evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true }))`);
        assert.equal(await evaluate("document.activeElement.dataset.rsSection"), selected, "Four-tab keyboard selection and focus");
        assert.equal(await evaluate("modal.querySelector('[role=tabpanel]').getAttribute('aria-labelledby')"), `royalShopTab-${selected}`);
      }
      await click('[data-rs-section="crowns"]');
      await wait("!!document.querySelector('[data-crown-checkout]')");
      await wait("modal.querySelector(':scope > .modal-card').getAnimations().every(a => !a.pending && a.playState !== 'running')");
      const packLayout = await evaluate(`(() => {
        const panel = document.querySelector('.crown-shop'), card = document.querySelector('.crown-pack'), r = card.getBoundingClientRect(), button = card.querySelector('button').getBoundingClientRect();
        return { inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
          noOverflow: panel.scrollWidth <= panel.clientWidth + 1 && panel.scrollHeight <= panel.clientHeight + 1,
          buttonWidth: button.width, buttonHeight: button.height };
      })()`);
      assert(packLayout.inside && packLayout.noOverflow && packLayout.buttonWidth >= 44 && packLayout.buttonHeight >= 44, JSON.stringify(packLayout));
      fs.writeFileSync(path.join(output, `buy-crowns-${mode}-${viewport.width}.png`), Buffer.from((await client.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
      await click("[data-crown-checkout]");
      await evaluate('CrownlandsCrownPaymentsUI.mount(document.querySelector("[data-crown-payments]"), { uid: "owner", api: crownQA.api })');
      if (mode === "test") assert(await evaluate("document.querySelector('.crown-test-notice').textContent.includes('Sandbox only.')"));
      else {
        assert.equal(await evaluate("document.querySelector('.crown-test-notice')"), null);
        assert(await evaluate("document.querySelector('.crown-purchase-notice').textContent.includes('One-time purchase')"));
        assert.equal(await evaluate("document.querySelector('.crown-payments-dialog a[href^=mailto]').getAttribute('href')"), "mailto:crownlandsmail@gmail.com");
      }
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
      await click("[data-crown-check]"); await statusContains(mode === "test" ? "Test payment confirmed:" : "Payment confirmed:");
      if (mode === "test") assert(await evaluate("document.querySelector('.crown-payments-dialog [role=status]').textContent.includes('playable Crown balance is unchanged')"));
      assert.equal(await evaluate("cosmeticState.crowns"), 2000);
      const bounds = await evaluate("document.querySelector('.crown-payments-dialog').getBoundingClientRect().toJSON()");
      assert(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.height <= viewport.height, "Dialog fits the viewport");
      const screenshot = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(output, `checkout-${mode}-${viewport.width}.png`), Buffer.from(screenshot.data, "base64"));
      if (mode === "live") {
        await evaluate("crownQA.latest.reviewRequired = true");
        await click("[data-crown-check]"); await statusContains("manual review");
        await evaluate("crownQA.latest.reviewRequired = false");
      }
      await click("[data-crown-again]");
      await evaluate('crownQA.badUrl = "https://checkout.stripe.com.evil.test/"');
      await click("[data-crown-pay]"); await statusContains("Checkout returned an invalid address.");
      assert.equal(await evaluate("crownQA.popups.at(-1).closed"), true);
      assert.equal(await evaluate("crownQA.popups.at(-1).url"), undefined);
      await evaluate("crownQA.badUrl = null; crownQA.defer = true");
      await click("[data-crown-pay]"); await wait("!!crownQA.resolve");
      await evaluate('CrownlandsCrownPaymentsUI.reset("other-account"); crownQA.resolve()');
      assert.equal(await evaluate("document.querySelectorAll('[data-crown-checkout]').length"), 0, "Account changes clear the previous account's offer");
      await wait("crownQA.popups.at(-1).closed === true");
      assert.equal(await evaluate("document.querySelectorAll('.crown-payments-dialog').length"), 0, "Account changes remove purchase details and reject late responses");
      await evaluate('crownQA.enabled = false; CrownlandsCrownPaymentsUI.mount(document.querySelector("[data-crown-payments]"), { uid: "other-account", api: crownQA.api })');
      await wait("document.querySelector('[data-crown-payments]').textContent.includes('currently unavailable')");
      assert.equal(await evaluate("document.querySelectorAll('[data-crown-checkout]').length"), 0);
      await evaluate('CrownlandsCrownPaymentsUI.mount(document.querySelector("[data-crown-payments]"), { uid: "", api: crownQA.api })');
      assert.equal(await evaluate("document.querySelector('[data-crown-payments]').textContent"), "Sign in to buy Crowns.");
      await evaluate("modal.close()");
    }
    for (const page of [{ file: "support.html", section: "private-support" }, { file: "terms.html", section: "crown-purchases" }, { file: "privacy.html", section: "payments" }]) {
      for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }]) {
        await client.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1, mobile: false });
        // Position the section after fonts load; a URL fragment can trigger a
        // late browser scroll that races the explicit screenshot positioning.
        await client.send("Page.navigate", { url: `${address.url}/${page.file}` });
        await wait(`!!document.getElementById(${JSON.stringify(page.section)}) && document.readyState === 'complete'`);
        await evaluate(`(async () => {
          await document.fonts.ready;
          const target = document.getElementById(${JSON.stringify(page.section)});
          const headerHeight = document.querySelector('.site-header').getBoundingClientRect().height;
          window.scrollTo({ top: window.scrollY + target.getBoundingClientRect().top - headerHeight - 12, behavior: 'instant' });
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        })()`);
        const sectionBounds = await evaluate(`document.getElementById(${JSON.stringify(page.section)}).getBoundingClientRect().toJSON()`);
        assert(sectionBounds.top >= 0 && sectionBounds.top < viewport.height / 2, `Payment policy heading is visible: ${page.file} ${viewport.width} ${JSON.stringify(sectionBounds)}`);
        const section = await evaluate(`document.getElementById(${JSON.stringify(page.section)}).textContent`);
        assert(section.includes("crownlandsmail@gmail.com"));
        assert(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "Payment policy has no horizontal overflow");
        const screenshot = await client.send("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(path.join(output, `${page.section}-${viewport.width}.png`), Buffer.from(screenshot.data, "base64"));
      }
    }
    assert.deepEqual(errors, []);
    console.log("Crown checkout browser passed at desktop and landscape mobile: dedicated Buy Crowns tab, server-priced Crown card, keyboard tabs, removed Earn Crowns, live/test disclosure, manual review, blocked popup, same-order recovery, status, unchanged wallet, hostile URL and account-switch isolation.");
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (browser) { await waitForProcessExit(browser.browserProcess); await removeBrowserProfile(browser.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
