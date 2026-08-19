const { getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const crypto = require("node:crypto");
const realm = require("../release-config.json");
const CHAT = require("../chat.js");

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "crown-land-b15e0";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const configuredFunctionsHost = process.env.CROWNLANDS_FUNCTIONS_EMULATOR_HOST
  || process.env.FUNCTIONS_EMULATOR_HOST;
if (!firestoreHost) throw new Error("FIRESTORE_EMULATOR_HOST is required.");

if (!getApps().length) initializeApp({ projectId });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

let functionsHostPromise = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function formatEmulatorHost(host, port) {
  const normalizedHost = String(host || "127.0.0.1").trim();
  const formattedHost = normalizedHost.includes(":") && !normalizedHost.startsWith("[")
    ? `[${normalizedHost}]`
    : normalizedHost;
  return `${formattedHost}:${port}`;
}

async function resolveFunctionsHost() {
  if (configuredFunctionsHost) return configuredFunctionsHost;
  if (!functionsHostPromise) {
    functionsHostPromise = (async () => {
      const hubHost = String(process.env.FIREBASE_EMULATOR_HUB || "").trim();
      if (!hubHost) return "127.0.0.1:5001";
      const response = await fetch(`http://${hubHost}/emulators`);
      if (!response.ok) throw new Error(`Firebase Emulator Hub discovery failed with HTTP ${response.status}.`);
      const emulators = await response.json();
      const functions = emulators?.functions || {};
      const listen = Array.isArray(functions.listen) ? functions.listen[0] : functions.listen;
      const host = functions.host || listen?.address;
      const port = Number(functions.port || listen?.port);
      if (!host || !Number.isInteger(port) || port <= 0) {
        throw new Error("Firebase Emulator Hub did not report a running Functions emulator.");
      }
      return formatEmulatorHost(host, port);
    })();
  }
  return functionsHostPromise;
}

async function createAuthUser(label) {
  const nonce = crypto.randomBytes(6).toString("hex");
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `chat-${label}-${nonce}@example.test`,
      password: `Chat-${nonce}-Pass!`,
      returnSecureToken: true,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Auth emulator signup failed: ${JSON.stringify(body)}`);
  return { uid: body.localId, token: body.idToken };
}

async function callChat(user, data = {}) {
  const functionsHost = await resolveFunctionsHost();
  const response = await fetch(`http://${functionsHost}/${projectId}/us-central1/sendChatMessage`, {
    method: "POST",
    headers: {
      ...(user?.token ? { authorization: `Bearer ${user.token}` } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      data: {
        ...data,
        clientReleaseId: realm.releaseId,
        clientResetGeneration: realm.resetGeneration,
        clientWorldId: realm.worldId,
      },
    }),
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body, result: body?.result };
}

function assertCallableError(call, expectedCode, label) {
  const serialized = JSON.stringify(call.body || {}).toLowerCase().replace(/_/g, "-");
  assert(!call.result, `${label} unexpectedly succeeded.`);
  assert(serialized.includes(String(expectedCode).toLowerCase()), `${label} returned the wrong error: ${JSON.stringify(call.body)}`);
}

function callableErrorDetails(call = {}) {
  return call.body?.error?.details || call.body?.error?.data || {};
}

async function expireChatCooldown(user) {
  const nowMs = Date.now();
  await db.doc(`serverRateLimits/chat_${user.uid}`).set({
    lastMessageAtMs: nowMs - CHAT.CHAT_SEND_COOLDOWN_MS - 25,
    cooldownUntilMs: nowMs - 25,
  }, { merge: true });
}

function firestoreUrl(documentPath) {
  return `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${documentPath}`;
}

