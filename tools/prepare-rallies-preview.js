/* Actual-game Rallies preview using only the loopback benchmark's mock services. */
const fs = require("node:fs"), path = require("node:path");
async function main() {
  const origin = process.argv[2] || "http://127.0.0.1:61703";
  const response = await fetch(`${origin}/__benchmark__/?scenario=A&visualRallies=0`);
  if (!response.ok) throw Error(`Preview server returned ${response.status}`);
  const html = await response.text();
  if (!html.includes("/__benchmark__/mock-firebase.js")) throw Error("Isolated benchmark page required");
  const draft = fs.readFileSync(path.resolve(__dirname, "../docs/visual-qa/kingdom-activity-rallies/preview.js"), "utf8");
  const start = draft.indexOf("const participant ="), end = draft.indexOf("function status(");
  if (start < 0 || end <= start) throw Error("Review fixtures not found");
  const factory = `<script>window.__rallyReviewFixtures = (() => {${draft.slice(start, end)}return fixtures;})();</script>`;
  const output = path.resolve(__dirname, "../release-artifacts/rallies/runtime-preview.html");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, html.replace("<head>", '<head><base href="/">').replace("</body>", `${factory}<script src="docs/visual-qa/kingdom-activity-rallies/runtime-fixture.js"></script></body>`));
  console.log(`${origin}/release-artifacts/rallies/runtime-preview.html`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
