"use strict";
// Real modal navigation with isolated synthetic rewards; never contacts production.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CdpClient } = require("./map-benchmark/cdp-client");
const { createMapBenchmarkServer } = require("./map-benchmark/server");
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require("./validate-focused-browser-smoke");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const root = path.resolve(__dirname, "..");
const output = path.join(root, "release-artifacts/reward-window-layout");
const tabs = [
  ["rewards", ".daily-shell", "assets/optimized/hud-daily-reward-ink-384x384-e2287cbf41c2.webp"],
  ["quests", ".quests-panel", "assets/optimized/rewards-quests-ink-384x384-8d198ff51049.webp"],
  ["achievements", ".achievements-panel", "assets/optimized/rewards-achievements-ink-384x384-10f16fe082e9.webp"],
];

async function main() {
  const executable = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(file => file && fs.existsSync(file));
  assert(executable, "Set CHROME_PATH to Chromium.");
  fs.mkdirSync(output, { recursive: true });
  const server = createMapBenchmarkServer(), address = await server.listen();
  let session, client;
  const records = [], errors = [];
  try {
    session = await startBrowserSession(executable);
    client = await CdpClient.connect(session.targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await Promise.all([client.send("Page.enable"), client.send("Runtime.enable")]);
    client.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails?.exception?.description || event.exceptionDetails?.text));
    const evaluate = async expression => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const waitFor = async expression => {
      for (let attempt = 0; attempt < 480; attempt++) {
        if (await evaluate(expression)) return;
        await pause(125);
      }
      throw Error("Timed out: " + expression);
    };
    const settled = () => waitFor("modal.querySelector(':scope > .modal-card').getAnimations().every(a => !a.pending && a.playState !== 'running')");
    const click = async (selector, touch) => {
      const point = await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}), r = e.getBoundingClientRect(); return { x:r.x+r.width/2, y:r.y+r.height/2, hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)) }; })()`);
      assert(point.hit, "Control is obscured: " + selector);
      if (touch) {
        await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: point.x, y: point.y }] });
        await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      } else {
        await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
        await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
      }
    };
    const screenshot = async name => fs.writeFileSync(path.join(output, name + ".png"), Buffer.from((await client.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
    await client.send("Page.navigate", { url: address.url + "/__benchmark__/?scenario=A&visualMarches=0" });
    await waitFor("window.__CROWNLANDS_BENCHMARK__?.getStatus().status === 'ready'");
    await evaluate("__CROWNLANDS_BENCHMARK__.closeModal(); levelUpRewardQueue.length=0; activeLevelUpReward=null; pendingOfflineRewardsSummary=null; toast.classList.remove('visible');");
    for (const file of ["docs/visual-qa/quests-ledger/samples.js", "docs/visual-qa/achievements-ledger/samples.js", "docs/visual-qa/achievements-ledger/runtime-fixture.js"]) {
      await evaluate(fs.readFileSync(path.join(root, file), "utf8"));
    }
    await waitFor("document.documentElement.dataset.achievementRuntimeReady === 'true'");
    await evaluate("supportsDailyMissions=()=>true; dailyMissionState=normalizeDailyMissionState({...QuestReviewSamples.standard,serverTimeMs:Date.now(),resetsAtMs:Date.now()+3600000}); dailyMissionStatusLoading=false;");
    for (const [size, width, height] of [["desktop",1440,900], ["landscape",844,390], ["compact",568,320]]) {
      const touch = width < 1000;
      await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: touch });
      await client.send("Emulation.setTouchEmulationEnabled", { enabled: touch });
      // Daily Login shares a dialog with Box/Reports screens that hide header navigation.
      // Exercise actual view transitions, including a queued close in the same turn.
      for (const previous of ["showCommonGearBoxScreen();modal.close()", "showLogModal()"] ) {
        await evaluate(`modal.close();${previous};showDailyLoginRewardsModal({skipRefresh:true})`);
        await waitFor("!!modalBody.querySelector('.daily-shell')");
        await settled();
        const header = await evaluate(`(() => {
          const buttons=[...modalHeaderNav.querySelectorAll('[data-daily-reward-tab]')];
          return { classes:modal.className, hidden:modalHeaderNav.hidden, tabs:buttons.map(button=>{
            const r=button.getBoundingClientRect();
            return {id:button.dataset.dailyRewardTab,visible:r.width>=44&&r.height>=44,
              hit:button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};
          })};
        })()`);
        assert(!header.hidden && header.tabs.length===3 && header.tabs.every(tab=>tab.visible&&tab.hit),
          `Daily tabs disappeared after ${previous} at ${size}: ${JSON.stringify(header)}`);
        await click('[data-daily-reward-tab="quests"]',touch);
        await waitFor("!!modalBody.querySelector('.quests-panel')");
        await click('[data-daily-reward-tab="achievements"]',touch);
        await waitFor("!!modalBody.querySelector('.achievements-panel')");
        await click('#closeModalBtn',touch);
        await waitFor("!modal.open");
      }
      for (const fullscreen of [false, true]) {
        if (fullscreen) await evaluate("document.documentElement.requestFullscreen()");
        await waitFor(`Boolean(document.fullscreenElement) === ${fullscreen}`);
        await evaluate("showDailyLoginRewardsModal({skipRefresh:true})");
        let reference;
        for (const [tab, panel, art] of tabs) {
          await settled();
          await click(`[data-daily-reward-tab="${tab}"]`, touch);
          await waitFor(`!!modalBody.querySelector('${panel}')?.querySelector('.window-title-art')?.naturalWidth`);
          await settled();
          const layout = await evaluate(`(() => {
            const panel=document.querySelector('${panel}'), header=panel.querySelector('header'), art=header.querySelector('.window-title-art'), title=art.nextElementSibling, clock=title.nextElementSibling;
            const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
            const fit=e=>{const r=rect(e),h=rect(header);return r.x>=h.x&&r.right<=h.right&&r.y>=h.y&&r.bottom<=h.bottom;};
            const images=[...modalHeaderNav.querySelectorAll('img')];
            const scrollers=[...panel.querySelectorAll('.detail-scroll,#achievementList,#questList,#weeks')];
            return {modal:rect(modal),panel:rect(panel),header:rect(header),close:rect(closeModalBtn),nav:rect(modalHeaderNav),art:rect(art),title:rect(title),clock:rect(clock),
              source:art.getAttribute('src'),hud:document.querySelector('#dailyLoginRewardBtn img').getAttribute('src'),fit:getComputedStyle(art).objectFit,alt:art.alt,
              tabImages:images.map(img=>({source:img.getAttribute('src'),decoded:img.complete&&img.naturalWidth>0})),
              controlsFit:[closeModalBtn,...modalHeaderNav.querySelectorAll('button')].every(fit),
              overflow:modal.scrollWidth>modal.clientWidth+1||panel.scrollWidth>panel.clientWidth+1,
              scrollers:scrollers.map(e=>{e.scrollTop=e.scrollHeight;return {scrollable:e.scrollHeight>e.clientHeight+1,reached:e.scrollTop>0};}),
              actions:[...panel.querySelectorAll('.claim-footer button,.action-footer button')].map(e=>({rect:rect(e),height:e.clientHeight})),
              quests:panel.querySelectorAll('[data-quest]').length,achievements:panel.querySelectorAll('[data-achievement]').length};
          })()`);
          const label = `${size}/${fullscreen ? "fullscreen" : "window"}/${tab}`;
          assert.equal(layout.source, art, label + " artwork");
          if (tab === "rewards") assert.equal(layout.hud, "assets/optimized/hud-daily-labeled-192x192-91fa9910f959.webp", "HUD retains its approved caption artwork; window and tabs use the uncaptioned illustration.");
          assert.equal(layout.fit, "contain"); assert.equal(layout.alt, "");
          assert.deepEqual(layout.tabImages.map(image => image.source), tabs.map(entry => entry[2]));
          assert(layout.tabImages.every(image => image.decoded), label + " image decoding");
          assert(layout.controlsFit && !layout.overflow, label + " header controls or overflow");
          assert(layout.art.right + 6 <= layout.title.x && layout.title.right <= layout.clock.x && layout.clock.right <= layout.nav.x, label + " header overlap: " + JSON.stringify({art:layout.art,title:layout.title,clock:layout.clock,nav:layout.nav}));
          assert(Math.abs(layout.art.y+layout.art.height/2-layout.header.y-layout.header.height/2)<1, label + " artwork alignment");
          assert(layout.scrollers.every(s => !s.scrollable || s.reached), label + " content cannot scroll");
          assert(layout.actions.every(action => action.height >= 42 && action.rect.bottom <= layout.panel.bottom), label + " action clipped");
          if (tab === "quests") assert.equal(layout.quests, 3, "All three quests must remain reachable");
          if (tab === "achievements") assert.equal(layout.achievements, 40, "All achievements must remain reachable");
          const frame = { modal:layout.modal,panel:layout.panel,header:layout.header,close:layout.close,nav:layout.nav };
          if (reference) assert.deepEqual(frame, reference, label + " must keep Daily Login geometry");
          else reference = frame;
          await evaluate("document.activeElement?.blur(); modalBody.querySelectorAll('.detail-scroll,#achievementList,#questList,#weeks').forEach(e=>e.scrollTop=0)");
          await screenshot(`${tab}-${size}-${fullscreen ? "fullscreen" : "window"}`);
          records.push({ label, ...layout });
        }
        // Keyboard navigation must still activate a tab and restore focus.
        await evaluate("document.getElementById('dailyRewardTabAchievements').focus()");
        await client.send("Input.dispatchKeyEvent", { type:"keyDown", key:"Home", code:"Home", windowsVirtualKeyCode:36 });
        await client.send("Input.dispatchKeyEvent", { type:"keyUp", key:"Home", code:"Home", windowsVirtualKeyCode:36 });
        await waitFor("document.activeElement?.id==='dailyRewardTabRewards' && !!modalBody.querySelector('.daily-shell')");
        await settled(); await click("#closeModalBtn", touch); await waitFor("!modal.open");
        await evaluate("showLeaderboardModal()"); await settled();
        await waitFor("!!modalTitle.querySelector('img')?.naturalWidth");
        const leaderboard = await evaluate(`(() => {const img=modalTitle.querySelector('img'),r=img.getBoundingClientRect(),h=modalTitle.getBoundingClientRect(),c=closeModalBtn.getBoundingClientRect(),t=modalTitle.querySelector('span').getBoundingClientRect();return {art:img.getAttribute('src')==='assets/optimized/hud-leaderboard-ink-384x384-7781c5983020.webp',aligned:Math.abs(r.y+r.height/2-h.y-h.height/2)<1,fits:r.x>=h.x&&r.right+7<=t.x&&t.right<c.x&&c.bottom<=h.bottom+1,overflow:modal.scrollWidth>modal.clientWidth+1};})()`);
        assert(leaderboard.art && leaderboard.aligned && leaderboard.fits && !leaderboard.overflow, JSON.stringify(leaderboard));
        await screenshot(`leaderboard-${size}-${fullscreen ? "fullscreen" : "window"}`);
        await click("#closeModalBtn", touch); await waitFor("!modal.open");
        records.push({ label:`${size}/${fullscreen ? "fullscreen" : "window"}/leaderboard`, ...leaderboard });
        if (fullscreen) await evaluate("document.exitFullscreen()");
      }
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output,"checks.json"), JSON.stringify({passed:true,records,errors},null,2));
    console.log("Passed Box/Reports-to-Daily transitions and 24 reward/leaderboard layouts: matching artwork, stable tab geometry, fullscreen, scrolling, keyboard and mouse/touch dismissal.");
  } finally {
    if (client) { await client.send("Browser.close").catch(() => {}); client.close(); }
    if (session) { await waitForProcessExit(session.browserProcess); await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
}
main().catch(error => { console.error(error.stack); process.exitCode=1; });
