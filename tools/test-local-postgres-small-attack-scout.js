"use strict";
const { createGameplayPilot } = require("./map-benchmark/seamless/gameplay-pilot");
(async () => {
  const pilot = await createGameplayPilot({ productionRouting: true });
  try {
    const game = require("../functions"), identity = pilot.identity;
    const call = (name, actor, data = {}) => game[name]({ auth: { uid: actor.uid, token: { email_verified: true,
      firebase: { sign_in_provider: "password" } } }, data: { clientReleaseId: identity.releaseId,
      clientWorldId: identity.worldId, clientResetGeneration: identity.resetGeneration,
      clientRealmShardId: identity.realmShardId, ...data } });
    const defender = (await pilot.store.doc(`players/${pilot.players[1].uid}`).get()).data();
    const candidates = await pilot.store.collection(`islands/${defender.mainIslandId}/cities`).get();
    const target = candidates.docs.find(doc => !doc.data().ownerUid && !doc.data().strongholdType && doc.data().kind !== "stronghold").data();
    await require("../functions/test/small-attack-scout-cases")({ db: pilot.store, call,
      attacker: pilot.players[0], defender: pilot.players[1], source: pilot.pair[0], target, cityRef: pilot.cityRef });
  } finally { await pilot.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