async function clientDocument(user, documentPath, method = "GET") {
  const response = await fetch(firestoreUrl(documentPath), {
    method,
    headers: {
      ...(user?.token ? { authorization: `Bearer ${user.token}` } : {}),
      "content-type": "application/json",
    },
    ...(method === "PATCH" ? {
      body: JSON.stringify({
        fields: {
          text: { stringValue: "forged by client" },
          status: { stringValue: "visible" },
          resetGeneration: { stringValue: realm.resetGeneration },
          worldId: { stringValue: realm.worldId },
        },
      }),
    } : {}),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

function equality(fieldPath, value) {
  return {
    fieldFilter: {
      field: { fieldPath },
      op: "EQUAL",
      value: { stringValue: value },
    },
  };
}

async function runChatQuery(user, parentPath) {
  const response = await fetch(`${firestoreUrl(parentPath)}:runQuery`, {
    method: "POST",
    headers: {
      ...(user?.token ? { authorization: `Bearer ${user.token}` } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "messages" }],
        where: {
          compositeFilter: {
            op: "AND",
            filters: [
              equality("resetGeneration", realm.resetGeneration),
              equality("worldId", realm.worldId),
              equality("status", "visible"),
            ],
          },
        },
        orderBy: [{ field: { fieldPath: "createdAtMs" }, direction: "DESCENDING" }],
        limit: 80,
      },
    }),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

function playerRecord(user, name, clanId = "") {
  return {
    uid: user.uid,
    playerName: name,
    displayName: `${name} ignored`,
    clanId,
    resetGeneration: realm.resetGeneration,
    worldId: realm.worldId,
  };
}

function clanRecord(leaderUid) {
  return {
    status: "active",
    leaderUid,
    resetGeneration: realm.resetGeneration,
    worldId: realm.worldId,
  };
}

function memberRecord(user, role = "member") {
  return {
    uid: user.uid,
    role,
    status: "active",
    resetGeneration: realm.resetGeneration,
    worldId: realm.worldId,
  };
}

async function main() {
  const suffix = crypto.randomBytes(5).toString("hex");
  const clanA = `chat-clan-a-${suffix}`;
  const clanB = `chat-clan-b-${suffix}`;
  const author = await createAuthUser("author");
  const switcher = await createAuthUser("switcher");
  const outsider = await createAuthUser("outsider");
  const unsafeSender = await createAuthUser("unsafe");
  const muted = await createAuthUser("muted");
  const stale = await createAuthUser("stale");

  const setup = db.batch();
  setup.set(db.doc(`players/${author.uid}`), playerRecord(author, "Lady Author", clanA));
  setup.set(db.doc(`players/${switcher.uid}`), playerRecord(switcher, "Sir Switcher", clanA));
  setup.set(db.doc(`players/${outsider.uid}`), playerRecord(outsider, "Outer Ruler"));
  setup.set(db.doc(`players/${unsafeSender.uid}`), playerRecord(unsafeSender, "Markup Baron"));
  setup.set(db.doc(`players/${muted.uid}`), playerRecord(muted, "Muted Ruler"));
  setup.set(db.doc(`players/${stale.uid}`), {
    ...playerRecord(stale, "Stale Ruler"),
    resetGeneration: "archived-generation",
    worldId: "archived-world",
  });
  setup.set(db.doc(`clans/${clanA}`), clanRecord(author.uid));
  setup.set(db.doc(`clans/${clanB}`), clanRecord(switcher.uid));
  setup.set(db.doc(`clans/${clanA}/members/${author.uid}`), memberRecord(author, "leader"));
  setup.set(db.doc(`clans/${clanA}/members/${switcher.uid}`), memberRecord(switcher));
  setup.set(db.doc(`clans/${clanB}/members/${switcher.uid}`), memberRecord(switcher, "leader"));
  setup.set(db.doc(`realmSecurity/${realm.resetGeneration}/chatRestrictions/${muted.uid}`), {
    mutedUntilMs: Date.now() + 60_000,
    reason: "emulator-test",
  });
  await setup.commit();

  assertCallableError(await callChat(null, {
    channel: "global", text: "anonymous", requestId: `chat_${suffix}_anon`,
  }), "unauthenticated", "Anonymous send");

  assertCallableError(await callChat(outsider, {
    channel: "trade", text: "wrong channel", requestId: `chat_${suffix}_channel`,
  }), "invalid-argument", "Invalid channel");
  assertCallableError(await callChat(outsider, {
    channel: "global", text: "   \n ", requestId: `chat_${suffix}_empty`,
  }), "invalid-argument", "Whitespace-only message");
  assertCallableError(await callChat(outsider, {
    channel: "global", text: "x".repeat(251), requestId: `chat_${suffix}_large`,
  }), "invalid-argument", "Oversized message");
  assertCallableError(await callChat(outsider, {
    channel: "global", text: "spoof", requestId: `chat_${suffix}_spoof`, senderUid: author.uid,
  }), "invalid-argument", "Spoofed identity");
  assertCallableError(await callChat(outsider, {
    channel: "clan", text: "spoof", requestId: `chat_${suffix}_clan_spoof`, clanId: clanA,
  }), "invalid-argument", "Spoofed clan");
  assertCallableError(await callChat(outsider, {
    channel: "clan", text: "not a member", requestId: `chat_${suffix}_no_clan`,
  }), "failed-precondition", "No-clan send");
  assertCallableError(await callChat(stale, {
    channel: "global", text: "from archive", requestId: `chat_${suffix}_stale`,
  }), "failed-precondition", "Archived-realm send");
  assertCallableError(await callChat(muted, {
    channel: "global", text: "while muted", requestId: `chat_${suffix}_muted`,
  }), "permission-denied", "Muted-account send");

  const globalSend = await callChat(outsider, {
    channel: "global", text: "Hail, Crownlands!", requestId: `chat_${suffix}_global`,
  });
  assert(globalSend.result?.ok === true && !globalSend.result.replayed, `Valid Global send failed: ${JSON.stringify(globalSend.body)}`);
  assert(globalSend.result.cooldownMs === CHAT.CHAT_SEND_COOLDOWN_MS, "Accepted Global send returned the wrong cooldown duration.");
  assert(globalSend.result.retryAfterMs === CHAT.CHAT_SEND_COOLDOWN_MS, "Accepted Global send did not return a full cooldown.");
  assert(globalSend.result.cooldownUntilMs - globalSend.result.createdAtMs === CHAT.CHAT_SEND_COOLDOWN_MS, "Accepted Global send returned inconsistent cooldown timing.");
  const immediateGlobal = await callChat(outsider, {
    channel: "global", text: "Immediate Global retry", requestId: `chat_${suffix}_global_fast`,
  });
  assertCallableError(immediateGlobal, "resource-exhausted", "Global to Global cooldown");
  const immediateGlobalDetails = callableErrorDetails(immediateGlobal);
  assert(immediateGlobalDetails.retryAfterMs > 0 && immediateGlobalDetails.retryAfterMs <= CHAT.CHAT_SEND_COOLDOWN_MS,
    `Global cooldown did not return a clean remaining duration: ${JSON.stringify(immediateGlobal.body)}`);
  await expireChatCooldown(outsider);
  const afterGlobalCooldown = await callChat(outsider, {
    channel: "global", text: "Global cooldown elapsed", requestId: `chat_${suffix}_global_after`,
  });
  assert(afterGlobalCooldown.result?.ok === true, `Global send after cooldown failed: ${JSON.stringify(afterGlobalCooldown.body)}`);
  const globalPath = `globalChat/${realm.resetGeneration}/messages/${globalSend.result.messageId}`;
  const globalDoc = await db.doc(globalPath).get();
  const globalData = globalDoc.data() || {};
  assert(globalData.senderUid === outsider.uid, "Global message sender was not assigned from auth.");
  assert(globalData.senderDisplayName === "Outer Ruler", "Global message display name was not assigned from the profile.");
  assert(globalData.text === "Hail, Crownlands!", "Global message text changed unexpectedly.");
  assert(globalData.expiresAtMs > Date.now() + 6 * 24 * 60 * 60 * 1000, "Global message retention is shorter than expected.");
  assert(globalData.expiresAtMs < Date.now() + 8 * 24 * 60 * 60 * 1000, "Global message retention is longer than expected.");

  assert((await clientDocument(outsider, globalPath)).status === 200, "A current authenticated player could not read Global Chat.");
  assert((await runChatQuery(outsider, `globalChat/${realm.resetGeneration}`)).status === 200, "A current player could not subscribe to the scoped Global Chat query.");
  assert((await clientDocument(null, globalPath)).status === 403, "A signed-out user read Global Chat.");
  assert((await runChatQuery(null, `globalChat/${realm.resetGeneration}`)).status === 403, "A signed-out user subscribed to Global Chat.");
  assert((await clientDocument(stale, globalPath)).status === 403, "A stale-realm player read current Global Chat.");
  assert((await clientDocument(outsider, `${globalPath}-forged`, "PATCH")).status === 403, "A player wrote directly to Global Chat.");

  const authorGlobalSend = await callChat(author, {
    channel: "global", text: "Global before Clan", requestId: `chat_${suffix}_author_global`,
  });
  assert(authorGlobalSend.result?.ok === true, `Author Global send failed: ${JSON.stringify(authorGlobalSend.body)}`);
  assertCallableError(await callChat(author, {
    channel: "clan", text: "Clan bypass attempt", requestId: `chat_${suffix}_global_clan_fast`,
  }), "resource-exhausted", "Global to Clan cooldown");
  await expireChatCooldown(author);
  const clanSend = await callChat(author, {
    channel: "clan", text: "Clan A assembly", requestId: `chat_${suffix}_clan_a`,
  });
  assert(clanSend.result?.ok === true && clanSend.result.clanId === clanA, `Valid Clan send failed: ${JSON.stringify(clanSend.body)}`);
  assertCallableError(await callChat(author, {
    channel: "clan", text: "Immediate Clan retry", requestId: `chat_${suffix}_clan_clan_fast`,
  }), "resource-exhausted", "Clan to Clan cooldown");
  const clanAPath = `clans/${clanA}/messages/${clanSend.result.messageId}`;
  assert((await clientDocument(author, clanAPath)).status === 200, "Clan author could not read Clan Chat.");
  assert((await clientDocument(switcher, clanAPath)).status === 200, "Active clan member could not read Clan Chat.");
  assert((await runChatQuery(switcher, `clans/${clanA}`)).status === 200, "Active clan member could not subscribe to Clan Chat.");
  assert((await clientDocument(outsider, clanAPath)).status === 403, "Outsider read Clan Chat.");
  assert((await runChatQuery(outsider, `clans/${clanA}`)).status === 403, "Outsider subscribed to Clan Chat.");
  assert((await clientDocument(author, `${clanAPath}-forged`, "PATCH")).status === 403, "A member wrote directly to Clan Chat.");

  await db.doc(`players/${switcher.uid}`).set({ clanId: clanB }, { merge: true });
  assert((await clientDocument(switcher, clanAPath)).status === 403, "A clan switch left access to the previous Clan Chat.");
  assert((await runChatQuery(switcher, `clans/${clanA}`)).status === 403, "A clan switch left the previous Clan Chat subscription authorized.");
  const clanBSend = await callChat(switcher, {
    channel: "clan", text: "Clan B assembly", requestId: `chat_${suffix}_clan_b`,
  });
  assert(clanBSend.result?.ok === true && clanBSend.result.clanId === clanB, `Switched-clan send failed: ${JSON.stringify(clanBSend.body)}`);
  assertCallableError(await callChat(switcher, {
    channel: "global", text: "Global bypass from Clan", requestId: `chat_${suffix}_clan_global_fast`,
  }), "resource-exhausted", "Clan to Global cooldown");
  await expireChatCooldown(switcher);
  const switcherGlobalSend = await callChat(switcher, {
    channel: "global", text: "Global after Clan cooldown", requestId: `chat_${suffix}_clan_global_after`,
  });
  assert(switcherGlobalSend.result?.ok === true, `Clan to Global send after cooldown failed: ${JSON.stringify(switcherGlobalSend.body)}`);
  const clanBPath = `clans/${clanB}/messages/${clanBSend.result.messageId}`;
  assert((await clientDocument(switcher, clanBPath)).status === 200, "Switched member could not read the new Clan Chat.");
  assert((await clientDocument(author, clanBPath)).status === 403, "Old-clan member read the switched player's new Clan Chat.");

  await db.doc(`players/${author.uid}`).set({ clanId: "" }, { merge: true });
  assert((await clientDocument(author, clanAPath)).status === 403, "Leaving a clan did not immediately revoke Clan Chat reads.");

  const unsafeText = `<img src=x onerror="globalThis.pwned=true">`;
  const unsafePayload = {
    channel: "global",
    text: unsafeText,
    requestId: `chat_${suffix}_idempotent`,
  };
  const firstUnsafe = await callChat(unsafeSender, unsafePayload);
  const replayedUnsafe = await callChat(unsafeSender, unsafePayload);
  assert(firstUnsafe.result?.ok === true && !firstUnsafe.result.replayed, `Unsafe-text send failed: ${JSON.stringify(firstUnsafe.body)}`);
  assert(replayedUnsafe.result?.ok === true && replayedUnsafe.result.replayed, "Idempotent retry was not replayed.");
  assert(firstUnsafe.result.messageId === replayedUnsafe.result.messageId, "Idempotent retry created a different message ID.");
  assert(replayedUnsafe.result.retryAfterMs > 0 && replayedUnsafe.result.retryAfterMs <= CHAT.CHAT_SEND_COOLDOWN_MS,
    "Idempotent retry did not preserve the original cooldown receipt.");
  const unsafeDoc = await db.doc(`globalChat/${realm.resetGeneration}/messages/${firstUnsafe.result.messageId}`).get();
  assert(unsafeDoc.data()?.text === unsafeText, "Markup-like input was not preserved as inert message text.");
  assertCallableError(await callChat(unsafeSender, {
    channel: "global",
    text: "timestamp bypass",
    requestId: `chat_${suffix}_timestamp_bypass`,
    createdAtMs: Date.now() + 24 * 60 * 60 * 1000,
  }), "invalid-argument", "Modified client timestamp");
  assertCallableError(await callChat(unsafeSender, {
    channel: "global", text: "too soon", requestId: `chat_${suffix}_rate`,
  }), "resource-exhausted", "Rapid send");

  console.log("Chat emulator gate passed: auth, validation, spoof protection, server identity, membership transitions, rules, idempotency, shared 3-second cooldowns, moderation, and retention.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
