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
  function findShortestRoute(regionIds, getPortals, source, target, calculateLeg) {
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
    while (pending.length) {
      const current = pop();
      if (best.get(current.key) !== current) continue;
      if (winner && current.cost >= winner.cost) break;
      if (current.regionId === target.regionId) {
        const leg = calculateLeg(current.regionId, current.point, target);
        if (leg && Number.isFinite(leg.length) && leg.length >= 0) {
          const cost = current.cost + leg.length;
          if (!winner || cost < winner.cost) winner = { previous: current, leg, cost };
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

  return Object.freeze({ buildEdgeConnections, getArrivalPortal, findRegionChain, findShortestRoute, validateConnections });
});
