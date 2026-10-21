/* Identity/async boundary between continuous rendering and existing game UI. */
(function(root) {
  "use strict";
  class GameBridge {
    constructor({ resolve, activate, clear, valid = () => true, busy = () => {} }) {
      Object.assign(this, { resolve, activate, clear, valid, busy });
      this.revision = 0; this.disposed = false; this.pending = null; this.running = false; this.selected = null;
    }
    select(item) {
      if (this.disposed || !this.valid() || !item?.sectionId || !item?.id) return Promise.resolve(false);
      this.error = "";
      const revision = ++this.revision;
      // Serialize section subscriptions. Only the latest click may open controls;
      // requests already in flight must never replace a newer selection.
      if (this.pending) this.pending.done(false);
      return new Promise(done => { this.pending = { item, revision, done }; void this.drain(); });
    }
    async drain() {
      if (this.running) return;
      this.running = true; this.busy(true); this.clear();
      try {
        while (this.pending && !this.disposed) {
          const request = this.pending; this.pending = null;
          let accepted = false;
          try {
            const target = await this.resolve(request.item);
            if (!this.disposed && request.revision === this.revision && this.valid() && target
                && target.id === request.item.id && target.sectionId === request.item.sectionId) {
              this.selected = request.item; await this.activate(target, request.item); accepted = true;
            }
          } catch (error) { this.error = error?.message || "Selection unavailable"; } finally { request.done(accepted); }
        }
      } finally { this.running = false; this.busy(false); }
    }
    cancel() { this.revision++; this.pending?.done(false); this.pending = null; this.selected = null; this.clear(); }
    dispose() { this.disposed = true; this.cancel(); }
  }
  if (typeof module === "object") module.exports = { GameBridge };
  else root.ContinuousGameBridge = GameBridge;
})(typeof window === "object" ? window : globalThis);
