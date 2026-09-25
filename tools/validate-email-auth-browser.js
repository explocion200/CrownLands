"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const root = path.resolve(__dirname, "..");
const fixture = `(() => {
  let user = null, signedIn = false, busy = false;
  const calls = [];
  const emit = () => window.dispatchEvent(new CustomEvent('crownlands:auth-ui', {detail:{}}));
  const operation = async (name, work) => { if(busy) throw Error('duplicate'); busy=true; emit(); calls.push(name); await new Promise(r=>setTimeout(r,120)); try{return work();}finally{busy=false;emit();} };
  window.CrownlandsOnline = {
    isConfigured:()=>true,isReady:()=>true,isSignedIn:()=>signedIn,isAuthBusy:()=>busy,getAuthUser:()=>user,getUser:()=>signedIn?user:null,
    getVerificationResendAtMs:()=>0,
    signInWithEmail:()=>operation('signup',()=>{user={uid:'email-user',email:'qa@example.test',emailVerified:false,providerIds:['password']};signedIn=false;}),
    refreshEmailVerification:()=>operation('verify',()=>{user.emailVerified=true;signedIn=true;return true;}),
    sendVerificationEmail:()=>operation('resend',()=>true),sendPasswordRecovery:()=>operation('reset',()=>true),
    reauthenticateGoogleForPassword:()=>operation('reauthenticate',()=>true),
    addEmailPassword:()=>operation('link',()=>{user.providerIds.push('password');return user;})
  };
  window.emailQa = {calls, reset:()=>{user=null;signedIn=false;emit();}, google:()=>{user={uid:'google-user',email:'google@example.test',emailVerified:true,providerIds:['google.com']};signedIn=true;emit();}};
})();`;
async function main() {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const target = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) { response.writeHead(404); response.end(); return; }
    const type = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".svg": "image/svg+xml" }[path.extname(target)] || "application/octet-stream";
    response.writeHead(200, { "content-type": type });
    if (target === path.join(root, "index.html")) {
      const html = fs.readFileSync(target, "utf8").replace(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g, (tag, src) => {
        if (src.startsWith("firebaseClient.js")) return `<script>${fixture}</script>`;
        return src.startsWith("email-auth-ui.js") ? tag : "";
      });
      response.end(html);
    } else fs.createReadStream(target).pipe(response);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browserPath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(candidate => candidate && fs.existsSync(candidate));
  assert(browserPath, "Set CHROME_PATH to Chromium.");
  let browser, client;
  const output = path.join(root, "release-artifacts/email-auth"); fs.mkdirSync(output, { recursive: true });
  try {
    browser = await startBrowserSession(browserPath);
    client = await CdpClient.connect(browser.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable"); await client.send("Runtime.enable"); await client.send("Network.enable");
    await client.send("Network.setBlockedURLs", { urls: ["*googleapis.com*", "*gstatic.com*", "*cloudfunctions.net*", "*firebaseio.com*", "*playcrownlands.com*"] });
    const evaluate = async expression => {
      const response = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
      return response.result.value;
    };
    const waitFor = async expression => {
      for (let attempt = 0; attempt < 150; attempt++) {
        if (await evaluate(expression)) return;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error(`Timed out: ${expression}`);
    };
    const click = async id => {
      const point = await evaluate(`(() => { const el=document.getElementById(${JSON.stringify(id)}); el.scrollIntoView({block:'center'}); const r=el.getBoundingClientRect(); if(el.disabled || !r.width || !r.height)throw Error('Control unavailable'); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
      await client.send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
      await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
    };
    const fill = (id, value) => evaluate(`(() => {const el=document.getElementById(${JSON.stringify(id)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const capture = async name => { const result = await client.send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(path.join(output, name), Buffer.from(result.data, "base64")); };
    for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 568, height: 320 }]) {
      await client.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1, mobile: false });
      await client.send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/` });
      await waitFor('window.emailQa && !document.getElementById("emailSignInBtn").disabled');
      await capture(`login-${viewport.width}x${viewport.height}.png`);
      await click("emailSignInBtn");
      assert(await evaluate('document.getElementById("emailAuthDialog").open'));
      await click("emailAuthModeBtn");
      assert.equal(await evaluate('document.getElementById("emailAuthPassword").autocomplete'), "new-password");
      await fill("emailAuthAddress", "qa@example.test");
      await fill("emailAuthPassword", "a long password");
      await fill("emailAuthConfirm", "a different password");
      await click("emailAuthSubmit");
      assert.match(await evaluate('document.getElementById("emailAuthStatus").textContent'), /do not match/);
      await fill("emailAuthConfirm", "a long password");
      await evaluate('document.getElementById("emailAuthTitle").scrollIntoView()');
      await capture(`create-${viewport.width}x${viewport.height}.png`);
      const box = await evaluate('document.getElementById("emailAuthDialog").getBoundingClientRect().toJSON()');
      assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, "Email dialog leaves the viewport.");
      await click("emailAuthSubmit");
      await waitFor('!document.getElementById("emailAuthDialog").open');
      assert.equal(await evaluate('document.getElementById("emailVerificationPanel").hidden'), false);
      await capture(`verify-${viewport.width}x${viewport.height}.png`);
      assert.equal(await evaluate('document.getElementById("emailAuthPassword").value'), "");
      assert.equal(await evaluate('emailQa.calls.filter(c => c === "signup").length'), 1);
      await click("emailVerifiedBtn");
      await waitFor('document.getElementById("emailVerificationPanel").hidden');

      await evaluate('emailQa.reset()');
      await click("emailSignInBtn"); await click("emailForgotBtn");
      assert(await evaluate('document.getElementById("emailPasswordFields").hidden'));
      await fill("emailAuthAddress", "unknown@example.test"); await click("emailAuthSubmit");
      await waitFor('document.getElementById("emailAuthStatus").textContent.includes("If this email")');
      await click("emailAuthBackBtn");
      await evaluate('emailQa.google(); document.getElementById("emailAddPasswordBtn").click();');
      await waitFor('document.getElementById("emailAuthDialog").open');
      assert(await evaluate('document.getElementById("emailAuthAddress").readOnly'));
      assert.equal(await evaluate('document.getElementById("emailAuthAddress").value'), "google@example.test");
      await fill("emailAuthPassword", "a linked password"); await fill("emailAuthConfirm", "a linked password");
      await click("emailAuthSubmit");
      await waitFor('!document.getElementById("emailAuthDialog").open');
      assert.match(await evaluate('document.getElementById("emailAccountStatus").textContent'), /Password added/);
      assert.equal(await evaluate('CrownlandsOnline.getAuthUser().uid'), "google-user");
    }
    console.log("Email browser checks passed at 1440×900, 844×390 and 568×320: signup, mismatch, verification, recovery, same-account linking, bounded dialogs.");
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (browser) {
      if (!await waitForProcessExit(browser.browserProcess)) { browser.browserProcess.kill(); await waitForProcessExit(browser.browserProcess); }
      await removeBrowserProfile(browser.profilePath);
    }
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
