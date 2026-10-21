"use strict";
// Private PostgreSQL fixture realm. Uses the rehearsal-only Store boundary;
// never accepts a production schema, connection string or player export.
const crypto = require("node:crypto");
const { createCatalogFeed } = require("./catalog-feed");
const { Store } = require("../../../local-backend/store");
const Visibility = require("./game-visibility");
const RETAIN = 60, MAX_EVENTS = 256;
class FixtureRealm {
  constructor(store, { crowded = false, clock = Date.now } = {}) {
    if (!(store instanceof Store) || !/^migration_world3_[a-f0-9]{12}$/.test(store.schema)) throw Error("Private world schema required");
    this.store = store; this.schema = store.schema; this.clock = clock; this.started = clock();
    this.epoch = crypto.randomUUID(); this.catalog = createCatalogFeed(crowded);
    this.manifest = { ...this.catalog.manifest, realmId: "private-world-stage-three", authenticated: true };
    this.ids = new Set(this.manifest.sections.map(s => s.id)); this.routes = new Map(); this.initial = [];
    const seen = new Set();
    for (const section of this.manifest.sections) {
      const data = this.catalog.read([section.id], 0);
      for (const body of data.sections[0].objects) {
        const uid = body.owner.startsWith("Lady Rowan") ? "sample-rowan" : "sample-alder";
        const source = body.selectable ? { path: body.kind === "tower" ? `holdingTowers/${body.id}` : `islands/${Visibility.CONTRACT.worldId}-${section.id}/${body.kind === "camp" ? "camps" : "cities"}/${body.id}`,
          data: { ...Visibility.CONTRACT, ownerUid: uid } } : null;
        this.initial.push({ key: body.key, kind: "object", sections: [section.id], viewers: [], body, source });
      }
      for (const route of data.routes) this.routes.set(route.id, route);
      for (const body of data.marches) if (!seen.has(body.key)) {
        seen.add(body.key);
        // Synthetic permissions deliberately include private armies. Nearby
        // geography alone never grants access to another player's army.
        const uid = seen.size % 2 ? "sample-rowan" : "sample-alder";
        this.initial.push({ key: body.key, kind: "march", sections: body.sections, viewers: [uid], body, source: { path: `armies/${body.id}`, data: { ...Visibility.CONTRACT, ownerUid: uid, participantUids: [uid], status: "active", kind: "transfer" } } });
      }
    }
  }
  async initialize() {
    await Visibility.seed(this.store);
    const s = this.schema, client = await this.store.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`CREATE TABLE ${s}.world_meta (id boolean PRIMARY KEY DEFAULT true CHECK(id), revision integer NOT NULL);
        INSERT INTO ${s}.world_meta VALUES(true,0);
        CREATE TABLE ${s}.world_rows (key text PRIMARY KEY, kind text NOT NULL, sections text[] NOT NULL, viewers text[] NOT NULL, body jsonb NOT NULL, source jsonb);
        CREATE INDEX ON ${s}.world_rows USING gin(sections);
        CREATE TABLE ${s}.world_events (revision integer NOT NULL, key text NOT NULL, before_row jsonb, after_row jsonb, PRIMARY KEY(revision,key));
        REVOKE ALL ON ALL TABLES IN SCHEMA ${s} FROM PUBLIC;`);
      await client.query(`INSERT INTO ${s}.world_rows SELECT * FROM jsonb_to_recordset($1::jsonb) AS r(key text,kind text,sections text[],viewers text[],body jsonb,source jsonb)`, [JSON.stringify(this.initial)]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  validIds(ids) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 16 || new Set(ids).size !== ids.length || ids.some(id => !this.ids.has(id))) throw Error("Choose 1–16 sample sections");
    return [...ids].sort();
  }
  visible(row, uid, ids) { return !!row && row.sections.some(id => ids.includes(id)) && (row.kind === "object" || row.viewers.includes(uid)); }
  // Only called by private fixture scripts/tests, never mounted as an HTTP API.
  async change(changes) {
    if (!changes.length || changes.length > 128 || new Set(changes.map(c => c.key)).size !== changes.length) throw Error("Bounded unique fixture changes required");
    const client = await this.store.pool.connect(), s = this.schema;
    try {
      await client.query("BEGIN");
      const revision = (await client.query(`UPDATE ${s}.world_meta SET revision=revision+1 RETURNING revision`)).rows[0].revision;
      for (const change of changes) {
        const before = (await client.query(`SELECT * FROM ${s}.world_rows WHERE key=$1`, [change.key])).rows[0] || null;
        const after = change.row ? { ...change.row } : null;
        // Legacy fixture helpers change viewers; keep that operation an actual
        // authoritative ownership/participation update, rather than bypass ACLs.
        if (before && after?.source?.path.startsWith("armies/") && JSON.stringify(after.viewers) !== JSON.stringify(before?.viewers))
          after.source = { ...after.source, data: { ...after.source.data, ownerUid: after.viewers[0] || "sample-outsider", participantUids: after.viewers } };
        if (after) {
          if (after.key !== change.key || after.body.key !== change.key || !["object", "march"].includes(after.kind)) throw Error("Invalid fixture identity");
          this.validIds(after.sections);
          await client.query(`INSERT INTO ${s}.world_rows VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(key) DO UPDATE SET kind=EXCLUDED.kind,sections=EXCLUDED.sections,viewers=EXCLUDED.viewers,body=EXCLUDED.body,source=EXCLUDED.source`, [after.key, after.kind, after.sections, after.viewers, after.body, after.source || null]);
        } else await client.query(`DELETE FROM ${s}.world_rows WHERE key=$1`, [change.key]);
        await client.query(`INSERT INTO ${s}.world_events VALUES($1,$2,$3,$4)`, [revision, change.key, before, after]);
      }
      await client.query(`DELETE FROM ${s}.world_events WHERE revision <= $1`, [revision - RETAIN]);
      await client.query("COMMIT"); return revision;
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  async read(uid, ids, cursor) {
    if (!["sample-rowan", "sample-alder"].includes(uid)) throw Error("Not a fixture realm member");
    ids = this.validIds(ids);
    let viewerEpoch;
    const client = await this.store.pool.connect(), s = this.schema;
    try {
      // Snapshot and journal watermark must describe the same committed state.
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const visibility = await Visibility.context(this.store, client, uid, this.clock());
      const expired = (await client.query(`SELECT key FROM ${s}.world_rows WHERE sections && $1::text[]
        AND jsonb_typeof(source #> '{data,scoutReport,expiresAtMs}')='number'
        AND (source #>> '{data,scoutReport,expiresAtMs}')::numeric <= $2 ORDER BY key`, [ids,this.clock()])).rows;
      const timeScope = crypto.createHash("sha256").update(JSON.stringify(expired)).digest("hex").slice(0,12);
      viewerEpoch = this.epoch + ":" + visibility.scope + ":" + timeScope + ":" + uid;
      const revision = (await client.query(`SELECT revision FROM ${s}.world_meta`)).rows[0].revision;
      let delta = cursor?.epoch === viewerEpoch && Number.isSafeInteger(cursor.revision) && cursor.revision >= Math.max(0, revision - RETAIN) && cursor.revision <= revision;
      let events = [];
      if (delta) {
        events = (await client.query(`SELECT * FROM ${s}.world_events WHERE revision > $1 ORDER BY revision,key LIMIT $2`, [cursor.revision, MAX_EVENTS + 1])).rows;
        if (events.length > MAX_EVENTS) delta = false;
      }
      const rows = delta ? [] : (await client.query(`SELECT * FROM ${s}.world_rows WHERE sections && $1::text[] AND (kind='object' OR $2=ANY(viewers)) ORDER BY key`, [ids, uid])).rows;
      const result = { kind: delta ? "delta" : "snapshot", epoch: viewerEpoch, viewer: uid, revision, fromRevision: delta ? cursor.revision : null, ids, serverTime: (this.clock() - this.started) / 1000,
        objects: { upsert: [], remove: [] }, marches: { upsert: [], remove: [] }, routes: [] };
      const latest = new Map();
      if (delta) for (const event of events) {
        // Collapse each key while retaining the original visibility, so removal
        // after an unseen intermediate state cannot leave a stale client marker.
        const prior = latest.get(event.key);
        latest.set(event.key, { before: prior ? prior.before : event.before_row, after: event.after_row });
      }
      else for (const row of rows) latest.set(row.key, { before: null, after: row });
      for (const [key, { before, after }] of latest) {
        const was = this.visible(before, uid, ids), now = this.visible(after, uid, ids);
        if (was && (!now || before.kind !== after.kind)) result[before.kind === "object" ? "objects" : "marches"].remove.push(key);
        if (now) {
          const projected = await Visibility.project(visibility.access, after);
          if (projected) result[after.kind === "object" ? "objects" : "marches"].upsert.push(projected);
          else if (was) result[before.kind === "object" ? "objects" : "marches"].remove.push(key);
        }
      }
      result.routes = [...new Set(result.marches.upsert.map(m => m.routeId))].map(id => this.routes.get(id));
      await client.query("COMMIT");
      return result;
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  async tick(step) {
    const changes = [];
    for (const section of this.manifest.sections) {
      const row = this.initial.find(r => r.kind === "object" && r.sections[0] === section.id && r.body.kind === "castle");
      if (row) changes.push({ key: row.key, row: { ...row, body: { ...row.body, owner: step % 2 ? "House Willow · sample" : row.body.owner, troops: row.body.troops + step % 5 * 100 } } });
    }
    return this.change(changes);
  }
}
module.exports = { FixtureRealm, RETAIN, MAX_EVENTS };
