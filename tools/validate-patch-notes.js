const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createDailyPatchNoteReleases, getUtcDateKey } = require("./patch-note-history");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const html = read("index.html");
const updates = read("updates.html");
const publicSite = read("public-site.js");
const styles = read("site-info.css");
const worker = read("service-worker.js");
const deployStamp = read("tools/stamp-deploy-build.js");
const patchNotes = read("patch-notes.js");

assert.doesNotMatch(html, /patchNotesBtn|patchNotesBadge|src="patch-notes\.js/, "Patch notes must not remain on the game login screen.");
assert.match(html, /href="updates\.html">Patch Notes<\/a>/, "The login information links must remain inside packaged subdirectory builds.");
assert.ok(updates.indexOf('src="/patch-notes.js"') < updates.indexOf('src="/public-site.js'), "Patch-note data must load before the public website runtime.");
assert.match(updates, /data-patch-notes-feed[\s\S]*?data-update-post="patch-notes"/, "The website must provide a resilient Patch Notes feed and fallback.");
assert.doesNotMatch(worker, /"\/patch-notes\.js\?v=[^"]+"/, "Website Patch Notes must not inflate the game installation cache.");
assert.match(patchNotes, /window\.CROWNLANDS_PATCH_NOTES\s*=\s*Object\.freeze/, "Patch-note data must expose the browser configuration object.");
assert.match(patchNotes, /"?dateKey"?:\s*"\d{4}-\d{2}-\d{2}"/, "Patch-note releases must include a stable UTC date key.");

assert.match(publicSite, /function renderPublicPatchNotes\(\)[\s\S]*?normalizePatchNoteReleases\(\)[\s\S]*?feed\.replaceChildren/, "The website must render deployment-generated Patch Notes.");
assert.match(publicSite, /hasUtcDateKey[\s\S]*?timeZone:\s*"UTC"/, "Daily patch-note dates must render with a stable UTC boundary.");
assert.match(publicSite, /item\.textContent\s*=\s*note/, "Patch-note content must be rendered as text rather than executable markup.");
assert.match(styles, /\.patch-note-post\.is-current/, "The current website release needs a visible treatment.");

assert.match(deployStamp, /function getPatchNoteReleases\(currentBuildId\)/, "Deployment stamping must generate release history.");
assert.match(deployStamp, /git[\s\S]*?--first-parent[\s\S]*?--format=%H%x09%cI/, "Generated release history must follow deployed mainline commits.");
assert.match(deployStamp, /writeProjectFile\("patch-notes\.js", patchNotesSource\)/, "Every deployment must write freshly generated patch-note data.");
assert.match(deployStamp, /new Function\(patchNotesSource\)/, "Deployment validation must syntax-check its generated patch notes.");

assert.equal(getUtcDateKey("2026-08-03T00:00:00.000Z"), "2026-08-03", "UTC midnight must begin a new patch-note day.");
assert.equal(getUtcDateKey("2026-08-02T23:59:59.999Z"), "2026-08-02", "The instant before UTC midnight must remain on the previous day.");

const notesByCommit = new Map([
  ["newest", ["Later improvement.", "Shared improvement."]],
  ["earlier", ["Earlier improvement.", "Shared improvement."]],
  ["previous", ["Previous-day improvement."]],
]);
const groupedReleases = createDailyPatchNoteReleases([
  { commit: "newest", publishedAt: "2026-08-03T05:00:00-04:00" },
  { commit: "earlier", publishedAt: "2026-08-02T23:30:00-04:00" },
  { commit: "previous", publishedAt: "2026-08-02T23:59:59.999Z" },
], {
  currentBuildId: "deployed-build",
  getNotes: commit => notesByCommit.get(commit),
});
assert.equal(groupedReleases.length, 2, "Commits on the same UTC day must share one release card.");
assert.deepEqual(groupedReleases[0], {
  buildId: "deployed-build",
  dateKey: "2026-08-03",
  publishedAt: "2026-08-03T05:00:00-04:00",
  notes: ["Earlier improvement.", "Shared improvement.", "Later improvement."],
}, "A daily release must use the newest build while keeping unique notes in chronological order.");
assert.equal(groupedReleases[1].dateKey, "2026-08-02", "Commits across UTC midnight must create separate release cards.");

const sevenDaysOfRows = Array.from({ length: 7 }, (_, index) => ({
  commit: `commit-${index}`,
  publishedAt: `2026-07-${String(31 - index).padStart(2, "0")}T12:00:00.000Z`,
}));
sevenDaysOfRows.splice(1, 0, {
  commit: "same-day-commit",
  publishedAt: "2026-07-31T08:00:00.000Z",
});
const limitedReleases = createDailyPatchNoteReleases(sevenDaysOfRows, {
  currentBuildId: "current-build",
  getNotes: commit => [`${commit} note.`],
});
assert.equal(limitedReleases.length, 6, "The release limit must apply after commits are grouped into UTC days.");
assert.equal(limitedReleases[0].notes.length, 2, "Same-day notes must not consume additional history cards.");

console.log("Validated website-hosted Patch Notes, daily UTC consolidation, release history, and login removal.");
