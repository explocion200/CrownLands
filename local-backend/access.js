"use strict";
// Application-side document permissions corresponding to firestore.rules.
// Nothing in this module opens a database endpoint. All authorization reads
// must share the transaction used for the requested read/write.
const { isDeepStrictEqual: same } = require("node:util");
const { Timestamp, segments } = require("./values");
const FLAGS = require("../functions/playerFlagConfig");
const own = (object, key) => Object.hasOwn(object || {}, key);
const value = (object, key, fallback) => own(object, key) ? object[key] : fallback;
const map = object => object && Object.getPrototypeOf(object) === Object.prototype;
const allowed = (keys, set) => keys.every(key => set.includes(key));
const name = text => typeof text === "string" && /^[A-Za-z0-9 _.-]{1,18}$/.test(text);
const PREMIUM = Object.freeze({ "halloween-pumpkin": "halloween_pumpkin", "halloween-bat": "halloween_bat", "halloween-skull": "halloween_skull", "halloween-raven": "halloween_raven" });
const PRIVATE_PLAYER = ["estate", "estateChampions", "estateReceipts", "estateQuotes", "estateContracts", "estateGuildReports", "cosmetics", "cosmeticReceipts", "stamina", "staminaReceipts", "notificationTokens"];
const CURRENT_PLAYER = ["incomingArmies", "serverReports", "stats", "objectiveStats", "dailyMissions", "seasonalAchievements", "serverMembership", "retaliationWindows"];
const PROFILE_UPDATE = ["uid", "displayName", "email", "photoURL", "activeSession", "lastLoginAt", "updatedAt", "version", "snapshotKind", "activeIslandId", "activeRegionId", "playerName", "flag", "identityRevision", "daily", "scoutReports", "battleReports", "marchPercent", "lastSelectedOwnedCityId", "gameSeconds", "localGameSeconds", "lastRealTimeMs", "lastSeenAtMs"];
const PROFILE_CREATE_DENIED = ["gold", "goldFloat", "shopItems", "gear", "itemEffects", "peaceShieldCooldownExpiresAtMs", "peaceShieldCooldownResetGeneration", "itemPurchaseCooldowns", "clanShopUsage", "dailyLoginReward", "cityUpgradeReceipts", "reportsViewedAtMs", "realmAnnouncementSeenThroughMs", "lastRealmAnnouncementEventId", "inactivityNotice", "worldSlotResetAtMs", "economyUpdatedAtMs", "pendingAwayProduction", "troopProduction25Exclusion", "offlineProductionCities", "kingPower", "kingPowerVersion", "kingPowerUpdatedAtMs", "stationedReinforcementTroops", "reinforcementResetGeneration", "committedRallyTroops", "rallyResetGeneration", "towerGarrisonTroops", "towerGarrisonResetGeneration", "activeClanReinforcementTargets", "activeClanReinforcementAssignments", "clanReinforcementLimitResetGeneration", "clanReinforcementLimitVersion", "clanObjectiveAccrual", "pendingClanObjectiveAccrual", "cityCount", "globalStats", "character", "upgrades", "skillPresets", "skillPointSystemVersion", "skillPointSystemResetAtMs", "skillPointSystemRollbackAtMs", "freeSkillResetGrantVersion", "freeSkillResetCredits", "cityUpgradeXpDaily", "mainCityId", "mainIslandId", "mainRegionId", "mainCityChangedAtMs", "lastCityRelinquishedAtMs", "mainCityAssignmentVersion", "clanId", "clanName", "clanTag", "clanRole", "clanIdentityRevision", "clanIdentityRevisionVersion", "clanIdentityUpdatedAtMs", "clanJoinCooldownUntilMs", "formerClanCityProtection", "pendingClanApplicationId", "resetGeneration", "worldId", "realmShardId", "releaseId", "cloudSaveSlot", "identityRevision"];
const deny = () => Object.assign(Error("This game data is not available to this account."), { code: "permission-denied" });

