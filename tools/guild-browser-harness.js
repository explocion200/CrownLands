"use strict";
// The Guild review uses the repository's Chromium/CDP lifecycle so the same
// checks run in CI, where no optional root Playwright dependency is installed.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function openGuildBrowser({ width, height, errors }) {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Set CHROME_PATH to a Chromium browser.");
  const session = await startBrowserSession(executable);
  let client, closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (!await waitForProcessExit(session.browserProcess)) { session.browserProcess.kill(); await waitForProcessExit(session.browserProcess); }
    await removeBrowserProfile(session.profilePath);
  };
  try {
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all([client.send("Page.enable"), client.send("Runtime.enable"), client.send("Network.enable")]);
    await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await client.send("Emulation.setTouchEmulationEnabled", { enabled: width < 900, maxTouchPoints: 2 });
    await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    client.on("Network.responseReceived", event => {
      // Chromium probes for a favicon even though these local fixtures declare
      // none. All application requests, including lazy Guild art, remain checked.
      if (event.response.status >= 400 && new URL(event.response.url).pathname !== "/favicon.ico")
        errors.push(event.response.status + " " + event.response.url);
    });
    const evaluate = async (fn, arg) => {
      const response = await client.send("Runtime.evaluate", { expression: "(" + fn + ")(" + JSON.stringify(arg) + ")", returnByValue: true, awaitPromise: true });
      if (response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
      return response.result.value;
    };
    const frames = () => evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const waitForFunction = async (fn, arg) => {
      for (let attempt = 0; attempt < 300; attempt++) { if (await evaluate(fn, arg)) return; await delay(50); }
      throw Error("Timed out: " + fn);
    };
    const keyboard = { press: async key => {
      const vk = { Enter: 13, Escape: 27 }[key]; assert(vk, "Unsupported test key: " + key);
      await client.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code: key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
      if (key === "Enter") await client.send("Input.dispatchKeyEvent", { type: "char", text: "\r", unmodifiedText: "\r", key, code: key, windowsVirtualKeyCode: vk });
      await client.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
      await frames();
    } };
    function locator(selector, index = 0, contains = null) {
      const nodes = "Array.from(document.querySelectorAll(" + JSON.stringify(selector) + "))" + (contains === null ? "" : ".filter(node=>node.textContent.includes(" + JSON.stringify(contains) + "))");
      // Evaluate only test-owned functions and selectors, with JSON-encoded arguments.
      const withNodes = fn => evaluate("() => (" + fn + ")(" + nodes + ")");
      const withNode = fn => evaluate("() => { const nodes=" + nodes + "; const node=nodes.at(" + index + "); if(!node)throw Error('Missing control: '+" + JSON.stringify(selector) + "); return (" + fn + ")(node); }");
      const scrollIntoViewIfNeeded = async () => { await withNode(node => node.scrollIntoView({ block: "center", inline: "center", behavior: "instant" })); await frames(); };
      const activate = async touch => {
        await scrollIntoViewIfNeeded();
        const box = await withNode(node => {
          if (node.disabled) throw Error("Disabled control: " + node.textContent);
          const rect = node.getBoundingClientRect(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
          if (!node.contains(document.elementFromPoint(x, y))) throw Error("Covered control: " + node.textContent);
          return { x, y };
        });
        if (touch) {
          await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...box, id: 1 }] });
          await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        } else {
          await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...box, button: "none", buttons: 0 });
          await client.send("Input.dispatchMouseEvent", { type: "mousePressed", ...box, button: "left", buttons: 1, clickCount: 1 });
          await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...box, button: "left", buttons: 0, clickCount: 1 });
        }
        await frames();
      };
      return {
        evaluate: withNode, evaluateAll: withNodes, scrollIntoViewIfNeeded,
        count: () => withNodes(nodes => nodes.length),
        all: async () => Array.from({ length: await withNodes(nodes => nodes.length) }, (_, i) => locator(selector, i, contains)),
        first: () => locator(selector, 0, contains), last: () => locator(selector, -1, contains),
        filter: ({ hasText }) => locator(selector, index, hasText),
        click: () => activate(false), tap: () => activate(true),
        focus: async () => { await scrollIntoViewIfNeeded(); await withNode(node => node.focus()); },
        textContent: () => withNode(node => node.textContent),
        inputValue: () => withNode(node => node.value),
        isDisabled: () => withNode(node => node.disabled),
        getAttribute: name => withNode("node => node.getAttribute(" + JSON.stringify(name) + ")"),
        selectOption: async value => {
          await withNode("node => { node.value=" + JSON.stringify(value) + "; node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true})); }");
          await frames();
        },
        fill: async value => {
          await withNode("node => { node.value=" + JSON.stringify(value) + "; node.dispatchEvent(new Event('input',{bubbles:true})); }");
          await frames();
        },
      };
    }
    let currentUrl;
    const goto = async url => {
      currentUrl = url;
      await evaluate(() => { document.documentElement.dataset.guildGameReady = "false"; });
      await client.send("Page.navigate", { url });
      await waitForFunction(expected => location.href === expected && document.readyState === "complete", url);
    };
    return { close, page: { evaluate, locator, keyboard, goto, reload: () => goto(currentUrl), waitForFunction,
      screenshot: async ({ path }) => { const capture = await client.send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(path, Buffer.from(capture.data, "base64")); },
    } };
  } catch (error) { await close(); throw error; }
}
module.exports = { openGuildBrowser };
