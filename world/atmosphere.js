/* Sparse presentation only. One shared texture, no independent animation loop,
   world-sized surfaces, gameplay objects, hit targets or network subscriptions. */
(function (root) {
  "use strict";
  const clamp = n => Math.max(0, Math.min(1, n));
  const wrap = (n, span) => ((n % span) + span) % span;
  function layout(camera, size, minimum, seconds) {
    const fade = clamp((1.8 - camera.zoom / minimum) / .8);
    const width = Math.min(360, Math.max(180, size.width * .3)), height = width * .68;
    const spanX = size.width + width * 2, spanY = size.height + height * 2;
    return [[.14,.28,1],[.68,.74,.85],[.88,.12,1.1]].map(([x,y,scale], i) => ({
      // Sky parallax follows travel, not absolute coordinate * zoom: multiplying
      // a distant world's origin by zoom would sweep clouds across the screen
      // during a centered pinch even though the camera did not move.
      x: wrap(x * spanX + seconds * (3 + i * .35) - camera.x * .28, spanX) - width,
      y: wrap(y * spanY + seconds * .7 - camera.y * .28, spanY) - height,
      width: width * scale, height: height * scale,
      opacity: i === 2 && size.width < 1000 ? 0 : fade
    }));
  }
  class Atmosphere {
    constructor(viewport, world) {
      this.layers = [world, viewport].map((parent, i) => {
        const layer = document.createElement("div");
        layer.className = i ? "map-clouds" : "map-cloud-shadows";
        layer.setAttribute("aria-hidden", "true");
        for (let n = 0; n < 3; n++) layer.append(document.createElement("i"));
        parent.append(layer); return layer;
      });
      this.motion = root.matchMedia("(prefers-reduced-motion: reduce)");
      this.styleValues = new WeakMap();
      this.seconds = 0; this.last = null; this.writes = 0; this.disposed = false;
    }
    pause() { this.last = null; }
    frame(now, camera, size, minimum, surface) {
      if (this.disposed) return;
      // A diagnostic may hide both layers. No hidden animation work remains.
      if (this.layers.every(n => n.hidden)) { this.pause(); return; }
      this.mode = root.CrownlandsAnimations?.getEffectiveMode?.() || (this.motion.matches ? "reduced" : "full");
      const display = this.mode === "off" || camera.zoom >= minimum * 1.8 ? "none" : "";
      for (const layer of this.layers) if (layer.style.display !== display) layer.style.display = display;
      if (display) { this.pause(); return; }
      if (this.mode === "full" && this.last !== null) this.seconds += Math.min(100, Math.max(0, now - this.last)) / 1000;
      this.last = now;
      const set = (node, property, value) => {
        // CSSOM normalizes decimal precision and transform spacing. Comparing
        // its serialized value with our input would rewrite fixed dimensions
        // (and even reduced-motion transforms) on every frame.
        let values = this.styleValues.get(node);
        if (!values) { values = {}; this.styleValues.set(node, values); }
        if (values[property] !== value) { values[property] = value; node.style[property] = value; this.writes++; }
      };
      layout(camera, size, minimum, this.seconds).forEach((p, i) => {
        this.layers.forEach((layer, sky) => {
          const node = layer.children[i], z = sky ? 1 : camera.zoom;
          set(node, "opacity", String(p.opacity * (sky ? .32 : .12)));
          if (!p.opacity) return;
          // Shadows are inside the terrain surface, below every castle/banner.
          // Project their shared sky position back into the rebased world.
          const x = sky ? p.x : camera.x - surface.left + (p.x + p.width * .32 - size.width / 2) / z;
          const y = sky ? p.y : camera.y - surface.top + (p.y + p.height * .48 - size.height / 2) / z;
          set(node, "width", `${p.width / z}px`); set(node, "height", `${p.height / z}px`);
          set(node, "transform", `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0)`);
        });
      });
    }
    stats() { return { nodes: this.disposed ? 0 : 6, writes: this.writes, seconds: this.seconds, mode: this.mode }; }
    dispose() { this.disposed = true; this.layers.forEach(n => n.remove()); }
  }
  if (typeof module !== "undefined") module.exports = { layout, Atmosphere };
  else root.SeamlessAtmosphere = Atmosphere;
})(typeof window === "undefined" ? globalThis : window);
