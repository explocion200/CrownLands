"use strict";
const crypto = require("node:crypto");
const E = require("./estate-economy");
const S = require("./estate-services");
const G = require("./common-gear");
const CROWNS = require("./cosmetics");

function createEstateService({ db, HttpsError, runTransaction, assertCurrentPlayerProfile,
  prepareEconomy, writeEconomy, economyResponse, rawMainGoldRate, normalizeGear }) {
  const stateRef = uid => db.doc(`players/${uid}/estate/state`);
  const championRef = (uid, id) => db.doc(`players/${uid}/estateChampions/${id}`);
  const receiptRef = (uid, id) => db.doc(`players/${uid}/estateReceipts/${id}`);
  const quoteRef = (uid, id) => db.doc(`players/${uid}/estateQuotes/${id}`);
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
    const before = JSON.stringify([state.levels, state.jobs, state.quests, state.entitlements]);
    const ids = [...new Set([...state.activeChampionIds, ...extraIds])];
    if (ids.length) {
      const records = await tx.getAll(...ids.map(key => championRef(uid, id(key))));
      for (const record of records) if (record.exists) champions[record.id] = record.data();
    }
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
    S.settleQuests(state, champions, now);
    for (const building of Object.keys(G.BUILDINGS)) state.entitlements[building] = Math.max(state.entitlements[building], E.rarityIndex(state.levels[building]));
    if (before !== JSON.stringify([state.levels, state.jobs, state.quests, state.entitlements])) state.revision++;
    if (state.recruitOffers?.day !== S.utcDay(now) || !state.recruitOffers?.offers?.length)
      state.recruitOffers = { day: S.utcDay(now), offers: S.offers(state, now, 285) };
    return { now, state, champions, completed, profile, wallet: CROWNS.normalize(wallet.exists ? wallet.data() : {}),
      ref: stateRef(uid), walletRef: wallet.ref };
  }
  function save(tx, uid, account) {
    tx.set(account.ref, account.state);
    for (const job of [...account.state.jobs, ...account.completed]) tx.set(db.doc(`players/${uid}/estateContracts/${job.id}`), job);
    for (const [key, champion] of Object.entries(account.champions)) tx.set(championRef(uid, key), champion);
  }
  function result(account, now) {
    return { ok: true, estate: E.snapshot(account.state, now), champions: account.champions,
      crowns: account.wallet.crowns, cosmetics: account.wallet, serverNowMs: now };
  }
  async function load(uid, now = Date.now()) {
    return translate(() => runTransaction(async tx => {
      const account = await read(tx, uid, now);
      now = account.now;
      assertCurrentPlayerProfile(account.profile.data());
      save(tx, uid, account);
      return result(account, now);
    }));
  }
  function validateInput(input) {
    if (!input || typeof input !== "object" || Array.isArray(input) || JSON.stringify(input).length > 5000)
      E.fail("Invalid estate action.", "invalid-argument");
    if (!["fund", "deposit", "processor", "pause", "commission", "claimCommission", "recruit", "roster", "quest", "claimParcel", "supply"].includes(input.action))
      E.fail("Unknown estate action.", "invalid-argument");
    if (input.championId) id(input.championId);
  }
  function makeQuote(account, input, now, goldRate) {
    const state = account.state;
    switch (input.action) {
      case "fund": return E.constructionQuote(state, input.building, input.count ?? 1, goldRate);
      case "deposit": {
        const clone = structuredClone(state); E.deposit(clone, input.building, input.amounts);
        return { action: "deposit", building: input.building, amounts: input.amounts, target: state.levels[input.building] + 1, nonrefundable: true };
      }
      case "processor": {
        const producer = E.C.producers.find(p => p.building === input.building && Object.keys(p.inputs).length);
        if (!producer || !state.levels[input.building] || typeof input.enabled !== "boolean") E.fail("Choose a constructed processor.");
        const reserves = input.reserves || {};
        for (const [key, amount] of Object.entries(reserves)) {
          if (!Object.hasOwn(producer.inputs, key)) E.fail("That material is not an input to this processor.");
          E.integer(amount, 0, E.capacity(state, key), "Reserve must fit storage.");
        }
        return { action: "processor", building: input.building, enabled: input.enabled, reserves };
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
        if (champion.questId || champion.recoveryUntilMs > now) E.fail("This champion must finish their quest and recovery first.");
        const isActive = state.activeChampionIds.includes(champion.id);
        if (isActive === input.active) E.fail("That champion is already in this roster.");
        if (input.active && state.activeChampionIds.length >= S.rosterLimit(state)) E.fail("Your active roster is full. Bench an idle champion first.");
        return { action: "roster", championId: champion.id, active: input.active };
      }
      case "quest": return S.questQuote(state, input, account.champions, now);
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
        const account = await read(tx, uid, now, input.championId ? [input.championId] : []);
        now = account.now;
        assertCurrentPlayerProfile(account.profile.data());
        let economy = null;
        if (["fund", "recruit"].includes(input.action)) economy = await prepareEconomy(tx, uid, now);
        const value = makeQuote(account, input, now, economy ? rawMainGoldRate(economy) : 285);
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
        const account = await read(tx, uid, now, q.input.championId ? [q.input.championId] : []);
        now = account.now;
        if (q.expiresAtMs <= now) E.fail("This quote expired. Review a fresh quote.");
        assertCurrentPlayerProfile(account.profile.data());
        if (q.resetGeneration !== account.profile.data().resetGeneration || q.worldId !== account.profile.data().worldId || q.realmShardId !== (account.profile.data().realmShardId || "legacy"))
          E.fail("Review a new quote in the current realm.");
        if (q.revision !== account.state.revision) E.fail("Your estate changed. Review a new quote.");
        const state = account.state, value = q.value;
        if (value.nonrefundable && request.acceptPermanentCredit !== true) E.fail("Confirm that this payment becomes permanent, nonrefundable building credit.");
        let economy = null, profileOverrides = {}, details = {};
        if (["fund", "recruit", "claimCommission"].includes(value.action)) economy = await prepareEconomy(tx, uid, now);
        // Revalidate dynamic eligibility. Accepted contracts themselves never reprice.
        const fresh = makeQuote(account, q.input, now, economy ? rawMainGoldRate(economy) : 285);
        if (JSON.stringify(fresh) !== JSON.stringify(value)) E.fail("This quote changed. Review the current price and reward.");
        if (value.gold) {
          if (economy.goldFloat < value.gold) E.fail("Not enough Gold.");
          const goldFloat = economy.goldFloat - value.gold;
          profileOverrides = { goldFloat, gold: Math.floor(goldFloat) };
        }
        switch (value.action) {
          case "fund":
            E.fund(state, value, requestId, now);
            break;
          case "deposit": E.deposit(state, value.building, value.amounts); break;
          case "processor":
            state.processors[value.building] = value.enabled;
            Object.assign(state.reserves, value.reserves); break;
          case "pause": E.pauseJob(state, value.jobId, value.paused, now); break;
          case "commission":
            E.spend(state, value.materials);
            state.commissions[value.building] = { ...value, id: requestId, completesAtMs: now + value.durationMs }; break;
          case "claimCommission": {
            const gear = normalizeGear(economy.profileAfter);
            if (Object.keys(gear.instances).length >= G.INVENTORY_LIMIT) E.fail("Your Gear Bag is full. The commissioned item will wait safely.");
            const instanceId = "cg_estate_" + requestId;
            gear.instances[instanceId] = G.normalizeInstance({ instanceId, gearKey: value.gearKey, level: 1, isNew: true, acquiredAtMs: now });
            gear.newMarkers[value.building] = true; gear.updatedAtMs = now;
            profileOverrides.gear = gear; details.instanceId = instanceId;
            delete state.commissions[value.building]; break;
          }
          case "recruit": {
            const championId = "champion_" + value.offerId;
            const active = state.activeChampionIds.length < S.rosterLimit(state);
            account.champions[championId] = { id: championId, name: value.name, quality: value.quality,
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
          case "quest": S.launchQuest(state, value, requestId, account.champions, now); break;
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
      const records = await query.get();
      return { champions: records.docs.map(doc => doc.data()), nextCursor: records.size === 25 ? records.docs[24].id : "" };
    });
  }
  async function prepareGearPromotion(tx, uid, building, rarity, now) {
    const account = await read(tx, uid, now);
    if ((account.state.entitlements[building] || 0) < G.RARITIES.indexOf(rarity))
      throw new HttpsError("failed-precondition", "Upgrade " + G.BUILDINGS[building].name + " to Level " + E.C.gearMilestones[G.RARITIES.indexOf(rarity)][0] + " to unlock this rarity. Existing earned Gear remains available.");
    return account;
  }
  return { stateRef, championRef, receiptRef, load, quote, execute, bench, prepareGearPromotion, save };
}
module.exports = { createEstateService };
