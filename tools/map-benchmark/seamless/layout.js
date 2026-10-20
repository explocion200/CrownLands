"use strict";
// Private display coordinates only. Catalog coordinates remain the travel truth.
const EDGE = 54, SPACING = 88, STEP = 18, CITY_RADIUS = 30;
function spreadCities(section, obstacles) {
  const cities = section.definition.cities;
  const xs = cities.map(c => c.x), ys = cities.map(c => c.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  // Index the densely sampled road ribbons once, instead of scanning all roads
  // for each candidate. Two extra pixels cover the gaps between road samples.
  const buckets = new Map(), bucketSize = 64;
  for (const line of section.roads) for (const p of line) {
    const key = `${Math.floor(p[0] / bucketSize)},${Math.floor(p[1] / bucketSize)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(p);
  }
  const candidates = [];
  for (let y = EDGE; y <= section.height - EDGE; y += STEP) for (let x = EDGE; x <= section.width - EDGE; x += STEP) {
    if (obstacles.some(o => x > o.x - 31 && x < o.x + o.width + 31 && y > o.y - 31 && y < o.y + o.height + 31)) continue;
    const bx = Math.floor(x / bucketSize), by = Math.floor(y / bucketSize);
    let blocked = false;
    for (let dy = -1; dy <= 1 && !blocked; dy++) for (let dx = -1; dx <= 1 && !blocked; dx++) {
      blocked = (buckets.get(`${bx + dx},${by + dy}`) || []).some(([px, py, width]) => Math.hypot(x - px, y - py) < CITY_RADIUS + width / 2 + 8);
    }
    if (!blocked) candidates.push({ x, y });
  }
  const placed = new Map();
  const desired = cities.map(city => ({ city, x: EDGE + (city.x - minX) / (maxX - minX) * (section.width - 2 * EDGE),
    y: EDGE + (city.y - minY) / (maxY - minY) * (section.height - 2 * EDGE) }));
  // Place the outermost cities first so central obstacles cannot push all of
  // them back into the old empty border. Stable IDs break equal-distance ties.
  desired.sort((a, b) => Math.min(a.x, section.width - a.x, a.y, section.height - a.y)
    - Math.min(b.x, section.width - b.x, b.y, section.height - b.y) || a.city.id.localeCompare(b.city.id));
  for (const target of desired) {
    let best, distance = Infinity;
    for (const p of candidates) {
      const d = (p.x - target.x) ** 2 + (p.y - target.y) ** 2;
      if (d >= distance || [...placed.values()].some(c => Math.hypot(c.x - p.x, c.y - p.y) < SPACING)) continue;
      best = p; distance = d;
    }
    if (!best) throw new Error(`No clear preview position for ${section.id}/${target.city.id}`);
    placed.set(target.city.id, best);
  }
  return placed;
}
module.exports = { spreadCities, EDGE, SPACING, CITY_RADIUS };
