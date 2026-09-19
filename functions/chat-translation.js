"use strict";

const crypto = require("node:crypto");
const MONTHLY_CHARACTER_LIMIT = 500_000;
const CACHE_LIFETIME_MS = 24 * 60 * 60 * 1000;
const LEASE_MS = 30_000;
const MAX_BATCH = 20;
const REQUESTS_PER_MINUTE = 30;

function cacheKey(path, text, language) {
  return crypto.createHash("sha256").update(JSON.stringify([path, text, language])).digest("hex");
}

function validatePayload(data, fail) {
  const { channel, messageIds, targetLanguage, operation = "translate" } = data;
  if (!["global", "clan"].includes(channel)
    || !["translate", "detect"].includes(operation)
    || !Array.isArray(messageIds) || !messageIds.length || messageIds.length > MAX_BATCH
    || messageIds.some(id => typeof id !== "string" || !/^[a-f0-9]{40}$/.test(id))
    || new Set(messageIds).size !== messageIds.length
    || typeof targetLanguage !== "string" || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(targetLanguage)
    || (data.clanId != null && (typeof data.clanId !== "string" || data.clanId.length > 128 || data.clanId.includes("/")))
    || ["text", "texts", "contents", "senderUid"].some(key => Object.hasOwn(data, key))) {
    throw fail("invalid-argument", "Choose a chat channel, message IDs and translation language.");
  }
  return { channel, messageIds, targetLanguage, operation, clanId: data.clanId || "" };
}

// Google credentials stay on the backend. The provider receives message text only,
// with no player names, account IDs, clan IDs or client-supplied text.
function createGoogleProvider({ projectId, credential, fetchImpl = fetch, emulator = false }) {
  return async (contents, targetLanguage, operation = "translate") => {
    if (emulator) throw new Error("External translation is disabled in emulators.");
    if (!/^[a-z0-9-]+$/.test(projectId || "")) throw new Error("Translation project is unavailable.");
    const token = await credential.getAccessToken();
    const parent = `projects/${projectId}/locations/global`;
    if (operation === "detect") {
      const results = [];
      const signal = globalThis.AbortSignal.timeout(8000);
      // Detection accepts one text per request; bound concurrency and share one deadline.
      for (let offset = 0; offset < contents.length; offset += 4) {
        results.push(...await Promise.all(contents.slice(offset, offset + 4).map(async content => {
          const response = await fetchImpl(`https://translation.googleapis.com/v3/${parent}:detectLanguage`, {
            method: "POST", signal,
            headers: { authorization: `Bearer ${token.access_token}`, "content-type": "application/json", "x-goog-user-project": projectId },
            body: JSON.stringify({ content, mimeType: "text/plain" }),
          });
          if (!response.ok) throw new Error(`Language detection HTTP ${response.status}.`);
          const result = await response.json();
          const best = result.languages?.[0];
          if (!best || typeof best.languageCode !== "string" || !Number.isFinite(best.confidence)) throw new Error("Incomplete language detection.");
          return JSON.stringify({ language: best.languageCode, confidence: best.confidence });
        })));
      }
      return results;
    }
    const response = await fetchImpl(`https://translation.googleapis.com/v3/${parent}:translateText`, {
      method: "POST",
      headers: { authorization: `Bearer ${token.access_token}`, "content-type": "application/json", "x-goog-user-project": projectId },
      body: JSON.stringify({ contents, targetLanguageCode: targetLanguage, mimeType: "text/plain", model: `${parent}/models/general/nmt` }),
      signal: globalThis.AbortSignal.timeout(8000),
    });
    // Never log Google's response body: it can contain chat text or request details.
    if (!response.ok) throw new Error(`Translation provider HTTP ${response.status}.`);
    const result = await response.json();
    if (!Array.isArray(result.translations) || result.translations.length !== contents.length
      || result.translations.some(item => typeof item.translatedText !== "string" || !item.translatedText.trim() || item.translatedText.length > 3000)) {
      throw new Error("Translation provider returned an incomplete result.");
    }
    return result.translations.map(item => item.translatedText);
  };
}

