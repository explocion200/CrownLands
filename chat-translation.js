(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CrownlandsChatTranslation = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";
  const BATCH_LIMIT = 20;
  const CACHE_LIMIT = 400;

  function preferredLanguage(preferences = [], fallback = "en") {
    for (const value of [...preferences, fallback, "en"]) {
      try {
        const locale = new Intl.Locale(value);
        if (locale.language === "zh") return locale.script === "Hant" || ["TW", "HK", "MO"].includes(locale.region) ? "zh-TW" : "zh-CN";
        return locale.language;
      } catch (_error) { /* Try the next browser preference. */ }
    }
    return "en";
  }

  function create(options = {}) {
    let account = "", enabled = false, epoch = 0, activeRequest = null;
    let target = options.language || "en", view = null;
    const cache = new Map();
    const notify = () => options.onChange?.();
    const preferenceKey = () => `${options.storagePrefix || "crownlands-chat-translation"}:${account}`;
    const key = (message, context) => JSON.stringify([context.channel, context.clanId || "", target, message.id, message.text]);

    function invalidate() {
      epoch += 1;
      activeRequest?.abort();
      activeRequest = null;
      cache.clear();
    }
    function setAccount(uid) {
      if (account === uid) return;
      invalidate();
      view = null;
      account = String(uid || "");
      enabled = false;
      if (account) {
        try { enabled = options.storage?.getItem(preferenceKey()) === "true"; } catch (_error) { /* Session-only when storage is blocked. */ }
      }
    }
    function setEnabled(value) {
      enabled = Boolean(value);
      if (account) {
        try { options.storage?.setItem(preferenceKey(), String(enabled)); } catch (_error) { /* Session-only when storage is blocked. */ }
      }
      if (!enabled) invalidate();
      notify();
      pump();
    }
    function setLanguage(value) {
      if (value === target) return;
      invalidate();
      target = value;
      notify();
      pump();
    }
    function display(message, context) {
      const entry = enabled && cache.get(key(message, context));
      return entry || { text: message.text, state: "original" };
    }
    function update(context) {
      view = context;
      pump();
    }
    function retry() {
      for (const [id, entry] of cache) if (entry.state === "error") cache.delete(id);
      pump();
    }
    function status() {
      const states = enabled && view?.active ? view.messages.map(message => display(message, view).state) : [];
      return { enabled, target, pending: states.filter(s => s === "pending").length, failed: states.filter(s => s === "error").length };
    }
    async function pump() {
      if (!enabled || !account || !view?.active || activeRequest || !view.messages.length) return;
      // Only the selected, visible channel is translated; originals never leave the client via this adapter.
      const context = view;
      const batch = context.messages.filter(message => !cache.has(key(message, context))).slice(-BATCH_LIMIT);
      if (!batch.length) return;
      const generation = epoch, language = target;
      const entries = batch.map(message => [key(message, context), message]);
      const abort = new AbortController();
      activeRequest = abort;
      for (const [id, message] of entries) cache.set(id, { text: message.text, state: "pending" });
      // Notify asynchronously: a render may be the caller of update().
      queueMicrotask(notify);
      let timeout;
      try {
        const result = await Promise.race([
          Promise.resolve().then(() => {
            if (abort.signal.aborted) throw new Error("Translation cancelled.");
            return options.translate({
            channel: context.channel,
            clanId: context.channel === "clan" ? context.clanId : "",
            messageIds: batch.map(message => message.id),
            targetLanguage: language,
            }, { signal: abort.signal });
          }),
          new Promise((_, reject) => { timeout = setTimeout(() => { abort.abort(); reject(new Error("Translation timed out.")); }, options.timeoutMs || 12000); }),
        ]);
        if (generation !== epoch) return;
        const translated = new Map((result?.translations || []).map(item => [item.id, item]));
        for (const [id, message] of entries) {
          const item = translated.get(message.id);
          const valid = typeof item?.text === "string" && item.text.trim() && item.text.length <= 3000;
          cache.set(id, valid ? { text: item.text, state: item.text === message.text ? "original" : "translated" }
            : { text: message.text, state: "error" });
        }
      } catch (_error) {
        if (generation !== epoch) return;
        for (const [id, message] of entries) cache.set(id, { text: message.text, state: "error" });
        // Stop this pass after a failure, rather than sending every remaining page to a failing service.
        for (const message of context.messages) {
          const id = key(message, context);
          if (!cache.has(id)) cache.set(id, { text: message.text, state: "error" });
        }
      } finally {
        clearTimeout(timeout);
        if (generation === epoch) {
          activeRequest = null;
          // Retain the current view when trimming; no cached text is persisted to disk.
          const visible = new Set((view?.messages || []).map(message => key(message, view)));
          for (const id of cache.keys()) {
            if (cache.size <= CACHE_LIMIT) break;
            if (!visible.has(id)) cache.delete(id);
          }
          notify();
          pump();
        }
      }
    }
    return Object.freeze({ setAccount, setEnabled, setLanguage, display, update, retry, status,
      clear() { invalidate(); view = null; },
      dispose() { invalidate(); view = null; account = ""; enabled = false; },
    });
  }
  return Object.freeze({ preferredLanguage, create, BATCH_LIMIT });
});
