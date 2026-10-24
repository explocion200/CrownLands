"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
module.exports=async function checkControlScale(page,targets,select,output){
  const frames=()=>page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  const measure=()=>page.evaluate(()=>{
    const v=nativeContinuousWorld.view,{camera,size}=v.snapshot(),object=v.getObject(v.selectedKey),point=SeamlessModel.project(camera,object,size);
    const wheel=document.querySelector("#continuous-game-actions .city-action-wheel,#continuous-game-actions .gold-camp-action-wheel");
    if(!wheel)throw Error("Selected target has no native action controls");
    const rect=wheel.getBoundingClientRect(),bounds=[...wheel.querySelectorAll("button")].map(n=>{const r=n.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};});
    return {zoom:camera.zoom,max:SeamlessModel.forWorld(v.scene).limits(size).max,width:Math.max(rect.right,...bounds.map(r=>r.right))-Math.min(rect.left,...bounds.map(r=>r.left)),height:Math.max(rect.bottom,...bounds.map(r=>r.bottom))-Math.min(rect.top,...bounds.map(r=>r.top)),
      scale:new DOMMatrixReadOnly(getComputedStyle(wheel).transform).a,left:parseFloat(wheel.style.left),top:parseFloat(wheel.style.top),point,buttons:bounds,kind:object.kind};
  });
  const results=[];
  await page.evaluate(()=>{
    window.controlScaleQA={attached:[]};
    controlScaleQA.observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes){
      if(!node.matches?.(".city-action-wheel,.gold-camp-action-wheel"))continue;
      const {camera,size}=nativeContinuousWorld.view.snapshot();
      controlScaleQA.attached.push({transform:node.style.transform,expected:node.classList.contains("continuous-castle-wheel")?1:(size.height<500?.74:.9)*Math.min(1,camera.zoom/SeamlessModel.forWorld(nativeContinuousWorld.view.scene).limits(size).max)});
    }});
    controlScaleQA.observer.observe(document.querySelector("#continuous-game-actions"),{childList:true});
  });
  try{
    // Change sections once per target. Repeated zoom samples exercise camera
    // geometry, not a burst of unnecessary native selection/API commands.
    for(const target of targets){
      await page.setViewportSize({width:1440,height:900});await frames();
      await page.evaluate(()=>{const v=nativeContinuousWorld.view,{camera,size}=v.snapshot();clearSelection(false);v.clear();v.view(camera.x,camera.y,SeamlessModel.forWorld(v.scene).limits(size).home);});
      await select(page,target);
      for(const [width,height]of [[1440,900],[844,390],[568,320]]){
        await page.setViewportSize({width,height});await frames();
        const key=target.regionId+":"+target.id,samples=[];
        await page.evaluate(key=>{const v=nativeContinuousWorld.view,o=v.getObject(key);v.focus(o);if(v.selectedKey!==key)v.select(key);},key);
        for(const fraction of [1,.5,1/3,.2]){
          await page.evaluate(({key,fraction})=>{
            const v=nativeContinuousWorld.view,{size}=v.snapshot(),o=v.getObject(key);
            v.view(o.x,o.y,SeamlessModel.forWorld(v.scene).limits(size).max*fraction);
          },{key,fraction});
          await frames();await page.waitForFunction(()=>!nativeContinuousWorld.view.snapshot().feed.pending&&!nativeContinuousWorld.bridge.running&&document.querySelector("#continuous-game-actions button"));await frames();
          const sample=await measure(),expected=sample.kind==="castle"?1:(height<500?.74:.9)*sample.zoom/sample.max;
          assert(Math.abs(sample.scale-expected)<1e-5,"Action controls did not scale with map zoom");
          assert(Math.hypot(sample.left-sample.point.x,sample.top-sample.point.y)<.1,"Action controls detached from the selected target");
          assert(sample.buttons.length>0);assert(sample.buttons.every(b=>b.width>0&&b.height>0));
          for(let i=0;i<sample.buttons.length;i++)for(let j=i+1;j<sample.buttons.length;j++){
            const a=sample.buttons[i],b=sample.buttons[j];const overlap=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));assert(overlap<Math.min(a.width*a.height,b.width*b.height)*.15,"Overlapping control faces: "+JSON.stringify({target,fraction,sample}));
          }
          if(sample.kind==="castle"){
            assert(sample.buttons.every(b=>Math.abs(b.width-(height<=500?44:56))<.1),"Approved castle controls must remain readable");
            if(samples.length)assert(sample.width<=samples[0].width+.1,"Castle menu must not grow while zooming out");
          }else if(samples.length){
            const ratio=sample.zoom/samples[0].zoom;
            assert(Math.abs(sample.width/samples[0].width-ratio)<.002,"Wheel footprint grows relative to the target: "+JSON.stringify({width,height,target,fraction,sample,first:samples[0]}));
            sample.buttons.forEach((b,i)=>assert(Math.abs(b.width/samples[0].buttons[i].width-ratio)<.002,"A button ignores its wheel scale"));
          }
          samples.push({fraction,...sample});
          if(target===targets[0]&&(fraction===1||fraction===1/3))await page.screenshot({path:path.join(output,`control-scale-${width}-${fraction===1?"close":"overview"}.png`)});
        }
        // A real click/touch on the compact Info control opens the same native
        // panel. No synthetic command or enlarged hidden hit box is needed.
        const selector="#continuous-game-actions .wheel-info,#continuous-game-actions .camp-info-action,#continuous-game-actions [data-clan-tower-map-action=info]";
        if(width<1000){
          // Area polling can replace the wheel between separate visibility and
          // bounding-box calls. Read a live hit point atomically on a frame.
          const handle=await page.waitForFunction(selector=>{const n=document.querySelector(selector);if(!n||getComputedStyle(n).visibility!=="visible")return false;const r=n.getBoundingClientRect();return r.width>0&&r.height>0?{x:r.x+r.width/2,y:r.y+r.height/2}:false;},selector);
          const {x,y}=await handle.jsonValue();await handle.dispose();
          const cdp=await page.context().newCDPSession(page);await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y,id:1}]});await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await cdp.detach();
        }else await page.locator(selector).click();
        await page.waitForFunction(()=>modal.open&&modalBody.textContent.length>30,null,{timeout:5000});
        await page.evaluate(()=>modal.close());results.push({width,height,target:target.id,samples});
      }
    }
    // Resize an already selected wheel without rebuilding or changing target.
    await page.setViewportSize({width:1440,height:900});await select(page,targets[0]);
    await page.setViewportSize({width:844,height:390});await frames();
    const resized=await measure();assert(Math.abs(resized.scale-(resized.kind==="castle"?1:.74*resized.zoom/resized.max))<1e-5);
    const attached=await page.evaluate(()=>controlScaleQA.attached);
    assert(attached.length>=targets.length);
    for(const row of attached){const scale=row.transform==="none"?1:Number(/scale\(([^)]+)\)/.exec(row.transform)?.[1]);assert(Math.abs(scale-row.expected)<1e-5,"New control flashed at an unscaled size");}
    fs.writeFileSync(path.join(output,"control-scale-checks.json"),JSON.stringify({results,resized,attachments:attached.length},null,2));
  }finally{
    await page.evaluate(()=>{controlScaleQA.observer.disconnect();delete window.controlScaleQA;modal.close();clearSelection(false);window.nativeContinuousWorld?.view.clear();});
    await page.setViewportSize({width:1440,height:900});
    if(await page.evaluate(()=>!!window.nativeContinuousWorld)){await page.evaluate(()=>nativeContinuousWorld.view.home());await select(page,targets[0]);}
  }
};
