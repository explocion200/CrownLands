"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { getRealmIdentity } = require("../functions/realmTopology");
const config = require("../functions/release-config.json");

const directory = path.join(__dirname, "local-migration");
const timer = fs.readFileSync(path.join(directory, "preseason-backup.conf"), "utf8");
const expression = "*-*~1 00:00:00 UTC";
assert(timer.includes(`OnCalendar=\nOnCalendar=${expression}\n`), "Replace, rather than add to, the daily schedule");
assert(timer.includes("Persistent=false\n"), "Missed runs must alert instead of starting after rollover");
assert(timer.includes("RandomizedDelaySec=0\n"));
assert.equal(config.realmMode, "monthly-shared");
assert.equal(config.resetActivationHeld, false);

// Ask systemd itself to calculate a complete cycle including leap February and
// the Eastern daylight-saving changes, then compare to the game's UTC seasons.
const calendar = execFileSync("systemd-analyze", ["calendar", "--base-time=2027-12-01 00:00:00 UTC",
  "--iterations=15", expression], { encoding: "utf8", env: { ...process.env, TZ: "UTC" } });
const dates = [...calendar.matchAll(/(?:Next elapse|Iteration #\d+):\s+\w+ (\d{4}-\d{2}-\d{2}) 00:00:00 UTC/g)].map(match => match[1]);
assert.equal(dates.length, 15, "Every systemd occurrence must be inspected");
for (const date of dates) {
  const due = Date.parse(`${date}T00:00:00Z`);
  const identity = getRealmIdentity(config, due);
  assert.equal(identity.endsAtMs - due, 24 * 3600 * 1000, date);
}
assert(dates.includes("2028-02-29"));
execFileSync("python3", [path.join(directory, "test_preseason_backup.py")], { stdio: "inherit", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
console.log("Preseason backup calendar, leap/DST boundaries, freshness, failure alerts and private HTTP responses passed.");