function createService({ db, authorize, provider, fail, now = Date.now }) {
  async function readMessages(transaction, request, payload) {
    const scope = await authorize(transaction, request, payload);
    const refs = payload.messageIds.map(id => db.doc(`${scope.messageCollection}/${id}`));
    const snapshots = await transaction.getAll(...refs);
    const current = now();
    return snapshots.map((snapshot, index) => {
      const message = snapshot.data() || {};
      if (!snapshot.exists || !scope.isVisible(message, current)
        || typeof message.text !== "string" || !message.text.trim() || Array.from(message.text).length > 250) {
        throw fail("not-found", "One or more messages are no longer available. Refresh chat.");
      }
      const key = cacheKey(refs[index].path, message.text, payload.operation === "detect" ? "language-detection-v1" : payload.targetLanguage);
      return { id: snapshot.id, source: message.text, cacheRef: db.doc(`chatTranslationCache/${key}`),
        expiresAtMs: payload.channel === "global" ? Math.min(current + CACHE_LIFETIME_MS, message.createdAtMs + CACHE_LIFETIME_MS) : current + CACHE_LIFETIME_MS };
    });
  }

  return async request => {
    if (!request.auth?.uid) throw fail("unauthenticated", "Sign in before translating chat.");
    const payload = validatePayload(request.data || {}, fail);
    const owner = crypto.randomUUID();
    const batch = await db.runTransaction(async transaction => {
      const messages = await readMessages(transaction, request, payload);
      const current = now();
      const month = new Date(current).toISOString().slice(0, 7);
      // This project-wide ledger is intentionally outside seasonal world data.
      const budgetRef = db.doc(`chatTranslationUsage/${month}`);
      const rateRef = db.doc(`serverRateLimits/translation_${request.auth.uid}`);
      const snapshots = await transaction.getAll(budgetRef, rateRef, ...messages.map(item => item.cacheRef));
      const [budget, rate, ...cached] = snapshots;
      const rateData = rate.data() || {};
      const minute = Math.floor(current / 60_000);
      const count = rateData.minute === minute ? Number(rateData.count) || 0 : 0;
      if (count >= REQUESTS_PER_MINUTE) throw fail("resource-exhausted", "Translation is busy. Try again in a minute.");
      const pending = [];
      for (let i = 0; i < messages.length; i += 1) {
        const cache = cached[i].data() || {};
        if (cache.state === "ready" && cache.expiresAtMs > current && typeof cache.text === "string") messages[i].text = cache.text;
        else if (cache.state === "pending" && cache.leaseUntilMs > current) {
          throw fail("unavailable", "These messages are being translated. Try again shortly.");
        } else pending.push(messages[i]);
      }
      const characters = pending.reduce((sum, item) => sum + Array.from(item.source).length, 0);
      const reserved = budget.exists ? budget.data().reservedCharacters : 0;
      if (!Number.isSafeInteger(reserved) || reserved < 0) throw fail("unavailable", "Translation usage is unavailable.");
      if (characters && reserved + characters > MONTHLY_CHARACTER_LIMIT) {
        throw fail("resource-exhausted", "This month's chat translation allowance is used. Originals remain available.", { reason: "translation-monthly-limit" });
      }
      transaction.set(rateRef, { minute, count: count + 1 });
      if (characters) {
        // Reserve before the external request. Failed or uncertain requests are
        // not refunded: a timeout may still have been billed by Google.
        transaction.set(budgetRef, { month, reservedCharacters: reserved + characters, limit: MONTHLY_CHARACTER_LIMIT, updatedAtMs: current });
        for (const item of pending) transaction.set(item.cacheRef, { state: "pending", owner, leaseUntilMs: current + LEASE_MS, expiresAtMs: item.expiresAtMs });
      }
      return { messages, pending };
    });

    if (batch.pending.length) {
      let translated;
      try {
        translated = await provider(batch.pending.map(item => item.source), payload.targetLanguage, payload.operation);
        if (!Array.isArray(translated) || translated.length !== batch.pending.length
          || translated.some(text => typeof text !== "string" || !text.trim() || text.length > 3000)) throw new Error("Incomplete translation.");
      } catch (_error) {
        await db.runTransaction(async transaction => {
          const snapshots = await transaction.getAll(...batch.pending.map(item => item.cacheRef));
          snapshots.forEach((snapshot, index) => {
            if (snapshot.data()?.owner === owner) transaction.delete(batch.pending[index].cacheRef);
          });
        });
        throw fail("unavailable", "Google Translate is unavailable. Originals remain available; try again shortly.");
      }
      await db.runTransaction(async transaction => {
        const snapshots = await transaction.getAll(...batch.pending.map(item => item.cacheRef));
        snapshots.forEach((snapshot, index) => {
          const item = batch.pending[index];
          item.text = translated[index];
          if (snapshot.data()?.owner === owner) transaction.set(item.cacheRef, { state: "ready", text: item.text, expiresAtMs: item.expiresAtMs });
        });
      });
    }
    // Recheck access, moderation, deletion and source changes after Google's
    // response, including cache hits. Leaving a clan must invalidate access.
    await db.runTransaction(async transaction => {
      const latest = await readMessages(transaction, request, payload);
      if (latest.some((item, i) => item.cacheRef.path !== batch.messages[i].cacheRef.path)) {
        throw fail("not-found", "These messages changed. Refresh chat before translating.");
      }
    });
    if (payload.operation === "detect") {
      return { detections: batch.messages.map(({ id, text }) => {
        const detected = JSON.parse(text);
        return { id, language: String(detected.language || "").slice(0, 16), confidence: Number(detected.confidence) || 0 };
      }), provider: "google" };
    }
    return { translations: batch.messages.map(({ id, text }) => ({ id, text })), targetLanguage: payload.targetLanguage, provider: "google" };
  };
}

module.exports = { createService, createGoogleProvider, cacheKey, validatePayload, MONTHLY_CHARACTER_LIMIT, CACHE_LIFETIME_MS };
