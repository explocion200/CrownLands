"use strict";
const crypto = require("node:crypto");
const { Pool } = require("pg");
const V = require("./values");
const { isDeepStrictEqual } = require("node:util");
const { AsyncLocalStorage } = require("node:async_hooks");

function pathParts(path, even) {
  if (typeof path !== "string" || !path || Buffer.byteLength(path) > 6000) throw Error("Invalid document path");
  const parts = path.split("/");
  if (parts.some(p => !p || p === "." || p === ".." || p.includes("\0")) || (parts.length % 2 === 0) !== even) throw Error("Invalid document path");
  return parts;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function hash(value) { return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }
function precondition(value = {}) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).some(key => !["exists", "lastUpdateTime"].includes(key))
    || (value.exists !== undefined && typeof value.exists !== "boolean")
    || (value.lastUpdateTime !== undefined && !(value.lastUpdateTime instanceof V.Timestamp))
    || (value.exists !== undefined && value.lastUpdateTime !== undefined)) throw Error("Invalid write precondition");
  return value;
}
function updateArguments(args) {
  if (!args.length) throw Error("Update fields are required");
  let data, condition;
  if (typeof args[0] === "string" || args[0] instanceof V.FieldPath) {
    const values = [...args];
    if (values.length % 2) condition = values.pop();
    if (!values.length || values.length % 2) throw Error("Update requires field/value pairs");
    const entries = [];
    for (let i = 0; i < values.length; i += 2) { V.segments(values[i]); entries.push([values[i], values[i + 1]]); }
    data = new V.UpdateFields(entries);
  } else {
    if (args.length > 2) throw Error("Unexpected update arguments");
    [data, condition] = args;
  }
  return { data, precondition: precondition(condition) };
}
function checkPrecondition(condition, body) {
  if ((condition.exists !== undefined && condition.exists !== Boolean(body))
    || (condition.lastUpdateTime !== undefined && (!body || !condition.lastUpdateTime.isEqual(V.Timestamp.fromString(body.updateTime))))) {
    throw Object.assign(Error("Document changed before the conditional write"), { code: 9 });
  }
}

class DocumentReference {
  constructor(store, path) {
    pathParts(path, true); this.firestore = store; this.path = path; this.id = path.split("/").at(-1);
    this.name = store.root + "/" + path; this[V.DOCUMENT_REFERENCE] = true;
  }
  get parent() { return this.firestore.collection(this.path.split("/").slice(0, -1).join("/")); }
  collection(id) { return this.firestore.collection(this.path + "/" + id); }
  get() { return this.firestore.get(this); }
  set(data, options) { return this.firestore.batch().set(this, data, options).commit(); }
  create(data) { return this.firestore.batch().create(this, data).commit(); }
  update(...args) { return this.firestore.batch().update(this, ...args).commit(); }
  delete(condition) { return this.firestore.batch().delete(this, condition).commit(); }
  listCollections() { return this.firestore.listCollections(this); }
  isEqual(other) { return other instanceof DocumentReference && this.firestore === other.firestore && this.path === other.path; }
}
class DocumentSnapshot {
  constructor(store, path, body) {
    this.ref = store.doc(path); this.id = this.ref.id; this.exists = Boolean(body); this.body = body;
    this.createTime = body?.createTime ? V.Timestamp.fromString(body.createTime) : undefined;
    this.updateTime = body?.updateTime ? V.Timestamp.fromString(body.updateTime) : undefined;
  }
  data() { return this.exists ? V.decode({ mapValue: { fields: this.body.fields || {} } }, name => this.ref.firestore.reference(name)) : undefined; }
  get(field) { return V.getField(this.data(), field); }
}
class QuerySnapshot {
  constructor(docs) { this.docs = docs; this.size = docs.length; this.empty = !docs.length; }
  forEach(callback) { this.docs.forEach(callback); }
}
const Filter = Object.freeze({
  where: (field, op, value) => ({ kind: "field", field, op, value }),
  and: (...filters) => ({ kind: "and", filters }),
  or: (...filters) => ({ kind: "or", filters }),
});

