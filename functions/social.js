"use strict";
// Account-scoped social state. Never attach seasonal progression or secrets here.
const crypto = require("node:crypto");
const DAY = 86400000, RETENTION = 90 * DAY, REQUEST_LIFETIME = 7 * DAY, RETRY = 30 * DAY;
const MAX_FRIENDS = 200, PAGE = 50, MAX_TEXT = 1000, COOLDOWN = 3000;
const CONFIG = "socialConfiguration/current";
const validUid = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const hash = value => crypto.createHash("sha256").update(value).digest("hex").slice(0, 40);
const pairId = (a, b) => hash(JSON.stringify([a, b].sort()));
const accountPath = uid => `socialAccounts/${uid}`;
const pairPath = id => `socialPairs/${id}`;
const messagePath = (id, message) => `${pairPath(id)}/privateMessages/${message}`;
const unread = (row, now) => row.lastIncomingSeq > (row.readSeq || 0) && row.lastIncomingAtMs > now - RETENTION;
const visibleUnread = (row, now) => row.unavailable !== true && row.status !== "closed" && !(row.status === "pending" && row.expiresAtMs <= now) && unread(row, now);
const blocked = pair => Object.values(pair.blocks || {}).some(Boolean);
const activeRequest = (request, now) => request?.status === "pending" && request.expiresAtMs > now;
function effective(pair, now) {
  const copy = structuredClone(pair);
  for (const key of ["friend", "conversation"]) {
    if (copy[key]?.status === "pending" && copy[key].expiresAtMs <= now) {
      copy[key] = { ...copy[key], status: "declined", retryAtMs: copy[key].expiresAtMs + RETRY };
    }
  }
  return copy;
}
function relation(pair, uid, now) {
  const p = effective(pair, now), other = p.uids.find(id => id !== uid);
  return { id: p.id, peerUid: other, blocked: p.blocks?.[uid] === true, unavailable: blocked(p),
    friend: p.friend?.status === "accepted" ? "friends" : activeRequest(p.friend, now) ? p.friend.from === uid ? "outgoing" : "incoming" : "none",
    conversation: p.conversation?.status === "accepted" ? "accepted" : activeRequest(p.conversation, now) ? p.conversation.from === uid ? "outgoing" : "incoming" : "none",
    canSend: !blocked(p) && (p.friend?.status === "accepted" || p.conversation?.status === "accepted"),
    friendExpiresAtMs: p.friend?.expiresAtMs || 0, messageExpiresAtMs: p.conversation?.expiresAtMs || 0 };
}
function identity(uid, profile = {}) {
  const flag = profile.flag || {}, cleanFlag = {};
  for (const key of ["version", "primary", "secondary", "symbolColor", "pattern", "symbol"]) {
    if (typeof flag[key] === "string") cleanFlag[key] = flag[key].slice(0, 80);
    else if (key === "version" && Number.isInteger(flag[key])) cleanFlag[key] = flag[key];
  }
  return { uid, name: String(profile.playerName || "Ruler").slice(0, 18), flag: cleanFlag,
    clanTag: String(profile.clanTag || "").slice(0, 5) };
}
function createService({ db, fail = (code, message) => Object.assign(Error(message), { code }), now = Date.now,
  getRealm = () => ({}), memberPath = uid => `gameServers/crownlands/members/${uid}` }) {
  const invalid = () => fail("invalid-argument", "Choose a valid social action.");
  const deny = () => fail("permission-denied", "This conversation is unavailable.");
  const snapshotData = snapshot => snapshot.exists ? snapshot.data() : null;
  async function reads(tx, paths) { return Promise.all(paths.map(path => tx.get(db.doc(path)).then(snapshotData))); }
  function requirePair(pair, uid) { if (!pair || !pair.uids?.includes(uid)) throw deny(); }
  function assertSending(account, restriction, time) {
    if (account.restrictedUntilMs > time || restriction?.banned === true || restriction?.status === "banned"
      || Number(restriction?.mutedUntilMs || restriction?.mutedUntil?.toMillis?.() || 0) > time) {
      throw fail("permission-denied", "Messaging is temporarily restricted for this account.");
    }
  }
  function signal(tx, uid, section, time) {
    // One opaque per-account signal covers every conversation, including older pages.
    tx.set(db.doc(`${accountPath(uid)}/signals/current`), { [section]: crypto.randomUUID(), updatedAtMs: time }, { merge: true });
  }
  async function handler(request) {
    const uid = request.auth?.uid, input = request.data || {}, time = now();
    if (!validUid(uid)) throw fail("unauthenticated", "Sign in to use Friends and Messages.");
    if (request.auth?.token?.firebase?.sign_in_provider === "password" && request.auth.token.email_verified !== true) throw deny();
    if (!input || typeof input !== "object" || Array.isArray(input)) throw invalid();
    const fields = ["action", "peerUid", "conversationId", "choice", "text", "requestId", "kind", "cursor", "beforeSeq", "throughSeq", "uids", "enabled", "messageId", "reason",
      "clientReleaseId", "clientWorldId", "clientResetGeneration", "clientRealmShardId", "clientApiContractHash", "activeSessionId"];
    if (Object.keys(input).some(key => !fields.includes(key))) throw invalid();
    const action = input.action;
    return db.runTransaction(async tx => {
      const [config, ownProfile, storedAccount] = await reads(tx, [CONFIG, `players/${uid}`, accountPath(uid)]);
      if (action === "status") return { enabled: config?.enabled === true, version: 1, privateAlerts: storedAccount?.privateAlerts === true, serverNowMs: time };
      if (!config?.enabled) throw fail("unavailable", "Friends and Messages are not available yet.");
      if (!ownProfile) throw fail("failed-precondition", "Enter your kingdom before using Friends and Messages.");
      const account = storedAccount || {};
      if (action === "list") {
        const definitions = {
          friends: ["contacts", "friend", "==", "friends"], friendRequests: ["contacts", "friend", "in", ["incoming", "outgoing"]],
          blocked: ["contacts", "blocked", "==", true], conversations: ["inbox", "status", "==", "accepted"],
          messageRequests: ["inbox", "status", "==", "pending"],
        };
        const def = definitions[input.kind]; if (!def) throw invalid();
        let query = db.collection(`${accountPath(uid)}/${def[0]}`).where(def[1], def[2], def[3]).orderBy("updatedAtMs", "desc").orderBy("__name__", "asc").limit(PAGE + 1);
        if (input.cursor != null) {
          const c = input.cursor;
          if (!Number.isSafeInteger(c.at) || !/^[a-f0-9]{40}$/.test(c.id || "")) throw invalid();
          query = query.startAfter(c.at, c.id);
        }
        const snap = await tx.get(query), page = snap.docs.slice(0, PAGE);
        const profiles = await reads(tx, page.map(doc => `players/${doc.data().peerUid}`));
        const rows = page.map((doc, index) => ({ id: doc.id, ...doc.data(), player: identity(doc.data().peerUid, profiles[index] || {}), unread: visibleUnread(doc.data(), time) }))
          .filter(row => input.kind === "friendRequests" ? row.friendExpiresAtMs > time : input.kind === "messageRequests" ? row.expiresAtMs > time : true);
        return { rows, next: snap.size > PAGE ? { at: page.at(-1).data().updatedAtMs, id: page.at(-1).id } : null, serverNowMs: time };
      }
      if (action === "unread") {
        const snap = await tx.get(db.collection(`${accountPath(uid)}/inbox`).where("unread", "==", true).where("lastIncomingAtMs", ">", time - RETENTION).limit(201));
        const count = snap.docs.filter(doc => visibleUnread(doc.data(), time)).length;
        return { count: Math.min(200, count), more: snap.size > 200, serverNowMs: time };
      }
      if (action === "presence") {
        if (!Array.isArray(input.uids) || input.uids.length > PAGE || input.uids.some(id => !validUid(id)) || new Set(input.uids).size !== input.uids.length) throw invalid();
        const pairs = await reads(tx, input.uids.map(id => pairPath(pairId(uid, id))));
        const ids = input.uids.filter((id, index) => pairs[index]?.friend?.status === "accepted" && !blocked(pairs[index]));
        const members = await reads(tx, ids.map(memberPath)), realm = getRealm();
        return { players: ids.map((id, index) => { const p = members[index]; return { uid: id, online: Boolean(p && p.status === "active" && p.resetGeneration === realm.resetGeneration && p.lastSeenAtMs > time - 180000), expiresAtMs: time + 30000 }; }), serverNowMs: time };
      }
      if (action === "preference") {
        if (typeof input.enabled !== "boolean") throw invalid();
        tx.set(db.doc(accountPath(uid)), { privateAlerts: input.enabled }, { merge: true });
        signal(tx, uid, "preferences", time); return { ok: true, privateAlerts: input.enabled };
      }
      let id = input.conversationId;
      if (input.peerUid !== undefined) {
        if (!validUid(input.peerUid) || input.peerUid === uid) throw invalid();
        id = pairId(uid, input.peerUid);
        if (input.conversationId && input.conversationId !== id) throw invalid();
      }
      if (!/^[a-f0-9]{40}$/.test(id || "")) throw invalid();
      const pairRef = db.doc(pairPath(id)), stored = snapshotData(await tx.get(pairRef));
      if (!stored && !input.peerUid) throw deny();
      const pair = effective(stored || { id, uids: [uid, input.peerUid].sort(), blocks: {}, friend: { status: "none" }, conversation: { status: "none" }, sequence: 0 }, time);
      requirePair(pair, uid);
      const peer = pair.uids.find(value => value !== uid);
      const [peerProfile, peerAccountData, ownInbox, peerInbox, restriction] = await reads(tx, [`players/${peer}`, accountPath(peer), `${accountPath(uid)}/inbox/${id}`, `${accountPath(peer)}/inbox/${id}`, `realmSecurity/${getRealm().resetGeneration}/chatRestrictions/${uid}`]);
      if (!peerProfile) throw deny();
      const peerAccount = peerAccountData || {}, boxes = { [uid]: ownInbox || {}, [peer]: peerInbox || {} };
      if (action === "relation") return { ...relation(pair, uid, time), player: identity(peer, peerProfile), serverNowMs: time };
      if (action === "history") {
        let query = db.collection(`${pairPath(id)}/privateMessages`).where("expiresAtMs", ">", time).orderBy("expiresAtMs", "desc").orderBy("sequence", "desc").limit(PAGE + 1);
        if (input.beforeSeq != null) {
          if (!Number.isSafeInteger(input.beforeSeq) || input.beforeSeq < 1) throw invalid();
          query = query.where("sequence", "<", input.beforeSeq);
        }
        const snap = await tx.get(query), page = snap.docs.slice(0, PAGE);
        return { messages: page.map(doc => ({ id: doc.id, ...doc.data() })).reverse(), next: snap.size > PAGE ? page.at(-1).data().sequence : null,
          relation: relation(pair, uid, time), player: identity(peer, peerProfile), serverNowMs: time };
      }
      if (action === "read") {
        if (!Number.isSafeInteger(input.throughSeq) || input.throughSeq < 0 || input.throughSeq > pair.sequence) throw invalid();
        const box = boxes[uid];
        if (input.throughSeq <= (box.readSeq || 0)) return { ok: true };
        const readSeq = input.throughSeq;
        tx.set(db.doc(`${accountPath(uid)}/inbox/${id}`), { ...box, readSeq, unread: visibleUnread({ ...box, readSeq }, time) });
        signal(tx, uid, "inbox", time); return { ok: true };
      }
      if (action === "report") {
        if (!/^[a-f0-9]{40}$/.test(input.messageId || "") || !["harassment", "spam", "threat", "other"].includes(input.reason)) throw invalid();
        const message = snapshotData(await tx.get(db.doc(messagePath(id, input.messageId))));
        if (!message || message.expiresAtMs <= time || message.senderUid === uid) throw deny();
        const reportId = hash(JSON.stringify([uid, id, input.messageId]));
        const reportRef = db.doc(`socialReports/${reportId}`), exists = await tx.get(reportRef);
        if (exists.exists) return { ok: true, reportId };
        const context = await tx.get(db.collection(`${pairPath(id)}/privateMessages`).where("sequence", "<", message.sequence).where("expiresAtMs", ">", time).orderBy("expiresAtMs", "desc").orderBy("sequence", "desc").limit(5));
        tx.set(reportRef, { id: reportId, conversationId: id, reporterUid: uid, reportedUid: message.senderUid, messageId: input.messageId,
          reason: input.reason, status: "open", createdAtMs: time, expiresAtMs: time + RETENTION,
          evidence: [...context.docs.map(doc => ({ id: doc.id, ...doc.data() })).reverse(), { id: input.messageId, ...message }] });
        return { ok: true, reportId };
      }
      if (!["friend", "conversation", "block", "send"].includes(action)) throw invalid();
      if (typeof input.requestId !== "string" || !/^[A-Za-z0-9_-]{12,96}$/.test(input.requestId)) throw invalid();
      const requestKey = hash(JSON.stringify([uid, input.requestId])), receiptRef = db.doc(`${accountPath(uid)}/socialReceipts/${requestKey}`);
      const signature = hash(JSON.stringify([action, id, input.choice ?? null, input.text ?? null, input.enabled ?? null]));
      const receipt = snapshotData(await tx.get(receiptRef));
      if (receipt) {
        if (receipt.signature !== signature) throw invalid();
        return { ...receipt.result, replayed: true };
      }
      const wasFriends = pair.friend.status === "accepted";
      const requestBudget = () => {
        const day = Math.floor(time / DAY);
        if (account.requestDay !== day) { account.requestDay = day; account.newRequests = 0; }
        if ((account.newRequests || 0) >= 20) throw fail("resource-exhausted", "You can send up to 20 new friend or message requests each day.");
        account.newRequests = (account.newRequests || 0) + 1;
      };
      let message;
      if (action === "block") {
        if (typeof input.enabled !== "boolean") throw invalid();
        pair.blocks[uid] = input.enabled;
        if (input.enabled) {
          pair.friend = { status: "none" }; pair.conversation = { status: "none" };
        }
      } else {
        if (blocked(pair)) throw deny();
        if (action === "friend" || action === "conversation") {
          const key = action, state = pair[key];
          if (input.choice === "request" && key === "friend") {
            assertSending(account, restriction, time);
            if (state.status !== "accepted" && !activeRequest(state, time)) {
              if (state.from === uid && state.retryAtMs > time) throw fail("resource-exhausted", "Please wait before sending another request to this player.");
              requestBudget(); pair.friend = { status: "pending", from: uid, expiresAtMs: time + REQUEST_LIFETIME };
            }
          } else if (["accept", "decline"].includes(input.choice)) {
            if (!activeRequest(state, time) || state.from === uid) throw fail("failed-precondition", "That request is no longer available.");
            pair[key] = { ...state, status: input.choice === "accept" ? "accepted" : "declined", retryAtMs: time + RETRY };
          } else if (input.choice === "cancel" && key === "friend" && activeRequest(state, time) && state.from === uid) {
            pair.friend = { ...state, status: "declined", retryAtMs: time + RETRY };
          } else if (input.choice === "remove" && key === "friend" && state.status === "accepted") {
            pair.friend = { status: "none" };
          } else throw invalid();
          if (pair.friend.status === "accepted") pair.conversation = { status: "accepted" };
        } else {
          assertSending(account, restriction, time);
          if (typeof input.text !== "string") throw invalid();
          const text = input.text.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "").trim();
          if (!text || Array.from(text).length > MAX_TEXT) throw fail("invalid-argument", "Private messages must contain 1–1,000 characters.");
          if (account.lastSendAtMs > time - COOLDOWN) throw fail("resource-exhausted", "Wait 3 seconds between private messages.");
          if (pair.friend.status === "accepted") pair.conversation = { status: "accepted" };
          if (pair.conversation.status !== "accepted") {
            if (activeRequest(pair.conversation, time)) throw fail("failed-precondition", "Wait for the message request to be accepted.");
            if (pair.conversation.from === uid && pair.conversation.retryAtMs > time) throw fail("resource-exhausted", "Please wait before sending another request to this player.");
            requestBudget(); pair.conversation = { status: "pending", from: uid, expiresAtMs: time + REQUEST_LIFETIME };
          }
          account.lastSendAtMs = time; pair.sequence += 1;
          const messageTime = Math.max(time, pair.lastMessageAtMs || 0);
          message = { id: requestKey, sequence: pair.sequence, senderUid: uid, senderDisplayName: identity(uid, ownProfile).name,
            text, createdAtMs: messageTime, expiresAtMs: messageTime + RETENTION };
          boxes[peer].lastIncomingSeq = pair.sequence; boxes[peer].lastIncomingAtMs = time;
          pair.lastMessageAtMs = messageTime;
        }
      }
      const becameFriends = pair.friend.status === "accepted";
      if (becameFriends !== wasFriends) {
        const difference = becameFriends ? 1 : -1;
        for (const item of [account, peerAccount]) {
          item.friendCount = Math.max(0, (item.friendCount || 0) + difference);
          if (item.friendCount > MAX_FRIENDS) throw fail("resource-exhausted", "A player has reached the 200-friend limit.");
        }
      }
      pair.pendingUntilMs = Math.min(...[pair.friend, pair.conversation].map(item => item.status === "pending" ? item.expiresAtMs : 8e15));
      pair.updatedAtMs = time;
      const result = { ok: true, conversationId: id, ...(message ? { messageId: message.id, sequence: message.sequence } : {}) };
      // All reads complete before any writes, for both Firestore tests and PostgreSQL.
      tx.set(pairRef, pair);
      tx.set(db.doc(accountPath(uid)), account); tx.set(db.doc(accountPath(peer)), peerAccount);
      for (const who of pair.uids) {
        const r = relation(pair, who, time);
        tx.set(db.doc(`${accountPath(who)}/contacts/${id}`), { ...r, updatedAtMs: time });
        if (pair.sequence || pair.conversation.status === "accepted") tx.set(db.doc(`${accountPath(who)}/inbox/${id}`), {
          ...boxes[who], peerUid: r.peerUid, status: pair.conversation.status === "accepted" ? "accepted" : activeRequest(pair.conversation, time) ? "pending" : "closed",
          from: pair.conversation.from || "", expiresAtMs: pair.conversation.expiresAtMs || 0, lastMessageAtMs: pair.lastMessageAtMs || 0,
          unread: !blocked(pair) && ["accepted", "pending"].includes(pair.conversation.status) && unread(boxes[who], time), unavailable: blocked(pair), updatedAtMs: time });
        signal(tx, who, message ? "inbox" : "contacts", time);
      }
      if (message) {
        tx.set(db.doc(messagePath(id, message.id)), message);
        if (pair.conversation.status === "accepted" && peerAccount.privateAlerts === true && (!pair.pushTimes?.[peer] || time - pair.pushTimes[peer] >= 60000)) {
          pair.pushTimes = { ...(pair.pushTimes || {}), [peer]: time }; tx.set(pairRef, pair);
          tx.set(db.doc(`serverNotificationOutbox/social_${message.id}`), { type: "private_message", status: "pending", createdAtMs: time, expiresAtMs: time + 1800000,
            notification: { type: "private_message", recipientUid: peer, conversationId: id, messageId: message.id, sequence: message.sequence } });
        }
      }
      tx.set(receiptRef, { signature, result, expiresAtMs: time + RETENTION });
      return result;
    });
  }
  async function authorizeTranslation(tx, request, payload) {
    const uid = request.auth?.uid, time = now(), id = payload.conversationId;
    if (!validUid(uid) || !/^[a-f0-9]{40}$/.test(id || "") || payload.operation !== "translate") throw deny();
    const [config, pair] = await reads(tx, [CONFIG, pairPath(id)]);
    if (!config?.enabled) throw deny(); requirePair(pair, uid);
    return { messageCollection: `${pairPath(id)}/privateMessages`, maxLength: MAX_TEXT,
      isVisible: message => message.expiresAtMs > time && pair.uids.includes(message.senderUid) };
  }
  async function pushEligible(notification) {
    return db.runTransaction(async tx => {
      const { recipientUid: uid, conversationId: id, messageId } = notification;
      if (!validUid(uid) || !/^[a-f0-9]{40}$/.test(id || "") || !/^[a-f0-9]{40}$/.test(messageId || "")) return false;
      const [config, account, pair, box, message] = await reads(tx, [CONFIG, accountPath(uid), pairPath(id), `${accountPath(uid)}/inbox/${id}`, messagePath(id, messageId)]);
      return Boolean(config?.enabled && account?.privateAlerts === true && pair?.uids?.includes(uid) && !blocked(pair)
        && pair.conversation?.status === "accepted" && message?.senderUid !== uid && message?.expiresAtMs > now()
        && message.sequence > (box?.readSeq || 0));
    });
  }
  async function cleanup() {
    let deleted = 0;
    for (const collection of ["privateMessages", "socialReceipts", "socialReports"]) {
      const snapshot = await db.collectionGroup(collection).where("expiresAtMs", "<=", now()).limit(200).get();
      const docs = snapshot.docs.filter(doc => /^(socialPairs\/[^/]+\/privateMessages\/[^/]+|socialAccounts\/[^/]+\/socialReceipts\/[^/]+|socialReports\/[^/]+)$/.test(doc.ref.path));
      if (docs.length) { const batch = db.batch(); docs.forEach(doc => batch.delete(doc.ref)); await batch.commit(); deleted += docs.length; }
    }
    // Expired request projections are also filtered at read time. Cleanup is bounded.
    const pending = await db.collection("socialPairs").where("pendingUntilMs", "<=", now()).limit(50).get();
    for (const doc of pending.docs) await db.runTransaction(async tx => {
      const current = await tx.get(doc.ref); if (!current.exists) return;
      const pair = effective(current.data(), now());
      pair.pendingUntilMs = Math.min(...[pair.friend, pair.conversation].map(item => item.status === "pending" ? item.expiresAtMs : 8e15));
      tx.set(doc.ref, pair);
      for (const uid of pair.uids) {
        tx.set(db.doc(`${accountPath(uid)}/contacts/${pair.id}`), { ...relation(pair, uid, now()), updatedAtMs: now() });
        if (pair.sequence) tx.set(db.doc(`${accountPath(uid)}/inbox/${pair.id}`), { status: pair.conversation.status === "accepted" ? "accepted" : activeRequest(pair.conversation, now()) ? "pending" : "closed",
          ...(!["accepted", "pending"].includes(pair.conversation.status) ? { unread: false } : {}) }, { merge: true });
        signal(tx, uid, "contacts", now());
      }
    });
    return { deleted, requests: pending.size };
  }
  return { handler, authorizeTranslation, pushEligible, cleanup };
}
module.exports = { createService, pairId, pairPath, accountPath, messagePath, identity, relation, effective, unread, CONFIG, DAY, RETENTION, PAGE, MAX_TEXT };
