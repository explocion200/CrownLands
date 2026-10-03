"use strict";

const DURATION_MS = 20 * 24 * 60 * 60 * 1000;
const PREVIOUS_FACTOR = 10.815;

function normalize(value) {
  const startsAtMs = Number(value?.startsAtMs);
  const expiresAtMs = Number(value?.expiresAtMs);
  return Number.isSafeInteger(startsAtMs) && startsAtMs > 0
    && Number.isSafeInteger(expiresAtMs) && expiresAtMs - startsAtMs === DURATION_MS
    ? { startsAtMs, expiresAtMs } : null;
}

function factorAt(value, nowMs, currentFactor) {
  const window = normalize(value);
  // Accrual from before deployment also retains the previously deployed rate.
  return window && nowMs < window.expiresAtMs
    ? PREVIOUS_FACTOR : currentFactor;
}

// Split uncollected production at both policy boundaries and timed-item overlap.
function integrate(value, startMs, endMs, ratesAt, boost = {}) {
  if (!(endMs > startMs)) return 0;
  const window = normalize(value);
  const boundaries = [startMs, endMs, ...(window ? [window.startsAtMs, window.expiresAtMs] : [])]
    .filter(time => time >= startMs && time <= endMs).sort((a, b) => a - b);
  const boostStart = Number(boost.startsAtMs), boostEnd = Number(boost.expiresAtMs);
  let total = 0;
  for (let index = 1; index < boundaries.length; index += 1) {
    const start = boundaries[index - 1], end = boundaries[index];
    if (end <= start) continue;
    const rates = ratesAt(start);
    const boostMs = boostStart > 0 && boostEnd > boostStart
      ? Math.max(0, Math.min(end, boostEnd) - Math.max(start, boostStart)) : 0;
    total += rates.troopProductionPerSecond * (end - start) / 1000
      + rates.baseTroopProductionPerHour * boostMs / 3600000 * (Number(boost.percent) || 0) / 100;
  }
  return total;
}

module.exports = { DURATION_MS, PREVIOUS_FACTOR, normalize, factorAt, integrate };
