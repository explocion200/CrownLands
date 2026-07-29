(function exposeClanQuestPeriod(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CrownlandsClanQuestPeriod = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  function safePeriodSegment(value = "", fallback = "realm") {
    const normalized = String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
    return normalized || fallback;
  }

  function getClanQuestPeriod(nowMs = Date.now(), resetGeneration = "") {
    const instant = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
    const current = new Date(instant);
    const daysSinceMonday = (current.getUTCDay() + 6) % 7;
    const weekStartAtMs = Date.UTC(
      current.getUTCFullYear(),
      current.getUTCMonth(),
      current.getUTCDate() - daysSinceMonday
    );
    const weekEndAtMs = weekStartAtMs + WEEK_MS;
    const weekKey = new Date(weekStartAtMs).toISOString().slice(0, 10);
    const questPeriodId = `v2_${safePeriodSegment(resetGeneration)}_${weekKey}`;
    return {
      version: 2,
      questPeriodId,
      periodId: questPeriodId,
      weekKey,
      weekStartAtMs,
      weekEndAtMs,
    };
  }

  return Object.freeze({
    WEEK_MS,
    getClanQuestPeriod,
  });
}));