class Query {
  constructor(store, scope, constraints = {}) { this.firestore = store; this.scope = scope; this.constraints = constraints; }
  _with(patch) { return new Query(this.firestore, this.scope, { ...this.constraints, ...patch }); }
  where(field, op, value) {
    const filter = arguments.length === 1 ? field : Filter.where(field, op, value);
    return this._with({ filters: [...(this.constraints.filters || []), filter] });
  }
  orderBy(field, direction = "asc") {
    if (!["asc", "desc"].includes(direction)) throw Error("Invalid query order");
    return this._with({ orders: [...(this.constraints.orders || []), { field, direction }] });
  }
  limit(n) { if (!Number.isInteger(n) || n < 1 || n > 10000) throw Error("Query limit outside supported bounds"); return this._with({ limit: n }); }
  select(...fields) { return this._with({ select: fields }); }
  startAfter(...values) { return this._with({ start: { values, inclusive: false } }); }
  startAt(...values) { return this._with({ start: { values, inclusive: true } }); }
  endAt(...values) { return this._with({ end: { values, inclusive: true } }); }
  get() { return this.firestore.get(this); }
  count() { throw Error("Count aggregation needs separate SQL coverage"); }
}
class CollectionReference extends Query {
  constructor(store, path) { const parts = pathParts(path, false); super(store, { collection: parts.at(-1), parent: parts.slice(0, -1).join("/") }); this.path = path; this.id = parts.at(-1); }
  get parent() { const parts = this.path.split("/"); return parts.length > 1 ? this.firestore.doc(parts.slice(0, -1).join("/")) : null; }
  doc(id = crypto.randomBytes(15).toString("base64url")) { if (id.includes("/")) throw Error("Invalid document ID"); return this.firestore.doc(this.path + "/" + id); }
  async add(data) { const ref = this.doc(); await ref.create(data); return ref; }
}

class Transaction {
  constructor(store, client) { this.store = store; this.client = client; this.writes = []; }
  get(target) { if (this.writes.length) throw Error("All transaction reads must precede writes"); return this.store.get(target, this.client); }
  getAll(...refs) { if (refs.length > 1000) throw Error("Too many document reads"); return Promise.all(refs.map(ref => this.get(ref))); }
  _write(kind, ref, data, options = {}) {
    if (!(ref instanceof DocumentReference) || ref.firestore !== this.store) throw Error("Foreign document reference");
    if (this.writes.length >= 500) throw Error("Transaction write limit exceeded");
    this.writes.push({ kind, ref, data, options }); return this;
  }
  set(ref, data, options) { return this._write("set", ref, data, options); }
  create(ref, data) { return this._write("create", ref, data); }
  update(ref, ...args) { const value = updateArguments(args); return this._write("update", ref, value.data, { precondition: value.precondition }); }
  delete(ref, condition) { return this._write("delete", ref, undefined, { precondition: precondition(condition) }); }
}

class BulkWriter {
  constructor(store) { this.store = store; this.jobs = []; this.results = []; this.active = 0; this.closed = false; }
  delete(ref, condition) {
    if (this.closed || this.results.length >= 2000) throw Error("Bulk writer is closed or its bounded batch is full");
    if (!(ref instanceof DocumentReference) || ref.firestore !== this.store) throw Error("Foreign document reference");
    condition = precondition(condition);
    const result = new Promise((resolve, reject) => this.jobs.push({ ref, condition, resolve, reject }));
    // Track settled results without suppressing rejection of the caller's promise.
    this.results.push(result.then(() => undefined, () => undefined));
    this.pump(); return result;
  }
  pump() {
    while (this.active < 4 && this.jobs.length) {
      const job = this.jobs.shift(); this.active++;
      this.store.runTransaction(tx => { tx.delete(job.ref, job.condition); }).then(job.resolve, job.reject)
        .finally(() => { this.active--; this.pump(); });
    }
  }
  async close() { this.closed = true; await Promise.all(this.results); }
}

