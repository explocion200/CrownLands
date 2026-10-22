"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
const root=path.resolve(__dirname,".."),read=file=>fs.readFileSync(path.join(root,file),"utf8");
const native=read("world/native.js"),start=native.indexOf("  function renderPickups(){"),end=native.indexOf("  const locate =",start);
const frameStart=native.indexOf("      for(const node of pickupNodes.values())"),frameEnd=native.indexOf("\n      if (areasReady",frameStart);
assert(start>0&&end>start&&frameStart>0&&frameEnd>frameStart,"Native pickup hooks changed; update the fixture");
const render=native.slice(start,end),frame=native.slice(frameStart,frameEnd);
const game=read("game.js"),icons=read("skins-ui.js").slice(read("skins-ui.js").indexOf("function renderCosmeticPickupIcon("));
const styles=[...read("index.html").matchAll(/<link\b[^>]*>/g)].map(m=>m[0]).filter(s=>/rel="stylesheet"/.test(s))
  .map(s=>s.match(/href="([^"]+)"/)[1]).filter(s=>!s.includes("://"));
const out=path.join(root,"release-artifacts/pickup-animation");fs.mkdirSync(out,{recursive:true});
(async()=>{
  let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.CHROME_PATH||"/usr/bin/google-chrome",headless:true,args:["--no-sandbox"]});
    const page=await browser.newPage(),external=[],errors=[],results=[];
    page.on("pageerror",e=>errors.push(e.message));
    await page.route("**/*",async route=>{
      const url=new URL(route.request().url());
      if(url.origin!=="http://pickup.test"){external.push(url.origin);return route.abort();}
      if(url.pathname==="/")return route.fulfill({contentType:"text/html",body:`<!doctype html><html data-animation-mode="full"><head>${styles.map(s=>`<link rel="stylesheet" href="/${s}">`).join("")}</head><body><div id="frame" class="map-frame" style="position:absolute;inset:0;width:100%;height:100%;margin:0"><div id="continuous-world-pickups" style="position:absolute;inset:0"></div></div></body></html>`});
      const file=path.resolve(root,"."+decodeURIComponent(url.pathname));
      if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:"Missing fixture asset"});
      await route.fulfill({path:file});
    });
    await page.goto("http://pickup.test/");
    await page.addScriptTag({content:read("world/model.js")});
    await page.addScriptTag({content:`
      ${game.match(/const TROOP_PICKUP_ICON_SRC = [^;]+;/)[0]}
      ${game.match(/const GOLD_PICKUP_ICON_SRC = [^;]+;/)[0]}
      const normalizeHarvestBonusType=t=>t;
      ${icons}
      const getHarvestBonusIcon=renderCosmeticPickupIcon;
      const pickups=document.getElementById('continuous-world-pickups'),pickupNodes=new Map(),pendingHarvestBonusIds=new Set();
      const scene={width:1448*5,height:1086*5,sections:[{id:'sample',x:0,y:0,width:1448,height:1086,gameBounds:{left:0,top:0,width:1448,height:1086}}]};
      const view={},disposed=false,areasReady=true,pickupPlacement={safe:()=>true};
      let bonuses=[],collected=[];
      const ensureDailyCaptureTracker=()=>({}),getAllActiveHarvestBonuses=()=>bonuses,getHarvestBonusRemaining=()=>30,collectHarvestBonus=id=>collected.push(id);
      ${render}
      window.pickupTest={set(type){bonuses=[{id:type,type,regionId:'sample',x:724,y:543}];renderPickups();},
        frame(fraction){const size={width:innerWidth,height:innerHeight},camera={zoom:SeamlessModel.forWorld(scene).limits(size).max*fraction},project=()=>({x:innerWidth/2,y:innerHeight/2});${frame}},
        collected:()=>collected};
    `});
    for(const [width,height]of [[1440,900],[844,390],[568,320]]){
      await page.setViewportSize({width,height});
      for(const type of ["gold","troops","crowns"]){
        await page.evaluate(type=>pickupTest.set(type),type);
        const button=page.locator("#continuous-world-pickups button");await button.locator("img").evaluate(i=>i.decode());
        for(const mode of ["full","reduced","off"]){
          await page.evaluate(mode=>document.documentElement.dataset.animationMode=mode,mode);
          for(const fraction of [1,.5,.2])for(const phase of [0,775,1550]){
            await page.evaluate(({fraction,phase})=>{pickupTest.frame(fraction);for(const a of document.querySelector("#continuous-world-pickups button").getAnimations({subtree:true})){a.pause();a.currentTime=phase;}},{fraction,phase});
            const sample=await button.evaluate(n=>{const r=n.getBoundingClientRect(),i=n.querySelector("img").getBoundingClientRect();return {width:r.width,art:i.width,x:r.x+r.width/2,y:r.y+r.height/2,animation:getComputedStyle(n).animationName,ring:getComputedStyle(n,"::after").animationName};});
            assert(Math.abs(sample.width-44*.8*fraction)<.1,`${type}/${mode}/${width}/${fraction}/${phase}: hit area ${sample.width} ignores camera scale`);
            assert(Math.abs(sample.art-62*.8*fraction)<.1,"Animated artwork ignores camera scale");
            assert(Math.abs(sample.x-width/2)<.1&&Math.abs(sample.y-height/2)<.1,"Animation moves the pickup away from its world anchor");
            if(mode==="full")assert(sample.animation!=="none"&&sample.ring!=="none","Full-mode pickup glow was removed");
            else assert(sample.animation==="none"&&sample.ring==="none","Motion preference ignored");
            results.push({width,height,type,mode,fraction,phase,...sample});
            if(width===844&&mode==='full'&&phase===775&&fraction!==.5)await page.screenshot({path:path.join(out,`${type}-${fraction===1?'close':'wide'}.png`)});
          }
        }
        await page.evaluate(()=>pickupTest.frame(1));await button.click();
        assert.equal(await page.evaluate(()=>pickupTest.collected().at(-1)),type,"Pickup button lost its collection handler");
      }
    }
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    fs.writeFileSync(path.join(out,"report.json"),JSON.stringify(results,null,2));
    console.log(`Animated connected pickups passed ${results.length} size/phase cases, all three types and motion modes, desktop and landscape, collection clicks, zero external requests.`);
  }finally{await browser?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
