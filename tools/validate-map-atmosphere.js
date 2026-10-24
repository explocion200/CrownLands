"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const { layout } = require("../world/atmosphere");
const M = require("../world/model");
for (const size of [{width:1440,height:900},{width:844,height:390},{width:568,height:320}]) {
  const min=M.limits(size).min, camera={x:8000,y:6000,zoom:min};
  const fit=Math.min(size.width/1448,size.height/1086),range=M.limits(size);
  assert(Math.abs(min/fit-(size.height<=500?1.4:.85))<1e-8);
  assert.equal(range.max,fit*3);assert(range.home>=min&&min>range.detail);
  const bounds={width:30000,height:30000},model=M.forWorld(bounds),anchor={x:size.width*.7,y:size.height*.4};
  const before=model.unproject({...camera,zoom:range.max},anchor,size);
  const after=model.zoomAt({...camera,zoom:range.max},size,anchor,0);
  const p=model.project(after,before,size);assert(Math.hypot(p.x-anchor.x,p.y-anchor.y)<1e-8);
  const a=layout(camera,size,min,100),b=layout(camera,size,min,101);
  const zoomed=layout({...camera,zoom:min*1.2},size,min,100);
  a.forEach((p,i)=>{assert.equal(zoomed[i].x,p.x);assert.equal(zoomed[i].y,p.y);});
  assert.equal(a.length,3); assert.equal(a.filter(p=>p.opacity>0).length,size.width<1000?2:3);
  a.forEach((p,i)=>{
    assert(p.width<397&&p.height<270); assert(p.opacity<=1);
    assert(Math.abs((b[i].x-p.x)-(3+i*.35))<1e-8,"Cloud drift must be continuous");
  });
  assert(layout({...camera,zoom:min*1.8},size,min,100).every(p=>p.opacity<1e-10),"Clouds must fade out in the close-up");
  assert(layout({...camera,x:-1e9,y:1e9},size,min,1e9).every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>-500&&p.x<size.width+500));
}
// Model CSSOM serialization rather than an identity object: browsers round
// dimensions and add transform whitespace when reading inline style values.
const style=()=>new Proxy({}, {set(target,key,value){target[key]=/^(width|height|transform)$/.test(key)?String(value).replace(/(\d+\.\d+)/g,n=>Number(n).toFixed(3)).replaceAll(",",", "):value;return true;}});
const element=()=>({style:style(),children:[],append(n){this.children.push(n);},setAttribute(){},remove(){this.removed=true;}});
const motion={matches:false},sandbox={window:{matchMedia:()=>motion},document:{createElement:element}};
vm.runInNewContext(fs.readFileSync("world/atmosphere.js","utf8"),sandbox);
const viewport=element(),world=element(),a=new sandbox.window.SeamlessAtmosphere(viewport,world);
const size={width:844,height:390},camera={x:8000,y:6000,zoom:.6},surface={left:7100,top:5500};
const frame=t=>a.frame(t,camera,size,.6,surface);
frame(100);frame(200);assert.equal(a.stats().seconds,.1);assert.equal(a.stats().nodes,6);
const cloud=viewport.children[0].children[0],shadow=world.children[0].children[0];
const xy=n=>n.style.transform.match(/[-\d.]+(?=px)/g).map(Number);
const [cx,cy]=xy(cloud),[sx,sy]=xy(shadow);
const patch=layout(camera,size,.6,.1)[0];
assert(Math.abs((sx+surface.left-camera.x)*camera.zoom+size.width/2-cx-patch.width*.32)<.02,"Shadow x must remain paired through surface rebasing");
assert(Math.abs((sy+surface.top-camera.y)*camera.zoom+size.height/2-cy-patch.height*.48)<.02,"Shadow y must remain paired through surface rebasing");
motion.matches=true;frame(300);const stable=a.stats();frame(400);
assert.equal(a.stats().writes,stable.writes,"Reduced motion at rest must not rewrite identical styles");assert.equal(a.stats().seconds,stable.seconds);
motion.matches=false;a.pause();frame(30000);assert.equal(a.stats().seconds,stable.seconds,"Resuming must not jump through hidden time");
let mode="off";sandbox.window.CrownlandsAnimations={getEffectiveMode:()=>mode};frame(30050);
assert.equal(world.children[0].style.display,"none");assert.equal(viewport.children[0].style.display,"none");
mode="reduced";frame(30060);const reduced=a.stats();frame(30070);assert.equal(a.stats().writes,reduced.writes);assert.equal(a.stats().seconds,reduced.seconds);
assert.equal(viewport.children[0].style.display,"");
world.children[0].hidden=viewport.children[0].hidden=true;const hidden=a.stats();frame(30100);assert.equal(a.stats().writes,hidden.writes);
a.dispose();frame(30200);assert.equal(a.stats().nodes,0);assert(world.children[0].removed&&viewport.children[0].removed);
const css=fs.readFileSync("world/preview.css","utf8").split("/* A few small composited")[1];
assert(css.includes("pointer-events:none"));assert(!/filter:|animation:/.test(css),"No extra blur filter or independent animation may run");
console.log("Map atmosphere: bounded patches, drift/fade, shared shadow projection, reduced motion, pause, no idle writes and disposal passed.");
// A lost cosmetic module must not strand the game at loading. Required map
// modules still fail closed and retain the normal retry/error behavior.
(async()=>{
  for(const failedModule of ["atmosphere","model"]){
    let mounted=0;const loaded=[],messages=[];
    const context={
      window:{addEventListener(){}},document:{hidden:false,createElement:()=>({remove(){}}),head:{append(script){const name=script.src.match(/world\/(.*?)\.js/)[1];loaded.push(name);queueMicrotask(()=>name===failedModule?script.onerror():script.onload());}}},
      setInterval:()=>1,clearInterval(){},getOnlineSessionRequestScope:()=>"fixture",onlineWorldConnected:true,isMapInteractionBlocked:()=>false,state:{mainCityId:"home"},cityById:()=>null,
      getOnlineApi:()=>({getUser:()=>({uid:"fictional"}),readWorld:async()=>({enabled:true,protocol:1,routingVersion:"continuous-world-v1",revision:"a".repeat(64),sections:[{id:"home"}]})}),
      showToast:message=>messages.push(message)
    };
    context.window.mountContinuousWorld=async()=>{mounted++;};
    vm.runInNewContext(fs.readFileSync("world/bootstrap.js","utf8"),context);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(mounted,failedModule==="atmosphere"?1:0);
    assert.equal(messages.length,failedModule==="atmosphere"?0:1);
    if(failedModule==="atmosphere")assert(loaded.includes("native"));
  }
  console.log("Optional cloud-module failure preserves map startup; required-module failures still block startup.");
})().catch(error=>{console.error(error);process.exitCode=1;});
