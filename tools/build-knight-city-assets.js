"use strict";
// Encode approved paintings for runtime use; preserve the full alpha silhouette.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
async function encode(url) {
  const image = new Image(); image.src = url; await image.decode();
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d"); ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, 512, 512);
  return canvas.toDataURL("image/webp", .82).split(",")[1];
}
async function main() {
  const root = path.resolve(__dirname, ".."), directory = "docs/visual-qa/knight-order-city-skins";
  const server = createMapBenchmarkServer(), address = await server.listen();
  const browser = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  let session, client; const assets = [];
  try {
    session = await startBrowserSession(browser);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await client.send("Page.navigate", { url: `${address.url}/${directory}/index.html` });
    for (const order of ["templar", "hospitaller", "teutonic", "santiago"]) for (let stage = 1; stage <= 5; stage++) {
      const source = `${directory}/art/${order}${stage === 5 ? "" : `-stage-${stage}`}.png`;
      const result = await client.send("Runtime.evaluate", { expression: `(${encode.toString()})(${JSON.stringify(address.url + "/" + source)})`, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
      const bytes = Buffer.from(result.result.value, "base64"), sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
      const output = `assets/optimized/knight-${order}-stage-${stage}-512x512-${sha256.slice(0, 12)}.webp`;
      fs.writeFileSync(path.join(root, output), bytes);
      assets.push({ order, stage, path: output, sha256, bytes: bytes.length, width: 512, height: 512, source, sourceSha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(root, source))).digest("hex") });
    }
    fs.writeFileSync(path.join(root, directory, "runtime-assets.json"), JSON.stringify({ quality: .82, assets }, null, 2) + "\n");
    console.log(JSON.stringify({ paintings: assets.length, totalBytes: assets.reduce((sum, asset) => sum + asset.bytes, 0) }));
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (session) { await waitForProcessExit(session.browserProcess); await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
