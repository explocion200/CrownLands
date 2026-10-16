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
    if (qa.popupMode === "open-error") throw new DOMException("New tabs unavailable", "SecurityError");
    const popup = { document: { body: {} }, location: { replace(url) {
      if (qa.popupMode === "navigate-error") throw new DOMException("Detached tab", "SecurityError");
      if (qa.popupMode !== "ignored-navigation") popup.url = url;
    } }, close() { popup.closed = true; } };
    if (qa.popupMode === "setup-error") Object.defineProperty(popup, "document", { get() { throw new DOMException("Detached tab", "SecurityError"); } });
    if (qa.popupMode === "closed") popup.closed = true;
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
      return { order: qa.latest, url: qa.badUrl || `https://checkout.stripe.com/c/pay/cs_${qa.mode}_fixture` };
    },
    getCrownCheckoutStatus: async () => ({ order: { ...qa.latest, status: qa.expired ? "expired" : qa.paid ? "confirmed" : "awaiting_payment" } }),
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

function shopFrame() {
  return [".rs-shop-shell", ".rs-shop-header", ".rs-shop-heading h1", ".rs-shop-seal", "#royalShopSections", "#royalShopCatalogPanel", "#closeModalBtn", ...["provisions", "skins", "crowns", "rewards"].map(id => `[data-rs-section="${id}"]`)].map(selector => {
    const node = modal.querySelector(selector), rect = node.getBoundingClientRect(), style = getComputedStyle(node);
    return { selector, x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      fontFamily: style.fontFamily, fontSize: style.fontSize, lineHeight: style.lineHeight,
      label: node.hasAttribute("data-rs-section") ? node.textContent : null };
  });
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
      // Auto mode settles asynchronously after resizing; keep each tab comparison in one motion mode.
      await evaluate(`setAnimationModePreference(${JSON.stringify(viewport.width < 900 ? "reduced" : "full")})`);
      await evaluate(`(${fixture.toString()})(${JSON.stringify(mode)})`);
      await wait("!!document.querySelector('[data-skins-mode=shop]')");
      assert.equal(await evaluate("document.querySelectorAll('[data-skin-earn],[data-crown-payments]').length"), 0, "Skins no longer hosts earning or checkout buttons");
      assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-rs-section]')].map(tab => tab.dataset.rsSection)"), ["provisions", "skins", "crowns", "rewards"]);
      await evaluate("document.fonts.ready");
      await wait("modal.querySelector(':scope > .modal-card').getAnimations().every(a => !a.pending && a.playState !== 'running')");
      let commonFrame;
      for (const section of ["provisions", "skins", "crowns", "rewards"]) {
        await click(`[data-rs-section="${section}"]`);
        const frame = await evaluate(`(${shopFrame.toString()})()`);
        if (commonFrame) assert.deepEqual(frame, commonFrame, `${section} must preserve the same Shop frame, header, tabs and typography at ${viewport.width}`);
        else commonFrame = frame;
        assert.equal(await evaluate("modal.querySelector('.rs-shop-heading p').textContent"), "The royal market");
        assert(await evaluate("(() => { const balance = modal.querySelector('[data-shop-balance]'); balance.textContent = 'stale'; patchRoyalShopSelection(); return balance.textContent === formatNumber(getProjectedGold()); })()"), "Gold balance refreshes on every tab");
        if (mode === "live") {
          await evaluate("Promise.all([...modal.querySelectorAll('img')].map(img => img.decode()))");
          fs.writeFileSync(path.join(output, `shared-shop-${section}-${viewport.width}.png`), Buffer.from((await client.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
        }
      }
      await click('[data-rs-section="crowns"]');
      await wait("!!document.querySelector('[data-crown-checkout]')");
      assert(await evaluate("(() => { const button = document.querySelector('[data-crown-checkout]'); button.focus(); refreshCosmeticPanels(); return button === document.activeElement && button.isConnected; })()"), "Wallet refreshes preserve the offer and keyboard focus");
      await click('[data-rs-section="crowns"]');
      assert.equal(await evaluate("crownQA.calls.length"), 0, "Opening the tab must not create an order");
      assert.equal(await evaluate("document.querySelector('.crown-pack h2').textContent"), "1,000 Crowns");
      assert.equal(await evaluate("document.querySelector('.crown-pack-price').textContent"), "$4.99 USD");
      assert.equal(await evaluate("document.querySelector('[data-crown-checkout]').textContent"), mode === "live" ? "Buy" : "Test checkout");
      assert.deepEqual(await evaluate("(() => { const css = getComputedStyle(document.querySelector('[data-crown-checkout]')); return [css.color, css.backgroundColor]; })()"),
        ["rgb(244, 230, 197)", "rgb(114, 54, 58)"], "The Buy button uses the shared cream-on-burgundy primary action");
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
        ["rgb(53, 43, 32)", "rgb(53, 43, 32)"], "Game-wide label styling must not make checkout prices unreadable");
      const checkoutLinks = async () => {
        await wait("!!document.querySelector('[data-crown-open]')");
        const links = await evaluate(`['[data-crown-open]', '[data-crown-same-tab]'].map(selector => {
          const link = document.querySelector(selector), r = link.getBoundingClientRect();
          return { href: link.href, target: link.target, rel: link.rel, referrerPolicy: link.referrerPolicy,
            visible: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, height: r.height };
        })`);
        assert(links.every(link => link.href === `https://checkout.stripe.com/c/pay/cs_${mode}_fixture` && link.visible && link.height >= 44), "Both real links stay visible without scrolling, including after a lost popup");
        assert.equal(links[0].target, "_blank"); assert.equal(links[0].rel, "noopener noreferrer");
        assert.equal(links[1].target, ""); assert.equal(links[1].referrerPolicy, "no-referrer");
        assert.equal(await evaluate("sessionStorage.getItem('crownlands-stripe-' + crownQA.mode + ':owner').includes('checkout.stripe.com')"), false, "Payment URLs are not persisted in browser storage");
        assert.equal(await evaluate("!!document.querySelector('[data-crown-pay]')"), false, "Ready checkout uses the existing order link instead of creating another request");
      };
      const reopen = async () => {
        await evaluate('CrownlandsCrownPaymentsUI.reset(null); CrownlandsCrownPaymentsUI.mount(document.querySelector("[data-crown-payments]"), { uid: "owner", api: crownQA.api })');
        await click("[data-crown-checkout]");
      };
      await evaluate("crownQA.blocked = true");
      await click("[data-crown-pay]"); await checkoutLinks();
      assert.equal(await evaluate("crownQA.calls.length"), 1, "Blocked popups still prepare the recoverable order without charging it");
      assert.equal(await evaluate("crownQA.popups.length"), 0);
      fs.writeFileSync(path.join(output, `checkout-ready-${mode}-${viewport.width}.png`), Buffer.from((await client.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
      await reopen();
      await evaluate("crownQA.blocked = false; crownQA.lose = true");
      await click("[data-crown-pay]"); await statusContains("Connection lost");
      await click("[data-crown-pay]");
      await wait("crownQA.calls.length === 3 && !!crownQA.popups.at(-1).url");
      await checkoutLinks();
      assert.equal(await evaluate("new Set(crownQA.calls.map(call => call.requestId)).size"), 1);
      assert.equal(await evaluate("crownQA.popups.at(-1).opener"), null);
      for (const popupMode of ["open-error", "setup-error", "navigate-error", "closed", "ignored-navigation"]) {
        await reopen(); await evaluate(`crownQA.popupMode = ${JSON.stringify(popupMode)}`);
        await click("[data-crown-pay]"); await checkoutLinks();
        assert.equal(await evaluate("new Set(crownQA.calls.map(call => call.requestId)).size"), 1, "Every recovery uses the same order");
      }
      await evaluate("crownQA.popupMode = null");
      await click("[data-crown-check]"); await statusContains("Your payment form is ready.");
      await checkoutLinks();
      await evaluate("crownQA.expired = true");
      await click("[data-crown-check]"); await statusContains("checkout expired.");
      assert.equal(await evaluate("document.querySelectorAll('[data-crown-open],[data-crown-same-tab]').length"), 0, "Expired orders lose their payment links");
      await evaluate("crownQA.expired = false");
      await click("[data-crown-again]");
      await click("[data-crown-pay]"); await checkoutLinks();
      await evaluate("crownQA.paid = true");
      await click("[data-crown-check]"); await statusContains(mode === "test" ? "Test payment confirmed:" : "Payment confirmed:");
      if (mode === "test") assert(await evaluate("document.querySelector('.crown-payments-dialog [role=status]').textContent.includes('playable Crown balance is unchanged')"));
      assert.equal(await evaluate("cosmeticState.crowns"), 2000);
      assert.equal(await evaluate("document.querySelectorAll('[data-crown-open],[data-crown-same-tab]').length"), 0, "Confirmed orders lose their payment links");
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
      assert.equal(await evaluate("document.querySelectorAll('[data-crown-open],[data-crown-same-tab]').length"), 0, "An unsafe URL is never rendered as a payment link");
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
    // Exercise a real browser link navigation, not window.open or a mocked
    // location setter. Fulfill at the request stage so Stripe is never contacted.
    await evaluate(`(${fixture.toString()})("live")`);
    await click('[data-rs-section="crowns"]'); await click('[data-crown-checkout]');
    await evaluate("crownQA.blocked = true"); await click('[data-crown-pay]');
    await wait("!!document.querySelector('[data-crown-same-tab]')");
    const navigations = [];
    const stopIntercept = client.on("Fetch.requestPaused", event => {
      navigations.push(event.request.url);
      void client.send("Fetch.fulfillRequest", { requestId: event.requestId, responseCode: 200,
        responseHeaders: [{ name: "Content-Type", value: "text/html" }],
        body: Buffer.from('<!doctype html><title>Simulated payment form</title><link rel="icon" href="data:,"><p id="checkout-fixture">No provider request or payment was made.</p>').toString('base64') }).catch(error => errors.push(error.message));
    });
    await client.send("Fetch.enable", { patterns: [{ urlPattern: "https://checkout.stripe.com/*", requestStage: "Request" }] });
    await click('[data-crown-same-tab]');
    await wait("!!document.querySelector('#checkout-fixture')");
    assert.deepEqual(navigations, ["https://checkout.stripe.com/c/pay/cs_live_fixture"]);
    assert.equal(await evaluate("location.href"), navigations[0], "Same-tab recovery reaches the payment form even when window.open is blocked");
    await client.send("Fetch.disable"); stopIntercept();
    for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }]) {
      await client.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1, mobile: false });
      await client.send("Page.navigate", { url: address.url + "/crown-payment-return.html" });
      await wait("document.readyState === 'complete' && !!document.querySelector('[data-crown-open]')");
      assert.equal(await evaluate("document.querySelector('[data-crown-open]').href"), "https://playcrownlands.com/play/");
      assert(await evaluate("document.body.textContent.includes('does not confirm payment') && document.body.textContent.includes('not entered payment details')"), "Cancel/return never claims payment and explains how to resume checkout");
      assert(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"));
      fs.writeFileSync(path.join(output, `checkout-return-${viewport.width}.png`), Buffer.from((await client.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
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
    console.log("Crown checkout browser passed at desktop and landscape mobile: consistent Shop, live/test disclosure, visible same-order checkout links for blocked/detached/closed/lost tabs, same-tab return, retry recovery, status, unchanged wallet, hostile URL and account-switch isolation.");
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (browser) { await waitForProcessExit(browser.browserProcess); await removeBrowserProfile(browser.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
