/* Bounded decoration drawing; native castle and troop buttons retain their
   original artwork, banners, keyboard semantics and live presentation. */
(function () {
  "use strict";
  class SpriteLayer {
    constructor(viewport, assets) {
      this.assets = assets; this.images = new Map();
      this.drawing=null;this.tileBytes=0;this.draws=0;this.tileHits=0;this.tileBuilds=0;this.disposed=false;
      this.back = document.createElement("canvas");
      this.back.className = "sprite-batch scenery-batch";
      this.back.setAttribute("aria-hidden","true");viewport.append(this.back);
    }
    image(path) {
      const url = this.assets.get(path); if (!url) return null;
      let image = this.images.get(path);
      if (!image || image.src !== url) { image = new Image(); image.src = url; this.images.set(path,image); image.onload=()=>{ if(!this.disposed){this.drawing=null;this.changed?.();} }; }
      return image.complete && image.naturalWidth ? image : null;
    }
    context(canvas, size) {
      const dpr = Math.min(2, devicePixelRatio || 1), width = Math.round(size.width*dpr), height = Math.round(size.height*dpr);
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      const ctx = canvas.getContext("2d"); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,size.width,size.height); return ctx;
    }
    scenery(items,camera,size) {
      const z=camera.zoom,tx=size.width/2-camera.x*z,ty=size.height/2-camera.y*z;
      // Cache an overscanned drawing at the exact zoom. Pure pans translate this
      // canvas on the compositor; zoom/content changes redraw at native density.
      const margin=96,dpr=Math.min(2,devicePixelRatio||1);
      const signature=JSON.stringify([z,size.width,size.height,dpr,items.map(o=>[o.key,o.left,o.top,o.width,o.height,this.assets.get(o.asset)])]);
      let tile=this.drawing;
      const width=Math.ceil((size.width+margin*2)*dpr),height=Math.ceil((size.height+margin*2)*dpr);
      if(width*height*4>48*1024*1024){
        this.drawing=null;this.tileBytes=0;this.back.style.cssText="";const ctx=this.context(this.back,size);
        for(const o of items){const img=this.image(o.asset);if(img&&Math.max(o.width,o.height)*z>=8)ctx.drawImage(img,tx+o.left*z,ty+o.top*z,o.width*z,o.height*z);}return;
      }
      if(!tile||tile.signature!==signature||Math.abs(camera.x-tile.x)*z>margin/2||Math.abs(camera.y-tile.y)*z>margin/2){
        this.back.width=width;this.back.height=height;
        this.back.style.cssText=`left:${-margin}px;top:${-margin}px;width:${width/dpr}px;height:${height/dpr}px;will-change:transform`;
        const c=this.back.getContext("2d");c.setTransform(dpr,0,0,dpr,0,0);
        for(const o of items){const img=this.image(o.asset);if(img&&Math.max(o.width,o.height)*z>=8)c.drawImage(img,margin+tx+o.left*z,margin+ty+o.top*z,o.width*z,o.height*z);}
        tile=this.drawing={signature,x:camera.x,y:camera.y};this.tileBytes=width*height*4;this.tileBuilds++;
      }else this.tileHits++;
      this.back.style.transform=`translate3d(${(tile.x-camera.x)*z}px,${(tile.y-camera.y)*z}px,0)`;this.draws++;
      for(const [path,img]of this.images)if(!this.assets.get(path)){img.onload=null;this.images.delete(path);}
    }
    stats(){return {tiles:this.drawing?1:0,tileBytes:this.tileBytes,images:this.images.size,draws:this.draws,tileHits:this.tileHits,tileBuilds:this.tileBuilds};}
    dispose() {this.disposed=true;for(const img of this.images.values())img.onload=null;this.images.clear();this.drawing=null;this.tileBytes=0;this.back.remove(); }
  }
  window.SeamlessSpriteLayer=SpriteLayer;
})();
