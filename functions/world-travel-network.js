(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CROWNLANDS_WORLD_TRAVEL = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const opposite = Object.freeze({ north: "south", south: "north", east: "west", west: "east" });
  const targetId = edge => String(edge?.targetRegionId || edge?.connectsToRegionId || edge?.target || "");
  const linkId = edge => String(edge?.targetConnectionId || edge?.targetPortalId || edge?.targetPortal
    || edge?.linkedPortalId || edge?.connectedPortalId || "");

  function buildEdgeConnections(summary = {}, fallback = {}) {
    const entries = Object.entries(summary.connections || {});
    if (!entries.length) return fallback || {};
    return Object.fromEntries(entries.map(([side, connection]) => [side,
      connection?.state === "open" && connection?.targetRegionId ? [{
        id: `${side}_road`, side,
        start: side === "north" || side === "south" ? 0.472 : 0.462,
        end: side === "north" || side === "south" ? 0.528 : 0.538,
        type: "road", connectsToRegionId: connection.targetRegionId,
        arrowXNorm: side === "west" ? 0.065 : side === "east" ? 0.935 : 0.5,
        arrowYNorm: side === "north" ? 0.065 : side === "south" ? 0.935 : 0.5,
        intentionalOuter: false,
      }] : [],
    ]));
  }

  function getArrivalPortal(getPortals, sourceId, edge) {
    const destinationId = targetId(edge);
    const candidates = (getPortals(destinationId) || [])
      .filter(candidate => targetId(candidate) === sourceId)
      .filter(candidate => !linkId(candidate) || linkId(candidate) === edge.id)
      .filter(candidate => !opposite[edge.side] || candidate.side === opposite[edge.side]);
    const explicit = linkId(edge);
    if (explicit) return candidates.find(candidate => candidate.id === explicit) || null;
    const backlink = candidates.find(candidate => linkId(candidate) === edge.id);
    if (backlink) return backlink;
    // Current cardinal roads have one entrance per side. Preserve midpoint
    // selection for older maps containing several entrances on the same edge.
    const midpoint = portal => (Number(portal.start) + Number(portal.end)) / 2 || 0;
    return candidates.sort((a, b) => Math.abs(midpoint(a) - midpoint(edge))
      - Math.abs(midpoint(b) - midpoint(edge)))[0] || null;
  }

  function findRegionChain(regionIds, getPortals, sourceId, destinationId) {
    const known = new Set(regionIds);
    if (!known.has(sourceId) || !known.has(destinationId)) return null;
    const previous = new Map([[sourceId, null]]);
    const queue = [sourceId];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      if (current === destinationId) {
        const chain = [];
        for (let id = current; id !== null; id = previous.get(id)) chain.push(id);
        return chain.reverse();
      }
      for (const portal of getPortals(current) || []) {
        const next = targetId(portal);
        if (!known.has(next) || previous.has(next) || !getArrivalPortal(getPortals, current, portal)) continue;
        previous.set(next, current);
        queue.push(next);
      }
    }
    return null;
  }

  function validateConnections(maps = []) {
    const errors = [];
    const known = new Map();
    for (const map of maps) {
      if (!map.id || known.has(map.id)) errors.push(`Duplicate or missing map ID: ${map.id || "(blank)"}.`);
      known.set(map.id, map);
    }
    const getPortals = id => Object.entries(known.get(id)?.edgeConnections || {})
      .flatMap(([side, edges]) => (Array.isArray(edges) ? edges : []).map(edge => ({ ...edge, side })));
    for (const map of maps) {
      const ids = new Set();
      for (const portal of getPortals(map.id)) {
        if (portal.intentionalOuter) continue;
        const label = `${map.id}.${portal.id || portal.side}`;
        if (!portal.id || ids.has(portal.id)) errors.push(`${label}: duplicate or missing road ID.`);
        ids.add(portal.id);
        if (!opposite[portal.side]) errors.push(`${label}: malformed road side.`);
        if (![portal.start, portal.end].every(value => typeof value === "number" && Number.isFinite(value)
          && value >= 0 && value <= 1) || portal.start > portal.end) errors.push(`${label}: invalid road geometry.`);
        if (!known.has(targetId(portal))) errors.push(`${label}: unknown destination ${targetId(portal) || "(blank)"}.`);
        else if (!getArrivalPortal(getPortals, map.id, portal)) errors.push(`${label}: missing reciprocal road or broken destination link.`);
      }
    }
    return errors;
  }

  // Dijkstra over arrival entrances, using the actual terrain route in each
  // map as the edge cost. No recursion or map-hop budget is involved.
  function findShortestRoute(regionIds, getPortals, source, target, calculateLeg, options = {}) {
    const known = new Set(regionIds);
    if (!known.has(source.regionId) || !known.has(target.regionId)) return null;
    if (![source.x, source.y, target.x, target.y].every(Number.isFinite)) return null;
    const start = { key: "source", regionId: source.regionId, point: source, cost: 0, previous: null, leg: null };
    const best = new Map([[start.key, start]]);
    const pending = [];
    let sequence = 0;
    const before = (a, b) => a.cost < b.cost || (a.cost === b.cost && a.sequence < b.sequence);
    const push = entry => {
      entry.sequence = sequence++;
      let index = pending.length;
      pending.push(entry);
      while (index > 0) {
        const parent = (index - 1) >> 1;
        if (!before(entry, pending[parent])) break;
        pending[index] = pending[parent];
        index = parent;
      }
      pending[index] = entry;
    };
    const pop = () => {
      const first = pending[0];
      const last = pending.pop();
      if (pending.length) {
        let index = 0;
        while (index * 2 + 1 < pending.length) {
          let child = index * 2 + 1;
          if (child + 1 < pending.length && before(pending[child + 1], pending[child])) child += 1;
          if (!before(pending[child], last)) break;
          pending[index] = pending[child];
          index = child;
        }
        pending[index] = last;
      }
      return first;
    };
    push(start);
    let winner = null;
    const maximum = Number.isFinite(options.maxDistance) ? options.maxDistance : Infinity;
    const beyondMaximum = cost => cost > maximum + Math.max(1, maximum) * 1e-9;
    while (pending.length) {
      const current = pop();
      if (best.get(current.key) !== current) continue;
      if (beyondMaximum(current.cost)) break;
      if (winner && current.cost >= winner.cost) break;
      if (current.regionId === target.regionId) {
        const leg = calculateLeg(current.regionId, current.point, target);
        if (leg && Number.isFinite(leg.length) && leg.length >= 0) {
          const cost = current.cost + leg.length;
          if (!beyondMaximum(cost) && (!winner || cost < winner.cost)) winner = { previous: current, leg, cost };
        }
      }
      for (const exit of getPortals(current.regionId) || []) {
        const destinationId = targetId(exit);
        if (!known.has(destinationId)) continue;
        // Different entrances are separate search states, but a march must not
        // revisit a map it already crossed, even when that detour looks cheaper.
        let prior = current;
        while (prior && prior.regionId !== destinationId) prior = prior.previous;
        if (prior) continue;
        const arrival = getArrivalPortal(getPortals, current.regionId, exit);
        if (!arrival) continue;
        if (beyondMaximum(current.cost + Math.hypot(current.point.x - exit.x, current.point.y - exit.y))) continue;
        const key = `${destinationId}:${arrival.id}`;
        // A positive-distance cycle cannot improve an already finalized state.
        const leg = calculateLeg(current.regionId, current.point, { ...exit, id: `portal:${current.regionId}:${exit.id}` });
        if (!leg || !Number.isFinite(leg.length) || leg.length < 0) continue;
        const cost = current.cost + leg.length;
        if (best.has(key) && best.get(key).cost <= cost) continue;
        const entry = { key, regionId: destinationId,
          point: { ...arrival, id: `portal:${destinationId}:${arrival.id}` }, cost, previous: current, leg };
        best.set(key, entry);
        push(entry);
      }
    }
    if (!winner) return null;
    const legs = [];
    for (let entry = winner; entry?.leg; entry = entry.previous) legs.push(entry.leg);
    legs.reverse();
    return { segments: legs, points: legs.flatMap((leg, index) => index ? leg.points.slice(1) : leg.points), length: winner.cost };
  }

  // Removing obstacles and allowing revisits makes this graph a relaxation of
  // actual terrain travel. Reverse directed edges preserve asymmetric roads.
  function createTargetDistanceBound(regionIds, getPortals, target) {
    const known = new Set(regionIds);
    if (!known.has(target.regionId) || ![target.x, target.y].every(Number.isFinite)) return () => 0;
    const nodes = new Map();
    const byRegion = new Map();
    const key = (regionId, portal) => JSON.stringify([regionId, portal.id]);
    for (const regionId of known) {
      const rows = (getPortals(regionId) || []).filter(p => [p.x, p.y].every(Number.isFinite))
        .map(point => ({ key: key(regionId, point), regionId, point, incoming: [], distance: Infinity }));
      byRegion.set(regionId, rows);
      rows.forEach(row => nodes.set(row.key, row));
    }
    for (const row of nodes.values()) {
      for (const next of byRegion.get(row.regionId)) {
        if (next !== row) next.incoming.push({ row, cost: Math.hypot(row.point.x - next.point.x, row.point.y - next.point.y) });
      }
      const destinationId = targetId(row.point);
      const arrival = known.has(destinationId) && getArrivalPortal(getPortals, row.regionId, row.point);
      const next = arrival && nodes.get(key(destinationId, arrival));
      if (next) next.incoming.push({ row, cost: 0 });
      if (row.regionId === target.regionId) row.distance = Math.hypot(row.point.x - target.x, row.point.y - target.y);
    }
    const pending = new Set(nodes.values());
    while (pending.size) {
      let closest = null;
      for (const row of pending) if (!closest || row.distance < closest.distance) closest = row;
      if (!Number.isFinite(closest.distance)) break;
      pending.delete(closest);
      for (const edge of closest.incoming) edge.row.distance = Math.min(edge.row.distance, closest.distance + edge.cost);
    }
    return source => {
      if (!known.has(source.regionId) || ![source.x, source.y].every(Number.isFinite)) return 0;
      let distance = source.regionId === target.regionId ? Math.hypot(source.x - target.x, source.y - target.y) : Infinity;
      for (const row of byRegion.get(source.regionId) || []) {
        distance = Math.min(distance, Math.hypot(source.x - row.point.x, source.y - row.point.y) + row.distance);
      }
      return Number.isFinite(distance) ? Math.max(0, distance - Math.max(1, distance) * 1e-9) : distance;
    };
  }

  return Object.freeze({ buildEdgeConnections, getArrivalPortal, findRegionChain, findShortestRoute, createTargetDistanceBound, validateConnections });
});
