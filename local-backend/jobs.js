"use strict";
const crypto = require("node:crypto");
const { Store, DocumentSnapshot } = require("./store");

const minuteMs = 60000;
const lostLease = () => Object.assign(Error("Background job no longer owns its lease"), { code: "job-lease-lost" });
function matchDocument(pattern, path) {
  const parts = pattern.split("/"), actual = path.split("/"), params = {};
  if (parts.length !== actual.length) return null;
  for (let i = 0; i < parts.length; i++) {
    const variable = /^\{([A-Za-z][A-Za-z0-9_]*)\}$/.exec(parts[i]);
    if (variable) params[variable[1]] = actual[i];
    else if (parts[i] !== actual[i]) return null;
  }
  return params;
}
function scheduleMatcher({ schedule, timeZone }) {
  // Cover the actual game's schedule grammar. A future unsupported schedule
  // prevents startup instead of silently running at the wrong time.
  const interval = /^every ([1-9][0-9]*) (minutes|hours)$/.exec(schedule);
  if (interval) {
    if (!["UTC", "Etc/UTC"].includes(timeZone)) throw Error("Interval schedule requires UTC");
    const minutes = Number(interval[1]) * (interval[2] === "hours" ? 60 : 1);
    if (minutes > 1440 || 1440 % minutes) throw Error("Unsupported schedule interval");
    return ms => Math.floor(ms / minuteMs) % minutes === 0;
  }
  const daily = /^(\d{1,2}) (\d{1,2}) \* \* \*$/.exec(schedule);
  if (!daily || +daily[1] > 59 || +daily[2] > 23) throw Error("Unsupported daily schedule");
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
  return ms => {
    const parts = Object.fromEntries(formatter.formatToParts(ms).map(part => [part.type, part.value]));
    return +parts.minute === +daily[1] && +parts.hour === +daily[2];
  };
}
class JobQueue {
  constructor({ store, controlStore = store, routes, leaseSeconds = 60, maxAttempts = 8, maxActive = 2 }) {
    if (!(store instanceof Store) || !/^migration_game_[a-z0-9_]{1,30}$/.test(store.schema)) throw Error("Jobs require an isolated game rehearsal schema");
    if (!(controlStore instanceof Store) || controlStore.schema !== store.schema) throw Error("Job control must use the same game schema");
    if (!Number.isInteger(leaseSeconds) || leaseSeconds < 5 || leaseSeconds > 300 || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) throw Error("Invalid job bounds");
    if (!Number.isInteger(maxActive) || maxActive < 1 || maxActive > 8) throw Error("Invalid worker concurrency");
    this.store = store; this.controlStore = controlStore; this.schema = store.schema; this.leaseSeconds = leaseSeconds; this.maxAttempts = maxAttempts;
    this.maxActive = maxActive; this.active = 0; this.stopping = false; this.stopAt = Infinity;
    this.routes = new Map(); this.triggers = []; this.schedules = []; this.scheduledThrough = -1;
    for (const route of routes) {
      if (!/^[A-Za-z][A-Za-z0-9]{1,100}$/.test(route.name) || this.routes.has(route.name) || typeof route.handler !== "function") throw Error("Invalid or duplicate handler");
      if (!["created", "written", "schedule"].includes(route.kind)) continue;
      this.routes.set(route.name, route);
      if (route.kind === "schedule") {
        this.schedules.push({ ...route, matches: scheduleMatcher(route.options), signature: crypto.createHash("sha256").update(JSON.stringify([route.options.schedule, route.options.timeZone])).digest("hex") });
      } else {
        const parts = String(route.options.document || "").split("/");
        if (parts.length % 2 || parts.some(part => !/^(?:[A-Za-z0-9_-]+|\{[A-Za-z][A-Za-z0-9_]*\})$/.test(part))) throw Error("Unsupported trigger pattern");
        const variables = parts.filter(part => part.startsWith("{"));
        if (new Set(variables).size !== variables.length) throw Error("Duplicate trigger parameter");
        this.triggers.push(route);
      }
    }
  }
  async initialize() {
    const s = this.schema;
    await this.controlStore.pool.query(`
      ALTER TABLE ${s}.changes ADD COLUMN IF NOT EXISTS dispatched_at timestamptz;
      CREATE INDEX IF NOT EXISTS changes_undispatched ON ${s}.changes(id) WHERE dispatched_at IS NULL;
      CREATE TABLE IF NOT EXISTS ${s}.work_jobs (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, job_key text NOT NULL UNIQUE,
        handler text NOT NULL, kind text NOT NULL CHECK(kind IN ('created','written','schedule')), event jsonb NOT NULL,
        status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','complete','dead')),
        attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        lease_token uuid, lease_until timestamptz, finished_at timestamptz, last_error_code text);
      CREATE INDEX IF NOT EXISTS work_jobs_pending ON ${s}.work_jobs(available_at,id) WHERE status IN ('pending','running');
      CREATE INDEX IF NOT EXISTS work_jobs_handler ON ${s}.work_jobs(handler,id) WHERE status IN ('pending','running');
      CREATE TABLE IF NOT EXISTS ${s}.work_schedules (name text PRIMARY KEY, signature text NOT NULL, last_minute bigint NOT NULL);
      REVOKE ALL ON ${s}.work_jobs,${s}.work_schedules FROM PUBLIC;`);
    await this.transaction(client => require("./job-status").initializeJobStatus(client, s));
  }
  async transaction(callback) {
    const client = await this.controlStore.pool.connect();
    try {
      await client.query("BEGIN"); const result = await callback(client); await client.query("COMMIT"); return result;
    } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
    finally { client.release(); }
  }
  async dispatchChanges(limit = 200) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw Error("Invalid dispatch limit");
    return this.transaction(async client => {
      const rows = (await client.query(`SELECT id,path,before_body IS NOT NULL AS had_before,after_body IS NOT NULL AS has_after FROM ${this.schema}.changes WHERE dispatched_at IS NULL ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`, [limit])).rows;
      const jobs = [];
      for (const row of rows) {
        for (const route of this.triggers) {
          const params = matchDocument(route.options.document, row.path);
          if (!params || (route.kind === "created" && (row.had_before || !row.has_after))) continue;
          jobs.push({ job_key: `change:${row.id}:${route.name}`, handler: route.name, kind: route.kind, event: { changeId: row.id, params } });
        }
      }
      if (jobs.length) await client.query(`INSERT INTO ${this.schema}.work_jobs(job_key,handler,kind,event)
        SELECT job_key,handler,kind,event FROM jsonb_to_recordset($1::jsonb) AS rows(job_key text,handler text,kind text,event jsonb)
        ON CONFLICT(job_key) DO NOTHING`, [JSON.stringify(jobs)]);
      // Mark each row in the same commit as its jobs. Identity sequences do not
      // follow commit order; a global last-ID cursor would lose late commits.
      await client.query(`UPDATE ${this.schema}.changes SET dispatched_at=clock_timestamp() WHERE id=ANY($1::bigint[])`, [rows.map(row => row.id)]);
      return rows.length;
    });
  }
  async enqueueSchedules(at = Date.now()) {
    if (!Number.isSafeInteger(at) || at < 0 || at > 8640000000000000) throw Error("Invalid scheduler time");
    const target = Math.floor(at / minuteMs);
    if (target <= this.scheduledThrough) return 0;
    let caughtUp = true;
    const added = await this.transaction(async client => {
      let added = 0;
      for (const schedule of this.schedules) {
        await client.query(`INSERT INTO ${this.schema}.work_schedules(name,signature,last_minute) VALUES($1,$2,$3) ON CONFLICT(name) DO NOTHING`, [schedule.name, schedule.signature, target - 1]);
        const state = (await client.query(`SELECT signature,last_minute FROM ${this.schema}.work_schedules WHERE name=$1 FOR UPDATE`, [schedule.name])).rows[0];
        if (state.signature !== schedule.signature) throw Error("Schedule changed; review the retained cursor before replacing it");
        const prior = Number(state.last_minute), end = Math.min(target, prior + 360);
        if (end < target) caughtUp = false;
        for (let minute = prior + 1; minute <= end; minute++) {
          if (!schedule.matches(minute * minuteMs)) continue;
          const result = await client.query(`INSERT INTO ${this.schema}.work_jobs(job_key,handler,kind,event) VALUES($1,$2,'schedule',$3) ON CONFLICT(job_key) DO NOTHING`, [`schedule:${schedule.name}:${minute}`, schedule.name, { scheduleTime: new Date(minute * minuteMs).toISOString() }]);
          added += result.rowCount;
        }
        if (end > prior) await client.query(`UPDATE ${this.schema}.work_schedules SET last_minute=$2 WHERE name=$1`, [schedule.name, end]);
      }
      return added;
    });
    // Cache only a successfully committed, fully caught-up minute. A restart
    // rereads durable cursors; failures and multi-batch catch-up never skip work.
    if (caughtUp) this.scheduledThrough = Math.max(this.scheduledThrough, target);
    return added;
  }
  async claim() {
    return this.transaction(async client => {
      // Serialize only the short claim, never the handler. One pending/running
      // invocation per handler executes in order; different handlers can overlap.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1),6721)", [this.schema]);
      const row = (await client.query(`SELECT j.* FROM ${this.schema}.work_jobs j
        WHERE ((j.status='pending' AND j.available_at<=clock_timestamp()) OR (j.status='running' AND j.lease_until<=clock_timestamp()))
        AND NOT EXISTS(SELECT 1 FROM ${this.schema}.work_jobs p WHERE p.handler=j.handler AND p.id<j.id AND p.status IN ('pending','running'))
        ORDER BY j.available_at,j.id LIMIT 1 FOR UPDATE`, [])).rows[0];
      if (!row) return null;
      if (row.attempts >= this.maxAttempts) {
        await client.query(`UPDATE ${this.schema}.work_jobs SET status='dead',lease_token=NULL,lease_until=NULL,last_error_code='attempt-limit',finished_at=clock_timestamp() WHERE id=$1`, [row.id]);
        return null;
      }
      const token = crypto.randomUUID();
      return (await client.query(`UPDATE ${this.schema}.work_jobs SET status='running',attempts=attempts+1,lease_token=$2,lease_until=clock_timestamp()+$3*interval '1 second' WHERE id=$1 RETURNING *`, [row.id, token, this.leaseSeconds])).rows[0];
    });
  }
  async heartbeat(job) {
    const result = await this.controlStore.pool.query(`UPDATE ${this.schema}.work_jobs SET lease_until=clock_timestamp()+$3*interval '1 second'
      WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until>clock_timestamp()`, [job.id, job.lease_token, this.leaseSeconds]);
    if (!result.rowCount) throw lostLease();
  }
  guard(job) {
    return async client => {
      // This shared row lock prevents a new lease owner from starting before
      // this transaction commits, including when the wall-clock lease expires.
      const result = await client.query(`SELECT id FROM ${this.schema}.work_jobs WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until>clock_timestamp() FOR SHARE`, [job.id, job.lease_token]);
      if (!result.rowCount) throw lostLease();
    };
  }
  async finish(job, error) {
    const code = error ? (/^[A-Za-z0-9_-]{1,64}$/.test(String(error.code || "")) ? String(error.code) : "handler-failed") : null;
    // Only safe error codes are retained; handlers can include player data in
    // error messages, and payloads must never enter ordinary status logs.
    const status = error ? (job.attempts >= this.maxAttempts ? "dead" : "pending") : "complete";
    const result = await this.controlStore.pool.query(`UPDATE ${this.schema}.work_jobs SET status=$3,lease_token=NULL,lease_until=NULL,
      last_error_code=$4,available_at=clock_timestamp()+$5*interval '1 second',finished_at=CASE WHEN $3 IN ('complete','dead') THEN clock_timestamp() ELSE NULL END
      WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until>clock_timestamp()`, [job.id, job.lease_token, status, code, error ? Math.min(300, 2 ** job.attempts) : 0]);
    if (!result.rowCount) throw lostLease();
  }
  async event(job) {
    if (job.kind === "schedule") return { jobName: job.handler, scheduleTime: job.event.scheduleTime };
    const row = (await this.controlStore.pool.query(`SELECT path,before_body,after_body,created_at FROM ${this.schema}.changes WHERE id=$1`, [job.event.changeId])).rows[0];
    if (!row) throw Object.assign(Error("Job source change missing"), { code: "source-change-missing" });
    const before = new DocumentSnapshot(this.store, row.path, row.before_body);
    const after = new DocumentSnapshot(this.store, row.path, row.after_body);
    return { id: job.job_key, time: row.created_at.toISOString(), params: job.event.params,
      data: job.kind === "created" ? after : { before, after } };
  }
  async runOne() {
    if (this.stopping || Date.now() >= this.stopAt || this.active >= this.maxActive) return false;
    this.active++;
    let job;
    try { job = await this.claim(); } catch (error) { this.active--; throw error; }
    if (!job) { this.active--; return false; }
    let failure = null, stopped = false, timer, deadline, execute, executionFinished = false;
    const refresh = async () => {
      try { await this.heartbeat(job); }
      catch { failure = lostLease(); stopped = true; }
      if (!stopped) timer = setTimeout(refresh, this.leaseSeconds * 1000 / 3);
    };
    timer = setTimeout(refresh, this.leaseSeconds * 1000 / 3);
    try {
      const route = this.routes.get(job.handler);
      if (!route || route.kind !== job.kind) throw Object.assign(Error("Retained job handler missing"), { code: "handler-missing" });
      const event = await this.event(job);
      execute = Promise.resolve(this.store.withTransactionGuard(async client => {
        if (failure) throw failure;
        if (this.stopping || Date.now() >= this.stopAt) throw Object.assign(Error("Worker is stopping"), { code: "job-worker-stopping" });
        await this.guard(job)(client);
      }, () => route.handler(event)));
      // A handler can ignore its timeout and keep running JavaScript. Retain
      // its slot until it actually settles, even after the job is retried.
      execute.then(() => { executionFinished = true; }, () => { executionFinished = true; });
      await Promise.race([execute, new Promise((resolve, reject) => {
        deadline = setTimeout(() => reject(Object.assign(Error("Job deadline exceeded"), { code: "job-timeout" })), Math.min(route.options.timeoutSeconds || 540, 540) * 1000);
      })]);
    } catch (error) { failure = error; }
    finally { stopped = true; clearTimeout(timer); clearTimeout(deadline); }
    try { await this.finish(job, failure); }
    catch (error) { if (error.code !== "job-lease-lost") throw error; }
    finally {
      if (execute && !executionFinished) execute.then(() => { this.active--; }, () => { this.active--; });
      else this.active--;
    }
    return true;
  }
  stop() { this.stopping = true; }
}
module.exports = { JobQueue, scheduleMatcher, matchDocument };
