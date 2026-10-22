"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
const {createGameplayPilot}=require("./map-benchmark/seamless/gameplay-pilot");
const {createAuthenticatedNativeHarness}=require("./map-benchmark/seamless/native-auth-harness");
(async()=>{
 const pilot=await createGameplayPilot({productionRouting:true}),output=path.resolve("release-artifacts/city-shields");fs.mkdirSync(output,{recursive:true});
 let world,harness,browser;const pages=[],errors=[],outside=[];
 try{
  const deployment=require("./map-benchmark/seamless/production-test-policy").productionTestPolicy(pilot.store);
  world=require("../local-backend/world/service").createWorldService({store:pilot.store,readPool:pilot.reader.pool,deployment,directory:path.join(output,"terrain"),enabled:true});
  await world.prepare(pilot.players[0].uid);
  harness=await createAuthenticatedNativeHarness(pilot,{productionWorld:world});
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||"/usr/bin/google-chrome",headless:true,args:["--no-sandbox"]});
  for(let i=0;i<2;i++){
   const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:"block"});
   await context.addInitScript(()=>Object.defineProperty(window,"nativeContinuousWorld",{get:()=>window.CrownlandsContinuousWorld}));
   await context.addCookies(harness.cookies(i));
   await context.route("**/*",async route=>{const request=route.request();if(!request.url().startsWith("https://playcrownlands.com/"))outside.push(request.url());
    try{await route.fulfill(await harness.request(request.url(),request.method(),await request.allHeaders(),request.postDataBuffer()));}catch(error){errors.push(error.message);await route.abort();}});
   const page=await context.newPage();pages.push(page);page.on("pageerror",error=>errors.push(error.message));await page.goto(harness.url);
   await page.getByRole("button",{name:"Keep analytics off"}).click();await page.waitForFunction(()=>!document.getElementById("enterKingdomBtn")?.disabled);
   await page.locator("#enterKingdomBtn").click();await page.waitForFunction(()=>!!window.nativeContinuousWorld&&!isMapInteractionBlocked(),null,{timeout:90000});
  }
  await require("./check-continuous-city-shields")(pages,pilot,pilot.pair[0],output,harness);
  assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
  await harness.auth.signOut(harness.sessions[0].token);
  await pages[0].waitForFunction(()=>!window.nativeContinuousWorld||nativeContinuousWorld.view.snapshot().feed.authExpired);
  fs.writeFileSync(path.join(output,"result.json"),JSON.stringify({passed:true,viewers:2,errors,outside},null,2));
 }catch(error){for(const [i,page]of pages.entries())await page.screenshot({path:path.join(output,`failure-${i}.png`)}).catch(()=>{});throw error;}
 finally{await browser?.close();await harness?.close();await world?.close();await pilot.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
