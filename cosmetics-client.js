/* Account cosmetics transport, sharing the existing authenticated Firebase session. */
(function(root) {
  "use strict";
  root.CrownlandsCosmeticsClient = { create({ client, callServerFunction, subscribeScopedSnapshot }) {
  async function getCosmeticsState() { return callServerFunction("getCosmeticsState", {}); }
  async function purchaseCosmetic(payload) { return callServerFunction("purchaseCosmetic", payload); }
  async function equipCosmetic(payload) { return callServerFunction("equipCosmetic", payload); }
  function subscribeCosmetics(handlers = {}) {
    if (!client.db || !client.user?.uid) return () => {};
    const { doc } = client.modules.firestore;
    return subscribeScopedSnapshot(doc(client.db, "players", client.user.uid, "cosmetics", "state"), snapshot => handlers.onState?.(snapshot.exists() ? snapshot.data() : {}), error => handlers.onError?.(error));
  }
  function subscribeCosmeticOwners(uids, onChange) {
    if (!client.db || !client.user?.uid) return () => {};
    const { collection, query, where, documentId } = client.modules.firestore;
    const chunks = [], rows = new Map();
    const owners = [...new Set(uids)].filter(uid => typeof uid === "string" && uid && !uid.includes("/"));
    for (let index = 0; index < owners.length; index += 30) chunks.push(owners.slice(index, index + 30));
    if (!chunks.length) onChange([]);
    const stops = chunks.map((chunk, index) => subscribeScopedSnapshot(query(collection(client.db, "playerCosmetics"), where(documentId(), "in", chunk)), snapshot => {
      rows.set(index, snapshot.docs.map(doc => ({ uid: doc.id, equipped: doc.data().equipped })));
      onChange([...rows.values()].flat());
    }, () => { rows.set(index, []); onChange([...rows.values()].flat()); }));
    return () => stops.forEach(stop => stop());
  }

  async function collectHarvestBonus(payload = {}) {
    return callServerFunction("collectHarvestBonus", payload);
  }
  async function reserveHarvestBonusSpawn(payload = {}) {
    return callServerFunction("reserveHarvestBonusSpawn", payload);
  }
    return { reserveHarvestBonusSpawn, collectHarvestBonus, getCosmeticsState, purchaseCosmetic, equipCosmetic, subscribeCosmetics, subscribeCosmeticOwners };
  } };
})(globalThis);
