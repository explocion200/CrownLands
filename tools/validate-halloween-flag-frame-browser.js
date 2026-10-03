"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function setup() {
  modal.close(); closeProfileScreen(); setAnimationModePreference("full");
  getCurrentOnlineUid = () => "frame-owner"; cosmeticUid = getCurrentOnlineUid();
  cosmeticState = COSMETIC_CATALOG.normalize({ crowns: 1000 });
  cosmeticOffset = Date.UTC(2026, 9, 15) - Date.now();
  getOnlineApi = () => ({
    getUser: () => ({ uid: cosmeticUid }), getCosmeticsState: async () => ({ state: cosmeticState }),
    equipCosmetic: async request => ({ state: COSMETIC_CATALOG.equip(cosmeticState, request.category, request.itemId) }),
    purchaseCosmetic: async request => COSMETIC_CATALOG.purchase(cosmeticState, request, Date.UTC(2026, 9, 15)),
  });
  const ids = new Set([...cityLayer.querySelectorAll(".city-node")].map(n => n.dataset.cityId));
  const cities = state.cities.filter(c => !isStronghold(c) && ids.has(c.id)).slice(0, 12);
  if (cities.length < 10) throw Error("Need ten visible cities");
  cities.forEach((city, i) => Object.assign(city, { owner: i < 6 ? "player" : "enemy", ownerUid: i < 6 ? cosmeticUid : "frame-rival", ownerName: "Frame Rival", ownerKind: "player", ownerFlag: state.flag, level: [1,25,50,75,100,125][i%6] }));
  cosmeticOwnerAppearances.set("frame-rival", { border: "halloween_border" });
  selectedSourceId = null; selectedTargetId = null; sendMode = false; renderCities(true);
  window.__frameQA = { cities, node: city => cityLayer.querySelector('[data-city-id="' + city.id + '"]') };
}
async function checks() {
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const C = COSMETIC_CATALOG, qa = __frameQA, own = qa.cities[0], rival = qa.cities[6];
  const node = qa.node(own), center = node.querySelector(".city-owner-column"), flag = center.querySelector(".city-owner-flag");
  const initial = { width: center.getBoundingClientRect().width, height: center.getBoundingClientRect().height, flag: flag.innerHTML, text: node.textContent, color: getComputedStyle(center).backgroundColor, label: node.getAttribute("aria-label") };
  check(!node.querySelector(".city-flag-frame"), "Default must not allocate decoration");
  cosmeticCategory = "border"; cosmeticSelected = "halloween_border"; openSkinShop();
  cosmeticConfirmation = C.quote("halloween_border", cosmeticState, cosmeticNow()); await submitCosmeticPurchase();
  check(cosmeticState.crowns === 800 && cosmeticState.owned.halloween_border, "Border costs 200 Crowns");
  check(!cosmeticState.equipped.border, "Purchase must not equip");
  cosmeticCategory = "border"; cosmeticSelected = "halloween_border"; openMySkins();
  check(!cosmeticState.equipped.border, "Selection must not equip");
  await equipSelectedCosmetic(); closeProfileScreen(); modal.close();
  check(await CrownlandsCityFlagSkins.ready() === "ready", "Production frame must decode");
  const wrapper = node.querySelector(".city-flag-frame"), decorated = node.querySelector(".city-owner-column");
  check(wrapper && decorated === center && decorated.querySelector(".city-owner-flag") === flag, "Apply must preserve live marker and heraldry nodes");
  check(center.getBoundingClientRect().width === initial.width && center.getBoundingClientRect().height === initial.height, "Owned marker dimensions changed");
  check(flag.innerHTML === initial.flag && node.textContent === initial.text && node.getAttribute("aria-label") === initial.label, "Heraldry, city level, troops and accessibility must survive Apply");
  check(getComputedStyle(center).backgroundColor === initial.color, "Frame must not recolor the center");
  check(qa.cities.every(city => qa.node(city)?.querySelector(".city-flag-frame")), "All owned/remote cities must receive the owner's frame");
  // Check the real, downscaled artwork against both original marker geometries.
  for (const city of [own, rival]) {
    const n=qa.node(city), shape=n.querySelector(".city-owner-column,.foreign-city-shield"), image=n.querySelector(".flag-frame-art");
    await image.decode();
    const canvas=document.createElement("canvas"); canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const ctx=canvas.getContext("2d");ctx.drawImage(image,0,0);
    check(ctx.getImageData(0,0,1,1).data[3]===0 && ctx.getImageData(160,160,1,1).data[3]===0,"Frame exterior and center must remain transparent");
    const box=shape.getBoundingClientRect(), frame=image.getBoundingClientRect(), shoulder=city.owner==="player"?.84:.82;
    for(const fraction of [.757,.786,.8]) {
      const row=Math.floor(canvas.height*fraction),pixels=ctx.getImageData(0,row,canvas.width,1).data;
      for(const direction of [-1,1]) {
        let column=160; while(column>0&&column<319&&pixels[column*4+3]<128)column+=direction;
        column-=direction;
        const x=(frame.left-box.left+column*frame.width/canvas.width)/box.width;
        const y=(frame.top-box.top+row*frame.height/canvas.height)/box.height;
        const inset=y<=shoulder?0:.5*(y-shoulder)/(1-shoulder);
        check(y<=1&&x>=inset-.012&&x<=1-inset+.012,"Painted bottom must cover the marker without a transparent V gap");
      }
    }
  }
  const observer = new MutationObserver(() => {}); observer.observe(wrapper, { attributes:true, childList:true, subtree:true });
  for (let i=0;i<30;i++) applyCosmeticCityNode(node,own);
  check(observer.takeRecords().length === 0, "Unchanged updates must not rebuild or mutate the frame"); observer.disconnect();
  const rivalNode = qa.node(rival), foreignCenter = rivalNode.querySelector(".foreign-city-shield");
  const originalClasses = rivalNode.className, originalFlag = foreignCenter.querySelector(".city-owner-flag").innerHTML;
  const colors = {};
  for (const [key, cls] of Object.entries({ protected:"enemy enemy-power-protected", inRange:"enemy enemy-power-in-range", strong:"enemy enemy-power-overpowering", unknown:"enemy enemy-power-unknown", clan:"enemy clan-ally", neutral:"neutral",  })) {
    // Exercise actual palette selectors with the same independent marker nodes.
    rivalNode.className = "city-node " + cls;
    colors[key] = getComputedStyle(foreignCenter).backgroundColor;
    check(foreignCenter.querySelector(".city-owner-flag").innerHTML === originalFlag, "Strength must not rewrite heraldry");
  }
  check(new Set([colors.protected,colors.inRange,colors.strong,colors.unknown,colors.clan,colors.neutral]).size === 6, "Strength/relationship colors must remain distinct");
  const ownClasses=node.className;
  node.classList.add("main-city-node"); colors.main=getComputedStyle(center).backgroundColor;
  node.classList.remove("main-city-node"); colors.owned=getComputedStyle(center).backgroundColor;
  check(colors.main!==colors.owned && colors.owned!=="rgba(0, 0, 0, 0)","Owned and main-city fills remain distinct");
  node.className=ownClasses;
  rivalNode.className = originalClasses;
  selectedTargetId = rival.id; renderCities(true);
  check(qa.node(rival).querySelector(".city-flag-frame-selected .foreign-selected-crest .city-owner-flag"), "Expanded city must retain its framed heraldry");
  check(qa.node(rival).querySelector(".foreign-selected-level").textContent === String(rival.level), "Expanded city level must stay readable");
  check(qa.node(rival).querySelector(".foreign-selected-data .foreign-garrison"), "Expanded troop intelligence must remain");
  selectedTargetId = null; renderCities(true);
  cosmeticOwnerAppearances.set("frame-rival", { border:"" }); renderCities(true);
  check(!qa.node(rival).querySelector(".city-flag-frame"), "Remote Default must remove frame");
  applyCosmeticCityNode(node, {...own, owner:"enemy", ownerUid:"captor-with-default"});
  check(!node.querySelector(".city-flag-frame"), "Captured city must adopt current owner's appearance");
  applyCosmeticCityNode(node, own);
  const stronghold = document.createElement("button"); stronghold.innerHTML = '<span class="foreign-city-shield"><span class="city-owner-flag"></span></span>';
  applyCosmeticCityNode(stronghold, {...own, kind:"stronghold"});
  check(!stronghold.querySelector(".city-flag-frame"), "Strongholds must not receive frames");
  cosmeticCategory = "border"; cosmeticSelected = "halloween_border"; openMySkins();
  document.querySelector('[data-skin-select="default_border"]').click(); await equipSelectedCosmetic();
  check(!cosmeticState.equipped.border && !node.querySelector(".city-flag-frame"), "Default Apply restores original marker");
  cosmeticSelected = "halloween_border"; await equipSelectedCosmetic(); closeProfileScreen(); modal.close();
  cosmeticOwnerAppearances.set("frame-rival", {border:"halloween_border"}); renderCities(true);
  return { purchaseApplyDefault:true, allOwners:true, selectedLayout:true, colors, capture:true, stronghold:true, stableNodes:true };
}
async function scene() {
  document.documentElement.dataset.animationMode = "full";
  cosmeticUid = "frame-stress";
  const host = document.getElementById("cityLayer"); host.className = "map-frame";
  host.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;background:#aaa563;overflow:hidden";
  window.frameNodes = Array.from({length:120}, (_,i) => {
    const n=document.createElement("button"); n.className="city-node enemy enemy-power-in-range";
    n.style.cssText="position:absolute;left:"+((i%10+.5)*innerWidth/10+(i>=80?innerWidth*2:0))+"px;top:"+((Math.floor(i/10)%8+.7)*innerHeight/8)+"px";
    n.innerHTML='<span class="city-castle stage-5"><img class="city-art" alt=""></span><span class="foreign-city-label"><span class="foreign-city-shield"><span class="city-owner-flag kingdom-flag"><span class="flag-symbol"></span></span><span class="city-label-level">50</span></span></span>';
    host.append(n); return n;
  });
  window.setFrameScene = variant => {
    const city = variant === "combined" || variant === "city", border = variant === "frame" || variant === "combined";
    cosmeticState=COSMETIC_CATALOG.normalize({owned:{halloween_border:true,halloween_city:true},equipped:{city:city?"halloween_city":"",border:border?"halloween_border":""}});
    frameNodes.forEach((n,i)=>applyCosmeticCityNode(n,{id:"stress-"+i,owner:"player",ownerUid:cosmeticUid,level:100}));
  };
  setFrameScene("default");
}
async function main() {
  const root=path.resolve(__dirname,".."), out=path.join(root,"release-artifacts/halloween-flag-frame"); fs.mkdirSync(out,{recursive:true});
  const server=createMapBenchmarkServer(),address=await server.listen(); let session,client; const errors=[],results=[],requests=[];
  try {
    const browser=[process.env.CHROME_PATH,"C:/Program Files/Google/Chrome/Application/chrome.exe","/usr/bin/google-chrome","/usr/bin/chromium"].find(p=>p&&fs.existsSync(p));
    session=await startBrowserSession(browser); client=await CdpClient.connect(session.targets.find(t=>t.type==="page").webSocketDebuggerUrl);
    await Promise.all(["Runtime.enable","Page.enable","Network.enable","Performance.enable"].map(m=>client.send(m)));
    client.on("Runtime.exceptionThrown",e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
    client.on("Network.requestWillBeSent",e=>{if(e.request.url.includes("halloween-flag-frame-320"))requests.push(e.request.url)});
    const evaluate=async expression=>{const r=await client.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
    const metrics=async()=>Object.fromEntries((await client.send("Performance.getMetrics")).metrics.map(m=>[m.name,m.value]));
    const screenshot=async name=>{const r=await client.send("Page.captureScreenshot",{format:"png"});fs.writeFileSync(path.join(out,name+".png"),Buffer.from(r.data,"base64"))};
    for(const [width,height] of [[1440,900],[844,390]]) {
      await client.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:false});
      await client.send("Page.navigate",{url:address.url+"/__benchmark__/?scenario=A&visualMarches=0"});
      for(let i=0;i<400&&!await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status==='ready'");i++)await delay(100);
      assert.equal(await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status"),"ready");
      assert.equal(await evaluate("document.querySelectorAll('.flag-frame-art').length"),0,"Art must load only when used");
      await evaluate("("+setup.toString()+")()"); const behavior=await evaluate("("+checks.toString()+")()"); await delay(350);
      await evaluate("setZoomAroundPoint(1.4,innerWidth/2,innerHeight/2);centerOnCity(__frameQA.cities[6].id);renderCities(true)");await delay(350);await screenshot("map-"+width);
      await evaluate("selectedTargetId=__frameQA.cities[6].id;renderCities(true)"); await screenshot("selected-"+width);
      await evaluate("cosmeticCategory='border';cosmeticSelected='halloween_border';openMySkins()");await delay(350);
      assert.equal(await evaluate("document.querySelector('.skins-grid').getAnimations({subtree:true}).filter(a=>a.playState==='running').length"),0,"Cards stay static");
      assert.equal(await evaluate("cityLayer.getAnimations({subtree:true}).filter(a=>a.animationName.startsWith('cityFlag')&&a.playState==='running').length"),0,"Covered map stops");
      assert.equal(await evaluate("document.querySelector('.skin-detail').getAnimations({subtree:true}).filter(a=>a.playState==='running').length"),5,"Only selected preview animates");
      assert(await evaluate("[...document.querySelectorAll('[data-border-heraldry]')].every(n=>n.querySelector('svg'))"),"Preview uses actual heraldry renderer");
      await screenshot("profile-"+width); results.push({width,height,behavior});
    }
    assert(requests.length<=2,"Frame must load once per document, not once per city");
    const artRequests=requests.length;
    const styles=[...fs.readFileSync(path.join(root,"index.html"),"utf8").matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m=>m[1]).filter(h=>!h.startsWith("http"));
    const html='<!doctype html><html><head><base href="'+address.url+'/">'+styles.map(h=>'<link rel="stylesheet" href="'+h+'">').join("")+'</head><body><div id="profileScreen"></div><dialog id="modal"></dialog><div id="skinsView"></div><div id="cityLayer"></div><script>function isStronghold(){return false}function getCastleStage(){return 5}function getCastleAsset(){return CrownlandsCosmetics.item("halloween_city").assets[5]}</script>'+["functions/cosmetics.js","city-flag-skins.js","skins-ui.js"].map(f=>"<script>"+fs.readFileSync(path.join(root,f),"utf8")+"</script>").join("")+"</body></html>";
    const samples=[];
    for(const [width,height] of [[1440,900],[844,390]]) {
      await client.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:false});
      await client.send("Page.navigate",{url:address.url+"/__frame_stress__"});await delay(150);
      const {frameTree}=await client.send("Page.getFrameTree");await client.send("Page.setDocumentContent",{frameId:frameTree.frame.id,html});
      for(let i=0;i<100&&!await evaluate("typeof createCosmeticMotion==='function'");i++)await delay(100);
      await evaluate("("+scene.toString()+")()");
      for(const rate of [1,4]) for(const variant of ["default","city","frame","combined"]) {
        await evaluate("setFrameScene('default');setFrameScene("+JSON.stringify(variant)+")"); if(variant!=="default")await evaluate("CrownlandsCityFlagSkins.ready()");await delay(350);
        await client.send("Emulation.setCPUThrottlingRate",{rate}); const before=await metrics();
        const times=await evaluate("new Promise(resolve=>{const times=[];let start=performance.now(),last=start;function tick(now){times.push(now-last);last=now;if(now-start<2000)requestAnimationFrame(tick);else resolve(times.slice(1).sort((a,b)=>a-b))}requestAnimationFrame(tick)})");
        const after=await metrics(); assert((after.LayoutDuration-before.LayoutDuration)*1000<1,"Steady decoration must not trigger layout work");
        const active=await evaluate("cityLayer.getAnimations({subtree:true}).filter(a=>a.playState==='running').length");
        const slots=width<=1000?6:8; assert(active<=slots*6,"Frame and city bats must share the existing map budget");
        const activeFrames=await evaluate("[...cityLayer.querySelectorAll('.flag-frame-decoration')].filter(n=>n.getAnimations({subtree:true}).some(a=>a.playState==='running')).length");
        assert(activeFrames<=(width<=1000?2:3),"Frame-specific motion stays capped"); if(variant!=="default")assert(active>0);
        assert.equal(await evaluate("frameNodes.slice(80).flatMap(n=>n.getAnimations({subtree:true})).filter(a=>a.playState==='running').length"),0,"Offscreen frames must not animate");
        samples.push({width,height,variant,cpuThrottle:rate,cities:120,visible:80,activeFrames,activeAnimations:active,frameP95Ms:times[Math.floor(times.length*.95)],taskMs:(after.TaskDuration-before.TaskDuration)*1000,styleMs:(after.RecalcStyleDuration-before.RecalcStyleDuration)*1000,layoutMs:(after.LayoutDuration-before.LayoutDuration)*1000});
        await client.send("Emulation.setCPUThrottlingRate",{rate:1});
      }
      const running="cityLayer.getAnimations({subtree:true}).filter(a=>a.playState==='running').length";
      for(const cls of ["camera-moving","zooming","low-zoom","crowded-map"]){await evaluate("cityLayer.classList.add('"+cls+"')");await delay(100);assert.equal(await evaluate(running),0,cls+" must stop motion");await evaluate("cityLayer.classList.remove('"+cls+"')")}
      for(const mode of ["off","reduced"]){await evaluate("document.documentElement.dataset.animationMode='"+mode+"'");await delay(100);assert.equal(await evaluate(running),0)}
      await evaluate("delete document.documentElement.dataset.animationMode");
      await client.send("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});await delay(100);assert.equal(await evaluate(running),0);
      await client.send("Emulation.setEmulatedMedia",{features:[]});await evaluate("document.documentElement.dataset.animationMode='full'");
      for(const action of ["profileScreen.classList.add('open')","profileScreen.classList.remove('open');modal.showModal()"]){await evaluate(action);await delay(150);assert.equal(await evaluate(running),0)}
      await evaluate("modal.close();Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))");assert.equal(await evaluate(running),0);
      await evaluate("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));frameNodes.forEach((n,i)=>n.style.left=(i<80?-innerWidth*2:(i%10+.5)*innerWidth/10)+'px')");await delay(300);
      assert.equal(await evaluate("frameNodes.slice(0,80).flatMap(n=>n.getAnimations({subtree:true})).filter(a=>a.playState==='running').length"),0);
      assert(await evaluate(running)>0,"Newly visible frames should receive freed slots");
      await evaluate("window.recycled=frameNodes[100];recycled.remove();");await delay(150);await evaluate("cityLayer.append(recycled);setFrameScene('frame')");await delay(200);
      assert(await evaluate(running)>0,"Recycled nodes should be observed");
    }
    await client.send("Network.setCacheDisabled",{cacheDisabled:true});await client.send("Network.setBlockedURLs",{urls:["*halloween-flag-frame-320*"]});
    await client.send("Page.navigate",{url:address.url+"/__benchmark__/?scenario=A&visualMarches=0"});
    for(let i=0;i<400&&!await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status==='ready'");i++)await delay(100);
    await evaluate("("+setup.toString()+")()");
    assert(await evaluate("(async()=>{cosmeticState=COSMETIC_CATALOG.normalize({owned:{halloween_border:true},equipped:{border:'halloween_border'}});renderCities(true);await CrownlandsCityFlagSkins.ready();const n=__frameQA.node(__frameQA.cities[0]);return document.documentElement.dataset.flagFrameArt==='failed'&&getComputedStyle(n.querySelector('.flag-frame-decoration')).display==='none'&&!!n.querySelector('.city-owner-flag')&&!!n.querySelector('.city-label-level')&&cosmeticState.owned.halloween_border&&cosmeticState.equipped.border==='halloween_border'})()"),"Missing art must preserve marker information and ownership");
    assert.deepEqual(errors,[]);
    const report={results,samples,artRequests,missingArtFallback:true,errors};fs.writeFileSync(path.join(out,"validation.json"),JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report));
  } finally {
    if(client){await client.send("Browser.close").catch(()=>{});client.close()}
    if(session){await waitForProcessExit(session.browserProcess);await removeBrowserProfile(session.profilePath)}
    await server.close();
  }
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1});
