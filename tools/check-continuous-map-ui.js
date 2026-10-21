"use strict";
const assert=require("node:assert/strict");
module.exports=async function checkMapUI(page,source,select,output){
  const key=source.regionId+":"+source.id;
  const frames=()=>page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  const selected=async()=>{await frames();await page.evaluate(()=>{const v=nativeContinuousWorld.view,s=v.snapshot();v.view(s.camera.x,s.camera.y,SeamlessModel.forWorld(v.scene).limits(s.size).home);});await select(page,source);await page.waitForFunction(()=>document.querySelector("#continuous-game-actions")?.childElementCount>0);};
  const cleared=async()=>{await frames();assert(await page.evaluate(()=>!nativeContinuousWorld.view.selectedKey&&!selectedSourceId&&!selectedTargetId&&!document.querySelector("#continuous-game-actions").childElementCount),"Castle selection/actions were not cleared");};
  const ground=()=>page.evaluate(()=>{
    const root=nativeContinuousWorld.root,r=root.querySelector("#viewport").getBoundingClientRect();
    for(let y=r.top+200;y<r.bottom-100;y+=35)for(let x=r.left+100;x<r.right-100;x+=40){
      if(document.elementFromPoint(x,y)?.id==="continuous-game-surface"&&!root.elementFromPoint(x,y)?.closest("[data-key]"))return {x,y};
    }throw Error("No unobstructed fixture terrain");
  });
  await selected();const point=await ground();await page.mouse.click(point.x,point.y);await cleared();
  // Native dialogs/actions also clear their selection without a terrain click.
  await selected();await page.evaluate(()=>clearSelection(false));await cleared();
  await selected();await page.evaluate(()=>nativeContinuousWorld.root.querySelector("#viewport").dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})));await cleared();
  await selected();const wheelPoint=await ground();await page.mouse.move(wheelPoint.x,wheelPoint.y);await page.mouse.wheel(0,150);await cleared();
  await selected();await page.evaluate(()=>{const v=nativeContinuousWorld.view,s=v.snapshot();v.view(s.camera.x+s.size.width/s.camera.zoom,s.camera.y);});await cleared();
  // Cancel an asynchronous selection before it may open/reopen a wheel.
  await selected();await page.evaluate(key=>{
    const b=nativeContinuousWorld.bridge,resolve=b.resolve;b.resolve=async(...args)=>{await new Promise(r=>setTimeout(r,180));return resolve(...args);};
    nativeContinuousWorld.view.select(key);window.restoreMapResolve=()=>{b.resolve=resolve;delete window.restoreMapResolve;};
  },key);
  const blank=await ground();await page.mouse.click(blank.x,blank.y);await page.waitForTimeout(250);await cleared();await page.evaluate(()=>restoreMapResolve());
  // Crowded public owners/clan names exercise the actual shared banner CSS,
  // using temporary fictional nodes only; no account or backend data is edited.
  await selected();
  const crowded=await page.evaluate(()=>{
    const v=nativeContinuousWorld.view,root=nativeContinuousWorld.root,container=document.createElement("div");
    root.querySelector("#world").append(container);
    try{
      const rows=v.scene.objects.filter(o=>o.kind!=="scenery").map((o,i)=>{
        const item={...o,ownerUid:"fictional-crowded-"+i,owner:"Long Ruler Name",ownerClanTag:"CLAN",ownerClanId:"fictional-clan",troopVisibility:"hidden",level:125};
        const node=document.createElement("button");node.className="object "+o.kind;node.dataset.key=o.key;
        node.style.cssText=`left:${o.left}px;top:${o.top}px;width:${o.width}px;height:${o.height}px`;
        container.append(node);SeamlessAppearance.render(node,item);return {node,item};
      });
      SeamlessAppearance.layout(rows);
      const labels=rows.map(({node,item})=>({key:item.key,r:node.querySelector(".city-label")?.getBoundingClientRect(),hidden:node.querySelector(".map-banner")?.style.visibility==="hidden"})).filter(l=>l.r);
      const overlaps=[];for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){
        const a=labels[i],b=labels[j];if(!a.hidden&&!b.hidden&&Math.min(a.r.right,b.r.right)-Math.max(a.r.left,b.r.left)>.5&&Math.min(a.r.bottom,b.r.bottom)-Math.max(a.r.top,b.r.top)>.5)overlaps.push([a.key,b.key]);
      }
      return {count:labels.length,hidden:labels.filter(l=>l.hidden).length,overlaps};
    }finally{container.remove();}
  });
  assert(crowded.count>300,"Crowded test must cover neighboring sections");
  assert.equal(crowded.hidden,0,"Crowded active labels must fit");assert.deepEqual(crowded.overlaps,[]);
  // Labels are measured in world units and use the normal game banner markup.
  const reports=[];
  for(const [width,height]of [[1440,900],[844,390],[568,320]]){
    await page.setViewportSize({width,height});await selected();
    const base=await page.evaluate(()=>nativeContinuousWorld.view.snapshot());
    const samples=[];
    for(const factor of [2.5,1,.65]){
      await page.evaluate(({base,factor})=>{const v=nativeContinuousWorld.view;clearSelection(false);v.clear();v.view(base.camera.x,base.camera.y,SeamlessModel.forWorld(v.scene).limits(base.size).home*factor);},{base,factor});await frames();
      const checks=await page.evaluate(key=>{
        const root=nativeContinuousWorld.root,view=nativeContinuousWorld.view,labels=[];
        for(const node of root.querySelectorAll("#objects .object")){
          const banner=node.querySelector(".map-banner"),label=node.querySelector(".city-label");
          if(!label||getComputedStyle(banner).visibility==="hidden")continue;
          const r=label.getBoundingClientRect();labels.push({key:node.dataset.key,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,compact:banner.classList.contains("compact")});
        }
        const overlaps=[];for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){
          const a=labels[i],b=labels[j];if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5)overlaps.push([a.key,b.key]);
        }
        return {zoom:view.snapshot().camera.zoom,count:labels.length,overlaps,source:labels.find(l=>l.key===key),hidden:root.querySelectorAll('.map-banner[style*="visibility: hidden"]').length};
      },key);
      assert.equal(checks.overlaps.length,0,"Overlapping city UI: "+JSON.stringify(checks.overlaps));
      assert.equal(checks.hidden,0,"Current fixture labels should fit without being hidden");
      samples.push(checks);
    }
    assert(samples.every(s=>s.source),"Fixture castle missing during zoom check");
    for(let i=1;i<samples.length;i++){assert(samples[i].source.width<=samples[i-1].source.width+.5);assert(samples[i].source.height<=samples[i-1].source.height+.5);}
    reports.push({width,height,samples});
    await page.screenshot({path:require("node:path").join(output,`city-labels-${width}.png`)});
    // A touch pinch clears castle controls and cannot select on finger release.
    await selected();const cdp=await page.context().newCDPSession(page);
    const bounds=await page.locator("#continuous-game-surface #viewport").boundingBox();
    const x=bounds.x+bounds.width/2,y=bounds.y+bounds.height/2;
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:x-100,y,id:1},{x:x+100,y,id:2}]});
    await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:x-60,y,id:1},{x:x+60,y,id:2}]});
    await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await cdp.detach();await cleared();
  }
  require("node:fs").writeFileSync(require("node:path").join(output,"city-ui-checks.json"),JSON.stringify({crowded,viewports:reports},null,2));
  await page.setViewportSize({width:1440,height:900});await selected();
  // Zooming while choosing a troop destination must not cancel that order.
  await page.locator("#continuous-game-actions .wheel-send").click();
  const point2=await ground();await page.mouse.move(point2.x,point2.y);await page.mouse.wheel(0,-70);await frames();
  assert(await page.evaluate(()=>sendMode&&!!selectedSourceId),"Zoom canceled the pending troop destination choice");
  await page.evaluate(()=>{clearSelection(false);nativeContinuousWorld.view.clear();});await selected();
};
