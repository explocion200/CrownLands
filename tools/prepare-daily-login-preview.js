/* Build an isolated actual-game review page using the existing benchmark server. */
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
async function main() {
  const origin = process.argv[2] || "http://127.0.0.1:61703";
  const response = await fetch(`${origin}/__benchmark__/?scenario=A&visualMarches=0`);
  if (!response.ok) throw new Error(`Preview server returned ${response.status}`);
  const source = await response.text();
  if (!source.includes("/__benchmark__/mock-firebase.js")) throw new Error("Expected an isolated benchmark page.");
  const output = path.join(root, "release-artifacts/daily-login-cycle/runtime-preview.html");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, source.replace("<head>", '<head><base href="/">').replace("</body>",
    '<script src="docs/visual-qa/daily-login-cycle/runtime-fixture.js"></script></body>'));
  console.log(`${origin}/release-artifacts/daily-login-cycle/runtime-preview.html?day=7`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
