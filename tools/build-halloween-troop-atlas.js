"use strict";
// Pack approved poses for the renderer; retain the source images.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
async function pack(url) {
  const base = url + "/docs/visual-qa/halloween-troops/";
  const layout = await (await fetch(base + "atlas-layout.json")).json();
  const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 1280;
  const ctx = canvas.getContext("2d"); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  let rowOffset = 0;
  for (const file of ["march-north-east.png", "march-south-west.png"]) {
    const image = new Image(); image.src = base + file; await image.decode();
    layout[file].rows.forEach((row, r) => row.forEach((frame, c) => {
      const scale = 160 / 360, x = c * 160 + (360 - frame.width) / 2 * scale, y = (rowOffset + r) * 160 + (342 - frame.height) * scale;
      ctx.save(); ctx.beginPath();
      if (frame.excludeTopRight) {
        const edge = frame.excludeTopRight * scale, w = frame.width * scale, h = frame.height * scale;
        ctx.moveTo(x, y); ctx.lineTo(x + w * .6, y); ctx.lineTo(x + w * .6, y + edge); ctx.lineTo(x + w, y + edge); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
      } else ctx.rect(x, y, frame.width * scale, frame.height * scale);
      ctx.clip(); ctx.drawImage(image, frame.x, frame.y, frame.width, frame.height, x, y, frame.width * scale, frame.height * scale); ctx.restore();
    }));
    rowOffset += 4;
  }
  return canvas.toDataURL("image/webp", .88).split(",")[1];
}
async function main() {
  const root = path.resolve(__dirname, ".."), server = createMapBenchmarkServer(), address = await server.listen();
  const browser = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => p && fs.existsSync(p));
  let session, client;
  try {
    session = await startBrowserSession(browser);
    client = await CdpClient.connect(session.targets.find(t => t.type === "page").webSocketDebuggerUrl);
    await client.send("Page.navigate", { url: address.url + "/docs/visual-qa/halloween-troops/preview.html" });
    const result = await client.send("Runtime.evaluate", { awaitPromise: true, returnByValue: true, expression: "(" + pack.toString() + ")(" + JSON.stringify(address.url) + ")" });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
    const bytes = Buffer.from(result.result.value, "base64"), sha = crypto.createHash("sha256").update(bytes).digest("hex");
    const output = "assets/optimized/halloween-troops-640x1280-" + sha.slice(0, 12) + ".webp";
    fs.writeFileSync(path.join(root, output), bytes);
    fs.writeFileSync(path.join(root, "docs/visual-qa/halloween-troops/production-atlas.json"), JSON.stringify({
      output, sha256: sha, bytes: bytes.length, width: 640, height: 1280, cell: 160, rows: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
      source: ["march-north-east.png", "march-south-west.png"], layout: "atlas-layout.json", quality: .88, decodedRgbaBytes: 640 * 1280 * 4,
    }, null, 2) + "\n");
    console.log(JSON.stringify({ output, bytes: bytes.length, decodedMiB: 640 * 1280 * 4 / 1024 / 1024 }));
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (session) { await waitForProcessExit(session.browserProcess); await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
