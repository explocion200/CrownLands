"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path"),sharp=require("sharp");
const {chromium}=require("playwright");
const {catalog,fixture}=require("../local-backend/world/catalog");
const cosmetics=require("../functions/cosmetics");
const {placeLabels}=require("../world/model");
const game=fs.readFileSync("game.js","utf8"),context={window:{},document:{}};
vm.createContext(context);
vm.runInContext(game.slice(game.indexOf("function getCastleStage("),game.indexOf("function getCastleAsset(")),context);
vm.runInContext(fs.readFileSync("world/appearance.js","utf8"),context);
const geometry=context.window.SeamlessAppearance.geometry,levels=[1,25,50,75,100],scales=[.6,.7,.8,.9,1];
const sets=[{id:"default",name:"Default cities",assets:catalog.mapPresentation.cityStageAssets},...cosmetics.ITEMS.filter(x=>x.category==="city")];
(async()=>{
  for(const level of [1,24,25,49,50,74,75,99,100,125]){
    const stage=context.getCastleStage(level),raw=Object.freeze({key:"section:city",kind:"castle",level,x:420,y:360,width:56,height:56,left:392,top:332,ownerUid:"sample",gamePosition:{x:8,y:9}});
    const a=geometry(raw),b=geometry(raw);assert.deepEqual(a,b,"Repeated packets must not progressively shrink cities");
    assert.equal(a.width,56*scales[stage-1]);assert.equal(a.height,a.width);
    assert.equal(a.left+a.width/2,raw.x);assert.equal(a.top+a.height/2,raw.y);
    assert.equal(a.gamePosition,raw.gamePosition);assert.equal(a.key,raw.key);assert.equal(a.ownerUid,raw.ownerUid);
    if(stage===5)assert.deepEqual({...a},{...raw},"Level 100+ maximum changed");
  }
  for(const kind of ["scenery","stronghold","camp","citadel","npc","troop"]){const o={kind,level:1,width:100,height:80};assert.equal(geometry(o),o);}
  const sites=fixture.objects.filter(o=>o.kind!=="scenery").map(geometry);
  const labels=sites.map(o=>({key:o.key,x:o.x,y:o.top-4,width:o.kind==="castle"?110:140,height:o.kind==="castle"?70:40,compact:{width:o.kind==="castle"?64:105,height:o.kind==="castle"?56:40}}));
  const placed=placeLabels(labels);assert(placed.every(p=>!p.hidden));
  for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++){const a=placed[i].rect,b=placed[j].rect;assert(!(a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top));}
  const rows=[];
  for(const set of sets){const cells=[];let previous={width:0,height:0};
    for(let i=0;i<levels.length;i++){
      const asset=set.assets[i+1],{data,info}=await sharp(asset).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      let left=info.width,top=info.height,right=0,bottom=0;
      for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>=16){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
      const size=geometry({kind:"castle",level:levels[i],x:0,y:0,width:56,height:56});
      const visible={width:(right-left+1)/info.width*size.width,height:(bottom-top+1)/info.height*size.height};
      assert(visible.width>previous.width&&visible.height>previous.height,`${set.id}: visible artwork does not grow at stage ${i+1}`);previous=visible;
      cells.push({level:levels[i],scale:scales[i],size:size.width,visible,asset,url:'data:image/webp;base64,'+fs.readFileSync(asset).toString('base64')});
    }rows.push({name:set.name||set.id,cells});
  }
  const out=path.resolve("release-artifacts/city-stage-sizes");fs.mkdirSync(out,{recursive:true});
  const html=`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#e8d9ae;color:#312614;font:18px Georgia,serif}header{padding:24px 28px;background:#71343c;color:#fff2d5}h1{margin:0 0 6px;font-size:29px}header p{margin:0}section{padding:16px 22px;border-bottom:1px solid #ad9464}h2{margin:0 0 10px;font-size:21px}.stages{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.city{display:flex;justify-content:center;align-items:flex-end;height:182px;background:#aaa566;border-bottom:2px solid #857c45}.city img{object-fit:contain;max-width:none;display:block}h3,p{text-align:center;margin:6px 0;font-size:17px}small{font:14px sans-serif}footer{padding:16px 28px;font:15px sans-serif}@media(max-width:850px){header{padding:12px}h1{font-size:23px}section{padding:10px}.stages{gap:5px}.city{height:76px}.city img{width:calc(var(--size)*1.3px)!important;height:calc(var(--size)*1.3px)!important}h3,p{font-size:14px}h2{font-size:18px}}</style></head><body><header><h1>Crownlands · City growth</h1><p>Five artwork stages · Level 100 keeps its current maximum size</p></header>${rows.map(row=>`<section><h2>${row.name}</h2><div class="stages">${row.cells.map((c,i)=>`<article><div class="city"><img src="${c.url}" style="--size:${c.size};width:${c.size*3}px;height:${c.size*3}px" alt="${row.name} level ${c.level}"></div><h3>Level ${c.level}${i===4?'+':'–'+(levels[i+1]-1)}</h3><p>${Math.round(c.scale*100)}% size</p></article>`).join('')}</div></section>`).join('')}<footer>Existing artwork • Equal 10-percentage-point size steps • Castle centers and gameplay unchanged</footer></body></html>`;
  fs.writeFileSync(path.join(out,"preview.html"),html);
  let browser;try{browser=await chromium.launch({executablePath:process.env.CHROME_PATH||"/usr/bin/google-chrome",headless:true,args:["--no-sandbox"]});
    const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    for(const [width,height]of [[1100,900],[844,390],[568,320]]){await page.setViewportSize({width,height});await page.setContent(html);await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
      const boxes=await page.locator('.stages').first().locator('img').evaluateAll(imgs=>imgs.map(i=>i.getBoundingClientRect().width));
      for(let i=1;i<boxes.length;i++)assert(Math.abs((boxes[i]-boxes[i-1])-(boxes[1]-boxes[0]))<.1);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:path.join(out,`all-skins-${width}.png`),fullPage:true});
      if(width===1100){const bottom=await page.locator('section').first().evaluate(n=>n.getBoundingClientRect().bottom);await page.screenshot({path:path.join(out,'default-stages.png'),clip:{x:0,y:0,width,height:Math.ceil(bottom)}});}
    }assert.deepEqual(errors,[]);
  }finally{await browser?.close();}
  fs.writeFileSync(path.join(out,"art-sizes.json"),JSON.stringify(rows.map(r=>({...r,cells:r.cells.map(({url,...c})=>c)})),null,2));
  console.log(`City stages passed: 10 threshold levels, ${sets.length} skins / 30 growing paintings, ${sites.length} collision-free labels, desktop and two landscape sizes. Preview: ${out}/default-stages.png`);
})().catch(e=>{console.error(e);process.exitCode=1;});
