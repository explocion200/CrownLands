/* Private authenticated transport; camera, area generation and server epoch are independent. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./feed"));
  else root.SeamlessDeltaFeed = factory(root.SeamlessFeed);
})(typeof globalThis === "object" ? globalThis : this, function (base) {
  "use strict";
  const { AreaFeed } = base;
  function applyPacket(previous, packet, ids, cursor) {
    if (!["snapshot", "delta"].includes(packet.kind) || typeof packet.epoch !== "string" || typeof packet.viewer !== "string" || !Number.isSafeInteger(packet.revision) || packet.revision < 0
        || !Number.isFinite(packet.serverTime) || packet.serverTime < 0 || JSON.stringify(packet.ids) !== JSON.stringify([...ids].sort())) throw Error("Invalid area envelope");
    const delta = packet.kind === "delta";
    if (delta && (!cursor || packet.viewer !== previous.viewer || packet.epoch !== cursor.epoch || packet.fromRevision !== cursor.revision || packet.revision < cursor.revision)) throw Error("Invalid delta cursor");
    if (cursor?.epoch === packet.epoch && packet.revision < cursor.revision) throw Error("Obsolete area revision");
    // A validated empty delta advances the clock/cursor without copying every
    // object and rebuilding the rendered scene. Permission changes still arrive
    // as changes (or a new epoch/snapshot) and use the normal path below.
    if (delta && ["objects","marches"].every(kind=>Array.isArray(packet[kind]?.upsert) && !packet[kind].upsert.length
        && Array.isArray(packet[kind].remove) && !packet[kind].remove.length) && Array.isArray(packet.routes) && !packet.routes.length) {
      return {...previous,authoritative:true,revision:packet.revision,serverTime:packet.serverTime,scriptHealthy:packet.scriptHealthy,removed:[]};
    }
    const objects = new Map(delta ? previous.sections.flatMap(s => s.objects).map(o => [o.key, o]) : []);
    const marches = new Map(delta ? previous.marches.map(m => [m.key, m]) : []);
    const routes = new Map(delta ? previous.routes.map(r => [r.id, r]) : []);
    const removed = new Set();
    for (const [kind, target] of [["objects", objects], ["marches", marches]]) {
      const changes = packet[kind];
      if (!Array.isArray(changes?.upsert) || !Array.isArray(changes.remove) || changes.upsert.length > 10000 || changes.remove.length > 10000) throw Error("Invalid area changes");
      const seen = new Set();
      for (const item of changes.upsert) {
        if (!item || typeof item.key !== "string" || seen.has(item.key) || (kind === "objects" ? !ids.includes(item.sectionId) : !item.sections?.some(id => ids.includes(id)))) throw Error("Invalid area identity");
        seen.add(item.key); target.set(item.key, item);
      }
      for (const key of changes.remove) { if (typeof key !== "string" || seen.has(key)) throw Error("Conflicting area change"); target.delete(key); removed.add(key); }
    }
    if (!Array.isArray(packet.routes) || packet.routes.length > 512) throw Error("Invalid routes");
    for (const route of packet.routes) {
      if (typeof route?.id !== "string" || !Array.isArray(route.points) || route.points.length < 2 || route.points.length > 8192 || route.points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw Error("Invalid route geometry");
      if (delta && routes.has(route.id) && JSON.stringify(routes.get(route.id).points) !== JSON.stringify(route.points)) throw Error("Route identity changed within an epoch");
      routes.set(route.id, route);
    }
    const used = new Set([...marches.values()].map(m => m.routeId));
    if ([...used].some(id => !routes.has(id))) throw Error("Missing march route");
    for (const id of routes.keys()) if (!used.has(id)) routes.delete(id);
    if (!delta) for (const item of [...previous.sections.flatMap(s => s.objects), ...previous.marches]) {
      // A snapshot only proves deletion/visibility loss inside the requested
      // area. Eviction outside that area retains the last-known inspector.
      const inside = item.kind === "troop" ? item.sections.some(id => ids.includes(id)) : ids.includes(item.sectionId);
      if (inside && !objects.has(item.key) && !marches.has(item.key)) removed.add(item.key);
    }
    const same=(a,b)=>a?.length===b.length&&b.every((item,i)=>item===a[i]);
    const grouped=new Map(ids.map(id=>[id,[]]));for(const item of objects.values())grouped.get(item.sectionId).push(item);
    const priorSections=new Map(previous.sections.map(s=>[s.id,s]));
    let sections=ids.map(id=>{const old=priorSections.get(id),items=grouped.get(id);return delta&&same(old?.objects,items)?old:{id,objects:items};});
    if(delta&&same(previous.sections,sections))sections=previous.sections;
    const nextMarches=[...marches.values()],nextRoutes=[...routes.values()];
    return { authoritative: true, viewer: packet.viewer, revision: packet.revision, epoch: packet.epoch, serverTime: packet.serverTime, scriptHealthy: packet.scriptHealthy, removed: [...removed],
      sections, marches:delta&&same(previous.marches,nextMarches)?previous.marches:nextMarches, routes:delta&&same(previous.routes,nextRoutes)?previous.routes:nextRoutes };
  }
  class DeltaFeed extends AreaFeed {
    constructor(changed, load) { super(changed, load); this.cursor = null; this.cursorIds = ""; this.snapshots = 0; this.deltas = 0; this.bytes = 0; this.authExpired = false; this.failures = 0; this.retryAt = 0; }
    set(ids) {
      const next = [...new Set(ids)].slice(0, 16).sort();
      if (JSON.stringify(next) !== JSON.stringify(this.ids)) { this.cursor = null; this.cursorIds = ""; this.data = { ...this.data, authoritative: false }; }
      super.set(next);
    }
    async refresh() {
      if (this.disposed || this.pending || !this.ids.length || this.authExpired || Date.now() < this.retryAt) return;
      const generation = this.generation, ids = [...this.ids], controller = new AbortController(); this.pending = controller; this.requests++;
      const cursor = this.cursorIds === JSON.stringify(ids) ? this.cursor : null;
      const timeout = setTimeout(() => controller.abort(), 8000); let loaded = false;
      try {
        const packet = await this.load(ids, controller.signal, cursor);
        if (this.disposed || controller.signal.aborted || generation !== this.generation) { this.staleResults++; return; }
        loaded = true;
        const data = applyPacket(this.data, packet, ids, cursor); data.receivedAt = performance.now() / 1000;
        this.cursor = { epoch: packet.epoch, revision: packet.revision }; this.cursorIds = JSON.stringify(ids);
        this.data = data; this.failed = false; this.failures = 0; this.retryAt = 0; this[packet.kind === "snapshot" ? "snapshots" : "deltas"]++;
        this.bytes += new TextEncoder().encode(JSON.stringify(packet)).length;
        this.peakSections = Math.max(this.peakSections, data.sections.length); this.changed(data);
      } catch (error) {
        if (!this.disposed && generation === this.generation) {
          this.failed = true;
          this.retryAt = Date.now() + Math.max(error.retryAfterMs || 0,
            Math.min(30000, 1000 * 2 ** Math.min(5, this.failures++)) * (1 + Math.random() * 0.2));
          if (error.status === 401 || error.status === 403 || error.status === 409 || error.status === 410) {
            this.authExpired = true; this.cursor = null;
            this.data = { revision: -1, sections: [], marches: [], routes: [], authExpired: true };
          }
          // A malformed packet must recover with a new atomic snapshot.
          if (loaded) { this.cursor = null; this.cursorIds = ""; }
          this.changed(this.data);
        }
      } finally { clearTimeout(timeout); if (this.pending === controller) this.pending = null; }
    }
    stats() { return { ...super.stats(), epoch: this.cursor?.epoch, snapshots: this.snapshots, deltas: this.deltas, bytes: this.bytes, authExpired: this.authExpired, retryAt: this.retryAt }; }
  }
  return { DeltaFeed, applyPacket };
});
