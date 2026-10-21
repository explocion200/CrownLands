/* Viewport-sized batches for decorative sprites and moving patrols. Native
   castle art/buttons remain sharp; patrol buttons retain keyboard semantics. */
(function () {
  "use strict";
  class SpriteLayer {
    constructor(viewport, assets) {
      this.assets = assets; this.images = new Map(); this.stamps = new Map();
      this.back = document.createElement("canvas"); this.front = document.createElement("canvas");
      this.back.className = "sprite-batch scenery-batch"; this.front.className = "sprite-batch patrol-batch";
      for (const canvas of [this.back,this.front]) { canvas.setAttribute("aria-hidden","true"); viewport.append(canvas); }
    }
    image(path) {
      const url = this.assets.get(path); if (!url) return null;
      let image = this.images.get(path);
      if (!image || image.src !== url) { image = new Image(); image.src = url; this.images.set(path,image); image.onload=()=>{ this.changed?.(); }; }
      return image.complete && image.naturalWidth ? image : null;
    }
    context(canvas, size) {
      const dpr = Math.min(2, devicePixelRatio || 1), width = Math.round(size.width*dpr), height = Math.round(size.height*dpr);
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      const ctx = canvas.getContext("2d"); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,size.width,size.height); return ctx;
    }
    scenery(items,camera,size) {
      const ctx = this.context(this.back,size), z=camera.zoom, tx=size.width/2-camera.x*z, ty=size.height/2-camera.y*z;
      for (const item of items) { const img=this.image(item.asset); if(img && Math.max(item.width,item.height)*z >= 8) ctx.drawImage(img,tx+item.left*z,ty+item.top*z,item.width*z,item.height*z); }
    }
    patrols(items,camera,size,selected,focused) {
      const ctx = this.context(this.front,size), z=camera.zoom, diameter=Math.max(22,36*z), r=diameter/2;
      for (const item of items) {
        const x=size.width/2+(item.position.x-camera.x)*z, y=size.height/2+(item.position.y-camera.y)*z;
        if(x < -r || y < -r || x > size.width+r || y > size.height+r) continue;
        let stamp=this.stamps.get(item.asset); const img=this.image(item.asset);
        if (!stamp && img) {
          stamp=document.createElement("canvas"); stamp.width=stamp.height=128;
          const c=stamp.getContext("2d"); c.fillStyle="#e7d6ad"; c.strokeStyle="#72363a"; c.lineWidth=8;
          c.beginPath();c.arc(64,64,60,0,Math.PI*2);c.fill();c.stroke();c.save();c.clip();c.drawImage(img,8,8,112,112);c.restore();this.stamps.set(item.asset,stamp);
        }
        if(stamp) ctx.drawImage(stamp,x-r,y-r,diameter,diameter);
        if(item.key===selected || item.key===focused) { ctx.strokeStyle="#ffe394";ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,r+4,0,Math.PI*2);ctx.stroke(); }
      }
    }
    dispose() { this.images.clear();this.stamps.clear();this.back.remove();this.front.remove(); }
  }
  window.SeamlessSpriteLayer=SpriteLayer;
})();
