"use strict";
const crypto = require("node:crypto");
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const channel = schema => "crownlands_chat_" + hash(schema).slice(0, 32);
function topic(collection) {
  return /^(globalChat|clans)\/[^/]+\/messages$/.test(collection) ? hash(collection) : null;
}
const unavailable = () => Object.assign(Error("Chat updates are reconnecting."), { code: "unavailable" });

// One dedicated connection serves every waiting browser. Notifications contain
// only opaque collection hashes, never message text, account IDs or credentials.
// They are hints: every response is freshly read through ClientData authorization.
class ChatEvents {
  constructor(pool, schema) {
    this.pool = pool; this.channel = channel(schema); this.subscribers = new Set();
    this.closed = false; this.client = null; this.timer = null;
  }
  async start() {
    this.timer = null;
    try {
      const client = await this.pool.connect();
      if (this.closed) { client.release(); return; }
      this.client = client;
      const lost = () => {
        if (this.client !== client) return;
        this.client = null; client.release(true);
        if (!this.closed) this.timer = setTimeout(() => { void this.start(); }, 1000);
      };
      client.on("error", lost); client.on("end", lost);
      client.on("notification", event => {
        if (event.channel !== this.channel || !/^[a-f0-9]{64}$/.test(event.payload || "")) return;
        for (const subscriber of this.subscribers) if (subscriber.topics.has(event.payload)) subscriber.wake();
      });
      await client.query('LISTEN "' + this.channel + '"');
      // Recheck after LISTEN commits: notifications missed during a disconnect
      // are recovered from authoritative snapshots, never replayed as messages.
      for (const subscriber of this.subscribers) subscriber.wake();
    } catch {
      if (this.client) { const client = this.client; this.client = null; client.release(true); }
      if (!this.closed && !this.timer) this.timer = setTimeout(() => { this.timer = null; void this.start(); }, 1000);
    }
  }
  subscribe(collections) {
    if (this.closed) throw unavailable();
    const topics = collections.map(topic);
    if (!topics.length || topics.length > 2 || topics.some(value => !value)) throw Object.assign(Error("Invalid chat subscription."), { code: "invalid-argument" });
    let version = 0, pending = null, closed = false;
    const subscriber = { topics: new Set(topics), wake: () => { version++; pending?.(); } };
    this.subscribers.add(subscriber);
    return {
      get version() { return version; },
      wait: (prior, ms, signal) => new Promise(resolve => {
        if (closed || this.closed || signal.aborted || prior !== version) return resolve();
        const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); pending = null; resolve(); };
        const timer = setTimeout(finish, ms);
        pending = finish; signal.addEventListener("abort", finish, { once: true });
      }),
      close: () => { closed = true; this.subscribers.delete(subscriber); pending?.(); },
    };
  }
  async close() {
    this.closed = true; clearTimeout(this.timer);
    for (const subscriber of this.subscribers) subscriber.wake();
    if (this.client) { const client = this.client; this.client = null; client.release(true); }
    await this.pool.end();
  }
}

async function watchChat({ events, targets, cursor, signal, read, holdMs = 25000, recheckMs = 10000 }) {
  if (!Array.isArray(targets) || !targets.length || targets.length > 2
      || targets.some(target => !target || !topic(target.collection || "") || !Number.isInteger(target.limit) || target.limit < 1 || target.limit > 100)
      || (cursor !== undefined && !/^[a-f0-9]{64}$/.test(cursor))) {
    throw Object.assign(Error("Invalid chat subscription."), { code: "invalid-argument" });
  }
  const subscription = events.subscribe(targets.map(target => target.collection));
  const until = performance.now() + holdMs;
  try {
    while (!signal.aborted && !events.closed) {
      const version = subscription.version;
      const results = await read(targets);
      if (signal.aborted || events.closed) throw unavailable();
      const next = hash(JSON.stringify(results));
      if (next !== cursor || results.some(result => result.error) || performance.now() >= until) return { cursor: next, results };
      // No transaction or pool slot is held while waiting. The periodic recheck
      // covers session/membership revocation and writes outside this adapter.
      await subscription.wait(version, Math.min(recheckMs, until - performance.now()), signal);
      if (!signal.aborted) await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw unavailable();
  } finally { subscription.close(); }
}
module.exports = { ChatEvents, channel, topic, watchChat };
