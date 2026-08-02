const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const html = read("index.html");
const game = read("game.js");
const styles = read("styles.css");
const worker = read("service-worker.js");
const deployStamp = read("tools/stamp-deploy-build.js");
const patchNotes = read("patch-notes.js");

assert.match(html, /id="patchNotesBtn"[\s\S]*?id="patchNotesBadge"[^>]*hidden/, "The main menu must include a Patch Notes button with a hidden-by-default New badge.");
assert.ok(html.indexOf('src="patch-notes.js') < html.indexOf('src="game.js'), "Patch-note data must load before the game runtime.");
assert.match(worker, /"\/patch-notes\.js\?v=[^"]+"/, "Patch notes must be available from the offline app cache.");
assert.match(patchNotes, /window\.CROWNLANDS_PATCH_NOTES\s*=\s*Object\.freeze/, "Patch-note data must expose the browser configuration object.");

assert.match(game, /PATCH_NOTES_SEEN_STORAGE_KEY/, "The menu must remember which deployed patch notes were viewed.");
assert.match(game, /localStorage\.getItem\(PATCH_NOTES_SEEN_STORAGE_KEY\)\s*!==\s*buildId/, "The New badge must compare the viewed release with the current build.");
assert.match(game, /function showPatchNotesModal\(\)[\s\S]*?markPatchNotesSeen\(\)[\s\S]*?modal\.showModal\(\)/, "Opening Patch Notes must render the modal and clear its New state.");
assert.match(styles, /\.patch-notes-btn\.has-new-patch-notes/, "The unread Patch Notes button needs a visible update treatment.");
assert.match(styles, /\.patch-notes-release\.is-latest/, "The current release needs distinct modal styling.");

assert.match(deployStamp, /function getPatchNoteReleases\(currentBuildId\)/, "Deployment stamping must generate release history.");
assert.match(deployStamp, /git[\s\S]*?--first-parent[\s\S]*?--format=%H%x09%cI/, "Generated release history must follow deployed mainline commits.");
assert.match(deployStamp, /writeProjectFile\("patch-notes\.js", patchNotesSource\)/, "Every deployment must write freshly generated patch-note data.");
assert.match(deployStamp, /new Function\(patchNotesSource\)/, "Deployment validation must syntax-check its generated patch notes.");

console.log("Validated automatic main-menu patch notes, unread state, release history, and offline delivery.");
