(function initializeLocalClient(root) {
  "use strict";
  function create() {
    if (root.location.origin !== "https://playcrownlands.com" || !root.location.pathname.startsWith("/api/local-game/rehearsal/")) throw Error("The local client is limited to the private rehearsal.");
    const authState = { currentUser: null }, observers = new Set(), watchers = new Set();
    const db = { kind: "local-database" }; let csrf, authTime, refreshing, watchTimer, authTimer, revision = 0, disposed = false, activeRequests = 0;
    const pendingRequests = [];
    const makeError = (code, message) => Object.assign(Error(message || "The request could not be completed."), { code });
    async function session(notify = true) {
      if (refreshing) return refreshing;
      refreshing = (async () => {
        const response = await root.fetch("/local-auth/v1/session", { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) throw makeError("auth/network-request-failed"); const result = await response.json();
        csrf = result.csrf;
        const prior = JSON.stringify([authState.currentUser, authTime]);
        if (result.user?.uid !== authState.currentUser?.uid || result.authTime !== authTime) revision++;
        if (authState.currentUser && result.user?.uid === authState.currentUser.uid) Object.assign(authState.currentUser, result.user);
        else authState.currentUser = result.user;
        authTime = result.authTime;
        if (notify && prior !== JSON.stringify([authState.currentUser, authTime])) for (const observer of observers) observer(authState.currentUser);
        return result;
      })().finally(() => { refreshing = null; });
      return refreshing;
    }
    async function post(path, input, authentication = false) {
      if (authentication) return performPost(path, input, true);
      if (!csrf) await session();
      const requestedRevision = revision;
      const unavailable = () => makeError(path.startsWith("call/") ? "functions/unauthenticated" : "unauthenticated", "The account session changed.");
      if (disposed) throw unavailable();
      if (pendingRequests.length >= 128) throw makeError(path.startsWith("call/") ? "functions/resource-exhausted" : "resource-exhausted", "Too many pending game requests.");
      // Login starts many independent listeners/callables. Bound each tab to
      // six in-flight game requests so the server's admission limit is useful
      // protection rather than a source of normal startup failures.
      await new Promise((resolve, reject) => {
        if (activeRequests < 6) { activeRequests++; resolve(); }
        else pendingRequests.push({ resolve, reject: () => reject(unavailable()) });
      });
      try {
        if (disposed || requestedRevision !== revision) throw unavailable();
        return await performPost(path, input, false);
      } finally {
        const next = pendingRequests.shift();
        if (next) next.resolve(); else activeRequests--;
      }
    }
    async function performPost(path, input, authentication) {
      const normalizeCode = code => !authentication && !path.startsWith("call/") ? code.replace(/^functions\//, "") : code;
      if (!csrf) await session();
      const started = revision;
      const response = await root.fetch((authentication ? "/local-auth/v1/" : "/api/local-game/v1/") + path, {
        method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", "X-Crownlands-CSRF": csrf }, body: JSON.stringify(input),
      });
      const result = await response.json().catch(() => ({}));
      if (disposed || (!authentication && started !== revision)) throw makeError(normalizeCode("functions/unauthenticated"), "The account session changed.");
      if (!response.ok || result.error) {
        if (response.status === 401) await session().catch(() => {});
        throw Object.assign(makeError(normalizeCode(result.error?.code || (authentication ? "auth/network-request-failed" : "functions/unavailable")), result.error?.message), { details: result.error?.details });
      }
      return authentication ? result : result.result;
    }
    async function google(reauthenticate = false) {
      const result = await post("google-start", { reauthenticate }, true), url = new URL(result.url);
      if (url.origin !== "https://accounts.google.com") throw makeError("auth/internal-error");
      root.location.assign(url.href); return new Promise(() => {});
    }
    class GoogleAuthProvider {}
    const auth = {
      getAuth: () => authState, GoogleAuthProvider,
      onAuthStateChanged: (_state, callback) => {
        observers.add(callback); session(false).then(() => { if (observers.has(callback)) callback(authState.currentUser); }).catch(() => { if (observers.has(callback)) callback(null); });
        if (!authTimer) authTimer = root.setInterval(() => session().catch(() => {}), 10000);
        return () => { observers.delete(callback); if (!observers.size) { root.clearInterval(authTimer); authTimer = null; } };
      },
      getRedirectResult: async () => null,
      signInWithPopup: () => google(), signInWithRedirect: () => google(),
      reauthenticateWithPopup: () => google(true), reauthenticateWithRedirect: () => google(true),
      signOut: async () => { await post("logout", {}, true); await session(); },
      signInWithEmailAndPassword: async (_state, email, password) => { const result = await post("login", { email, password }, true); await session(); return { ...result, user: authState.currentUser }; },
      createUserWithEmailAndPassword: async (_state, email, password) => { const result = await post("register", { email, password }, true); await session(); return { ...result, user: authState.currentUser }; },
      sendEmailVerification: () => post("verification-request", {}, true),
      sendPasswordResetEmail: (_state, email) => post("reset-request", { email }, true),
      reload: () => session(),
      getIdToken: async () => { await session(); return "local-cookie-session"; },
      getIdTokenResult: async user => { await session(); if (!user || user.uid !== authState.currentUser?.uid) throw makeError("auth/user-token-expired");
        return { signInProvider: user.signInProvider, claims: { auth_time: authTime, email_verified: user.emailVerified, firebase: { sign_in_provider: user.signInProvider } } }; },
      EmailAuthProvider: { credential: (email, password) => ({ email, password }) },
      linkWithCredential: async (user, credential) => { if (user?.email !== credential.email) throw makeError("auth/user-mismatch");
        await post("password-link", { password: credential.password }, true); await session(); return { user: authState.currentUser }; },
    };
    class Timestamp {
      constructor(seconds, nanoseconds) { this.seconds = seconds; this.nanoseconds = nanoseconds; }
      toMillis() { return this.seconds * 1000 + this.nanoseconds / 1e6; }
      toDate() { return new Date(this.toMillis()); }
      static fromMillis(value) { const seconds = Math.floor(value / 1000); return new Timestamp(seconds, Math.round((value - seconds * 1000) * 1e6)); }
      static now() { return Timestamp.fromMillis(Date.now()); }
    }
    class Transform { constructor(kind) { this.kind = kind; } }
    const parseTime = value => { const match = /^(.*?)(?:\.(\d{1,9}))?Z$/.exec(value); return new Timestamp(Date.parse(match[1] + "Z") / 1000, Number((match[2] || "").padEnd(9, "0"))); };
    function decode(value) {
      if ("nullValue" in value) return null;
      if ("stringValue" in value) return value.stringValue;
      if ("booleanValue" in value) return value.booleanValue;
      if ("integerValue" in value) { const number = Number(value.integerValue); return Number.isSafeInteger(number) ? number : BigInt(value.integerValue); }
      if ("doubleValue" in value) return Number(value.doubleValue);
      if ("timestampValue" in value) return parseTime(value.timestampValue);
      if ("arrayValue" in value) return (value.arrayValue.values || []).map(decode);
      if ("mapValue" in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decode(item)]));
      if ("referenceValue" in value) return ref("doc", value.referenceValue.split("/documents/")[1]);
      if ("bytesValue" in value) return Uint8Array.from(root.atob(value.bytesValue), character => character.charCodeAt(0));
      if ("geoPointValue" in value) return value.geoPointValue;
      throw Error("Unsupported document value");
    }
    function encode(value, transforms, parts = []) {
      if (value instanceof Transform) { if (!transforms) throw Error("Transform outside a write"); transforms.push({ field: parts, kind: value.kind }); return undefined; }
      if (value === null) return { nullValue: null };
      if (typeof value === "string") return { stringValue: value };
      if (typeof value === "boolean") return { booleanValue: value };
      if (typeof value === "bigint") return { integerValue: String(value) };
      if (typeof value === "number") return Number.isSafeInteger(value) && !Object.is(value, -0) ? { integerValue: String(value) } : { doubleValue: Number.isFinite(value) ? value : String(value) };
      if (value instanceof Date) value = Timestamp.fromMillis(value.getTime());
      if (value instanceof Timestamp) return { timestampValue: new Date(value.seconds * 1000).toISOString().slice(0, 19) + "." + String(value.nanoseconds).padStart(9, "0") + "Z" };
      if (Array.isArray(value)) return { arrayValue: { values: value.map(item => encode(item)) } };
      if (value && Object.getPrototypeOf(value) === Object.prototype) return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item, transforms, [...parts, key])]).filter(([, item]) => item !== undefined)) } };
      throw Error("Unsupported document value");
    }
    function ref(kind, path) {
      const parts = path.split("/");
      if (!path || parts.some(part => !part) || (parts.length % 2 === 0) !== (kind === "doc")) throw Error("Invalid document path");
      return { kind, path, id: parts.at(-1), get parent() { return kind === "doc" ? ref("collection", parts.slice(0, -1).join("/")) : parts.length > 1 ? ref("doc", parts.slice(0, -1).join("/")) : null; } };
    }
    const fieldParts = field => Array.isArray(field) ? field : String(field).split(".");
    const fieldValue = (value, field) => fieldParts(field).reduce((data, key) => data && Object.hasOwn(data, key) ? data[key] : undefined, value);
    function spec(target) {
      if (target.kind === "doc") return { path: target.path };
      const result = { [target.kind === "group" ? "group" : "collection"]: target.path, filters: [], orders: [] };
      for (const clause of target.clauses || []) {
        if (clause.kind === "where") result.filters.push({ field: fieldParts(clause.field), op: clause.op, value: encode(clause.value) });
        if (clause.kind === "order") result.orders.push({ field: fieldParts(clause.field), direction: clause.direction });
        if (clause.kind === "limit") result.limit = clause.value;
      }
      for (const clause of target.clauses || []) {
        if (!["start", "end"].includes(clause.kind)) continue;
        let values = clause.values;
        if (values.length === 1 && values[0]?.raw) {
          const document = values[0], orders = [...result.orders];
          const inequalities = result.filters.filter(filter => ["<", "<=", ">", ">=", "!=", "not-in"].includes(filter.op))
            .map(filter => filter.field).sort((a, b) => a.join(".") < b.join(".") ? -1 : a.join(".") > b.join(".") ? 1 : 0);
          for (const field of inequalities) if (!orders.some(order => JSON.stringify(order.field) === JSON.stringify(field))) orders.push({ field });
          if (!orders.some(order => order.field.length === 1 && order.field[0] === "__name__")) orders.push({ field: ["__name__"] });
          values = orders.map(order => order.field[0] === "__name__" ? target.kind === "group" ? document.ref.path : document.id : fieldValue(document.data(), order.field));
        }
        result[clause.kind] = { inclusive: clause.inclusive, values: values.map(value => encode(value)) };
      }
      return result;
    }
    function documentSnapshot(raw) {
      const reference = ref("doc", raw.path);
      return { raw, ref: reference, id: reference.id, exists: () => Boolean(raw.body), data: () => raw.body ? decode({ mapValue: { fields: raw.body.fields || {} } }) : undefined,
        get: field => raw.body ? fieldValue(decode({ mapValue: { fields: raw.body.fields || {} } }), field) : undefined,
        metadata: { fromCache: false, hasPendingWrites: false } };
    }
    function snapshot(result, previous) {
      if (result.document) return documentSnapshot(result.documents[0]);
      const docs = result.documents.map(documentSnapshot), prior = previous?.docs || [], changes = [];
      for (const [index, doc] of prior.entries()) if (!docs.some(next => next.ref.path === doc.ref.path)) changes.push({ type: "removed", doc, oldIndex: index, newIndex: -1 });
      for (const [index, doc] of docs.entries()) {
        const old = prior.findIndex(previous => previous.ref.path === doc.ref.path);
        if (old === -1 || prior[old].raw.body?.updateTime !== doc.raw.body?.updateTime || old !== index) changes.push({ type: old === -1 ? "added" : "modified", doc, oldIndex: old, newIndex: index });
      }
      return { docs, size: docs.length, empty: !docs.length, forEach: callback => docs.forEach(callback), docChanges: () => changes, metadata: { fromCache: false, hasPendingWrites: false } };
    }
    async function read(target) { return snapshot((await post("read", { targets: [spec(target)] }))[0]); }
    function write(kind, reference, data, options = {}) {
      const entry = { path: reference.path, kind };
      if (kind !== "delete") {
        entry.transforms = []; entry.data = encode(data, entry.transforms);
        if (kind === "update") for (const transform of entry.transforms) transform.field = [...fieldParts(transform.field[0]), ...transform.field.slice(1)];
      }
      if (options.merge !== undefined) entry.merge = options.merge;
      return entry;
    }
    function batch() {
      const writes = [], api = { set: (reference, data, options) => { writes.push(write("set", reference, data, options)); return api; },
        update: (reference, data) => { writes.push(write("update", reference, data)); return api; }, delete: reference => { writes.push(write("delete", reference)); return api; },
        commit: () => writes.length ? post("write", { writes }) : Promise.resolve() };
      return api;
    }
    async function poll() {
      const active = [...watchers]; if (!active.length) { watchTimer = null; return; }
      let delay = root.document.hidden ? 10000 : 1500;
      try {
        // A single bounded request prevents dozens of listeners from flooding
        // the host. The server authorizes every target and returns independent
        // permission failures without exposing a forbidden document.
        const results = await post("watch", { targets: active.map(watcher => spec(watcher.target)) });
        if (!Array.isArray(results) || results.length !== active.length) throw makeError("unavailable");
        for (const [index, watcher] of active.entries()) {
          if (!watchers.has(watcher)) continue;
          const result = results[index];
          if (result.error) {
            watchers.delete(watcher);
            try { watcher.error?.(makeError(result.error.code, result.error.message)); } catch { /* A UI callback must not interrupt other listeners. */ }
            continue;
          }
          const identity = JSON.stringify(result);
          if (identity !== watcher.identity) {
            watcher.identity = identity; watcher.previous = snapshot(result, watcher.previous);
            try { watcher.next(watcher.previous); } catch { /* Match independent SDK callback delivery. */ }
          }
        }
      } catch (error) {
        delay = 10000;
        const terminal = ["permission-denied", "unauthenticated", "invalid-argument"].includes(error.code);
        for (const watcher of active) if (watchers.has(watcher)) {
          if (terminal) watchers.delete(watcher);
          try { watcher.error?.(error); } catch { /* Keep remaining listeners independent. */ }
        }
      }
      watchTimer = !disposed && watchers.size ? root.setTimeout(poll, delay) : null;
    }
    const firestore = {
      getFirestore: () => db, Timestamp,
      doc: (parent, ...parts) => ref("doc", [parent === db ? "" : parent.path, ...parts].filter(Boolean).join("/")),
      collection: (parent, ...parts) => ref("collection", [parent === db ? "" : parent.path, ...parts].filter(Boolean).join("/")),
      collectionGroup: (_db, id) => ({ kind: "group", path: id }),
      query: (target, ...clauses) => ({ ...target, clauses: [...(target.clauses || []), ...clauses] }),
      where: (field, op, value) => ({ kind: "where", field, op, value }), orderBy: (field, direction = "asc") => ({ kind: "order", field, direction }),
      limit: value => ({ kind: "limit", value }), documentId: () => ["__name__"],
      startAfter: (...values) => ({ kind: "start", values, inclusive: false }), startAt: (...values) => ({ kind: "start", values, inclusive: true }), endAt: (...values) => ({ kind: "end", values, inclusive: true }),
      getDoc: read, getDocFromServer: read, getDocs: read, getDocsFromServer: read,
      setDoc: (reference, data, options) => post("write", { writes: [write("set", reference, data, options)] }),
      updateDoc: (reference, data) => post("write", { writes: [write("update", reference, data)] }),
      deleteDoc: reference => post("write", { writes: [write("delete", reference)] }),
      writeBatch: batch, serverTimestamp: () => new Transform("timestamp"), deleteField: () => new Transform("delete"),
      runTransaction: async (_db, callback) => {
        for (let attempt = 0; attempt < 5; attempt++) {
          const writes = [], checks = [];
          const result = await callback({ get: async reference => { if (writes.length) throw Error("Transaction reads must precede writes"); const value = await read(reference); checks.push({ path: reference.path, updateTime: value.raw.body?.updateTime || null }); return value; },
            set: (reference, data, options) => writes.push(write("set", reference, data, options)), update: (reference, data) => writes.push(write("update", reference, data)), delete: reference => writes.push(write("delete", reference)) });
          if (!writes.length) return result;
          try { await post("write", { writes, checks }); return result; }
          catch (error) { if (error.code !== "aborted" || attempt === 4) throw error; }
        }
      },
      onSnapshot: (target, ...args) => {
        const callbacks = args.filter(arg => typeof arg === "function"), observer = args.find(arg => arg && typeof arg === "object" && typeof arg.next === "function");
        const watcher = { target, next: observer?.next || callbacks[0], error: observer?.error || callbacks[1] };
        if (!watcher.next) throw Error("A snapshot callback is required");
        if (watchers.size >= 80) throw makeError("resource-exhausted", "Too many active game listeners.");
        watchers.add(watcher);
        if (!watchTimer) watchTimer = root.setTimeout(poll, 0);
        return () => watchers.delete(watcher);
      },
    };
    const messaging = root.CrownlandsLocalPush?.create() || { isSupported: async () => false };
    return { app: { initializeApp: () => ({}) }, auth, firestore, functions: { getFunctions: () => ({}), httpsCallable: (_functions, name) => async data => ({ data: await post("call/" + name, { data }) }) },
      appCheck: {}, messaging,
      dispose: () => { disposed = true; revision++; messaging.dispose?.(); root.clearInterval(authTimer); root.clearTimeout(watchTimer); watchers.clear(); observers.clear();
        for (const request of pendingRequests.splice(0)) request.reject(); } };
  }
  root.CrownlandsLocalBackend = { create };
})(typeof window !== "undefined" ? window : globalThis);
