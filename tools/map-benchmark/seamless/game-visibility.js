"use strict";
// Private adapter: evaluate the real document permissions inside the same SQL
// snapshot as the map rows, then emit only a map DTO. No client-supplied paths.
const crypto = require("node:crypto");
const { Access } = require("../../../local-backend/access");
const CONTRACT = Object.freeze({ resetGeneration: "realm-private-world3", worldId: "main-private-world3", realmShardId: "legacy" });
const FIELDS = ["key","id","sectionId","sectionName","name","kind","local","previewLocal","artLocal","x","y","left","top","width","height","asset","owner","selectable","sections","routeId","speed","phase"];
async function context(store, client, uid, now) {
  const access = await new Access({ store, transaction: { get: ref => store.get(ref, client) }, auth: { uid, token: { email_verified: true, firebase: { sign_in_provider: "password" } } }, now }).initialize();
  if (!access.current(access.profile)) throw Object.assign(Error("Not a current fixture realm member"), { code: "permission-denied" });
  // The fixture document journal contains permission dependencies (realm,
  // profile, clan membership and tower ownership). Any such document change
  // forces a snapshot, including dependencies discovered during projection.
  // A production adapter needs targeted dependency versions, not this global
  // rehearsal watermark; game-state rows already have their own bounded deltas.
  const revision = (await client.query(`SELECT COALESCE(max(id),0)::text AS revision FROM ${store.schema}.changes`)).rows[0].revision;
  const state = [access.realm, access.profile.realmShardId, access.profile.clanId || null, revision];
  return { access, scope: crypto.createHash("sha256").update(JSON.stringify(state)).digest("hex").slice(0,20) };
}
async function project(access, row) {
  const source = row.source;
  if (source && (!access.current(source.data) || !await access.canRead(source.path, source.data))) return null;
  if (source?.data.scoutReport && (!Number.isFinite(source.data.scoutReport.expiresAtMs) || source.data.scoutReport.expiresAtMs <= access.now)) return null;
  const dto = Object.fromEntries(FIELDS.filter(key => Object.hasOwn(row.body,key)).map(key => [key,row.body[key]]));
  // Public map rows cannot smuggle credentials, reports, inventories, combat
  // snapshots or private troop counts through a future added source field.
  if (!source || source.data.ownerUid === access.uid || source.data.holderUid === access.uid) {
    dto.troops = row.body.troops; dto.troopVisibility = "exact";
  } else if (source.data.troopVisibility === "estimate") {
    dto.troopVisibility = "estimate"; dto.troopEstimateLabel = source.data.troopEstimateLabel;
  } else { dto.troopVisibility = "hidden"; }
  return dto;
}
async function seed(store) {
  await store.doc("realmConfig/current").set(CONTRACT);
  for (const uid of ["sample-rowan","sample-alder"]) await store.doc("players/"+uid).set({ ...CONTRACT, uid, clanId: "sample-clan" });
  await store.doc("clans/sample-clan").set({ ...CONTRACT, status:"active" });
  for (const uid of ["sample-rowan","sample-alder"]) await store.doc(`clans/sample-clan/members/${uid}`).set({ ...CONTRACT, uid, status:"active", role:uid==="sample-rowan"?"leader":"member" });
}
module.exports = { context, project, seed, CONTRACT };
