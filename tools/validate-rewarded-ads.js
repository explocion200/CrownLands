const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const gameSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const firebaseClientSource = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const stylesSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const serviceWorkerSource = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const adsConfigSource = fs.readFileSync(path.join(root, "ads-config.js"), "utf8");
const privacySource = fs.readFileSync(path.join(root, "privacy.html"), "utf8");
const rulesSource = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}.`);
  const parametersStart = source.indexOf("(", start);
  let parameterDepth = 0;
  let bodyStart = -1;
  for (let index = parametersStart; index < source.length; index += 1) {
    if (source[index] === "(") parameterDepth += 1;
    if (source[index] === ")") {
      parameterDepth -= 1;
      if (parameterDepth === 0) {
        bodyStart = source.indexOf("{", index);
        break;
      }
    }
  }
  assert.ok(bodyStart >= 0, `Missing ${name} body.`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

function extractBetween(source, startText, endText) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start + startText.length);
  assert.ok(start >= 0 && end > start, `Missing source range ${startText}.`);
  return source.slice(start, end);
}

const context = {
  Date,
  Math,
  REWARDED_AD_REWARD_MINUTES: 30,
  REWARDED_AD_COOLDOWN_MS: 30 * 60 * 1000,
  REWARDED_AD_DAILY_LIMIT: 20,
  safeString: (value, maxLength = 1000) => String(value || "").slice(0, maxLength),
  safeNumber: (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  },
  clampInt: (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Math.floor(Number(value) || 0))),
  timestampToMs: value => {
    if (typeof value?.toMillis === "function") return value.toMillis();
    if (value instanceof Date) return value.getTime();
    return Number(value) || 0;
  },
};
vm.createContext(context);
vm.runInContext([
  extractFunction(serverSource, "getCurrentDateKey"),
  extractFunction(serverSource, "normalizeRewardedAdState"),
  extractFunction(serverSource, "createRewardedAdStatus"),
  extractFunction(serverSource, "getRewardedAdRewardAmount"),
].join("\n"), context, { filename: path.join(root, "functions", "index.js") });

assert.equal(context.getRewardedAdRewardAmount(101), 50, "The reward must floor half an hour of hourly production.");
assert.equal(context.getRewardedAdRewardAmount(1), 0, "Fractional production must not round up.");

const claimAt = Date.parse("2026-07-26T12:00:00.000Z");
const cooldownStatus = context.createRewardedAdStatus({
  dayKey: "2026-07-26",
  claimedToday: 1,
  lastClaimedAtMs: claimAt,
}, true, claimAt + (29 * 60 + 59) * 1000);
assert.equal(cooldownStatus.eligible, false);
assert.equal(cooldownStatus.reason, "cooldown");
assert.equal(cooldownStatus.cooldownRemainingMs, 1000);
assert.equal(cooldownStatus.cooldownEndsAtMs, claimAt + 30 * 60 * 1000);

const cooldownComplete = context.createRewardedAdStatus({
  dayKey: "2026-07-26",
  claimedToday: 1,
  lastClaimedAtMs: claimAt,
}, true, claimAt + 30 * 60 * 1000);
assert.equal(cooldownComplete.eligible, true, "The shared cooldown must end at exactly 30 minutes.");

const dailyLimit = context.createRewardedAdStatus({
  dayKey: "2026-07-26",
  claimedToday: 20,
  lastClaimedAtMs: claimAt - 31 * 60 * 1000,
}, true, claimAt);
assert.equal(dailyLimit.eligible, false);
assert.equal(dailyLimit.reason, "daily-limit");
assert.equal(dailyLimit.remainingToday, 0);

const utcReset = context.createRewardedAdStatus({
  dayKey: "2026-07-26",
  claimedToday: 20,
  lastClaimedAtMs: Date.parse("2026-07-26T22:00:00.000Z"),
}, true, Date.parse("2026-07-27T00:00:00.000Z"));
assert.equal(utcReset.claimedToday, 0);
assert.equal(utcReset.remainingToday, 20);
assert.equal(utcReset.eligible, true);

const baseRateSource = extractFunction(serverSource, "getRewardedAdBaseRates");
assert.match(baseRateSource, /isStronghold\(city\)/);
assert.match(baseRateSource, /getOwnerUid\(city\)\s*!==\s*economy\.uid/);
assert.match(baseRateSource, /baseGoldProductionPerHour/);
assert.match(baseRateSource, /baseTroopProductionPerHour/);
assert.match(baseRateSource, /includeStrongholdBoosts:\s*false/);
assert.match(baseRateSource, /includeWarDrums:\s*false/);
assert.match(baseRateSource, /includeRoyalTaxDecree:\s*false/);
assert.doesNotMatch(baseRateSource, /goldProductionPerHour[^:]/);
assert.doesNotMatch(baseRateSource, /troopProductionPerHour[^:]/);

assert.match(serverSource, /exports\.getRewardedAdStatus\s*=\s*onCall\(REWARDED_AD_STATUS_CALLABLE_OPTIONS/);
assert.match(serverSource, /exports\.prepareRewardedAd\s*=\s*onCall\(REWARDED_AD_MUTATION_CALLABLE_OPTIONS/);
assert.match(serverSource, /exports\.claimRewardedAd\s*=\s*onCall\(REWARDED_AD_MUTATION_CALLABLE_OPTIONS/);
assert.match(serverSource, /enforceAppCheck:\s*true/);
assert.match(serverSource, /consumeAppCheckToken:\s*true/);
assert.match(serverSource, /request\.app\.alreadyConsumed/);
assert.match(serverSource, /enabled:\s*config\.enabled\s*===\s*true/, "The server kill switch must fail closed.");
assert.match(serverSource, /rewardedAdIntents/);
assert.match(serverSource, /deleteAfter:\s*Timestamp\.fromMillis/);

const prepareSource = extractBetween(serverSource, "exports.prepareRewardedAd =", "exports.claimRewardedAd =");
assert.match(prepareSource, /transaction\.set\(intentRef,\s*intent\)/);
assert.match(prepareSource, /activeIntentId:\s*intentId/);
assert.match(prepareSource, /rewardAmount/);
assert.match(prepareSource, /claimByMs/);

const claimSource = extractBetween(serverSource, "exports.claimRewardedAd =", "exports.reserveHarvestBonusSpawn =");
assert.match(claimSource, /if\s*\(intent\.status\s*===\s*"claimed"\)/, "Claims must replay idempotently.");
assert.match(claimSource, /state\.activeIntentId\s*!==\s*intentId/);
assert.match(claimSource, /creditLevelUpTroopsToMainCity/);
assert.match(claimSource, /goldFloat[\s\S]*\+\s*rewardAmount/);
assert.match(claimSource, /lastClaimedAtMs:\s*nowMs/);
assert.match(claimSource, /claimedToday[\s\S]*state\.claimedToday\s*\+\s*1/);

assert.match(firebaseClientSource, /limitedUseAppCheckTokens:\s*true/);
assert.match(firebaseClientSource, /new client\.modules\.appCheck\.ReCaptchaEnterpriseProvider/);
assert.match(firebaseClientSource, /async function getRewardedAdStatus/);
assert.match(firebaseClientSource, /async function prepareRewardedAd/);
assert.match(firebaseClientSource, /async function claimRewardedAd/);

const rewardRenderer = extractFunction(gameSource, "renderRewardedAdShopItem");
assert.match(rewardRenderer, /data-rewarded-ad-watch/);
assert.ok(
  rewardRenderer.indexOf("shop-item-image-placeholder") < rewardRenderer.indexOf("data-rewarded-ad-watch"),
  "Watch Ad must render beneath the ad boost icon."
);
assert.match(rewardRenderer, /today \(UTC\)/);
assert.match(rewardRenderer, /Estimated reward:/);
assert.doesNotMatch(rewardRenderer, /City levels only/);
assert.doesNotMatch(gameSource, /Ad Manager setup required/);

const paidRenderer = extractFunction(gameSource, "renderShopItem");
assert.match(paidRenderer, /data-shop-buy/);
assert.match(paidRenderer, /item\.cost[\s\S]*gold/);
assert.doesNotMatch(paidRenderer, /data-rewarded-ad-watch/);

const rewardedFlow = extractFunction(gameSource, "requestGoogleRewardedAd");
assert.match(rewardedFlow, /OutOfPageFormat\.REWARDED/);
assert.match(rewardedFlow, /await loadGooglePublisherTag\(\)/);
assert.match(rewardedFlow, /rewardedSlotReady/);
assert.match(rewardedFlow, /rewardedSlotGranted/);
assert.match(rewardedFlow, /rewardedSlotClosed/);
assert.match(rewardedFlow, /slotRenderEnded/);
assert.match(rewardedFlow, /rememberPendingRewardedAdClaim\(intent\)/);
assert.match(rewardedFlow, /destroySlots\(\[slot\]\)/);
assert.match(rewardedFlow, /if\s*\(!granted\s*&&\s*!settled\)/);
assert.match(rewardedFlow, /REWARDED_AD_COMPLETION_TIMEOUT_MS/);
assert.match(rewardedFlow, /REWARDED_AD_DECISION_TIMEOUT_MS/);

const startFlow = extractFunction(gameSource, "startRewardedAdBoost");
assert.ok(
  startFlow.indexOf("await requestGoogleRewardedAd(intent)") < startFlow.indexOf("await claimPreparedRewardedAd(intent"),
  "The server claim must only run after the Google rewarded flow grants the slot."
);

assert.match(stylesSource, /\.rewarded-ad-shop-action[\s\S]*display:\s*grid/);
assert.match(stylesSource, /\.shop-item\.rewarded-ad-shop-item[\s\S]*grid-template-columns:\s*92px\s+minmax\(0,\s*1fr\)/);
assert.match(stylesSource, /\.shop-buy-btn\.rewarded-ad-watch-btn[\s\S]*width:\s*100%[\s\S]*min-width:\s*0/);
assert.match(stylesSource, /\.rewarded-ad-shop-copy[\s\S]*overflow-wrap:\s*anywhere/);
assert.match(stylesSource, /@media\s*\(max-width:\s*620px\)[\s\S]*?\.shop-rewarded-items\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
const publisherTagLoader = extractFunction(gameSource, "loadGooglePublisherTag");
assert.match(gameSource, /GOOGLE_PUBLISHER_TAG_URL\s*=\s*"https:\/\/securepubads\.g\.doubleclick\.net\/tag\/js\/gpt\.js"/);
assert.match(publisherTagLoader, /document\.createElement\("script"\)/);
assert.match(publisherTagLoader, /script\[data-crownlands-rewarded-gpt\]/);
assert.match(publisherTagLoader, /document\.head\.append\(script\)/);
assert.match(indexSource, /name="google-adsense-account"\s+content="ca-pub-6031755025291372"/);
assert.doesNotMatch(indexSource, /adsbygoogle\.js/);
assert.doesNotMatch(indexSource, /securepubads\.g\.doubleclick\.net/);
assert.doesNotMatch(indexSource, /loginDisplayAd|login-display-ad/);
assert.match(indexSource, /href="\/privacy\.html"/);
assert.match(indexSource, /ads-config\.js/);
assert.match(indexSource, /href="\/privacy\.html"/);
assert.match(gameSource, /assets\/optimized\/pickup-gold-[^"']+\.webp/);
assert.match(gameSource, /assets\/optimized\/pickup-troops-[^"']+\.webp/);
assert.match(serviceWorkerSource, /url\.pathname\.startsWith\("\/assets\/"\)/);
assert.match(serviceWorkerSource, /cacheFirst\(request\)/);
assert.doesNotMatch(serviceWorkerSource, /login-display-ad\.js/);
assert.match(adsConfigSource, /testAdUnitPath:\s*"\/22639388115\/rewarded_web_example"/);
assert.match(adsConfigSource, /approvedProductionHosts:\s*Object\.freeze/);
assert.doesNotMatch(adsConfigSource, /loginDisplayAd|publisherId|slotId/);
assert.doesNotMatch(stylesSource, /\.login-display-ad|\.adsbygoogle/);
assert.match(stylesSource, /\.login-game-info[\s\S]*?position:\s*absolute/);
assert.match(gameSource, /productionHostApproved\s*=\s*approvedProductionHosts\.has\(hostname\)/);
assert.match(gameSource, /productionHostApproved\s*\?\s*productionAdUnitPath\s*:\s*""/);
assert.match(adsConfigSource, /productionAdUnitPath:\s*""/);
assert.match(privacySource, /Google Ad Manager/);
assert.match(privacySource, /Google AdSense/);
assert.match(privacySource, /rewarded/i);
assert.match(rulesSource, /match\s+\/rewardedAds\/\{document=\*\*\}[\s\S]*?allow read, create, update, delete:\s*if false/);
assert.match(rulesSource, /match\s+\/rewardedAdIntents\/\{intentId\}[\s\S]*?allow read, create, update, delete:\s*if false/);
assert.match(rulesSource, /match\s+\/serverConfig\/\{configId\}[\s\S]*?allow read, create, update, delete:\s*if false/);

console.log("Validated rewarded ads with an ad-free login and click-triggered Google Publisher Tag loading.");
