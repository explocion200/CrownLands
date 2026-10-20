/* Bounded request scheduler; image URLs never carry scene/camera state. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SeamlessAssets = factory();
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  class AssetLoader {
    constructor(changed, load = AssetLoader.load, release = url => URL.revokeObjectURL(url)) {
      this.changed = changed; this.load = load; this.release = release;
      this.wanted = new Map(); this.cache = new Map(); this.pending = new Map(); this.failures = new Set();
      this.peakRequests = 0; this.peakFull = 0; this.disposed = false;
    }
    static async load(path, signal) {
      if (!/^(assets\/[a-zA-Z0-9_./-]+\.(webp|png|svg)|tools\/map-benchmark\/seamless\/terrain\/[a-z0-9-]+\.webp)$/.test(path) || path.includes("..")) throw new Error("Non-asset URL refused");
      const response = await fetch(`/${path}`, { signal, credentials: "omit" });
      if (!response.ok) throw new Error(`Image HTTP ${response.status}`);
      const url = URL.createObjectURL(await response.blob());
      try { const image = new Image(); image.src = url; await image.decode(); return url; }
      catch (error) { URL.revokeObjectURL(url); throw error; }
    }
    update(requests) {
      if (this.disposed) return;
      const full = requests.filter(r => r.kind === "full").sort((a, b) => a.priority - b.priority).slice(0, 4);
      this.wanted = new Map([...requests.filter(r => r.kind !== "full"), ...full].map(r => [r.path, r]));
      for (const [path, entry] of this.cache) if (entry.kind === "full" && !this.wanted.has(path)) { this.release(entry.url); this.cache.delete(path); }
      for (const [path, pending] of this.pending) if (!this.wanted.has(path)) pending.controller.abort();
      this.pump();
    }
    pump() {
      if (this.disposed) return;
      const queue = [...this.wanted.values()].filter(r => !this.cache.has(r.path) && !this.pending.has(r.path) && !this.failures.has(r.path)).sort((a, b) => a.priority - b.priority);
      while (this.pending.size < 2 && queue.length) {
        const request = queue.shift(), controller = new AbortController();
        this.pending.set(request.path, { controller });
        this.peakRequests = Math.max(this.peakRequests, this.pending.size);
        // A timeout also handles a connection which never produces a response.
        const timeout = setTimeout(() => controller.abort(new Error("Image timed out")), 12000);
        Promise.resolve().then(() => this.load(request.path, controller.signal)).then(url => {
          if (this.disposed || controller.signal.aborted || !this.wanted.has(request.path)) this.release(url);
          else this.cache.set(request.path, { url, kind: request.kind });
          this.peakFull = Math.max(this.peakFull, [...this.cache.values()].filter(e => e.kind === "full").length);
        }).catch(() => {
          if (!this.disposed && this.wanted.has(request.path)
              && (!controller.signal.aborted || controller.signal.reason?.message === "Image timed out")) this.failures.add(request.path);
        }).finally(() => {
          clearTimeout(timeout); this.pending.delete(request.path); this.changed(); this.pump();
        });
      }
    }
    get(path) { return this.cache.get(path)?.url; }
    retry() { this.failures.clear(); this.pump(); }
    dispose() { this.disposed = true; for (const p of this.pending.values()) p.controller.abort(); for (const e of this.cache.values()) this.release(e.url); this.cache.clear(); }
    stats() { return { pending: this.pending.size, full: [...this.cache.values()].filter(e => e.kind === "full").length, cached: this.cache.size, failed: this.failures.size, peakRequests: this.peakRequests, peakFull: this.peakFull }; }
  }
  return { AssetLoader };
});
