(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CrownlandsChatTranslation = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";
  const BATCH_LIMIT = 20, CACHE_LIMIT = 400;
  function preferredLanguage(preferences = [], fallback = "en") {
    for (const value of [...preferences, fallback, "en"]) {
      try {
        const locale = new Intl.Locale(value);
        if (locale.language === "zh") return locale.script === "Hant" || ["TW", "HK", "MO"].includes(locale.region) ? "zh-TW" : "zh-CN";
        return locale.language;
      } catch (_error) { /* Try the next device preference. */ }
    }
    return "en";
  }
  function hasLanguage(text) {
    return (String(text).replace(/https?:\/\/\S+/gu, "").match(/\p{L}/gu) || []).length >= 2;
  }
  function isForeign(language, confidence, target) {
    return /^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/.test(language || "") && language !== "und"
      && confidence >= 0.8 && language.split("-")[0] !== target.split("-")[0];
  }
  function create(options = {}) {
    let account = "", target = options.language || "en", epoch = 0, view = null, activeRequest = null;
    const cache = new Map();
    const key = (message, context) => JSON.stringify([context.channel, context.clanId || "", target, message.id, message.text]);
    const notify = () => options.onChange?.();
    function cancel(clear = false) {
      epoch += 1;
      activeRequest?.abort(); activeRequest = null;
      if (clear) cache.clear();
      else for (const [id, item] of cache) {
        if (item.detecting) cache.delete(id);
        else if (item.state === "pending") cache.set(id, { ...item, state: "original" });
      }
    }
    function display(message, context) {
      const item = cache.get(key(message, context));
      return item ? { ...item, text: item.state === "translated" ? item.translated : message.text }
        : { text: message.text, state: "original", eligible: false };
    }
    async function request(payload, abort) {
      let timer;
      try {
        return await Promise.race([
          Promise.resolve().then(() => {
            if (abort.signal.aborted) throw Error("Cancelled");
            return options.translate(payload, { signal: abort.signal });
          }),
          new Promise((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(Error("Timed out")); }, options.timeoutMs || 12000); }),
        ]);
      } finally { clearTimeout(timer); }
    }
    function trim() {
      const visible = new Set((view?.messages || []).map(message => key(message, view)));
      for (const id of cache.keys()) {
        if (cache.size <= CACHE_LIMIT) break;
        if (!visible.has(id)) cache.delete(id);
      }
    }
    async function detect() {
      if (!account || !view?.active || activeRequest) return;
      const context = view, generation = epoch;
      const batch = context.messages.filter(message => hasLanguage(message.text) && !cache.has(key(message, context))).slice(-BATCH_LIMIT);
      if (!batch.length) return;
      const abort = new AbortController(); activeRequest = abort;
      const entries = batch.map(message => [key(message, context), message]);
      for (const [id] of entries) cache.set(id, { state: "original", detecting: true, eligible: false });
      try {
        const result = await request({ channel: context.channel, clanId: context.clanId || "", messageIds: batch.map(message => message.id), targetLanguage: target, operation: "detect" }, abort);
        if (generation !== epoch) return;
        const detected = new Map((result?.detections || []).map(item => [item.id, item]));
        for (const [id, message] of entries) {
          const item = detected.get(message.id);
          cache.set(id, { state: "original", eligible: isForeign(item?.language, item?.confidence, target) });
        }
      } catch (_error) {
        if (generation !== epoch) return;
        // Unknown languages have no Translate control. Reopening chat permits a fresh check.
        for (const message of context.messages) if (!cache.has(key(message, context)) || cache.get(key(message, context)).detecting)
          cache.set(key(message, context), { state: "original", eligible: false, detectionFailed: true });
      } finally {
        if (generation === epoch) { activeRequest = null; trim(); notify(); detect(); }
      }
    }
    async function toggle(message, context) {
      const id = key(message, context), item = cache.get(id);
      if (!account || !view?.active || view.channel !== context.channel || (view.clanId || "") !== (context.clanId || "")
        || !view.messages.some(current => key(current, view) === id) || !item?.eligible || item.state === "pending") return;
      if (item.translated) { item.state = item.state === "translated" ? "original" : "translated"; notify(); return; }
      // An explicit row action takes priority over background language detection.
      cancel();
      const generation = epoch, abort = new AbortController(); activeRequest = abort;
      cache.set(id, { ...item, state: "pending" }); notify();
      try {
        const result = await request({ channel: context.channel, clanId: context.clanId || "", messageIds: [message.id], targetLanguage: target }, abort);
        if (generation !== epoch) return;
        const translated = result?.translations?.find(value => value.id === message.id)?.text;
        if (typeof translated !== "string" || !translated.trim() || translated.length > 3000) throw Error("Missing translation");
        cache.set(id, { eligible: translated !== message.text, state: translated === message.text ? "original" : "translated", translated });
      } catch (error) {
        if (generation === epoch) cache.set(id, { ...item, state: "error", monthlyLimit: error?.details?.reason === "translation-monthly-limit" });
      } finally {
        if (generation === epoch) { activeRequest = null; trim(); notify(); detect(); }
      }
    }
    return Object.freeze({
      setAccount(uid) { if (account !== uid) { cancel(true); account = String(uid || ""); view = null; } },
      setLanguage(language) { if (target !== language) { cancel(true); target = language; notify(); detect(); } },
      update(context) {
        if (view && (view.channel !== context.channel || view.clanId !== context.clanId || view.active !== context.active)) {
          cancel();
          for (const [id, item] of cache) if (item.detectionFailed) cache.delete(id);
        }
        view = context; detect();
      },
      display, toggle,
      status() { return { target, mode: "individual", pending: [...cache.values()].filter(item => item.state === "pending").length }; },
      clear() { cancel(true); view = null; },
      dispose() { cancel(true); view = null; account = ""; },
    });
  }
  return Object.freeze({ preferredLanguage, hasLanguage, isForeign, create, BATCH_LIMIT });
});
