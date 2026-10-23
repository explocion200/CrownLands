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
    await require("../functions/test/peace-shield-capture-cases")({ db: pilot.store, call,
      owner: pilot.players[0], rival: pilot.players[1], source: pilot.pair[0], target: pilot.pair[1],
      enemySource: pilot.assignments[2][0], cityRef: pilot.cityRef });
  } finally { await pilot.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
