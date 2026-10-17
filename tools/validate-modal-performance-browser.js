"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { execFileSync } = require("node:child_process");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const root = path.resolve(__dirname, "..");

async function main() {
  const base = JSON.parse(fs.readFileSync(path.join(root, "validation-plan.json"))).baseCommit;
  const replacements = ["styles.css", "interface-theme.css", "profile-theme.css", "crownlands-palette.css"].map(file => {
    const current = fs.readFileSync(path.join(root, file), "utf8");
    const after = current.match(/\/\* Keep the original \(0,2,0\) specificity[\s\S]*?\*\/\s*([^{}]+)\{/)[1].trim();
    const beforeFile = execFileSync("git", ["show", `${base}:${file}`], { cwd: root, encoding: "utf8" });
    const firstClass = after.match(/\.[\w-]+/)[0];
    const before = [...beforeFile.matchAll(/:is\(([a-zA-Z0-9_. >,\n\t-]+)\)(?=\s*\{)/g)]
      .find(match => match[1].trim().startsWith(firstClass) && match[1].length > 500)?.[0];
    assert(before, `Missing reviewed baseline for ${file}`);
    // No cascade changes: the old list's maximum is two classes, no types.
    const specificity = selector => {
      const plain = selector.replace(/:where\([^()]+\)/g, "");
      return [(plain.match(/\.[\w-]+/g) || []).length, (plain.match(/(?:^|[ >]+)[a-z][a-z0-9-]*/g) || []).length];
    };
    const old = before.slice(4, -1).split(",");
    assert.equal(old.map(specificity).sort((a,b) => a[0]-b[0] || a[1]-b[1]).at(-1).join(), "2,0");
    assert(after.split(",").every(selector => specificity(selector).join() === "2,0"));
    return { file, before, after };
  });
  const executable = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Set CHROME_PATH to Chromium");
  const server = createMapBenchmarkServer(), address = await server.listen();
  let session, client; const errors = [], evidence = [];
  try {
    session = await startBrowserSession(executable);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await client.send("Page.enable"); await client.send("Runtime.enable");
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    const evaluate = async expression => {
      const response = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
      return response.result.value;
    };
    for (const [width, height] of [[1440,900], [844,390], [568,320]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor:1, mobile:false });
      await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=2&hudOperations=both" });
      let ready = false;
      for (let i=0;i<400;i++) { if (await evaluate("window.__CROWNLANDS_BENCHMARK__?.getStatus().status==='ready'")) { ready=true;break; } await delay(100); }
      assert(ready);
      await evaluate(`window.__selectorChecks=${JSON.stringify(replacements)};__CROWNLANDS_BENCHMARK__.closeModal()`);
      const views = [];
      for (const [view, open] of [["map", ""], ["city", "showCityInfoModal(playerCities()[0].id)"],
        ["profile", "showProfileScreen()"], ["skills", "showProfileScreen();showProfileSkills()"],
        ["city-list", "showCityListModal()"], ["chat", "document.getElementById('chatToggleBtn').click()"]]) {
        await evaluate(`modal.close();closeProfileScreen({force:true});${open}`); await delay(100);
        if(view==="city") {
          const point=await evaluate("(()=>{const r=modalBody.querySelector('[aria-pressed=\"true\"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
          await client.send("Input.dispatchMouseEvent",{type:"mouseMoved",...point});
        }
        const result = await evaluate(`(() => {
          const comparisons=__selectorChecks.map(({file,before,after})=>{
            const old=[...document.querySelectorAll(before)],next=[...document.querySelectorAll(after)];
            return {file,matches:old.length,equal:old.length===next.length&&old.every((node,i)=>node===next[i])};
          });
          const props=['color','backgroundColor','borderColor','borderRadius','boxShadow','fontFamily','fontSize','lineHeight','display','padding','opacity'];
          const nodes=[...document.body.querySelectorAll('*')];
          const capture=()=>nodes.map(node=>{const s=getComputedStyle(node);return props.map(p=>s[p]).join('|')});
          const after=capture(),rules=[];
          for(const item of __selectorChecks){const sheet=[...document.styleSheets].find(s=>s.href?.split('?')[0].endsWith('/'+item.file));
            const rule=[...sheet.cssRules].find(r=>r.selectorText?.replace(/\\s+/g,' ').trim()===item.after.replace(/\\s+/g,' ').trim());
            if(!rule)throw Error('Missing optimized rule '+item.file);rules.push([rule,rule.selectorText]);rule.selectorText=item.before;
          }
          const before=capture();for(const [rule,selector] of rules)rule.selectorText=selector;
          return {comparisons,appearanceEqual:before.every((value,i)=>value===after[i]),nodes:nodes.length};
        })()`);
        assert(result.comparisons.every(row => row.equal), `${view}: selector matching changed`);
        assert(result.appearanceEqual, `${width} ${view}: computed appearance changed`);
        views.push({ view, ...result });
      }
      await evaluate("document.querySelectorAll('dialog[open]').forEach(d=>d.close());closeProfileScreen({force:true});showCityInfoModal(playerCities()[0].id)");
      const screenshot=await client.send("Page.captureScreenshot", {format:"png"});
      const output=path.join(root,"release-artifacts/game-smoothness-fixes");fs.mkdirSync(output,{recursive:true});
      fs.writeFileSync(path.join(output,`city-${width}.png`),Buffer.from(screenshot.data,"base64"));
      evidence.push({width,height,views});
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(root,"release-artifacts/game-smoothness-fixes/css-equivalence.json"),JSON.stringify(evidence,null,2));
    console.log("Modal styling: identical specificity, matched elements and computed appearance across map, city, profile, skills, city list and chat at desktop/landscape sizes.");
  } finally {
    if(client){await client.send("Browser.close").catch(()=>{});client.close();}
    if(session){if(!await waitForProcessExit(session.browserProcess)){session.browserProcess.kill();await waitForProcessExit(session.browserProcess);}await removeBrowserProfile(session.profilePath);}
    await server.close();
  }
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
