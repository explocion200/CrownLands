"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { chromium } = require("playwright");
const { createMapBenchmarkServer } = require("./map-benchmark/server");

(async () => {
  const server = createMapBenchmarkServer(), address = await server.listen();
  const artifacts = path.resolve(__dirname,"../release-artifacts/castle-action-wheel-draft");
  fs.mkdirSync(artifacts,{recursive:true});
  const browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
  const errors = [], requests = [], records = [];
  try {
    const context = await browser.newContext({hasTouch:true});
    await context.route("**/*", route => {
      const request = route.request();
      if (!request.url().startsWith(address.url+"/") || request.method() !== "GET") {requests.push({url:request.url(),method:request.method()});return route.abort();}
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    page.on("response", response => {if(response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);});
    for (const [width,height,name] of [[1440,900,"desktop"],[844,390,"phone"],[568,320,"small-phone"]]) {
      await page.setViewportSize({width,height});
      for (const kind of ["own","enemy","ally"]) for (const stage of [1,25,50,75,100]) for (const zoom of [1,0.6,0.2]) {
        await page.goto(`${address.url}/docs/visual-qa/castle-action-wheel/scene.html?kind=${kind}&stage=${stage}&zoom=${zoom}`);
        await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
        await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
        const metrics = await page.evaluate(() => {
          const rect = node => {const r=node.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
          const distance = (a,b) => Math.hypot(Math.max(a.x-b.right,b.x-a.right,0),Math.max(a.y-b.bottom,b.y-a.bottom,0));
          const buttons=[...document.querySelectorAll("#actions button")], city=rect(document.getElementById("castle"));
          const arc=document.querySelector("#arc path"), origin=rect(document.getElementById("arc"));
          const arcGap=Math.min(...Array.from({length:181},(_,i)=>{const p=arc.getPointAtLength(arc.getTotalLength()*i/180);return distance({x:origin.x+p.x,right:origin.x+p.x,y:origin.y+p.y,bottom:origin.y+p.y},city)-4;}));
          return {city, arcGap, buttons:buttons.map(button => {
            const r=rect(button), label=rect(button.querySelector(".wheel-action-name"));
            return {...r,clearance:distance(r,city),labelFits:label.x>=r.x && label.right<=r.right && label.y>=r.y && label.bottom<=r.bottom,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest("button")===button};
          }), separation:Math.min(...buttons.flatMap((button,i)=>buttons.slice(i+1).map(other=>distance(rect(button),rect(other)))))};
        });
        for (const button of metrics.buttons) {
          assert(button.width >= 44 && button.height >= 44,"Minimum touch target");
          assert(button.x>=0 && button.y>=0 && button.right<=width && button.bottom<=height,"Buttons must fit the viewport");
          assert(button.clearance >= (height<=500 ? 11.9 : 15.9),"Button must clear castle artwork");
          assert(button.labelFits && button.hit,"Readable label and unobstructed hit target");
        }
        assert(metrics.separation>=5.9,"Buttons must have separate hit regions");
        assert(metrics.arcGap>= (height<=500 ? 11.9 : 15.9),"The painted arc must never touch castle artwork");
        records.push({width,height,kind,stage,zoom,minimumCastleGap:Math.min(...metrics.buttons.map(b=>b.clearance)),minimumButtonGap:metrics.separation});
        if (stage===100 && zoom===1) {
          await page.screenshot({path:path.join(artifacts,`${name}${kind==="own" ? "" : "-"+kind}.png`)});
          if (name === "desktop" && kind === "own") await page.screenshot({path:path.join(artifacts,"desktop-detail.png"),clip:{x:320,y:175,width:800,height:500}});
          const action = page.locator("#actions button:not(:disabled)").first();
          if(height<=500) await action.tap(); else await action.click();
          assert.match(await page.locator("#feedback").textContent(),/preview only/);
          await page.keyboard.press("Escape");
          assert.equal(await page.locator("#actions button").first().isVisible(),false);
          await page.locator("#castle").click();
          assert.equal(await page.locator("#actions button").first().isVisible(),true);
          await page.mouse.click(width-5,height-5);
          assert.equal(await page.locator("#actions button").first().isVisible(),false);
        }
      }
    }
    await page.goto(`${address.url}/docs/visual-qa/castle-action-wheel/index.html`);
    await page.getByRole("button",{name:"Phone · 844 × 390",exact:true}).click();
    assert.equal(await page.locator("iframe").getAttribute("width"),"844");
    await page.locator("#kind").selectOption("enemy");
    await page.frameLocator("iframe").getByRole("button",{name:"Attack (sample)"}).waitFor();
    await page.getByRole("button",{name:"Small phone · 568 × 320",exact:true}).click();
    assert.equal(await page.frameLocator("iframe").locator("#actions button").first().evaluate(node => node.getBoundingClientRect().width),56);
    assert.deepEqual(errors,[]);assert.deepEqual(requests,[],"No external services or game writes");
    for (const source of ["index.html","game.js","world/native.js","service-worker.js"]) assert(!fs.readFileSync(path.resolve(__dirname,"..",source),"utf8").includes("visual-qa/castle-action-wheel"),"Draft must stay outside production entry points");
    fs.writeFileSync(path.join(artifacts,"checks.json"),JSON.stringify({passed:true,cases:records.length,errors,requests,records},null,2));
    console.log(JSON.stringify({passed:true,cases:records.length,viewports:3,mouseTouchKeyboard:true,noExternalRequestsOrWrites:true,artifacts}));
  } finally {await browser.close();await server.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