class Access {
  constructor({ store, transaction, auth, now = Date.now() }) {
    if (!auth?.uid || typeof auth.uid !== "string" || auth.uid.includes("/")
      || (auth.token?.firebase?.sign_in_provider === "password" && auth.token.email_verified !== true)) throw deny();
    this.store = store; this.tx = transaction; this.uid = auth.uid; this.now = now; this.cache = new Map();
  }
  read(path) {
    if (!this.cache.has(path)) this.cache.set(path, this.tx.get(this.store.doc(path)).then(snapshot => snapshot.data()));
    return this.cache.get(path);
  }
  async initialize() {
    [this.realm, this.profile] = await Promise.all([this.read("realmConfig/current"), this.read("players/" + this.uid)]);
    this.generation = value(this.realm, "resetGeneration", "fresh-2026-07-26-server-reset");
    this.world = value(this.realm, "worldId", "main-fresh-2026-07-26-server-reset");
    this.shard = value(this.profile, "realmShardId", "legacy");
    this.realmStorage = this.shard === "legacy" ? this.generation : this.generation + "--" + this.shard;
    return this;
  }
  current(data) { return data && value(data, "resetGeneration", "") === this.generation && value(data, "worldId", "") === this.world && value(data, "realmShardId", "legacy") === this.shard; }
  island(id) {
    if (this.shard !== "legacy") return id.startsWith(this.world + "--" + this.shard + "--");
    return id.startsWith(this.world + "-") && Boolean(id.slice(this.world.length + 1)) && id[this.world.length + 1] !== "-";
  }
  async member(clanId, manager = false) {
    if (!clanId || !this.current(this.profile) || this.profile.clanId !== clanId) return false;
    const [clan, member] = await Promise.all([this.read("clans/" + clanId), this.read(`clans/${clanId}/members/${this.uid}`)]);
    return Boolean(clan && clan.resetGeneration === this.generation && clan.worldId === this.world && clan.status === "active"
      && member?.uid === this.uid && member.status === "active" && this.current(member)
      && (!manager || ["leader", "officer"].includes(member.role)));
  }
  async scoutLodge(clanId, signal) {
    if (!await this.member(clanId) || !this.current(await this.read(`clans/${clanId}`))) return false;
    const T = require("../functions/holding-towers");
    const member = await this.read(`clans/${clanId}/members/${this.uid}`);
    if (!T.getEligibility(member, this.now, clanId).eligible) return false;
    const towers = (await Promise.all(T.TOWERS.map(t => this.read(`holdingTowers/${t.id}`))))
      .filter(t => this.current(t) && t.ownerKind === "clan" && t.clanId === clanId);
    if (towers.length !== 1 || !(T.materializeTowerState(towers[0], this.now).buildings.scout_lodge > 0)) return false;
    return !signal || (this.current(signal) && signal.towerId === towers[0].id && signal.ownershipRevision === towers[0].ownershipRevision);
  }
  async flag(flag) {
    if (!map(flag) || !allowed(Object.keys(flag), ["version", "primary", "secondary", "symbolColor", "pattern", "symbol"])
      || !["primary", "secondary", "pattern", "symbol"].every(key => own(flag, key))
      || (own(flag, "version") && flag.version !== 2) || !FLAGS.PATTERN_KEYS.includes(flag.pattern)
      || ![...FLAGS.SYMBOL_KEYS, ...Object.keys(FLAGS.LEGACY_SYMBOL_MAP)].includes(flag.symbol)
      || ![flag.primary, flag.secondary, ...(own(flag, "symbolColor") ? [flag.symbolColor] : [])].every(color => typeof color === "string" && /^#[0-9A-Fa-f]{6}$/.test(color))) return false;
    return !own(PREMIUM, flag.symbol) || (await this.read(`players/${this.uid}/cosmetics/state`))?.owned?.[PREMIUM[flag.symbol]] === true;
  }
  async optionalFlag(container) { return map(container) && (!own(container, "flag") || await this.flag(container.flag)); }
  async canQuery(query) {
    const has = (key, expected, op = "==") => (query.constraints.filters || []).some(filter => filter.kind === "field"
      && segments(filter.field).length === 1 && segments(filter.field)[0] === key && filter.op === op && same(filter.value, expected));
    const current = has("resetGeneration", this.generation) && has("worldId", this.world) && has("realmShardId", this.shard);
    const collection = query.scope.collection;
    if (query.scope.parent === undefined) return ["cities", "camps"].includes(collection) && current && has(collection === "cities" ? "ownerUid" : "holderUid", this.uid);
    const p = query.scope.parent.split("/"), [root, id, subcollection] = p;
    if (!query.scope.parent) {
      if (collection === "playerCosmetics") return true;
      if (collection === "players") return has("__name__", this.uid);
      if (["clans", "holdingTowers"].includes(collection)) return current;
      if (collection === "armies") return current && (has("ownerUid", this.uid) || has("participantUids", this.uid, "array-contains") || (has("rallyAttack", true) && has("targetOwnerUid", this.uid)));
      if (collection === "reinforcements") return current && has("status", "stationed") && (has("ownerUid", this.uid) || has("targetOwnerUid", this.uid));
      return false;
    }
    if (p.length === 4 && root === "islands" && subcollection === "camps" && collection === "rewardHistory") return this.island(id) && has("awardedToPlayerId", this.uid);
    if (p.length !== 2) return false;
    if (root === "socialAccounts") return id === this.uid && collection === "signals" && query.constraints.limit <= 1;
    if (root === "players") return id === this.uid && (PRIVATE_PLAYER.includes(collection) || (CURRENT_PLAYER.includes(collection) && current)
      || (collection === "saves" && has("__name__", "default-" + this.generation)));
    if (root === "realmGenerations") return id === this.generation && ((collection === "assignments" && has("__name__", this.uid)) || (collection === "expansion" && has("__name__", "current")));
    if (root === "islands") return this.island(id) && (["cities", "camps", "marauders", "armies", "presence"].includes(collection));
    if (["leaderboards", "pvpLeaderboards", "crownCitadelReigns", "strongholdLegacies"].includes(root)) return collection === "entries" && id === this.realmStorage && current;
    if (root === "clanLeaderboards") return collection === "entries" && id === this.realmStorage;
    if (root === "realmEvents") return collection === "activity" && id === this.realmStorage && current;
    if (root === "battleSnapshots") return collection === "entries" && id === this.realmStorage && current && has("participantUids", this.uid, "array-contains");
    if (root === "globalChat") return collection === "messages" && Boolean(this.current(this.profile)) && id === this.realmStorage && current && has("status", "visible");
    if (root === "clans") {
      if (collection === "members") return current;
      if (collection === "applications") return current && (has("__name__", this.uid) || await this.member(id, true));
      if (!await this.member(id)) return false;
      if (collection === "scoutIntelSignals") return current && has("__name__", "current") && query.constraints.limit <= 1 && await this.scoutLodge(id);
      if (collection === "rallies") return current;
      if (collection === "messages") return current && has("status", "visible");
      if (collection === "worldBenefits") return current && has("__name__", this.realmStorage);
      if (collection === "memberRewards") return current && has("__name__", this.uid);
      if (collection === "treasuryUsage") return current && has("uid", this.uid);
      if (collection === "treasury") return has("__name__", this.generation);
    }
    if (root === "holdingTowers" && collection === "garrison" && current) {
      if (has("__name__", this.uid)) return true;
      const tower = await this.read("holdingTowers/" + id);
      return Boolean(this.current(tower) && tower.clanId && has("clanId", tower.clanId) && await this.member(tower.clanId));
    }
    return false;
  }
  async canRead(path, data, method = "get") {
    const p = path.split("/"), [root, id, collection, record] = p;
    if (p.length < 2 || p.length % 2 || !["get", "list"].includes(method)) return false;
    // Recursive collection-group permissions also apply to a direct document.
    if (p.at(-2) === "cities" && this.current(data) && data.ownerUid === this.uid) return true;
    if (p.at(-2) === "camps" && this.current(data) && data.holderUid === this.uid) return true;
    if (p.length === 2) {
      if (root === "realmConfig") return id === "current";
      if (root === "playerCosmetics") return true;
      if (root === "players") return id === this.uid;
      if (["clans", "holdingTowers"].includes(root)) return Boolean(this.current(data));
      if (root === "pvpLeaderboards") return method === "get" && id === this.realmStorage;
      if (root === "islands") return this.island(id);
      if (root === "armies") return Boolean(this.current(data) && (data.ownerUid === this.uid
        || (data.rallyAttack === true && data.targetOwnerUid === this.uid)
        || (Array.isArray(data.participantUids) && data.participantUids.includes(this.uid))));
      if (root === "reinforcements") return Boolean(this.current(data) && data.status === "stationed" && [data.ownerUid, data.targetOwnerUid].includes(this.uid));
      return false;
    }
    if (p.length === 6 && root === "islands" && collection === "camps" && p[4] === "rewardHistory") return this.island(id) && data?.awardedToPlayerId === this.uid;
    if (p.length !== 4) return false;
    if (root === "realmGenerations") return id === this.generation && ((collection === "assignments" && record === this.uid) || (collection === "expansion" && record === "current"));
    if (root === "socialAccounts") return id === this.uid && collection === "signals" && record === "current";
    if (root === "players") {
      if (id !== this.uid) return false;
      if (PRIVATE_PLAYER.includes(collection)) return true;
      if (collection === "saves") return record === "default-" + this.generation;
      if (collection === "objectiveStats" && method === "get" && ["goldCamp", "warbandCamp", "relicCamp", "deedCamp"].includes(record)) return true;
      return CURRENT_PLAYER.includes(collection) && Boolean(this.current(data));
    }
    if (root === "realmEvents" && collection === "activity") return id === this.realmStorage && Boolean(this.current(data));
    if (["leaderboards", "pvpLeaderboards", "crownCitadelReigns", "strongholdLegacies"].includes(root) && collection === "entries") return id === this.realmStorage && Boolean(this.current(data));
    if (root === "clanLeaderboards" && collection === "entries") return id === this.realmStorage;
    if (root === "globalChat" && collection === "messages") return Boolean(this.current(this.profile) && id === this.realmStorage && this.current(data) && data.status === "visible");
    if (root === "battleSnapshots" && collection === "entries") return Boolean(id === this.realmStorage && this.current(data) && Array.isArray(data.participantUids) && data.participantUids.includes(this.uid));
    if (root === "holdingTowers" && collection === "garrison" && this.current(data)) {
      if (record === this.uid) return true;
      const tower = await this.read("holdingTowers/" + id);
      return Boolean(this.current(tower) && tower.clanId && tower.clanId === data.clanId && await this.member(tower.clanId));
    }
    if (root === "clans") {
      if (collection === "members") return Boolean(this.current(data));
      if (collection === "applications") return Boolean(this.current(data) && (record === this.uid || await this.member(id, true)));
      if (!await this.member(id)) return false;
      if (collection === "questProgress") return method === "get" && (!data || (data.questPeriodId === record && this.current(data)
        && data.weekStartAt instanceof Timestamp && data.weekEndAt instanceof Timestamp && this.now >= data.weekStartAt.toMillis() && this.now < data.weekEndAt.toMillis()));
      if (collection === "worldBenefits") return record === this.realmStorage && Boolean(this.current(data));
      if (collection === "memberRewards") return record === this.uid && Boolean(this.current(data));
      if (collection === "giftActivity") return method === "get" && record === this.realmStorage && (!data || Boolean(this.current(data)));
      if (collection === "scoutIntelSignals") return record === "current" && await this.scoutLodge(id, data);
      if (collection === "rallies") return Boolean(this.current(data));
      if (collection === "treasury") return record === this.generation && (!data || Boolean(this.current(data)));
      if (collection === "treasuryUsage") return data?.uid === this.uid && Boolean(this.current(data));
      if (collection === "messages") return data?.status === "visible" && Boolean(this.current(data));
      return false;
    }
    if (root === "islands" && this.island(id)) {
      if (["cities", "camps", "marauders", "armies", "presence"].includes(collection)) return true;
      if (collection === "reports") return !record.includes("_hold_");
    }
    return false;
  }
  async canWrite(path, before, after) {
    const [root, id, collection, record, extra] = path.split("/");
    if (extra) return false;
    const changed = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].filter(key => !same(before?.[key], after?.[key]) || own(before, key) !== own(after, key));
    if (root === "players" && id === this.uid) {
      if (!collection) {
        if (!map(after)) return false;
        if (!before) return value(after.shopItems, "shield_12h", 0) === 0 && (!own(after, "activeSession") || map(after.activeSession)) && value(after.activeSession, "version", 0) !== 2
          && (!own(after, "playerName") || name(after.playerName)) && await this.optionalFlag(after)
          && !Object.keys(after).some(key => PROFILE_CREATE_DENIED.includes(key));
        if (!allowed(changed, PROFILE_UPDATE) || (changed.includes("uid") && after.uid !== this.uid)) return false;
        if (changed.includes("activeSession") && ((own(before, "activeSession") && !map(before.activeSession)) || (own(after, "activeSession") && !map(after.activeSession)) || before.activeSession?.version === 2 || after.activeSession?.version === 2)) return false;
        if (changed.includes("playerName") && !name(after.playerName)) return false;
        if (changed.includes("flag") && !await this.flag(after.flag)) return false;
        if (changed.some(key => ["playerName", "flag", "identityRevision"].includes(key))) return allowed(changed, ["playerName", "flag", "identityRevision", "updatedAt"])
          && Number.isSafeInteger(after.identityRevision) && after.identityRevision === value(before, "identityRevision", 0) + 1 && before.resetGeneration === this.generation;
        return true;
      }
      if (collection === "notificationTokens") return !after || (after.uid === id && typeof after.token === "string" && after.token.length >= 20 && after.token.length <= 2048
        && typeof after.enabled === "boolean" && (!own(after, "installationId") || (typeof after.installationId === "string" && after.installationId.length >= 20 && after.installationId.length <= 160)));
      if (collection === "saves") return record === "default-" + this.generation && map(after) && map(this.profile)
        && (!own(after, "state") || await this.optionalFlag(after.state))
        && (!own(after, "playerName") || after.playerName === value(this.profile, "playerName", null))
        && (!own(after.state, "playerName") || after.state.playerName === value(this.profile, "playerName", null))
        && (!own(after.state, "flag") || same(after.state.flag, value(this.profile, "flag", null)));
    }
    if (root === "islands" && this.island(id)) {
      if (collection === "presence") return record === this.uid && (!after || await this.optionalFlag(after));
      if (collection === "cities") return Boolean(before && after && before.ownerUid === this.uid && after.ownerUid === this.uid
        && allowed(changed, ["ownerName", "ownerFlag", "updatedAt", "updatedBy"])
        && (!changed.includes("ownerName") || name(after.ownerName)) && (!changed.includes("ownerFlag") || await this.flag(after.ownerFlag)));
    }
    return false;
  }
}
module.exports = { Access, deny, PROFILE_UPDATE, PROFILE_CREATE_DENIED };
