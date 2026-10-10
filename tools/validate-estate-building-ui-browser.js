"use strict";
// Disposable loopback data: verifies the folio layout without a player account.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {createServer}=require("./estate-building-ui-preview");
const {CdpClient}=require("./map-benchmark/cdp-client");
const {startBrowserSession,waitForProcessExit,removeBrowserProfile}=require("./validate-focused-browser-smoke");
const root=path.resolve(__dirname,"..");
// Use the repository's dependency-free Chromium harness on Windows and CI.
function pageDriver(client){
  const evaluate=async(fn,arg)=>{const r=await client.send("Runtime.evaluate",{expression:"("+fn+")("+JSON.stringify(arg)+")",awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const waitForFunction=async(fn,arg)=>{for(let i=0;i<300;i++){if(await evaluate(fn,arg))return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error("Timeout: "+fn);};
  const key=async name=>{const code={Tab:9,Escape:27}[name];assert(code,"Unsupported key");for(const type of ["rawKeyDown","keyUp"])await client.send("Input.dispatchKeyEvent",{type,key:name,code:name,windowsVirtualKeyCode:code});};
  const locator=selector=>({
    first:()=>locator(selector),count:()=>evaluate(s=>document.querySelectorAll(s).length,selector),
    waitFor:()=>waitForFunction(s=>!!document.querySelector(s),selector),
    textContent:()=>evaluate(s=>document.querySelector(s).textContent,selector),
    inputValue:()=>evaluate(s=>document.querySelector(s).value,selector),
    getAttribute:name=>evaluate(p=>document.querySelector(p.selector).getAttribute(p.name),{selector,name}),
    evaluate:fn=>evaluate("s=>("+fn+")(document.querySelector(s))",selector),
    isDisabled:()=>evaluate(s=>document.querySelector(s).disabled,selector),
    isEnabled:()=>evaluate(s=>!document.querySelector(s).disabled,selector),
    isVisible:()=>evaluate(s=>!!document.querySelector(s)?.checkVisibility(),selector),
    fill:async value=>evaluate(p=>{const el=document.querySelector(p.selector);el.focus();el.value=p.value;el.dispatchEvent(new Event('input',{bubbles:true}));}, {selector,value}),
    press:async name=>{await evaluate(s=>document.querySelector(s).focus(),selector);await key(name);},
    click:async()=>{await evaluate(s=>document.querySelector(s).scrollIntoView({block:'nearest'}),selector);const r=await evaluate(s=>document.querySelector(s).getBoundingClientRect().toJSON(),selector);assert(r.width&&r.height,selector+" hidden");assert(await evaluate(p=>document.querySelector(p.selector).contains(document.elementFromPoint(p.x,p.y)),{selector,x:r.x+r.width/2,y:r.y+r.height/2}),selector+" covered");for(const type of ['mousePressed','mouseReleased'])await client.send('Input.dispatchMouseEvent',{type,x:r.x+r.width/2,y:r.y+r.height/2,button:'left',clickCount:1});}
  });
  return {evaluate,locator,waitForFunction,keyboard:{press:key},
    goto:async url=>{const navigation=await client.send('Page.navigate',{url});assert(!navigation.errorText,navigation.errorText);await waitForFunction(s=>location.href===s&&document.readyState==='complete',url);},
    setViewportSize:({width,height})=>client.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false}),
    emulateMedia:({reducedMotion})=>client.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reducedMotion}]}),
    screenshot:async({path:file})=>{const r=await client.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(file,Buffer.from(r.data,'base64'));}
  };
}
async function main(built=false){
  const output=path.join(root,"release-artifacts/estate-building-ui",built?"built":"source");
  const executable=[process.env.CHROME_PATH,"C:/Program Files/Google/Chrome/Application/chrome.exe","/usr/bin/google-chrome","/usr/bin/chromium"].find(p=>p&&fs.existsSync(p));
  assert(executable,"Chromium required");fs.mkdirSync(output,{recursive:true});
  const server=createServer({built});await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const origin="http://127.0.0.1:"+server.address().port;
  let session,client;const errors=[],proof=[];
  try{
    session=await startBrowserSession(executable);
    client=await CdpClient.connect(session.targets.find(t=>t.type==='page').webSocketDebuggerUrl);
    await client.send('Page.enable');await client.send('Runtime.enable');
    client.on('Runtime.exceptionThrown',event=>errors.push(event.exceptionDetails.exception?.description||event.exceptionDetails.text));
    const page=pageDriver(client);
    const action=a=>page.locator('.estate-economy-dialog [data-economy-action="'+a+'"]');
    const open=async(key,profile="ready",view="services")=>{
      await page.goto(origin+"/?"+new URLSearchParams({building:key,profile,view}));
      await page.waitForFunction(()=>document.documentElement.dataset.buildingUiReady==="true"&&document.querySelector('.estate-economy-dialog[open] .estate-economy-content[aria-busy="false"]'));
      if(view==="upgrade"&&!["blocked","working","maximum"].includes(profile))await action("fund").waitFor();
    };
    const layout=async(key)=>{
      const result=await page.evaluate(()=>{
        const d=document.querySelector('.estate-economy-dialog'),r=d.getBoundingClientRect(),content=d.querySelector('.estate-economy-content'),identity=d.querySelector('.estate-building-identity'),workspace=d.querySelector('.estate-economy-workspace');
        const footer=d.querySelector('footer'),f=footer.getBoundingClientRect();
        return{bounds:r.toJSON(),width:innerWidth,height:innerHeight,overflow:content.scrollWidth-content.clientWidth,workspaceOverflow:workspace.scrollWidth-workspace.clientWidth,identity:!!identity,portraitFramed:getComputedStyle(d.querySelector('.estate-building-portrait')).borderTopWidth==="1px",loaded:[...d.querySelectorAll('img')].every(img=>img.complete&&img.naturalWidth>0),footer:f.toJSON(),buttons:[...footer.querySelectorAll('button')].map(b=>{const q=b.getBoundingClientRect();return{height:q.height,inside:q.top>=0&&q.bottom<=innerHeight,covered:!b.contains(document.elementFromPoint(q.x+q.width/2,q.y+q.height/2))};}),title:d.querySelector('h2').textContent};
      });
      assert(result.identity&&result.loaded,key+": illustrated identity survives every size");
      assert(result.portraitFramed,key+": the service illustration keeps its window-only styling");
      assert(result.bounds.x>=0&&result.bounds.y>=0&&result.bounds.right<=result.width&&result.bounds.bottom<=result.height,key+": window fits");
      assert(result.overflow<=1&&result.workspaceOverflow<=1,key+": no horizontal overflow "+JSON.stringify(result));
      assert(result.footer.bottom<=result.height&&result.footer.top>=0,key+": footer fits");
      for(const b of result.buttons)assert(b.height>=44&&b.inside&&!b.covered,key+": persistent action stays usable");
      return result;
    };
    const sites=await (await fetch(origin+"/building-ui-fixture")).json();const keys=Object.keys(sites.estate.levels);
    assert.equal(keys.length,20);
    for(const [width,height]of [[1440,900],[844,390],[568,320]]){
      await page.setViewportSize({width,height});
      await page.goto(origin+"/?view=map");
      await page.waitForFunction(()=>document.documentElement.dataset.buildingUiReady==="true"
        && [...document.querySelectorAll('.estate-site>img')].every(img=>img.complete&&img.naturalWidth>0));
      await page.screenshot({path:path.join(output,"map-"+width+".png")});
      const mapArt=await page.evaluate(()=>CrownlandsEstate.buildings.map(b=>{
        const img=document.querySelector(`[data-estate-site="${b.key}"]>img`),style=getComputedStyle(img);
        return {key:b.key,width:style.width,height:style.height,expectedWidth:b.artSize.width+"px",expectedHeight:b.artSize.height+"px",
          border:style.borderTopWidth,shadow:style.boxShadow,background:style.backgroundImage,minHeight:style.minHeight,
          margins:[style.marginTop,style.marginRight,style.marginBottom,style.marginLeft]};
      }));
      assert.equal(mapArt.length,20);
      for(const art of mapArt){
        assert.equal(art.border,"0px",art.key+": map building must not inherit the window illustration frame");
        assert.equal(art.shadow,"none",art.key+": no window trim on the map");
        assert.equal(art.background,"none",art.key+": map sprites retain transparent backgrounds");
        assert.equal(art.minHeight,"0px",art.key+": no window minimum height on the map");
        assert.deepEqual(art.margins,["0px","0px","0px","0px"],art.key+": no window margins moving the map building");
        assert(Math.abs(parseFloat(art.width)-parseFloat(art.expectedWidth))<.02,art.key+": original map width");
        assert(Math.abs(parseFloat(art.height)-parseFloat(art.expectedHeight))<.02,art.key+": original map height");
      }
      for(const key of keys){
        await open(key);await layout(key);
        assert.equal(await page.locator('.estate-building-rank b').textContent(),key==="great-hall"?"25":"24");
        assert(await page.locator('.estate-building-benefit').count(),key+": current benefit retained");
        if(Object.values(sites.estate.resources).some(r=>r.source===key))assert.equal(await page.locator('.estate-production-details .estate-building-benefit').isVisible(),false,"Gathering/processing benefits stay collapsed");
        assert.equal(await action("fund").count(),0,key+": upgrading stays outside service screen");
      }
      for(const key of ["sawmill","smithy","workshop","windmill"]){
        await open(key);await layout(key);
        // Use the actual numeric control, its identifier is shared with the slider.
        const numeric=page.locator('.estate-production-amount input');
        await numeric.fill("21");await numeric.press("Tab");
        assert.equal(await page.locator('[data-economy-quantity]').inputValue(),"21");
        await action("productionMax").click();
        const max=await numeric.getAttribute("max");assert.equal(await numeric.inputValue(),max);
        assert.equal(await page.locator('[data-economy-quantity]').evaluate(el=>el.style.getPropertyValue('--estate-quantity-progress')),"100%");
        await numeric.fill("7");await numeric.press("Tab");await action("refresh").click();
        await page.waitForFunction(()=>document.querySelector('.estate-economy-content').getAttribute('aria-busy')==='false');
        assert.equal(await numeric.inputValue(),"7","Refresh preserves quantity");
        await action("produce").click();await action("confirm").waitFor();await layout(key);
        assert(await page.locator('footer').textContent().then(text=>text.includes('Order review')));
        await action("cancelReview").click();assert.equal(await numeric.inputValue(),"7","Back preserves the draft");
        if(key==="sawmill")await page.screenshot({path:path.join(output,"production-"+width+".png")});
      }
      for(const [profile,key]of [["ready","smithy"],["missing","quarry"],["unbuilt","mine"],["blocked","treasury"],["working","sawmill"],["maximum","great-hall"]]){
        await open(key,profile,"upgrade");await layout(key);
        if(profile==="missing"){assert(await action("fund").isDisabled());assert((await page.locator('.estate-material-shortage').first().textContent()).includes('Need'));}
        if(profile==="ready")assert(await action("fund").isEnabled());
        if(profile==="unbuilt"){assert.equal(await action("fund").textContent(),"Build Level 1");assert((await page.locator('.estate-building-state').textContent()).includes('Not built'));}
        if(profile==="blocked"){
          assert.equal(await action("fund").count(),0);await action("prerequisite").first().click();await action("prerequisiteBack").waitFor();
          assert((await page.locator('#estateEconomyTitle').textContent()).includes("Great Hall"));await layout("great-hall");
          await action("prerequisiteBack").click();assert((await page.locator('#estateEconomyTitle').textContent()).includes("Treasury"));
        }
        if(["working","maximum"].includes(profile))assert.equal(await action("fund").count(),0,"No second work or level 101");
        if(profile==="ready")await page.screenshot({path:path.join(output,"upgrade-"+width+".png")});
      }
      await open("guild-master");await page.screenshot({path:path.join(output,"guild-"+width+".png")});
      // Escape/close returns to the same estate; no paid action is needed to review.
      const before=await page.evaluate(()=>buildingUiPreview.view.snapshot());
      await page.keyboard.press("Escape");await page.waitForFunction(()=>!document.querySelector('.estate-economy-dialog').open);
      assert.deepEqual(await page.evaluate(()=>buildingUiPreview.view.snapshot()),before);
      proof.push({width,height,sites:20,manualProducers:4,constructionStates:6,mapArtUnframed:true,originalSpriteSizes:true,windowPortraitFramed:true,footerVisible:true,cameraRetained:true});
    }
    await page.setViewportSize({width:1440,height:900});await page.emulateMedia({reducedMotion:"reduce"});await open("sawmill");
    assert.equal(await action("produce").evaluate(el=>getComputedStyle(el).transitionDuration),"0s");
    assert.deepEqual(errors,[],"No browser exceptions");
    fs.writeFileSync(path.join(output,"verification.json"),JSON.stringify({built,proof,errors},null,2)+"\n");
    console.log("Estate building folio passed "+(built?"built":"source")+": 20 unframed map sprites at original sizes, 20 framed service portraits, 4 manual producers, 6 construction states, persistent actions, draft/chain/close, reduced motion at desktop and two landscape sizes.");
  }finally{
    if(client){await client.send('Browser.close').catch(()=>{});client.close();}
    if(session){if(!await waitForProcessExit(session.browserProcess)){session.browserProcess.kill();await waitForProcessExit(session.browserProcess);}await removeBrowserProfile(session.profilePath);}
    await new Promise(resolve=>server.close(resolve));
  }
}
async function validate(){
  if(process.argv.includes("--built"))return main(true);
  await main();
  if(fs.existsSync(path.join(root,"dist/estate-economy-ui.js")))await main(true);
}
validate().catch(error=>{console.error(error);process.exitCode=1;});
