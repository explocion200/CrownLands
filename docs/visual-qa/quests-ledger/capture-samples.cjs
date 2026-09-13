// Review fixtures only. Uses the existing mission generator; never connects to a backend.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const missions = require('../../../functions/dailyMissions');
const root = path.resolve(__dirname, '../../..');
const nowMs = Date.parse('2026-09-12T00:00:00Z');
const capacity = {
  cityCount: 12, totalCityLevels: 240, averageCityLevel: 20,
  gold: 900000, goldPerHour: 24000, troopPerHour: 12000,
  rewardGoldPerHour: 24000, rewardTroopPerHour: 12000,
  launchableTroops: 120000, maxSourceTroops: 75000,
  eligibleOpponentCount: 4, eligibleEnemyCityCount: 8, kingPower: 900000,
  safePvpTargets: [{ cityId: 'preview-target', regionId: 'preview-region', cityName: 'Stoneford', sourceCityName: 'Greyhaven', recommendedTroops: 4200, estimatedLosses: 340 }],
  maxCampCaptures: 4, feasibleCampTypes: ['gold', 'troops', 'items', 'deed'],
  deedCampEligible: true, strongholdEligible: true, clanGiftEligible: true,
  upgradeTargets: {
    easy: { totalLevels: 3, singleCityLevels: 2, uniqueCities: 2, goldSpendTarget: 12000 },
    medium: { totalLevels: 6, singleCityLevels: 3, uniqueCities: 3, goldSpendTarget: 24000 },
    hard: { totalLevels: 12, singleCityLevels: 6, uniqueCities: 6, goldSpendTarget: 48000 },
  },
  itemCosts: { royal_tax_decree_30m: 48000, war_drums_30m: 48000, swift_march_order: 48000, recall_horn: 48000 },
};
let standard, item;
for (let i = 0; i < 10000 && (!standard || !item); i++) {
  const state = missions.createDailyMissionState({ uid: `quest-design-${i}`, worldId: 'design-preview', resetGeneration: 'design-preview', nowMs, capacity });
  const families = state.missions.map(m => m.family);
  if (!standard && families.includes('TOTAL_CITY_LEVEL_UPGRADES') && families.includes('ENEMY_CITY_CAPTURE') && families.includes('GOLD_EARNED') && state.missions.every(m => m.reward.type !== 'item')) standard = state;
  if (!item && state.missions.some(m => m.reward.type === 'item')) item = state;
}
if (!standard || !item) throw Error('Could not capture the requested source-generated examples.');
standard.missions.sort((a, b) => ['TOTAL_CITY_LEVEL_UPGRADES', 'ENEMY_CITY_CAPTURE', 'GOLD_EARNED'].indexOf(a.family) - ['TOTAL_CITY_LEVEL_UPGRADES', 'ENEMY_CITY_CAPTURE', 'GOLD_EARNED'].indexOf(b.family));
standard.missions.forEach((m, slot) => { m.slot = slot; });
const replacement = missions.createReplacementMission(standard, standard.missions[0].id, capacity, nowMs + 3600000);
if (!replacement) throw Error('Replacement fixture unavailable.');
const largeCapacity = { ...capacity, gold: 900000000, goldPerHour: 24000000, rewardGoldPerHour: 24000000, troopPerHour: 12000000, rewardTroopPerHour: 12000000, launchableTroops: 120000000 };
const large = missions.createDailyMissionState({ uid: standard.uid, worldId: 'design-preview', resetGeneration: 'design-preview', nowMs, capacity: largeCapacity });
const replacements = Object.fromEntries(Object.entries({ standard, item, large }).map(([key, state]) => [key, Object.fromEntries(state.missions.map(m => [m.id, missions.createReplacementMission(state, m.id, key === 'large' ? largeCapacity : capacity, nowMs + 3600000)]))]));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/optimized/manifest.json'), 'utf8'));
const art = Object.fromEntries(manifest.assets.filter(a => ['hud', 'item'].includes(a.category)).map(a => [a.id, a.output]));
const payload = { standard, item, large, replacements, art, capturedFrom: '57fbf8b6f209ce438ec66910ed3e1b27c9d23fbd', sampleCapacity: capacity };
fs.writeFileSync(path.join(__dirname, 'samples.js'), '/* Source-generated synthetic review data. */\nwindow.QuestReviewSamples = ' + JSON.stringify(payload, null, 2) + ';\n');
const source = fs.readFileSync(path.join(root, 'city-details-ui.js'), 'utf8');
const match = source.match(/const cityDetailsIcons = (\{[\s\S]*?\n  \});/);
if (!match) throw Error('Approved City Details icon set unavailable.');
const icons = vm.runInNewContext('(' + match[1] + ')');
fs.writeFileSync(path.join(__dirname, 'icons.js'), '/* Engravings copied from the approved City Details icon set for this isolated draft. */\nwindow.QuestReviewIcons = ' + JSON.stringify(icons, null, 2) + ';\n');
console.log(JSON.stringify({ standard: standard.missions.map(m => ({title:m.title, difficulty:m.difficulty, target:m.target, reward:m.reward})), item: item.missions.find(m => m.reward.type === 'item').title, replacement: replacement.title }));
