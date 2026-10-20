/* One bounded fictional area subscription, independently versioned from camera/selection. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SeamlessFeed = factory();
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  class AreaFeed {
    constructor(changed, load) {
      this.changed = changed; this.load = load; this.ids = []; this.generation = 0; this.pending = null; this.disposed = false;
      this.data = { revision: -1, sections: [], marches: [], routes: [] }; this.failed = false; this.peakSections = 0; this.requests = 0; this.staleResults = 0;
    }
    set(ids) {
      ids = [...new Set(ids)].slice(0, 16).sort();
      if (JSON.stringify(ids) === JSON.stringify(this.ids)) return;
      this.ids = ids; this.generation++; this.pending?.abort(); this.pending = null;
      const wanted = new Set(ids), marches = this.data.marches.filter(m => m.sections.some(id => wanted.has(id)));
      const routes = new Set(marches.map(m => m.routeId));
      this.data = { ...this.data, sections: this.data.sections.filter(s => wanted.has(s.id)), marches, routes: this.data.routes.filter(r => routes.has(r.id)) };
      this.failed = false; this.changed(this.data); this.refresh();
    }
    async refresh() {
      if (this.disposed || this.pending || !this.ids.length) return;
      const generation = this.generation, ids = [...this.ids], controller = new AbortController(); this.pending = controller; this.requests++;
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const data = await this.load(ids, controller.signal);
        if (this.disposed || controller.signal.aborted || generation !== this.generation) { this.staleResults++; return; }
        if (!Number.isSafeInteger(data.revision) || data.revision < this.data.revision) { this.staleResults++; return; }
        if (data.sections.length !== ids.length || new Set(data.sections.map(s => s.id)).size !== ids.length || data.sections.some(s => !ids.includes(s.id))) throw new Error("Mismatched area response");
        this.data = data; this.failed = false; this.peakSections = Math.max(this.peakSections, data.sections.length); this.changed(data);
      } catch (_error) { if (!this.disposed && generation === this.generation) { this.failed = true; this.changed(this.data); } }
      finally { clearTimeout(timeout); if (this.pending === controller) this.pending = null; }
    }
    stats() { return { sections: this.data.sections.length, objects: this.data.sections.reduce((n, s) => n + s.objects.length, 0), marches: this.data.marches.length,
      pending: !!this.pending, failed: this.failed, revision: this.data.revision, requests: this.requests, staleResults: this.staleResults, peakSections: this.peakSections, ids: [...this.ids] }; }
    dispose() { this.disposed = true; this.generation++; this.pending?.abort(); this.pending = null; this.ids = []; this.data = { revision: -1, sections: [], marches: [], routes: [] }; }
  }
  return { AreaFeed };
});
