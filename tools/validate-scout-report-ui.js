const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const skillNames = { shieldwallDiscipline: "Shieldwall Discipline", stoneworks: "Stoneworks", fieldMedics: "Field Medics", guildCharters: "Guild Charters", swordmastery: "Swordmastery", marchOrders: "March Orders", taxStewardship: "Tax Stewardship", royalGranaries: "Royal Granaries" };
const context = vm.createContext({ window: {}, escapeHtml: esc, formatNumber: String, formatDuration: value => `${value}s`, formatWallIntegrity: value => `${value / 100}%`, clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  state: { playerName: "Aldric <script>", character: { level: 24 } }, getCurrentOnlineUid: () => "self", getCityRegionId: () => "region", getRegionLabel: region => region, getBattleTargetTypeLabel: () => "City", BASE_TROOP_DEFENSE_POWER: 1.3,
  SKILL_CONFIG: Object.fromEntries(Object.entries(skillNames).map(([key, label]) => [key, { label }])),
  renderPlayerNameLink: (uid, name) => `<button class="ruler-link" data-player-uid="${esc(uid)}">${esc(name)}</button>`, renderPlayerLinkedText: text => esc(text),
  renderBattleReportLocateButton: report => `<button class="map-button" data-report-jump="${esc(report.cityId)}">Map</button>`, renderBattleReportAge: () => '<span data-report-occurred-at-ms="123">30s ago</span>',
  renderOnboardingTip: () => '<aside class="onboarding-tip">First scout guidance</aside>', isDefenderScoutReport: report => report.scoutPerspective === "defender", getBattleReportExactTime: () => "14 Sep 2026, 10:42:18"
});
vm.runInContext(read("scout-report-ui.js"), context);
const ui = context.window.CrownlandsScoutReportUI;
const report = { targetType: "city", troops: 20000, totalDefense: 44470, baseAttackPercent: 25, shieldwallDisciplinePercent: 10, stoneworksPercent: 20 };
for (const key of Object.keys(skillNames)) { report[`${key}Level`] = 5; report[`${key}Percent`] ||= 10; }
const siege = { baseCityWalls: 29058, stoneworksPercent: 20, fullWallPower: 35450, startingWallPower: 14180, startingIntegrityBps: 4000, ownerGarrisonDefensePower: 23010, garrisonDefensePower: 30290, troopObjectiveDefenseBonusPercent: 5, repairWindowMinutes: 16 };
const model = { city: { id: "target", name: "Thornfield & Watch" }, report, cityLevel: 2, currentPlayerUid: "self", reportedOwnerUid: "enemy", reportedOwnerName: 'Maeve <img src=x onerror="bad">', ownerTroops: 15000, reinforcementTroops: 5000, soldierDefenseEnabled: true, baseTotalDefense: 37623, baseCityWalls: 29058, cityWalls: 35450, cityDefenseBonus: 600, defensePercent: 4, siege,
  reinforcements: [{ ownerUid: "ally", ownerName: "Rowan", troops: 5000, effectivePower: 7280, baseDefensePowerPerTroop: 1.3, shieldwallDisciplinePercent: 6, personalDefenseBonusPercent: 2, sharedDefenseBonusPercent: 1, gearDefenderStrengthPercent: 3 }],
  wallGearPercent: 2, wallGearCopy: " + Gatehouse gear +2%", defenderGearCopy: " · Gatehouse gear +3%", siegeRepair: '<small data-fortification-repair-at-ms="98765">Full repair in 60s</small>', age: 30, remaining: 570 };
