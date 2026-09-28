"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "release-artifacts/illustrated-login");
// Exercise the real markup/CSS with deterministic account states. Authentication
// interactions are covered separately by validate-email-auth-browser.js.
const fixtureHtml = fs.readFileSync(path.join(root, "index.html"), "utf8")
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

async function main() {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const target = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      response.writeHead(404).end(); return;
    }
    const mime = { ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png" };
    response.writeHead(200, { "content-type": mime[path.extname(target)] || "application/octet-stream", "cache-control": "no-store" });
    if (target === path.join(root, "index.html")) response.end(fixtureHtml);
    else fs.createReadStream(target).pipe(response);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser, client;
  const report = [];
  try {
    fs.mkdirSync(output, { recursive: true });
    const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
    assert(executable, "Set CHROME_PATH to Chromium.");
    browser = await startBrowserSession(executable);
    client = await CdpClient.connect(browser.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable"); await client.send("Runtime.enable"); await client.send("Network.enable");
    await client.send("Network.setCacheDisabled", { cacheDisabled: true });
    await client.send("Network.setBlockedURLs", { urls: ["*cloudfunctions.net*", "*firebaseio.com*", "*playcrownlands.com*"] });
    const errors = [], requests = [];
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.text));
    client.on("Network.requestWillBeSent", event => requests.push(event.request.url));
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const capture = async name => {
      const image = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      fs.writeFileSync(path.join(output, name + ".png"), Buffer.from(image.data, "base64"));
    };
    const viewports = [
      [1920, 1080], [1440, 900], [844, 390], [667, 375], [568, 320],
      [390, 844], [320, 568], [844, 260],
    ];
    for (const [width, height] of viewports) {
      await client.send("Page.navigate", { url: "about:blank" });
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: width < 900 ? 2 : 1, mobile: width < 900 });
      requests.length = 0;
      await client.send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/` });
      for (let attempt = 0; attempt < 150; attempt++) {
        if (await evaluate('document.readyState === "complete" && document.querySelector(".login-background img")?.naturalWidth > 0')) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      await evaluate("document.fonts.ready");
      const artRequests = requests.filter(url => /login-(?:kingdom|background)-/.test(url));
      assert.equal(artRequests.length, 1, `${width}: preload and picture must share one selected request.`);
      assert(artRequests[0].includes(width <= 900 && width > height ? "login-kingdom-960-" : "login-kingdom-1672-"));
      for (const state of ["signed-out", "signed-in", "loading", "queued", "verification", "long-name", "install"]) {
        await evaluate(`(() => {
          const state = ${JSON.stringify(state)}, byId = id => document.getElementById(id);
          const signedIn = ['signed-in','loading','queued','long-name'].includes(state);
          byId('setupScreen').classList.add('visible');
          byId('setupScreen').classList.toggle('loading', state === 'loading');
          byId('menuLoadingWheel').hidden = state !== 'loading';
          byId('onlineStatusText').textContent = signedIn ? 'Signed in: ' + (state === 'long-name' ? 'AlexandertheGreatRulerOfTheNorthernMountainKingdom' : 'Aldric') : state === 'verification' ? 'Verify your email' : 'Sign in to play';
          byId('onlineStatusDetail').textContent = state === 'queued' ? 'The realm is full. Your place in the queue is saved.' : signedIn ? 'The Crown Marches is ready. Press Enter Kingdom.' : 'Use Google or email to load your kingdom.';
          byId('serverRealmList').hidden = !signedIn;
          byId('serverQueueStatus').hidden = state !== 'queued';
          byId('googleSignInBtn').hidden = signedIn || state === 'verification';
          byId('emailSignInBtn').hidden = signedIn || state === 'verification';
          byId('emailSignInBtn').disabled = false;
          byId('installAppBtn').hidden = state !== 'install';
          byId('googleSignOutBtn').hidden = !signedIn && state !== 'verification';
          byId('enterKingdomBtn').hidden = !signedIn;
          byId('enterKingdomBtn').disabled = ['loading','queued'].includes(state);
          byId('enterKingdomBtn').textContent = state === 'loading' ? 'Entering...' : 'Enter Kingdom';
          byId('emailVerificationPanel').hidden = state !== 'verification';
          byId('emailVerificationDetail').textContent = 'Open the verification link in your email, then return here to continue.';
          byId('setupScreen').scrollTop = 0;
        })()`);
        const layout = await evaluate(`(() => {
          const screen = document.getElementById('setupScreen');
          const rect = el => { const r = el.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right }; };
          return { screen:rect(screen), art:rect(document.querySelector('.login-background img')), title:rect(document.querySelector('.login-branding h1')), card:rect(document.querySelector('.setup-card')), width:screen.clientWidth, scrollWidth:screen.scrollWidth, scrollHeight:screen.scrollHeight, height:screen.clientHeight, rotate:getComputedStyle(document.querySelector('.rotate-warning')).display, backdrop:getComputedStyle(document.querySelector('.setup-card')).backdropFilter, oldPanel:!!document.querySelector('.login-game-info') };
        })()`);
        assert.equal(layout.screen.width, width); assert.equal(layout.screen.height, height);
        assert.equal(layout.art.width, width); assert.equal(layout.art.height, height);
        assert(layout.scrollWidth <= layout.width + 1, `${width}/${state}: horizontal overflow`);
        assert(layout.title.y >= 0, `${width}/${state}: title clipped above scroll origin`);
        assert(layout.title.x >= 0 && layout.title.right <= width, `${width}/${state}: title clipped horizontally`);
        assert(layout.card.x >= 0 && layout.card.right <= width, `${width}/${state}: card clipped horizontally`);
        assert.equal(layout.rotate, "none"); assert.equal(layout.backdrop, "none"); assert.equal(layout.oldPanel, false);
        await capture(`${width}x${height}-${state}`);
        // Every visible control must remain scroll-reachable and hit-testable,
        // including longer names, verification messages, and keyboard height.
        await evaluate(`document.querySelectorAll('[data-login-qa]').forEach(el=>delete el.dataset.loginQa)`);
        const controls = await evaluate(`Array.from(document.querySelectorAll('#setupScreen button, #setupScreen a')).filter(el=>!el.disabled && el.getBoundingClientRect().height>0).map((el,i)=>{el.dataset.loginQa=String(i);return {i,button:el.tagName==='BUTTON'};})`);
        for (const control of controls) {
          const hit = await evaluate(`(() => {
            const el=document.querySelector('[data-login-qa="${control.i}"]');
            el.scrollIntoView({block:'center'});
            const r=el.getBoundingClientRect(), x=r.x+r.width/2, y=r.y+r.height/2;
            return {reachable:x>=0&&x<innerWidth&&y>=0&&y<innerHeight&&el.contains(document.elementFromPoint(x,y)),height:r.height,label:el.textContent||el.getAttribute('aria-label')};
          })()`);
          assert(hit.reachable, `${width}x${height}/${state}: control obscured: ${hit.label}`);
          if (control.button) assert(hit.height >= 44, `${width}/${state}: button target below 44px: ${hit.label}`);
        }
        assert.equal(await evaluate(`document.querySelector('.login-background img').getBoundingClientRect().top`), 0, "Artwork must continue covering the viewport while the account panel scrolls.");
        report.push({ width, height, state, scrolls:layout.scrollHeight > height, art:artRequests[0].split('/').at(-1) });
      }
      if (height > width) {
        assert.equal(await evaluate(`(() => {document.getElementById('setupScreen').classList.remove('visible'); return getComputedStyle(document.querySelector('.rotate-warning')).display;})()`), "grid", "Portrait gameplay must retain its existing orientation warning.");
      }
    }
    await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('#menuLoadingWheel .loading-wheel-ring')).animationName`), "none");
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, "layout-report.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(`Validated ${report.length} login layouts: desktop, landscape, portrait, short viewport, account states, reachable controls, and one responsive background request.`);
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (browser) {
      if (!await waitForProcessExit(browser.browserProcess)) { browser.browserProcess.kill(); await waitForProcessExit(browser.browserProcess); }
      await removeBrowserProfile(browser.profilePath);
    }
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
