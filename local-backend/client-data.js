"use strict";
const { createHash } = require("node:crypto");
const V = require("./values");
const { Store, DocumentReference } = require("./store");
const { Access, deny } = require("./access");
const invalid = () => Object.assign(Error("Invalid game data request."), { code: "invalid-argument" });
const conflict = () => Object.assign(Error("Game data changed; retry the operation."), { code: "aborted" });
const object = value => value && Object.getPrototypeOf(value) === Object.prototype;
function keys(value, permitted) { if (!object(value) || Object.keys(value).some(key => !permitted.includes(key))) throw invalid(); }
function field(value) {
  if (!Array.isArray(value) || !value.length || value.length > 20 || value.some(part => typeof part !== "string" || !part || part.length > 1500)) throw invalid();
  return new V.FieldPath(...value);
}
function decode(value, depth = 0) {
  if (depth > 20 || !object(value) || Object.keys(value).length !== 1) throw invalid();
  const [type] = Object.keys(value), item = value[type];
  if (type === "mapValue") {
    keys(item, ["fields"]); if (!object(item.fields) || Object.keys(item.fields).length > 2000) throw invalid();
    return Object.fromEntries(Object.entries(item.fields).map(([key, val]) => {
      if (!key || Buffer.byteLength(key) > 1500) throw invalid();
      return [key, decode(val, depth + 1)];
    }));
  }
  if (type === "arrayValue") {
    keys(item, ["values"]); if (!Array.isArray(item.values) || item.values.length > 2000) throw invalid();
    const decoded = item.values.map(val => decode(val, depth + 1));
    if (decoded.some(Array.isArray)) throw invalid(); return decoded;
  }
  if (type === "nullValue" && item === null) return null;
  if (type === "booleanValue" && typeof item === "boolean") return item;
  if (type === "stringValue" && typeof item === "string" && Buffer.byteLength(item) <= 262144) return item;
  if (type === "integerValue" && typeof item === "string" && /^-?(0|[1-9]\d{0,18})$/.test(item)) return V.decode(value);
  if (type === "doubleValue" && ((typeof item === "number" && Number.isFinite(item)) || ["NaN", "Infinity", "-Infinity"].includes(item))) return V.decode(value);
  if (type === "timestampValue" && typeof item === "string") {
    const time = V.Timestamp.fromString(item);
    if (time.toString().slice(0, 19) !== item.slice(0, 19)) throw invalid(); return time;
  }
  // Browser gameplay doesn't write references, bytes or geographic points.
  // Expand only after adding explicit permission and protocol coverage.
  throw invalid();
}
class ClientData {
  constructor(store) {
    if (!(store instanceof Store) || !/^migration_game_[a-z0-9_]{1,30}$/.test(store.schema)) throw Error("Client data requires an isolated game schema");
    this.store = store;
  }
  query(spec) {
    keys(spec, ["path", "collection", "group", "filters", "orders", "limit", "start", "end"]);
    if ([spec.path, spec.collection, spec.group].filter(value => value !== undefined).length !== 1) throw invalid();
    if (spec.path !== undefined) {
      if (Object.keys(spec).length !== 1) throw invalid(); return this.store.doc(spec.path);
    }
    // Only these collection groups are readable by clients in the source rules.
    if (spec.group !== undefined && !["cities", "camps"].includes(spec.group)) throw deny();
    let query = spec.group ? this.store.collectionGroup(spec.group) : this.store.collection(spec.collection);
    if (!Array.isArray(spec.filters || []) || !Array.isArray(spec.orders || []) || (spec.filters || []).length > 10 || (spec.orders || []).length > 5) throw invalid();
    for (const filter of spec.filters || []) {
      keys(filter, ["field", "op", "value"]);
      if (!["==", "!=", "<", "<=", ">", ">=", "in", "not-in", "array-contains", "array-contains-any"].includes(filter.op)) throw invalid();
      query = query.where(field(filter.field), filter.op, decode(filter.value));
    }
    for (const order of spec.orders || []) { keys(order, ["field", "direction"]); query = query.orderBy(field(order.field), order.direction || "asc"); }
    if (spec.limit !== undefined && (!Number.isInteger(spec.limit) || spec.limit < 1 || spec.limit > 1000)) throw invalid();
    query = query.limit(spec.limit || 1001);
    for (const bound of ["start", "end"]) {
      if (!spec[bound]) continue;
      keys(spec[bound], ["values", "inclusive"]);
      if (!Array.isArray(spec[bound].values) || spec[bound].values.length > 6 || typeof spec[bound].inclusive !== "boolean") throw invalid();
      const values = spec[bound].values.map(value => decode(value));
      if (bound === "end" && !spec[bound].inclusive) throw invalid();
      query = bound === "end" ? query.endAt(...values) : spec[bound].inclusive ? query.startAt(...values) : query.startAfter(...values);
    }
    return query;
  }
  async read(auth, targets, { partial = false, revisions } = {}) {
    if (!Array.isArray(targets) || !targets.length || targets.length > 80) throw invalid();
    if (revisions !== undefined && (!partial || !Array.isArray(revisions) || revisions.length !== targets.length
      || revisions.some(value => value !== null && (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))))) throw invalid();
    const queries = targets.map(target => this.query(target));
    return this.store.runTransaction(async tx => {
      const access = await new Access({ store: this.store, transaction: tx, auth }).initialize();
      const results = []; let remainingBytes = 4 * 1024 * 1024;
      for (const [index, target] of queries.entries()) {
        try {
        if (!(target instanceof DocumentReference) && !await access.canQuery(target)) throw deny();
        if (!(target instanceof DocumentReference)) {
          // Check the response budget in PostgreSQL before transferring a large
          // set of JSON documents into Node. Both reads share this snapshot.
          const compiled = this.store.compile(target);
          const size = await tx.client.query(`SELECT COALESCE(sum(octet_length(body::text)+octet_length(path)+128),0) AS bytes FROM (${compiled.text}) AS documents`, compiled.values);
          if (Number(size.rows[0].bytes) > remainingBytes) throw Object.assign(Error("Game data response is too large."), { code: "resource-exhausted" });
        }
        const result = await tx.get(target), document = target instanceof DocumentReference;
        if (!document && targets[index].limit === undefined && result.size > 1000) throw Object.assign(Error("Choose a smaller game data range."), { code: "resource-exhausted" });
        const docs = document ? [result] : result.docs;
        for (const doc of docs) if (!await access.canRead(doc.ref.path, doc.data(), document ? "get" : "list")) throw deny();
        const response = { documents: docs.map(doc => ({ path: doc.ref.path, body: doc.body || null })), document };
        const bytes = Buffer.byteLength(JSON.stringify(response)) + 2;
        if (bytes > remainingBytes) throw Object.assign(Error("Game data response is too large."), { code: "resource-exhausted" });
        remainingBytes -= bytes;
        // Tokens suppress bytes, never authorization. Query and per-document
        // permission/expiry checks above run in this request's fresh snapshot.
        // Include the principal and query so a token cannot cross subscriptions.
        if (revisions !== undefined) {
          const revision = createHash("sha256").update(JSON.stringify([auth.uid, targets[index], response])).digest("hex");
          results.push(revisions[index] === revision ? { unchanged: true, revision } : { ...response, revision });
        } else results.push(response);
        } catch (error) {
          // Watchers share one bounded request/snapshot, but a revoked clan
          // membership must not suppress an unrelated active-session listener.
          // Never swallow SQL errors: a failed PostgreSQL transaction cannot
          // safely continue. Only application permission/budget errors qualify.
          if (!partial || !["permission-denied", "resource-exhausted"].includes(error.code)) throw error;
          results.push({ error: { code: error.code, message: error.message } });
        }
      }
      return results;
    });
  }
  async write(auth, writes, checks = []) {
    if (!Array.isArray(writes) || !writes.length || writes.length > 100 || !Array.isArray(checks) || checks.length > 100) throw invalid();
    const paths = new Set();
    const prepared = writes.map(write => {
      keys(write, ["path", "kind", "data", "merge", "transforms"]);
      if (!["set", "update", "delete"].includes(write.kind) || paths.has(write.path)) throw invalid(); paths.add(write.path);
      const ref = this.store.doc(write.path);
      if (write.merge !== undefined && (write.kind !== "set" || typeof write.merge !== "boolean")) throw invalid();
      let data = write.kind === "delete" ? null : decode(write.data);
      if (write.kind !== "delete" && !object(data)) throw invalid();
      if (write.kind === "delete" && (write.data !== undefined || write.transforms !== undefined)) throw invalid();
      if (!Array.isArray(write.transforms || []) || (write.transforms || []).length > 100) throw invalid();
      const transformPaths = new Set();
      for (const transform of write.transforms || []) {
        keys(transform, ["field", "kind"]); const key = field(transform.field), id = JSON.stringify(transform.field);
        if (transformPaths.has(id) || !["timestamp", "delete"].includes(transform.kind)) throw invalid(); transformPaths.add(id);
        // For update() the input map uses dotted field names; set() uses nested maps.
        const transformValue = transform.kind === "timestamp" ? V.FieldValue.serverTimestamp() : V.FieldValue.delete();
        if (write.kind === "update") {
          if (transform.field.some(part => part.includes("."))) throw invalid();
          Object.defineProperty(data, transform.field.join("."), { value: transformValue, enumerable: true, configurable: true });
        } else {
          let container = data;
          for (const part of key.segments.slice(0, -1)) {
            if (!Object.hasOwn(container, part) || !object(container[part])) Object.defineProperty(container, part, { value: {}, enumerable: true, configurable: true, writable: true });
            container = container[part];
          }
          Object.defineProperty(container, key.segments.at(-1), { value: transformValue, enumerable: true, configurable: true, writable: true });
        }
      }
      return { ...write, ref, data };
    });
    const versions = checks.map(check => { keys(check, ["path", "updateTime"]); if (check.updateTime !== null && typeof check.updateTime !== "string") throw invalid(); return { ref: this.store.doc(check.path), version: check.updateTime }; });
    return this.store.runTransaction(async tx => {
      const access = await new Access({ store: this.store, transaction: tx, auth }).initialize();
      for (const check of versions) {
        const snap = await tx.get(check.ref);
        if (!await access.canRead(check.ref.path, snap.data())) throw deny();
        if ((snap.body?.updateTime || null) !== check.version) throw conflict();
      }
      const timestamp = V.Timestamp.now();
      const resolved = [];
      for (const write of prepared) {
        const before = (await tx.get(write.ref)).data();
        const after = write.kind === "delete" ? undefined : V.applyWrite(before, write.data, write.kind, { merge: write.merge === true }, timestamp);
        if (!await access.canWrite(write.ref.path, before, after)) throw deny();
        resolved.push({ ref: write.ref, after });
      }
      // Evaluate every permission against the same pre-write transaction state.
      // The client cannot create membership/entitlements in one batch and use
      // them to authorize a later write in that same batch.
      for (const item of resolved) {
        if (item.after === undefined) tx.delete(item.ref); else tx.set(item.ref, item.after);
      }
      return { committed: true };
    });
  }
}
module.exports = { ClientData, decode, field };
