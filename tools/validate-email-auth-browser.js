"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const root = path.resolve(__dirname, "..");
const fixture = `(() => {
  let observer, failure = '', failureCode = '';
  const calls = [], serverCalls = [], auth = {currentUser:null};
  const user = (uid,email,provider,verified=false) => ({uid,email,emailVerified:verified,providerData:[{providerId:provider}],provider});
  const operation = async (name,work) => { calls.push(name); await new Promise(r=>setTimeout(r,120)); if(failure===name){failure='';throw Object.assign(Error('PRIVATE_FIXTURE_DETAIL'),{code:failureCode,customData:{email:'PRIVATE_FIXTURE_DETAIL'}});} return work(); };
  window.CROWNLANDS_FIREBASE_CONFIG = {apiKey:'fixture',projectId:'fixture',authDomain:'fixture',appId:'fixture'};
  window.CROWNLANDS_REALM_CONFIG = {resetGeneration:'fixture',worldId:'fixture-world'};
  const modules = {
    app:{initializeApp:()=>({})},
    auth:{getAuth:()=>auth,GoogleAuthProvider:class {},onAuthStateChanged:(_auth,fn)=>{observer=fn;},getRedirectResult:async()=>null,
      getIdTokenResult:async u=>({signInProvider:u.provider,claims:{email_verified:u.emailVerified,auth_time:Date.now()/1000}}),getIdToken:async()=> 'fixture-token',
      createUserWithEmailAndPassword:(_auth,email)=>operation('signup',()=>{auth.currentUser=user('email-user',email,'password');observer(auth.currentUser);return {user:auth.currentUser};}),
      signInWithEmailAndPassword:()=>operation('signin',()=>{throw Object.assign(Error('Fixture credentials'),{code:'auth/invalid-credential'});}),
      sendEmailVerification:()=>operation('delivery',()=>true),reload:async u=>{u.emailVerified=true;},
      sendPasswordResetEmail:()=>operation('reset',()=>true),signOut:async()=>{auth.currentUser=null;observer(null);},
      reauthenticateWithPopup:async u=>({user:u}),EmailAuthProvider:{credential:(email,password)=>({email,password})},
      linkWithCredential:async u=>{u.providerData.push({providerId:'password'});return {user:u};}
    },
    firestore:{getFirestore:()=>({}),doc:(...parts)=>parts.slice(1).join('/'),onSnapshot:()=>()=>{}},
    functions:{getFunctions:()=>({}),httpsCallable:(_f,name)=>async payload=>{serverCalls.push(name);return {data:name==='getRealmInfo'?{resetGeneration:'fixture',worldId:'fixture-world'}:name==='joinGameServer'?{status:'active',activeSession:{id:payload.sessionId,version:2,revision:1}}:{ok:true}};}}
  };
  window.emailQa = {calls,serverCalls,modules,failNext:(name,code='auth/network-request-failed')=>{failure=name;failureCode=code;},reset:()=>CrownlandsOnline.signOut(),google:async()=>{auth.currentUser=user('google-user','google@example.test','google.com',true);observer(auth.currentUser);await new Promise(r=>setTimeout(r,0));}};
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
        if (src.startsWith("firebaseClient.js")) return `<script>${fixture}</script>${tag}`;
        return src.startsWith("email-auth-ui.js") ? tag : "";
      });
      response.end(html);
    } else if (target === path.join(root, "firebaseClient.js")) {
      response.end(fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n").replace(/\n  init\(\);\n\}\)\(\);\s*$/, "\n  loadModules = async () => window.emailQa.modules;\n  init();\n})();"));
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
    const fill = async (id, value) => {
      await evaluate(`(() => {const el=document.getElementById(${JSON.stringify(id)});el.focus();el.select();})()`);
      await client.send("Input.insertText", { text: value });
    };
    const capture = async name => { const result = await client.send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(path.join(output, name), Buffer.from(result.data, "base64")); };
    for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 568, height: 320 }]) {
      await client.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1, mobile: false });
      await client.send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/` });
      await waitFor('window.emailQa && !document.getElementById("emailSignInBtn").disabled');
      await capture(`login-${viewport.width}x${viewport.height}.png`);
      await click("emailSignInBtn");
      assert(await evaluate('document.getElementById("emailAuthDialog").open'));
      await click("emailAuthModeBtn");
      assert.match(await evaluate('document.getElementById("emailAuthHint").textContent'), /Settings → Account → Add a password/);
      assert.equal(await evaluate('document.getElementById("emailAuthPassword").autocomplete'), "new-password");
      await click("emailAuthSubmit");
      assert.match(await evaluate('document.getElementById("emailAuthStatus").textContent'), /valid email/);
      await fill("emailAuthAddress", "not-an-email"); await click("emailAuthSubmit");
      assert.match(await evaluate('document.getElementById("emailAuthStatus").textContent'), /valid email/);
      await fill("emailAuthAddress", "qa@example.test");
      await fill("emailAuthPassword", "elevenchars"); await fill("emailAuthConfirm", "elevenchars");
      await click("emailAuthSubmit");
      assert.match(await evaluate('document.getElementById("emailAuthStatus").textContent'), /at least 12 characters/);
      assert.equal(await evaluate('emailQa.calls.length'), 0, "Invalid form attempted authentication.");
      const errorBox = await evaluate('document.getElementById("emailAuthStatus").getBoundingClientRect().toJSON()');
      assert(errorBox.y >= 0 && errorBox.bottom <= viewport.height + 1, "Validation explanation is outside the viewport.");
      await fill("emailAuthPassword", "a long password");
      await fill("emailAuthConfirm", "a different password");
      await click("emailAuthSubmit");
      assert.match(await evaluate('document.getElementById("emailAuthStatus").textContent'), /do not match/);
      await fill("emailAuthConfirm", "a long password");
      await evaluate('document.getElementById("emailAuthTitle").scrollIntoView()');
      await capture(`create-${viewport.width}x${viewport.height}.png`);
      const box = await evaluate('document.getElementById("emailAuthDialog").getBoundingClientRect().toJSON()');
      assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, "Email dialog leaves the viewport.");
      const theme = await evaluate('({paper:getComputedStyle(document.getElementById("emailAuthDialog")).backgroundImage,ink:getComputedStyle(document.getElementById("emailAuthHint")).color,button:getComputedStyle(document.getElementById("emailAuthSubmit")).backgroundImage,radius:getComputedStyle(document.getElementById("emailAuthDialog")).borderRadius})');
      assert.match(theme.paper, /rgb\(238, 222, 190\)/, "Email form does not use the game parchment.");
      assert.equal(theme.ink, "rgb(90, 70, 50)"); assert.match(theme.button, /rgb\(114, 54, 58\)/); assert.equal(theme.radius, "2px");
      await evaluate('emailQa.failNext("signup")'); await click("emailAuthSubmit");
      await waitFor('document.getElementById("emailAuthStatus").textContent.includes("Could not connect")');
      assert(await evaluate('document.getElementById("emailAuthDialog").open'));
      assert.equal(await evaluate('CrownlandsOnline.getAuthUser()'), null);
      assert.equal(await evaluate('document.getElementById("emailAuthAddress").value'), "qa@example.test");
      assert.equal(await evaluate('document.getElementById("emailAuthPassword").value'), "");
      await fill("emailAuthPassword", "a long password"); await fill("emailAuthConfirm", "a long password");
      await click("emailAuthSubmit");
      assert(await evaluate('document.getElementById("emailAuthSubmit").disabled'));
      await evaluate('document.getElementById("emailAuthForm").requestSubmit()');
      await waitFor('!document.getElementById("emailAuthDialog").open');
      assert.equal(await evaluate('document.getElementById("emailVerificationPanel").hidden'), false);
      await capture(`verify-${viewport.width}x${viewport.height}.png`);
      assert.equal(await evaluate('document.getElementById("emailAuthPassword").value'), "");
      assert.equal(await evaluate('emailQa.calls.filter(c => c === "signup").length'), 2, "Expected one failed signup and one successful retry; duplicate submission escaped the pending guard.");
      assert.equal(await evaluate('emailQa.serverCalls.length'), 0, "Unverified UI signup started gameplay.");
      await click("emailVerifiedBtn");
      await waitFor('document.getElementById("emailVerificationPanel").hidden');

      await evaluate('emailQa.reset()');
      await click("emailSignInBtn"); await click("emailForgotBtn");
      assert(await evaluate('document.getElementById("emailPasswordFields").hidden'));
      await fill("emailAuthAddress", "unknown@example.test"); await click("emailAuthSubmit");
      await waitFor('document.getElementById("emailAuthStatus").textContent.includes("If this email")');
      await click("emailAuthBackBtn");
      await click("emailSignInBtn");
      await fill("emailAuthPassword", "some password"); await evaluate('emailQa.failNext("signin")'); await click("emailAuthSubmit");
      await waitFor('document.getElementById("emailAuthStatus").textContent.includes("Could not connect")');
      assert.equal(await evaluate('document.getElementById("emailAuthPassword").value'), "");
      await fill("emailAuthPassword", "another password"); await click("emailAuthSubmit");
      await waitFor('document.getElementById("emailAuthStatus").textContent.includes("Email or password was not accepted")');
      await click("emailAuthModeBtn");
      for (const [code, explanation] of [
        ["auth/email-already-in-use", "add a password in Settings"],
        ["auth/already-signed-in", "already signed in"],
        ["auth/unavailable", "Sign-in could not load"],
        ["auth/internal-error", "support with code auth/internal-error"],
        ["PRIVATE_FIXTURE_DETAIL@example.test", "support with code email/client-error"],
        ["", "support with code email/client-error"],
      ]) {
        await fill("emailAuthPassword", "a long password"); await fill("emailAuthConfirm", "a long password");
        await evaluate(`emailQa.failNext("signup", ${JSON.stringify(code)})`); await click("emailAuthSubmit");
        await waitFor(`document.getElementById("emailAuthStatus").textContent.includes(${JSON.stringify(explanation)})`);
        assert(await evaluate('document.getElementById("emailAuthDialog").open'));
        assert.equal(await evaluate('CrownlandsOnline.getAuthUser()'), null);
        assert(!(await evaluate('document.getElementById("emailAuthStatus").textContent')).includes("PRIVATE_FIXTURE_DETAIL"), "Private error data reached the UI.");
        assert.equal(await evaluate('document.getElementById("emailAuthPassword").value'), "");
      }
      await fill("emailAuthAddress", "delivery@example.test");
      await fill("emailAuthPassword", "delivery password"); await fill("emailAuthConfirm", "delivery password");
      await evaluate('emailQa.failNext("delivery")'); await click("emailAuthSubmit");
      await waitFor('document.getElementById("emailVerificationStatus").textContent.includes("could not be sent")');
      assert.match(await evaluate('document.getElementById("emailVerificationStatus").textContent'), /Could not connect/);
      assert.equal(await evaluate('CrownlandsOnline.isSignedIn()'), false);
      await click("emailResendBtn");
      await waitFor('document.getElementById("emailVerificationStatus").textContent.includes("Verification email sent")');
      await evaluate('emailQa.reset()');
      await evaluate('(async()=>{await emailQa.google(); document.getElementById("emailAddPasswordBtn").click();})()');
      await waitFor('document.getElementById("emailAuthDialog").open');
      assert(await evaluate('document.getElementById("emailAuthAddress").readOnly'));
      assert.equal(await evaluate('document.getElementById("emailAuthAddress").value'), "google@example.test");
      await fill("emailAuthPassword", "a linked password"); await fill("emailAuthConfirm", "a linked password");
      await click("emailAuthSubmit");
      await waitFor('!document.getElementById("emailAuthDialog").open');
      assert.match(await evaluate('document.getElementById("emailAccountStatus").textContent'), /Password added/);
      assert.equal(await evaluate('CrownlandsOnline.getAuthUser().uid'), "google-user");
    }
    console.log("Email browser checks passed at 1440×900, 844×390 and 568×320: real client/UI integration, visible validation, signup, delivery failure/resend, sign-in retry, verification, recovery, linking, parchment theme.");
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