const before = JSON.stringify(model), html = ui.renderIntel(model).replaceAll(",", "");
assert.equal(JSON.stringify(model), before, "Rendering must not mutate intelligence or report timestamps");
for (const text of ["20000", "15000", "5000", "23010", "7280", "30290", "14180", "35450", "44470", "37623", "+6847", "40%", "Gatehouse gear +3%", "owner gear +3%", "personal +2%", "clan +1%", "First scout guidance", "16-minute full-breach", ...Object.values(skillNames)]) assert(html.includes(text), `Missing recorded field: ${text}`);
assert(!html.includes('<img src=x') && !html.includes('<script>'), "Untrusted ruler name injected HTML");
assert(html.includes("Thornfield &amp; Watch"));
assert(html.indexOf('data-player-uid="self"') < html.indexOf('data-player-uid="enemy"'), "Viewer identity moved to the opponent side");
for (const hook of ["scoutReportPlayerFlag", "scoutReportDefenderFlag", "battleReportBackBtn", "data-report-jump", "data-scout-report-age", "data-scout-report-expires"]) assert(html.includes(hook), `Lost live hook: ${hook}`);
assert.equal((html.match(/data-fortification-repair-at-ms=/g) || []).length, 1, "The existing repair updater must own one primary label");
assert(html.includes('data-scout-repair-mirror="98765"'));
const breached = ui.renderIntel({ ...model, report: { ...report, totalDefense: 0 }, siege: { ...siege, startingIntegrityBps: 0, startingWallPower: 0, ownerGarrisonDefensePower: 0, garrisonDefensePower: 0 }, reinforcements: [{ ...model.reinforcements[0], effectivePower: 0 }] }).replaceAll(",", "");
assert(breached.includes('<strong>0</strong>') && breached.includes("0% intact") && breached.includes("−37623 net adjustment"), "Zero power or breached walls were replaced by fallback troop/base values");
const old = ui.renderIntel({ ...model, soldierDefenseEnabled: false, siege: null });
assert(old.includes("Not recorded") && old.includes("Wall integrity and repair timing were not recorded"), "Old intelligence fabricated unknown details");
const camp = ui.renderIntel({ ...model, rewardCampTarget: true, report: { ...report, troops: 18000, totalDefense: 18000 }, ownerTroops: 18000, baseTotalDefense: 18000, reinforcementTroops: 0, reinforcements: [] });
assert(!camp.includes('id="scoutDetail-walls"') && !camp.includes('class="skill-row"') && !camp.includes("Wall integrity at scout time"), "Camp rendered city-only intelligence");
assert(camp.includes("1.00 power per troop") && camp.includes("Camp objectives have no wall layer"));
const attempt = { id: "blocked", type: "scout", cityId: "target", cityName: "Thornfield", cityLevel: 2, summary: "Veil blocked the scout <unsafe>", troops: 987654321, totalDefense: 876543210, scoutReport: report };
const hidden = ui.renderAttempt(attempt, { label: "SCOUT BLOCKED" });
assert(hidden.includes("Veil blocked the scout &lt;unsafe&gt;") && hidden.includes("No current intelligence"));
for (const secret of ["987654321", "876543210", 'class="intel-metric', 'class="skill-row"']) assert(!hidden.includes(secret), "Unavailable report leaked hidden statistics");
const disclosure = { ...attempt, scoutPerspective: "defender", opponentUid: "enemy", opponentName: "Maeve", sourceCityName: "Origin & Keep", sourceRegionId: "region", scoutDisclosure: { targetType: "city", troops: 321, ownerTroops: 300, reinforcementTroops: 21, totalDefense: 1234, cityLevel: 2, wallIntegrityBps: 6000, reinforcements: [{ ownerUid: "ally", ownerName: "Rowan", troops: 21 }], skills: Object.fromEntries(Object.keys(skillNames).map(key => [key, { level: 7, percent: 14 }])) } };
const exposed = ui.renderAttempt(disclosure, { label: "YOU WERE SCOUTED" });
for (const text of ["321", "300", "1,234", "60%", "Origin &amp; Keep", "14 Sep 2026, 10:42:18", "Lv 7", "+14%", "scoutedReportAttackerFlag", "scoutedReportPlayerFlag"]) assert(exposed.includes(text), text);
assert(!exposed.includes("987654321") && !exposed.includes("876543210"), "Defender disclosure used undisclosed report statistics");
const missing = ui.renderDisclosure({ ...disclosure, scoutDisclosure: null }, { label: "YOU WERE SCOUTED" });
assert(missing.includes("Details unavailable") && !missing.includes('class="disclosure-metrics"') && !missing.includes('class="skill-row"'));
const mirror = {}, expiry = { textContent: "" }, toggles = [];
expiry.closest = () => ({ classList: { toggle: (...args) => toggles.push(args) } });
const host = { querySelector: selector => selector.includes("fortification-repair") ? { textContent: "Fully repaired — wall integrity restored" } : expiry, querySelectorAll: () => [mirror] };
ui.updateTiming(host, 20); assert.equal(expiry.textContent, "Expiring soon"); assert.equal(mirror.textContent, "Fully repaired — wall integrity restored"); assert.deepEqual(toggles.pop(), ["urgent", true]);
ui.updateTiming(host, 590); assert.equal(expiry.textContent, "Expires in"); assert.deepEqual(toggles.pop(), ["urgent", false]);
console.log("Validated Scout Report snapshot values, zero/breached walls, camp and historical fallback, no-disclosure boundaries, escaping, viewer order, saved flag/navigation hooks and mirrored timers.");
