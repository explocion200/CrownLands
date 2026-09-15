/* Render synthetic snapshots with actual game code and loopback mock services. */
const fs = require("node:fs"), path = require("node:path");
async function main() {
  const origin = process.argv[2] || "http://127.0.0.1:61703";
  const response = await fetch(`${origin}/__benchmark__/?scenario=A&visualMilitary=0`);
  if (!response.ok) throw Error(`Preview server returned ${response.status}`);
  const html = await response.text();
  if (!html.includes("/__benchmark__/mock-firebase.js")) throw Error("Isolated benchmark page required");
  const output = path.resolve(__dirname, "../release-artifacts/military/runtime-preview.html");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const fixtures = ["kingdom-activity-camps/fixtures.js", "kingdom-activity-strongholds/fixtures.js", "troop-orders/runtime-fixture.js"].map(file => `<script src="docs/visual-qa/${file}"></script>`).join("");
  fs.writeFileSync(output, html.replace("<head>", '<head><base href="/">').replace("</body>", `${fixtures}</body>`));
  console.log(`${origin}/release-artifacts/military/runtime-preview.html`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
