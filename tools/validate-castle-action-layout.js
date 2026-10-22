"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
const root=path.resolve(__dirname,".."),read=f=>fs.readFileSync(path.join(root,f),"utf8");
const game=read("game.js"),native=read("world/native.js");
const render=game.slice(game.indexOf("function renderSelectedCityWheel("),game.indexOf("function renderSelectedStrongholdWheel("));
const position=native.slice(native.indexOf("  function positionWheel("),native.indexOf("  function paintWheel("));
const styles=[...read("index.html").matchAll(/<link\b[^>]*>/g)].map(m=>m[0]).filter(s=>/rel="stylesheet"/.test(s)).map(s=>s.match(/href="([^"]+)"/)[1]).filter(s=>!s.includes("://"));
const sets=[{id:"default",assets:require("../local-backend/world/catalog").catalog.mapPresentation.cityStageAssets},...require("../functions/cosmetics").ITEMS.filter(x=>x.category==="city")];
const out=path.join(root,"release-artifacts/castle-action-live");fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || (fs.existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : chromium.executablePath())});
  const errors=[],external=[],results=[];
  try{
    const context=await browser.newContext({hasTouch:true});const page=await context.newPage();
    page.on("pageerror",e=>errors.push(e.message));
    let releaseImage;
    await page.route("**/*",async route=>{
      const url=new URL(route.request().url());
      if(url.origin!=="http://castle.test"||route.request().method()!=="GET"){external.push(url.href);return route.abort();}
      if(url.pathname==="/")return route.fulfill({contentType:"text/html",body:`<!doctype html><html><head>${styles.map(s=>`<link rel="stylesheet" href="/${s}">`).join("")}</head><body style="margin:0;overflow:hidden"><div style="position:absolute;inset:0;background:url('/assets/worlds/core-expansion-v1/maps/core-v2-north-west-holding-tower-m1-m1.webp') center/cover"></div><img id="castle" style="position:absolute;transform:translate(-50%,-50%)"><div id="continuous-game-actions" style="position:absolute;inset:0;pointer-events:none"></div></body></html>`});
      if(url.search==="?delayed")await new Promise(resolve=>{releaseImage=resolve;});
      if(url.search==="?failed")return route.fulfill({status:404,body:"Intentional missing test sprite"});
      const file=path.resolve(root,"."+decodeURIComponent(url.pathname));
      if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:"Missing fixture file"});
      return route.fulfill({path:file});
    });
    await page.goto("http://castle.test/");
    await page.addScriptTag({content:read("world/model.js")});await page.addScriptTag({content:native});
    await page.addScriptTag({content:`
      const cityLayer=document.getElementById('continuous-game-actions'), calls=[];
      const worldToMapPoint=()=>({x:0,y:0}),isStronghold=()=>false,canUseBulkArmyOrders=()=>true,getProjectedCityForInstantActions=c=>c,getLevelCost=()=>10000000,cityHasIncomingUpgradeBlocker=()=>false,getPendingCityUpgradeAction=()=>false,getProjectedGold=()=>100000000;
      const formatNumber=n=>n===10000000?'10Mg':String(n),escapeHtml=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
      let scoutNearbySourceId=null,regroupSourceId=null,pendingBulkOrderAction=null,testKind='own',testState='normal';
      const SCOUT_NEARBY_COST=100,REGROUP_COST=100,pendingDirectScoutTargets=new Set();
      const getScoutReport=()=>testKind==='enemy'?{}:null,getPendingScoutMission=()=>testState==='scouting',getClanFriendlyBlockReason=()=>testKind==='ally'?'Clan Ally':'',getVeilOfSilenceScoutBlockReason=()=>'',getMainCityScoutBlockReason=()=>'',getMainCityAttackBlockReason=()=>'',getPeaceShieldAttackBlockReason=()=>testState==='shielded'?'Shielded':'',playerCities=()=>[{troops:100}],getCityRegionId=()=>"sample";
      const primeCityUpgradeAudio=()=>{},upgradeCity=(...args)=>calls.push(['level',...args]),beginSendMode=id=>calls.push(['send',id]),showCityInfoModal=id=>calls.push(['info',id]),toggleScoutNearby=id=>calls.push(['nearby',id]),toggleRegroup=id=>calls.push(['regroup',id]),scoutCity=id=>calls.push(['scout',id]),beginClanReinforcement=c=>calls.push(['reinforce',c.id]),attackForeignCity=id=>calls.push(['attack',id]),showScoutReportModal=id=>calls.push(['report',id]);
      const renderCrownlandsIcon=name=>'<svg class="cl-icon"><use href="#cl-icon-'+name+'"></use></svg>';
      ${render}
      const scene={width:1448*3,height:1086*3,sections:[{id:'sample',x:1448,y:1086,width:1448,height:1086}]};
      let wheelPoint,frame,invalidations=0;const castleActions=createContinuousCastleActions(()=>{invalidations++;if(frame)positionWheel(cityLayer.children,frame);});
      ${position}
      window.layoutTest={calls,set:async({asset,level,zoom,kind='own',state='normal'})=>{
        testKind=kind;testState=state;cityLayer.replaceChildren();
        const city={id:'exact-city',name:'Sample Castle',level,troops:50000,owner:kind==='own'?'player':'enemy'};
        const size={width:innerWidth,height:innerHeight},fit=Math.min(size.width/1448,size.height/1086),z=fit*3*zoom;
        wheelPoint={kind:'castle',key:'sample:exact-city',asset,x:1448+724,y:1086+543,width:56*(.6+[1,25,50,75,100].indexOf(level)*.1),height:56*(.6+[1,25,50,75,100].indexOf(level)*.1)};
        frame={camera:{x:wheelPoint.x,y:wheelPoint.y,zoom:z},size};
        if(kind==='own')renderSelectedCityWheel(city);else renderSelectedForeignWheel(city);
        positionWheel(cityLayer.children,frame);
        const image=document.getElementById('castle');image.src=asset;image.style.cssText+=';left:'+innerWidth/2+'px;top:'+innerHeight/2+'px;width:'+wheelPoint.width*z+'px;height:'+wheelPoint.height*z+'px';await image.decode();
        await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));positionWheel(cityLayer.children,frame);
      },frame:()=>positionWheel(cityLayer.children,frame),dispose:()=>castleActions.dispose(),invalidations:()=>invalidations};
    `});
    // Reuse actual icon symbols without booting the game or its network adapter.
    await page.evaluate(html=>{const parsed=new DOMParser().parseFromString(html,'text/html'),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.style.cssText='position:absolute;width:0;height:0';parsed.querySelectorAll('symbol').forEach(s=>svg.append(document.importNode(s,true)));document.body.append(svg);},read("index.html"));
    for(const [width,height]of [[1440,900],[844,390],[568,320]]){
      await page.setViewportSize({width,height});
      for(const set of sets)for(const [i,level]of [1,25,50,75,100].entries())for(const zoom of [1,.6,.2]){
        await page.evaluate(options=>layoutTest.set(options),{asset:'/'+set.assets[i+1],level,zoom});
        const m=await page.evaluate(()=>{
          const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
          const city=rect(document.getElementById('castle')),wheel=document.querySelector('.continuous-castle-wheel'),arc=wheel.querySelector('path'),origin=rect(wheel.querySelector('svg'));
          const buttons=[...wheel.querySelectorAll('button')],distance=(a,b)=>Math.hypot(Math.max(a.x-b.right,b.x-a.right,0),Math.max(a.y-b.bottom,b.y-a.bottom,0));
          const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(document.getElementById('castle'),0,0,256,256);const alpha=ctx.getImageData(0,0,256,256).data,edges=[];
          for(let y=0;y<256;y++)for(let x=0;x<256;x++){if(alpha[(y*256+x)*4+3]<=32)continue;if(x===0||y===0||x===255||y===255||[[-1,0],[1,0],[0,-1],[0,1]].some(([dx,dy])=>alpha[((y+dy)*256+x+dx)*4+3]<=32))edges.push([city.x+(x+.5)*city.width/256,city.y+(y+.5)*city.height/256]);}
          let arcGap=Infinity;const length=arc.getTotalLength(),stroke=parseFloat(getComputedStyle(arc).strokeWidth);
          for(let i=0;i<=720;i++){const p=arc.getPointAtLength(length*i/720),x=p.x+origin.x,y=p.y+origin.y;const px=Math.floor((x-city.x)*256/city.width),py=Math.floor((y-city.y)*256/city.height);if(px>=0&&px<256&&py>=0&&py<256&&alpha[(py*256+px)*4+3]>32)arcGap=-100;for(const [ex,ey]of edges)arcGap=Math.min(arcGap,Math.hypot(x-ex,y-ey)-stroke/2);}
          return {arcGap,buttons:buttons.map(b=>{const r=rect(b),l=rect(b.querySelector('.wheel-action-name'));return {...r,gap:distance(r,city),label:l.width<=r.width&&l.x>=r.x&&l.right<=r.right&&l.bottom<=r.bottom,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===b};}),separation:Math.min(...buttons.flatMap((b,i)=>buttons.slice(i+1).map(o=>distance(rect(b),rect(o))))) };
        });
        for(const b of m.buttons){assert(Math.abs(b.width-(height<=500?44:56))<.1);assert(b.gap>=(height<=500?3.9:5.9));assert(b.label&&b.hit,JSON.stringify({width,level,set:set.id,zoom,b}));assert(b.x>=0&&b.y>=0&&b.right<=width&&b.bottom<=height);}
        assert(m.separation>=1.9);assert(m.arcGap>=(height<=500?3.7:5.7),JSON.stringify({set:set.id,level,zoom,arcGap:m.arcGap}));
        results.push({width,height,set:set.id,level,zoom,arcGap:m.arcGap});
        if(set.id==='default'&&level===100&&zoom===1)await page.screenshot({path:path.join(out,`castle-${width}.png`)});
      }
      for(const kind of ['own','enemy','ally'])for(const state of ['normal','scouting','shielded']){
        await page.evaluate(o=>layoutTest.set(o),{asset:'/'+sets[0].assets[5],level:100,zoom:1,kind,state});
        const selectors=kind==='own'?['level','send','info','scout-nearby','regroup']:kind==='enemy'?['scout','attack','info','report']:['attack','info'];
        for(const slot of selectors){const button=page.locator('.continuous-castle-wheel .wheel-'+slot);if(await button.isDisabled())continue;const count=await page.evaluate(()=>layoutTest.calls.length);if(height<=500)await button.tap();else await button.click();assert.equal(await page.evaluate(()=>layoutTest.calls.length),count+1,'Original handler must execute once');assert.equal(await page.evaluate(()=>layoutTest.calls.at(-1)[1]),'exact-city');}
      }
    }
    // Stationary camera/panning must not repeatedly relayout or decode artwork.
    const stable=await page.evaluate(async()=>{const wheel=document.querySelector('.continuous-castle-wheel');let changes=0;const observer=new MutationObserver(r=>changes+=r.filter(m=>m.target!==wheel||m.attributeName!=="style").length);observer.observe(wheel,{subtree:true,childList:true,attributes:true});const start=performance.now();for(let i=0;i<500;i++)layoutTest.frame();const ms=performance.now()-start;await Promise.resolve();observer.disconnect();return {changes,ms};});
    // Anchor style writes are expected; no geometry/subtree writes occur.
    assert.equal(stable.changes,0,JSON.stringify(stable));
    // Obsolete asset requests cannot modify a newer selected castle.
    await page.evaluate(asset=>{const node=document.querySelector('.continuous-castle-wheel');window.late=createContinuousCastleActions(()=>window.lateReady=(window.lateReady||0)+1);late.position(node,{asset:asset+'?delayed',width:56,height:56},1,{height:900});late.dispose();},'/'+sets[0].assets[5]);
    for(let i=0;i<50&&!releaseImage;i++)await page.waitForTimeout(10);assert(releaseImage);releaseImage();await page.waitForTimeout(75);assert.equal(await page.evaluate(()=>window.lateReady||0),0);
    await page.evaluate(asset=>{const node=document.querySelector('.continuous-castle-wheel');window.failed=createContinuousCastleActions(()=>{});failed.position(node,{asset:asset+'?failed',width:56,height:56},1,{height:900});},'/'+sets[0].assets[5]);
    await page.waitForTimeout(100);assert(await page.locator('.continuous-castle-wheel .wheel-info').isEnabled());
    await page.evaluate(()=>{failed.dispose();layoutTest.dispose();});
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    fs.writeFileSync(path.join(out,'layout-report.json'),JSON.stringify({cases:results.length,stable,results},null,2));
    console.log(`Castle layout passed ${results.length} stage/skin/zoom/viewport cases, native button handlers, delayed/failing assets and cached layout (${stable.ms.toFixed(1)} ms for 500 frames).`);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
