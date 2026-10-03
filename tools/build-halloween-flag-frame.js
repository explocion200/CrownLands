"use strict";
// Resize the approved transparent draft; do not ship the editable source PNG.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
async function pack(url) {
  const image = new Image(); image.src = url + "/docs/visual-qa/halloween-city-marker/ornate-frame.png"; await image.decode();
  const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 400;
  const ctx = canvas.getContext("2d"); ctx.imageSmoothingQuality = "high"; ctx.drawImage(image, 0, 0, 320, 400);
  return canvas.toDataURL("image/webp", .9).split(",")[1];
}
async function main() {
  const root = path.resolve(__dirname, ".."), server = createMapBenchmarkServer(), address = await server.listen();
  const browser = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && fs.existsSync(p));
  let session, client;
  try {
    session = await startBrowserSession(browser);
    client = await CdpClient.connect(session.targets.find(t => t.type === "page").webSocketDebuggerUrl);
    await client.send("Page.navigate", { url: address.url + "/docs/visual-qa/halloween-city-marker/preview.html" });
    const result = await client.send("Runtime.evaluate", { awaitPromise: true, returnByValue: true, expression: "(" + pack.toString() + ")(" + JSON.stringify(address.url) + ")" });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
    const bytes = Buffer.from(result.result.value, "base64"), sha = crypto.createHash("sha256").update(bytes).digest("hex");
    const output = "assets/optimized/halloween-flag-frame-320x400-" + sha.slice(0, 12) + ".webp";
    fs.writeFileSync(path.join(root, output), bytes);
    fs.writeFileSync(path.join(root, "docs/visual-qa/halloween-city-marker/production-frame.json"), JSON.stringify({ output, sha256: sha, bytes: bytes.length, width: 320, height: 400, source: "ornate-frame.png", quality: .9, decodedRgbaBytes: 320 * 400 * 4 }, null, 2) + "\n");
    console.log(JSON.stringify({ output, bytes: bytes.length, decodedKiB: 500 }));
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (session) { await waitForProcessExit(session.browserProcess); await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