class Store {
  constructor({ schema, database = "crownlands_migration", host = "/var/run/postgresql", project = "crown-land-b15e0", pool }) {
    // This implementation is deliberately limited to private rehearsal until
    // game parity, authorization, workers and a reviewed cutover are complete.
    if (!/^migration_[a-z0-9_]{1,40}$/.test(schema) || database !== "crownlands_migration" || host !== "/var/run/postgresql") throw Error("Only the isolated local rehearsal database is allowed");
    this.schema = schema; this.root = "projects/" + project + "/databases/(default)/documents";
    this.transactionGuard = new AsyncLocalStorage();
    this.pool = pool || new Pool({ database, host, max: 12, application_name: "crownlands-migration", statement_timeout: 30000 });
  }
  async initialize() {
    const s = this.schema;
    await this.pool.query(`CREATE SCHEMA IF NOT EXISTS ${s}; REVOKE ALL ON SCHEMA ${s} FROM PUBLIC;
      CREATE TABLE IF NOT EXISTS ${s}.documents (path text PRIMARY KEY, collection_id text NOT NULL, parent_path text NOT NULL, body jsonb NOT NULL, source_sha256 text NOT NULL);
      CREATE INDEX IF NOT EXISTS documents_collection_path ON ${s}.documents (collection_id,path);
      CREATE INDEX IF NOT EXISTS documents_parent_collection ON ${s}.documents (parent_path,collection_id,path);
      CREATE INDEX IF NOT EXISTS documents_path_prefix ON ${s}.documents (path text_pattern_ops);
      CREATE TABLE IF NOT EXISTS ${s}.changes (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, path text NOT NULL, before_body jsonb, after_body jsonb, created_at timestamptz NOT NULL DEFAULT clock_timestamp());
      REVOKE ALL ON ALL TABLES IN SCHEMA ${s} FROM PUBLIC;
      DO $type$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='${s}' AND t.typname='query_key') THEN
          CREATE TYPE ${s}.query_key AS (kind integer,numeric_value numeric,bytes_value bytea);
        END IF;
      END $type$;
      CREATE OR REPLACE FUNCTION ${s}.query_sort_key(v jsonb) RETURNS ${s}.query_key LANGUAGE plpgsql IMMUTABLE AS $fn$
      BEGIN
        IF v IS NULL THEN RETURN NULL; END IF;
        IF v ? 'nullValue' THEN RETURN ROW(0,NULL,NULL)::${s}.query_key; END IF;
        IF v ? 'booleanValue' THEN RETURN ROW(1,CASE WHEN (v->>'booleanValue')::boolean THEN 1 ELSE 0 END,NULL)::${s}.query_key; END IF;
        IF v ? 'integerValue' THEN RETURN ROW(2,(v->>'integerValue')::numeric,NULL)::${s}.query_key; END IF;
        IF v ? 'doubleValue' THEN
          IF v->>'doubleValue' IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Nonfinite query value requires explicit parity coverage'; END IF;
          RETURN ROW(2,(v->>'doubleValue')::numeric,NULL)::${s}.query_key;
        END IF;
        IF v ? 'timestampValue' THEN RETURN ROW(3,NULL,convert_to(left(v->>'timestampValue',19)||'.'||rpad(COALESCE(substring(v->>'timestampValue' from '[.]([0-9]+)Z$'),''),9,'0')||'Z','UTF8'))::${s}.query_key; END IF;
        IF v ? 'stringValue' THEN RETURN ROW(4,NULL,convert_to(v->>'stringValue','UTF8'))::${s}.query_key; END IF;
        RAISE EXCEPTION 'Complex query value requires explicit parity coverage';
      END $fn$;`);
  }
  doc(path) { return new DocumentReference(this, path); }
  collection(path) { return new CollectionReference(this, path); }
  collectionGroup(id) { if (!id || id.includes("/")) throw Error("Invalid collection ID"); return new Query(this, { collection: id }); }
  reference(name) { if (!name.startsWith(this.root + "/")) return new V.ReferenceValue(name); return this.doc(name.slice(this.root.length + 1)); }
  async listCollections(ref) {
    if (!(ref instanceof DocumentReference) || ref.firestore !== this) throw Error("Foreign document reference");
    const pattern = (ref.path + "/").replace(/[\\%_]/g, value => "\\" + value) + "%";
    const result = await this.pool.query(`SELECT DISTINCT split_part(path,'/',$1) COLLATE "C" AS id FROM ${this.schema}.documents WHERE path LIKE $2 ORDER BY id LIMIT 1001`, [ref.path.split("/").length + 1, pattern]);
    if (result.rows.length > 1000) throw Error("Subcollection enumeration exceeds migration bound");
    return result.rows.map(row => ref.collection(row.id));
  }
  async getAll(...refs) { if (refs.length > 1000) throw Error("Too many document reads"); return Promise.all(refs.map(ref => this.get(ref))); }
  async get(target, connection = this.pool) {
    if (target.firestore !== this) throw Error("Foreign query reference");
    if (target instanceof DocumentReference) {
      const result = await connection.query(`SELECT body FROM ${this.schema}.documents WHERE path=$1`, [target.path]);
      return new DocumentSnapshot(this, target.path, result.rows[0]?.body);
    }
    const { text, values } = this.compile(target);
    const result = await connection.query(text, values);
    if (!target.constraints.limit && result.rows.length > 10000) throw Error("Unbounded query exceeds migration limit");
    return new QuerySnapshot(result.rows.map(row => {
      if (target.constraints.select) {
        const old = new DocumentSnapshot(this, row.path, row.body).data();
        const data = {};
        for (const field of target.constraints.select) {
          const value = V.getField(old, field);
          if (value !== undefined) V.setField(data, field, value);
        }
        row.body = { ...row.body, fields: V.encode(data).mapValue.fields };
      }
      return new DocumentSnapshot(this, row.path, row.body);
    }));
  }
  compile(query) {
    if (!(query instanceof Query)) throw Error("Unsupported query");
    const values = [], param = value => { values.push(value); return "$" + values.length; };
    const field = key => {
      const parts = V.segments(key);
      if (parts.length === 1 && parts[0] === "__name__") return null;
      return `(body #> ${param(parts.flatMap((part, index) => index ? ["mapValue", "fields", part] : ["fields", part]))}::text[])`;
    };
    // Typed composite keys compare numeric values and UTF-8 bytes independently
    // of the host's language collation. JSONB string ordering is locale-sensitive.
    const key = expression => `${this.schema}.query_sort_key(${expression})`;
    const pathKey = expression => `(string_to_array(${expression},'/') COLLATE "C")`;
    const encoded = value => `${param(JSON.stringify(V.encode(value)))}::jsonb`;
    const docPath = value => {
      if (value instanceof DocumentReference) return value.path;
      if (typeof value !== "string") throw Error("Document cursor needs a path or ID");
      return query.scope.parent !== undefined ? [query.scope.parent, query.scope.collection, value].filter(Boolean).join("/") : value;
    };
    let filterCount = 0;
    const filter = condition => {
      if (++filterCount > 100) throw Error("Query filter complexity exceeded");
      if (["and", "or"].includes(condition?.kind)) {
        if (!condition.filters?.length) throw Error("Empty composite filter");
        return "(" + condition.filters.map(filter).join(condition.kind === "and" ? " AND " : " OR ") + ")";
      }
      if (condition?.kind !== "field") throw Error("Invalid query filter");
      const op = condition.op;
      if (["in", "not-in", "array-contains-any"].includes(op)) {
        if (!Array.isArray(condition.value) || !condition.value.length || condition.value.length > 30) throw Error("Invalid multi-value query");
        if (op === "not-in" && condition.value.includes(null)) return "FALSE";
        const clauses = condition.value.map(value => filter({ ...condition, op: op === "array-contains-any" ? "array-contains" : "==", value }));
        return (op === "not-in" ? "NOT " : "") + "(" + clauses.join(" OR ") + ")";
      }
      const expression = field(condition.field);
      const ops = { "==": "=", "!=": "<>", "<": "<", "<=": "<=", ">": ">", ">=": ">=" };
      if (expression === null) {
        if (!ops[op]) throw Error("Unsupported document-name operator");
        return `${pathKey("path")} ${ops[op]} ${pathKey(param(docPath(condition.value)))}`;
      }
      if (ops[op]) return `${key(expression)} ${ops[op]} ${key(encoded(condition.value))}`;
      if (op === "array-contains") return `EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(${expression}->'arrayValue'->'values','[]'::jsonb)) AS element WHERE ${key("element")}=${key(encoded(condition.value))})`;
      throw Error("Unsupported query operator");
    };
    const where = [`collection_id=${param(query.scope.collection)}`];
    if (query.scope.parent !== undefined) where.push(`parent_path=${param(query.scope.parent)}`);
    where.push(...(query.constraints.filters || []).map(filter));
    const orders = [...(query.constraints.orders || [])];
    const inequalityFields = new Set();
    function collectInequalities(condition) {
      if (condition.filters) condition.filters.forEach(collectInequalities);
      else if (["<", "<=", ">", ">=", "!=", "not-in"].includes(condition.op)) inequalityFields.add(V.segments(condition.field).join("."));
    }
    (query.constraints.filters || []).forEach(collectInequalities);
    for (const name of [...inequalityFields].sort()) {
      if (!orders.some(order => V.segments(order.field).join(".") === name)) orders.push({ field: name, direction: orders.at(-1)?.direction || "asc" });
    }
    if (!orders.some(order => V.segments(order.field).join(".") === "__name__")) orders.push({ field: "__name__", direction: orders.at(-1)?.direction || "asc" });
    const expressions = orders.map(order => {
      const expression = field(order.field);
      if (expression !== null) where.push(`${expression} IS NOT NULL`);
      return expression === null ? pathKey("path") : key(expression);
    });
    for (const bound of ["start", "end"]) {
      const cursor = query.constraints[bound];
      if (!cursor) continue;
      let inputs = cursor.values;
      if (inputs.length === 1 && inputs[0] instanceof DocumentSnapshot) inputs = orders.map(order => V.segments(order.field).join(".") === "__name__" ? inputs[0].ref : inputs[0].get(order.field));
      if (!inputs.length || inputs.length > orders.length) throw Error("Invalid query cursor");
      const comparands = inputs.map((value, i) => V.segments(orders[i].field).join(".") === "__name__" ? pathKey(param(docPath(value))) : key(encoded(value)));
      const clauses = comparands.map((right, i) => {
        const forward = (bound === "start") !== (orders[i].direction === "desc");
        const op = (forward ? ">" : "<") + (cursor.inclusive && i === comparands.length - 1 ? "=" : "");
        return "(" + [...comparands.slice(0, i).map((prior, j) => `${expressions[j]}=${prior}`), `${expressions[i]}${op}${right}`].join(" AND ") + ")";
      });
      where.push("(" + clauses.join(" OR ") + ")");
    }
    return { text: `SELECT path,body FROM ${this.schema}.documents WHERE ${where.join(" AND ")} ORDER BY ${expressions.map((expression, i) => expression + " " + orders[i].direction.toUpperCase()).join(",")} LIMIT ${param(query.constraints.limit || 10001)}`, values };
  }
  runTransaction(callback, options) { return this._runTransaction(callback, options, "SERIALIZABLE"); }
  async _runTransaction(callback, { maxAttempts = 8 } = {}, isolation = "SERIALIZABLE") {
    if (!["SERIALIZABLE", "READ COMMITTED"].includes(isolation)) throw Error("Unsupported transaction isolation");
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 32) throw Error("Invalid transaction retry bound");
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL " + isolation);
        // A reclaimed or timed-out background job must not commit further game
        // writes, even if its old JavaScript handler finishes late.
        const guard = this.transactionGuard.getStore();
        if (guard) await guard(client);
        const tx = new Transaction(this, client);
        const result = await callback(tx);
        if (guard) await guard(client);
        await this.commit(tx);
        if (guard) await guard(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        if (!["40001", "40P01"].includes(error.code) || attempt === maxAttempts - 1) throw error;
      } finally { client.release(); }
      // Give a competing writer time to finish. The previous short linear
      // delays could exhaust all eight attempts in about 200ms during catch-up.
      // Keep the attempt bound and SERIALIZABLE isolation; jitter separates
      // contenders while the cap keeps interactive requests bounded.
      const delay = Math.min(500, 20 * 2 ** attempt);
      await new Promise(resolve => setTimeout(resolve, delay + Math.floor(Math.random() * delay)));
    }
  }
  async commit(tx) {
    const paths = [...new Set(tx.writes.map(write => write.ref.path))].sort();
    if (!paths.length) return;
    // Lock absent keys as well as existing rows. This lets blind batches use
    // READ COMMITTED without losing simultaneous creates/merges/increments,
    // avoiding unrelated predicate conflicts during parallel map seeding.
    // Callback transactions still use SERIALIZABLE for query/phantom safety.
    await tx.client.query(`SELECT pg_advisory_xact_lock(hashtext($1),lock_id) FROM
      (SELECT DISTINCT hashtext(path) AS lock_id FROM unnest($2::text[]) AS path ORDER BY lock_id) AS locks`, [this.schema, paths]);
    const current = await tx.client.query(`SELECT path,body FROM ${this.schema}.documents WHERE path=ANY($1::text[]) ORDER BY path FOR UPDATE`, [paths]);
    const bodies = new Map(current.rows.map(row => [row.path, row.body]));
    const original = new Map(bodies);
    let timestamp = V.Timestamp.now();
    // A version must change even for consecutive writes in one millisecond.
    // Conditional maintenance deletes must never accept a stale document version.
    for (const body of bodies.values()) {
      const prior = V.Timestamp.fromString(body.updateTime);
      if (prior.seconds > timestamp.seconds || (prior.seconds === timestamp.seconds && prior.nanoseconds >= timestamp.nanoseconds)) {
        timestamp = new V.Timestamp(prior.seconds + (prior.nanoseconds === 999999999 ? 1 : 0), (prior.nanoseconds + 1) % 1e9);
      }
    }
    for (const write of tx.writes) {
      const before = bodies.get(write.ref.path);
      checkPrecondition(write.options.precondition || {}, before);
      if (write.kind === "create" && before) throw Object.assign(Error("Document already exists"), { code: 6 });
      if (write.kind === "delete") bodies.delete(write.ref.path);
      else {
        const data = V.applyWrite(before ? V.decode({ mapValue: { fields: before.fields || {} } }) : undefined, write.data, write.kind, write.options, timestamp);
        const body = { name: write.ref.name, fields: V.encode(data).mapValue.fields,
          createTime: before?.createTime || timestamp.toString(), updateTime: timestamp.toString() };
        if (Buffer.byteLength(JSON.stringify(body)) > 1024 * 1024) throw Error("Document exceeds supported size");
        bodies.set(write.ref.path, body);
      }
    }
    for (const path of paths) {
      const before = original.get(path), after = bodies.get(path);
      if (isDeepStrictEqual(before?.fields, after?.fields) && Boolean(before) === Boolean(after)) continue;
      if (after) {
        const parts = path.split("/");
        await tx.client.query(`INSERT INTO ${this.schema}.documents(path,collection_id,parent_path,body,source_sha256) VALUES($1,$2,$3,$4,$5) ON CONFLICT(path) DO UPDATE SET body=EXCLUDED.body,source_sha256=EXCLUDED.source_sha256`, [path, parts.at(-2), parts.slice(0, -2).join("/"), after, hash(after)]);
      } else await tx.client.query(`DELETE FROM ${this.schema}.documents WHERE path=$1`, [path]);
      await tx.client.query(`INSERT INTO ${this.schema}.changes(path,before_body,after_body) VALUES($1,$2,$3)`, [path, before || null, after || null]);
    }
  }
  batch() {
    const batch = new Transaction(this, null);
    batch.commit = () => this._runTransaction(tx => { tx.writes = batch.writes; }, {}, "READ COMMITTED");
    return batch;
  }
  bulkWriter() { return new BulkWriter(this); }
  withTransactionGuard(guard, callback) {
    if (typeof guard !== "function" || typeof callback !== "function" || this.transactionGuard.getStore()) throw Error("Invalid or nested transaction guard");
    return this.transactionGuard.run(guard, callback);
  }
  close() { return this.pool.end(); }
}

module.exports = { Store, DocumentReference, DocumentSnapshot, Query, QuerySnapshot, Filter, ...V };
