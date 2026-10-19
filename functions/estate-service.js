"use strict";
const crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const E = require("./estate-economy");
const S = require("./estate-services");
const F = require("./guild-facilities");
const M = require("./guild-missions");
const G = require("./common-gear");
const CROWNS = require("./cosmetics");

function createEstateService({ db, HttpsError, runTransaction, assertCurrentPlayerProfile,
  prepareEconomy, writeEconomy, economyResponse, rawMainGoldRate, normalizeGear, guildRealm, creditGuildTroops }) {
  const stateRef = uid => db.doc(`players/${uid}/estate/state`);
  const championRef = (uid, id) => db.doc(`players/${uid}/estateChampions/${id}`);
  const receiptRef = (uid, id) => db.doc(`players/${uid}/estateReceipts/${id}`);
  const quoteRef = (uid, id) => db.doc(`players/${uid}/estateQuotes/${id}`);
  const privateMissionRef = (uid, id) => db.doc(`players/${uid}/estateMissionResults/${id}`);
  const reportRef = (uid, id) => db.doc(`players/${uid}/estateGuildReports/${id}`);
  const profileRealm = account => ({ resetGeneration: account.profile.data().resetGeneration, worldId: account.profile.data().worldId,
    realmShardId: account.profile.data().realmShardId || "legacy" });
  function id(value) {
    if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{8,96}$/.test(value)) E.fail("A valid estate request ID is required.", "invalid-argument");
    return value;
  }
  const translate = async action => {
    try { return await action(); } catch (error) {
      if (error instanceof HttpsError) throw error;
      if (error.code && ["failed-precondition", "invalid-argument", "resource-exhausted"].includes(error.code))
        throw new HttpsError(error.code, error.message);
      throw error;
    }
  };
  async function read(tx, uid, now, extraIds = []) {
    const [saved, profile, wallet] = await Promise.all([
      tx.get(stateRef(uid)), tx.get(db.doc(`players/${uid}`)), tx.get(db.doc(`players/${uid}/cosmetics/state`)),
    ]);
    // A transaction may retry after a newer request settled this account. Use
    // a fresh server clock after the read, rather than the older request start.
    now = Math.max(now, Date.now());
    if (!profile.exists) E.fail("Enter your kingdom before opening the estate.");
    const state = E.normalize(saved.exists ? saved.data() : null, now), champions = {};
    const before = JSON.stringify([state.levels, state.jobs, state.quests, state.entitlements, state.productionOrders, state.productionPolicyVersion, state.guild]);
    const ids = [...new Set([...state.activeChampionIds, ...extraIds])];
    if (ids.length) {
      const records = await tx.getAll(...ids.map(key => championRef(uid, id(key))));
      for (const record of records) if (record.exists) champions[record.id] = record.data();
    }
    const privateResults = {};
    const due = (state.guild?.missions || []).filter(mission => mission.completesAtMs <= now);
    if (due.length) for (const record of await tx.getAll(...due.map(mission => privateMissionRef(uid, id(mission.id)))))
      if (record.exists) privateResults[record.id] = record.data();
    const gear = normalizeGear(profile.data());
    const historical = [];
    for (const item of Object.values(gear.instances)) {
      const definition = G.getDefinition(item.gearKey); if (definition) historical.push([definition.buildingId, G.RARITIES.indexOf(definition.rarity)]);
    }
    for (const receipt of gear.recentUpgradeReceipts) {
      const definition = G.getDefinition(receipt.resultGearKey); if (definition) historical.push([definition.buildingId, G.RARITIES.indexOf(definition.rarity)]);
    }
    const pending = state.chestEntitlement ? null : await tx.get(db.collection(`players/${uid}/seasonRewards`).where("uncommonGearBoxes", ">", 0).limit(1));
    if (gear.uncommonGearBoxes || gear.lastUncommonOpenReceipt?.requestId || pending?.size) state.chestEntitlement = 1;
    for (const building of Object.keys(G.BUILDINGS)) state.entitlements[building] = Math.max(
      state.entitlements[building] || 0, state.chestEntitlement || 0, E.rarityIndex(state.levels[building]),
      ...historical.filter(([key]) => key === building).map(([, tier]) => tier));
    state.entitlementVersion = 1;
    const completed = [];
    E.settle(state, now, job => completed.push(job));
    const guildCompleted = F.settle(state, now);
    M.migrate(state, champions);
    S.settleQuests(state, champions, now);
    const guildReports = M.settle(state, champions, privateResults, now, { resetGeneration: profile.data().resetGeneration,
      worldId: profile.data().worldId, realmShardId: profile.data().realmShardId || "legacy" });
    for (const building of Object.keys(G.BUILDINGS)) state.entitlements[building] = Math.max(state.entitlements[building], E.rarityIndex(state.levels[building]));
    if (before !== JSON.stringify([state.levels, state.jobs, state.quests, state.entitlements, state.productionOrders, state.productionPolicyVersion, state.guild])) state.revision++;
    if (state.recruitOffers?.day !== S.utcDay(now) || !state.recruitOffers?.offers?.length)
      state.recruitOffers = { day: S.utcDay(now), offers: S.offers(state, now, 285) };
    M.migrate(state, champions);
    return { now, state, champions, completed, guildCompleted, guildReports, profile, wallet: CROWNS.normalize(wallet.exists ? wallet.data() : {}),
      ref: stateRef(uid), walletRef: wallet.ref };
  }
  function save(tx, uid, account) {
    tx.set(account.ref, account.state);
    for (const job of [...account.state.jobs, ...account.completed]) tx.set(db.doc(`players/${uid}/estateContracts/${job.id}`), job);
    for (const job of [account.state.guild.roomJob, account.guildCompleted].filter(Boolean))
      tx.set(db.doc(`players/${uid}/estateContracts/${job.id}`), job);
    for (const [key, champion] of Object.entries(account.champions)) tx.set(championRef(uid, key), champion);
    for (const report of account.guildReports) tx.set(reportRef(uid, report.reportId), report);
  }
  function result(account, now) {
    return { ok: true, estate: E.snapshot(account.state, now), champions: account.champions,
      guildCatalogue: M.catalogue(account.state), crowns: account.wallet.crowns, cosmetics: account.wallet, serverNowMs: now };
  }
  async function load(uid, now = Date.now(), includeUpgradeOverview = false) {
    return translate(() => runTransaction(async tx => {
      const account = await read(tx, uid, now);
      now = account.now;
      assertCurrentPlayerProfile(account.profile.data());
      const economy = includeUpgradeOverview ? await prepareEconomy(tx, uid, now) : null;
      const upgradeOverview = economy ? E.upgradeOverview(account.state, economy.goldFloat, rawMainGoldRate(economy)) : null;
      const guildOverview = economy ? F.overview(account.state, rawMainGoldRate(economy)) : null;
      save(tx, uid, account);
      if (economy) writeEconomy(tx, economy);
      return { ...(economy ? economyResponse(economy) : {}), ...result(account, now), ...(upgradeOverview ? { upgradeOverview, guildOverview,
        guildContext: { ...guildRealm(economy, now), materialRates: Object.fromEntries(E.KEYS.map(key=>[key,E.quoteRate(account.state,key)])) } } : {}) };
    }));
  }
  function validateInput(input) {
    if (!input || typeof input !== "object" || Array.isArray(input) || JSON.stringify(input).length > 5000)
      E.fail("Invalid estate action.", "invalid-argument");
    if (!["fund", "deposit", "processor", "reserves", "produce", "pause", "commission", "claimCommission", "recruit", "roster", "quest", "claimParcel", "supply", "guildRoom", "guildParty", "guildMentor", "guildMission", "guildClaim"].includes(input.action))
      E.fail("Unknown estate action.", "invalid-argument");
    if (input.championId) id(input.championId);
    extraChampionIds(input);
  }
  function extraChampionIds(input) {
    const ids = input.action === "guildParty" && input.remove !== true ? input.championIds
      : input.action === "guildMentor" && input.clear !== true ? [input.mentorId, input.pupilId]
        : input.championId ? [input.championId] : [];
    if (!Array.isArray(ids) || ids.length > 4) E.fail("Choose up to four owned champions.", "invalid-argument");
    return ids.map(id);
  }
  function makeQuote(account, input, now, goldRate, context = profileRealm(account)) {
    const state = account.state;
    switch (input.action) {
      case "guildRoom": return F.roomQuote(state, input.room, goldRate);
      case "guildParty": return F.partyQuote(state, input, account.champions);
      case "guildMentor": return F.mentoringQuote(state, input, account.champions, now);
      case "guildMission": return M.quote(state, input, account.champions, now, context);
      case "guildClaim": return M.claimQuote(state, input.rewardId, context,
        Object.keys(normalizeGear(account.profile.data()).instances).length < G.INVENTORY_LIMIT, now);
      case "fund": return E.constructionQuote(state, input.building, input.count ?? 1, goldRate);
      // Accepted deposit receipts replay before validation; unaccepted old
      // quotes and new deposit requests must not create any more credit.
      case "deposit": E.fail("Material deposits are no longer available. Open Build or Upgrade to start with your resources.");
      case "processor": E.fail("Automatic processing is no longer available. Choose a quantity and start production in the building.");
      case "produce": return E.productionQuote(state, input.building, input.quantity);
      case "reserves": {
        const producer = E.C.producers.find(p => p.building === input.building && Object.keys(p.inputs).length);
        if (!producer || !state.levels[input.building]) E.fail("Choose a constructed processor.");
        const reserves = input.reserves || {};
        for (const [key, amount] of Object.entries(reserves)) {
          if (!Object.hasOwn(producer.inputs, key)) E.fail("That material is not an input to this processor.");
          E.integer(amount, 0, E.capacity(state, key), "Reserve must fit storage.");
        }
        return { action: "reserves", building: input.building, reserves };
      }
      case "pause": {
        const clone = structuredClone(state);
        if (typeof input.paused !== "boolean") E.fail("Choose pause or resume.");
        E.pauseJob(clone, input.jobId, input.paused, now);
        return { action: "pause", jobId: input.jobId, paused: input.paused, nonrefundable: true };
      }
      case "commission": return S.commissionQuote(state, input.building, input.family);
      case "claimCommission": {
        const order = state.commissions[input.building];
        if (!order || order.completesAtMs > now) E.fail("The commission is not ready.");
        return { action: "claimCommission", building: input.building, orderId: order.id, gearKey: order.gearKey };
      }
      case "recruit": {
        const offer = state.recruitOffers.offers.find(offer => offer.id === input.offerId);
        if (!offer || offer.claimed) E.fail("This recruitment offer is unavailable.");
        return { ...offer, action: "recruit", offerId: offer.id,
          gold: Math.ceil(Math.max(285, goldRate) * [.2, .5, 1, 2, 4][offer.quality]) };
      }
      case "roster": {
        const champion = account.champions[input.championId];
        if (!champion || typeof input.active !== "boolean") E.fail("Choose an owned champion.");
        if (champion.questId || champion.recoveryUntilMs > now || F.busyMentor(state, champion.id, now)) E.fail("This champion must finish their quest, mentoring and recovery first.");
        const isActive = state.activeChampionIds.includes(champion.id);
        if (isActive === input.active) E.fail("That champion is already in this roster.");
        if (input.active && state.activeChampionIds.length >= S.rosterLimit(state)) E.fail("Your active roster is full. Bench an idle champion first.");
        return { action: "roster", championId: champion.id, active: input.active };
      }
      case "quest": E.fail("Choose a contract in the updated Guild. Already accepted expeditions keep their original terms.");
      case "claimParcel": {
        const clone = structuredClone(state), received = S.claimParcel(clone, input.parcelId);
        return { action: "claimParcel", parcelId: input.parcelId, received };
      }
      case "supply": return S.supplyQuote(state, input.resource, input.hours, now);
      default: E.fail("Unknown estate action.", "invalid-argument");
    }
  }
  async function quote(uid, input, now = Date.now()) {
    return translate(async () => {
      validateInput(input);
      const quoteId = crypto.randomUUID();
      return runTransaction(async tx => {
        const account = await read(tx, uid, now, extraChampionIds(input));
        now = account.now;
        assertCurrentPlayerProfile(account.profile.data());
        let economy = null;
        if (["fund", "recruit", "guildRoom", "guildMission", "guildClaim"].includes(input.action)) economy = await prepareEconomy(tx, uid, now);
        const value = makeQuote(account, input, now, economy ? rawMainGoldRate(economy) : 285, economy ? guildRealm(economy, now) : profileRealm(account));
        const record = { id: quoteId, input, value, revision: account.state.revision, createdAtMs: now,
          expiresAtMs: Math.min(now + 5 * 60000, Date.parse(S.utcDay(now)) + S.DAY),
          resetGeneration: account.profile.data().resetGeneration, worldId: account.profile.data().worldId, realmShardId: account.profile.data().realmShardId || "legacy" };
        save(tx, uid, account);
        if (economy) writeEconomy(tx, economy);
        tx.create(quoteRef(uid, quoteId), record);
        return { ...(economy ? economyResponse(economy) : {}), ...result(account, now), quote: record };
      });
    });
  }
  async function execute(uid, request, assertCurrentRequest, now = Date.now()) {
    return translate(async () => {
      const requestId = id(request.requestId), quoteId = id(request.quoteId);
      if(requestId.startsWith("quote_"))E.fail("Reserved request ID prefix.","invalid-argument");
      return runTransaction(async tx => {
        const [receipt, quoted] = await Promise.all([tx.get(receiptRef(uid, requestId)), tx.get(quoteRef(uid, quoteId))]);
        if (receipt.exists) {
          if (receipt.data().quoteId !== quoteId) E.fail("This request ID belongs to another estate action.", "invalid-argument");
          // Before current-realm validation: old-world retries reconcile the
          // original payment without touching either world's wallet.
          return { ok: true, replayed: true, receipt: receipt.data(), serverNowMs: now };
        }
        assertCurrentRequest();
        if (!quoted.exists || quoted.data().expiresAtMs <= now) E.fail("This quote expired. Review a fresh quote.");
        const q = quoted.data();
        const used = await tx.get(receiptRef(uid, "quote_" + quoteId));
        if (used.exists) E.fail("That quote has already been accepted. Refresh your estate.");
        const account = await read(tx, uid, now, extraChampionIds(q.input));
        now = account.now;
        if (q.expiresAtMs <= now) E.fail("This quote expired. Review a fresh quote.");
        assertCurrentPlayerProfile(account.profile.data());
        if (q.resetGeneration !== account.profile.data().resetGeneration || q.worldId !== account.profile.data().worldId || q.realmShardId !== (account.profile.data().realmShardId || "legacy"))
          E.fail("Review a new quote in the current realm.");
        if (q.revision !== account.state.revision) E.fail("Your estate changed. Review a new quote.");
        const state = account.state, value = q.value;
        if (value.nonrefundable && request.acceptPermanentCredit !== true) E.fail("Confirm that this payment becomes permanent, nonrefundable building credit.");
        let economy = null, profileOverrides = {}, details = {};
        if (["fund", "recruit", "claimCommission", "guildRoom", "guildMission", "guildClaim"].includes(value.action)) economy = await prepareEconomy(tx, uid, now);
        // Revalidate dynamic eligibility. Accepted contracts themselves never reprice.
        const fresh = makeQuote(account, q.input, now, economy ? rawMainGoldRate(economy) : 285, economy ? guildRealm(economy, now) : profileRealm(account));
        // Stored maps can return in a different key order (notably PostgreSQL
        // JSONB). Compare the full terms, including array order and value types.
        if (!isDeepStrictEqual(fresh, value)) E.fail("This quote changed. Review the current price and reward.");
        if (value.gold) {
          if (economy.goldFloat < value.gold) E.fail("Not enough Gold.");
          const goldFloat = economy.goldFloat - value.gold;
          profileOverrides = { goldFloat, gold: Math.floor(goldFloat) };
        }
        switch (value.action) {
          case "guildRoom": F.startRoom(state, value, requestId, now); break;
          case "guildParty": F.saveParty(state, value, requestId); break;
          case "guildMentor": F.assignMentor(state, value); break;
          case "guildMission": {
            M.launch(state, value, requestId, account.champions, now);
            tx.create(privateMissionRef(uid, requestId), M.resolve(value));
            details.missionId = requestId;
            break;
          }
          case "guildClaim": {
            const received = value.received;
            if (received.gold) {
              const goldFloat = economy.goldFloat + received.gold;
              if (!Number.isFinite(goldFloat) || goldFloat > Number.MAX_SAFE_INTEGER) E.fail("The Gold balance cannot receive this reward yet.");
              Object.assign(profileOverrides, { goldFloat, gold: Math.floor(goldFloat) });
            }
            if (received.troops && !creditGuildTroops(economy, value.mainCityPath, received.troops, now)) E.fail("Return to the original Main City to claim these troops.");
            if (received.gearKey) {
              const gear = normalizeGear(economy.profileAfter);
              if (Object.keys(gear.instances).length >= G.INVENTORY_LIMIT) E.fail("Your Gear Bag is full. The item will wait safely.");
              const instanceId = "cg_guild_" + requestId;
              gear.instances[instanceId] = G.normalizeInstance({ instanceId, gearKey: received.gearKey, level: 1, isNew: true, acquiredAtMs: now, requiresBuildingLevel: true });
              gear.newMarkers[G.getDefinition(received.gearKey).buildingId] = true; gear.updatedAtMs = now;
              profileOverrides.gear = gear; details.instanceId = instanceId;
            }
            M.claim(state, value); details.received = received; break;
          }
          case "fund":
            E.fund(state, value, requestId, now);
            break;
          case "produce": E.startProduction(state, value, requestId, now); break;
          case "reserves":
            Object.assign(state.reserves, value.reserves); break;
          case "pause": E.pauseJob(state, value.jobId, value.paused, now); break;
          case "commission":
            E.spend(state, value.materials);
            state.commissions[value.building] = { ...value, id: requestId, completesAtMs: now + value.durationMs }; break;
          case "claimCommission": {
            const gear = normalizeGear(economy.profileAfter);
            if (Object.keys(gear.instances).length >= G.INVENTORY_LIMIT) E.fail("Your Gear Bag is full. The commissioned item will wait safely.");
            const instanceId = "cg_estate_" + requestId;
            gear.instances[instanceId] = G.normalizeInstance({ instanceId, gearKey: value.gearKey, level: 1, isNew: true, acquiredAtMs: now, requiresBuildingLevel: true });
            gear.newMarkers[value.building] = true; gear.updatedAtMs = now;
            profileOverrides.gear = gear; details.instanceId = instanceId;
            delete state.commissions[value.building]; break;
          }
          case "recruit": {
            const championId = "champion_" + value.offerId;
            const active = state.activeChampionIds.length < S.rosterLimit(state);
            const { action, offerId, gold, day, claimed, ...member } = value;
            account.champions[championId] = { ...member, id: championId,
              level: value.level, xp: 0, active, questId: "", recoveryUntilMs: 0, acquiredAtMs: now };
            if (active) state.activeChampionIds.push(championId);
            state.recruitOffers.offers.find(offer => offer.id === value.offerId).claimed = true;
            details.championId = championId; break;
          }
          case "roster":
            account.champions[value.championId].active = value.active;
            state.activeChampionIds = state.activeChampionIds.filter(id => id !== value.championId);
            if (value.active) state.activeChampionIds.push(value.championId);
            break;
          case "claimParcel": details.received = S.claimParcel(state, value.parcelId); break;
          case "supply":
            if (account.wallet.crowns < value.crowns) E.fail("Not enough Crowns.");
            account.wallet.crowns -= value.crowns; account.wallet.revision++;
            if (state.supplyUsage.day !== value.day) state.supplyUsage = { day: value.day, hours: 0 };
            state.supplyUsage.hours += value.hours; state.stock[value.resource] += value.quantity;
            tx.set(account.walletRef, account.wallet); break;
          default: E.fail("Unknown action.", "invalid-argument");
        }
        state.revision++;
        const record = { requestId, quoteId, action: value.action, quote: value, acceptedAtMs: now,
          resetGeneration: q.resetGeneration, ...details };
        save(tx, uid, account);
        if (economy) writeEconomy(tx, economy, profileOverrides);
        tx.create(receiptRef(uid, requestId), record);
        tx.create(receiptRef(uid, "quote_" + quoteId), { requestId, acceptedAtMs: now });
        return { ...(economy ? economyResponse(economy, profileOverrides) : {}), ...result(account, now), receipt: record, replayed: false };
      });
    });
  }
  async function bench(uid, cursor = "") {
    return translate(async () => {
      if (cursor) id(cursor);
      let query = db.collection(`players/${uid}/estateChampions`).orderBy("__name__").limit(25);
      if (cursor) query = query.startAfter(cursor);
      return runTransaction(async tx => {
        const records = await tx.get(query);
        const account = await read(tx, uid, Date.now(), records.docs.map(doc => doc.id));
        assertCurrentPlayerProfile(account.profile.data());
        save(tx, uid, account);
        return { champions: records.docs.map(doc => account.champions[doc.id]), nextCursor: records.size === 25 ? records.docs[24].id : "" };
      });
    });
  }
  async function reports(uid, cursor = "", reportId = "") {
    return translate(async () => {
      if (reportId) {
        const record = await reportRef(uid, id(reportId)).get();
        if (!record.exists) E.fail("This report is unavailable.");
        return { report: record.data() };
      }
      if (cursor) id(cursor);
      let query = db.collection(`players/${uid}/estateGuildReports`).orderBy("__name__", "desc").limit(25);
      if (cursor) query = query.startAfter(cursor);
      const records = await query.get();
      return { reports: records.docs.map(doc => doc.data()), nextCursor: records.size === 25 ? records.docs[24].id : "" };
    });
  }
  async function prepareGearPromotion(tx, uid, building, rarity, now) {
    const account = await read(tx, uid, now);
    const requiredLevel = E.C.gearMilestones[G.RARITIES.indexOf(rarity)]?.[0];
    if (!G.BUILDINGS[building] || !requiredLevel) throw new HttpsError("invalid-argument", "Unknown officer Gear rarity.");
    if (account.state.levels[building] < requiredLevel)
      throw new HttpsError("failed-precondition", "Upgrade " + G.BUILDINGS[building].name + " to Level " + requiredLevel + " to unlock " + rarity + " Gear. Current building Level " + account.state.levels[building] + ".");
    return account;
  }
  return { stateRef, championRef, receiptRef, load, quote, execute, bench, reports, prepareGearPromotion, save };
}
module.exports = { createEstateService };
