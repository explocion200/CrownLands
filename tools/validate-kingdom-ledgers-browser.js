"use strict";
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CdpClient } = require('./map-benchmark/cdp-client');
const { createMapBenchmarkServer } = require('./map-benchmark/server');
const { startBrowserSession, waitForProcessExit, removeBrowserProfile } = require('./validate-focused-browser-smoke');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const executable = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && fs.existsSync(p));
  assert(executable, 'Set CHROME_PATH to Chromium.');
  const server = createMapBenchmarkServer();
  const address = await server.listen();
  const artifactDir = path.resolve(__dirname, '../release-artifacts/kingdom-ledgers');
  fs.mkdirSync(artifactDir, { recursive:true });
  let session, client;
  const errors = [];
  try {
    session = await startBrowserSession(executable);
    client = await CdpClient.connect(session.targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('Emulation.setEmulatedMedia', { features:[{ name:'prefers-reduced-motion', value:'reduce' }] });
    client.on('Runtime.exceptionThrown', e => errors.push(e.exceptionDetails?.exception?.description || e.exceptionDetails?.text));
    const evaluate = async expression => {
      const r = await client.send('Runtime.evaluate', { expression, awaitPromise:true, returnByValue:true });
      if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const ready = async expression => {
      for (let i=0;i<240;i++) { if(await evaluate(expression)) return; await wait(125); }
      throw Error(`Timed out: ${expression}`);
    };
    const open = async params => {
      await client.send('Page.navigate', { url:`${address.url}/__benchmark__/?scenario=A&visualMarches=0&${params}` });
      await ready('document.documentElement?.dataset.ledgerQa === "ready"');
      await wait(180);
    };
    const shot = async name => {
      const result = await client.send('Page.captureScreenshot', { format:'png' });
      fs.writeFileSync(path.join(artifactDir, `${name}.png`), Buffer.from(result.data,'base64'));
    };
    for (const size of [{width:1440,height:900},{width:844,height:390},{width:568,height:320}]) {
      await client.send('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor:1, mobile:false });
      await open('ledgerUi=players');
      await ready('document.querySelectorAll("#leaderboardRows .leaderboard-row").length === 100');
      const rankLayout = await evaluate(`(() => {
        const list=document.querySelector('#leaderboardRows'), dialog=document.querySelector('#modal'), row=list.querySelector('.leaderboard-row'), heading=document.querySelector('#modalTitle');
        return {scroll:list.scrollHeight>list.clientHeight,overflow:dialog.scrollWidth>dialog.clientWidth+1,paper:getComputedStyle(row).backgroundColor,ink:getComputedStyle(heading).color,power:row.querySelector('.leaderboard-power strong').textContent};
      })()`);
      assert(rankLayout.scroll && !rankLayout.overflow, JSON.stringify(rankLayout));
      assert.equal(rankLayout.paper, 'rgb(243, 232, 204)');
      assert(rankLayout.power.includes(','), 'Power must not be abbreviated.');
      await evaluate(`document.querySelector('[data-find-rank]').click()`);
      await wait(700);
      const rankNavigation = await evaluate(`({active:document.activeElement.className,scroll:document.querySelector('#leaderboardRows').scrollTop})`);
      assert(rankNavigation.active.includes('current') && rankNavigation.scroll > 0, `Find my rank: ${JSON.stringify(rankNavigation)}`);
      await shot(`players-${size.width}`);
      await evaluate(`document.querySelector('[data-leaderboard-tab="clans"]').click()`);
      await ready('document.querySelectorAll("#clanLeaderboardRows .leaderboard-row").length === 100');
      assert(await evaluate(`document.querySelector('#leaderboardPlayersPanel').hidden && !document.querySelector('#leaderboardClansPanel').hidden`));
      await evaluate(`document.querySelector('#leaderboardRefreshBtn').click()`);
      await ready('document.querySelectorAll("#clanLeaderboardRows .leaderboard-row").length === 100');
      await shot(`clans-${size.width}`);

      for (const holding of ['gold','training','speed','defense','crown']) {
        await open(`ledgerUi=stronghold&holding=${holding}`);
        const layout = await evaluate(`(() => {
          const d=document.querySelector('#modal'), a=d.querySelector('.identity-column'), b=d.querySelector('.details-column'), button=d.querySelector('#relinquishCityBtn');
          return {overflow:d.scrollWidth>d.clientWidth+1,columns:a.getBoundingClientRect().right<=b.getBoundingClientRect().left+1,buttonVisible:button.getBoundingClientRect().bottom<=d.getBoundingClientRect().bottom,art:a.querySelector('img').complete&&a.querySelector('img').naturalWidth>0,folds:d.querySelectorAll('details:not([open])').length,troops:d.querySelector('[data-holding-field="troops"]').textContent};
        })()`);
        assert(!layout.overflow && layout.columns && layout.buttonVisible && layout.art, `${holding} ${size.width}: ${JSON.stringify(layout)}`);
        assert.equal(layout.folds,2);
        assert(layout.troops.includes('3,250,000'));
        if(holding === 'crown') assert.equal(await evaluate('document.querySelectorAll(".crown-benefit-grid>div").length'),5);
        await shot(`${holding}-${size.width}`);
        await evaluate(`document.querySelectorAll('#modal [role="tab"]')[1].click()`);
        await ready('document.querySelectorAll(".citadel-reign-row").length === 100');
        assert(await evaluate('document.querySelector(".holding-footer").hidden'), 'Management actions must not overlap the ledger.');
        assert(await evaluate(`(() => {const l=document.querySelector('.citadel-reign-list');return l.scrollHeight>l.clientHeight;})()`));
        await evaluate(`document.querySelectorAll('#modal [role="tab"]')[1].dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}))`);
        assert(await evaluate('!document.querySelector(".holding-footer").hidden && document.activeElement.getAttribute("aria-selected")==="true"'));
      }
      for (const holding of ['gold','crown']) {
        await open(`ledgerUi=stronghold&holding=${holding}&sample=enemy`);
        assert.equal(await evaluate('document.querySelector("[data-holding-field=troops] strong").textContent'),'Unknown');
        assert.equal(await evaluate('document.querySelector("[data-holding-field=estimate] strong").textContent'),'Unknown');
        assert.equal(await evaluate('document.querySelector("#relinquishCityBtn") === null'),true);
      }
      console.log(`Validated rankings and all five objective layouts at ${size.width}x${size.height}.`);
    }
    assert.deepEqual(errors,[]);
  } finally {
    if (client) await client.send('Browser.close').catch(() => {});
    if (session) { await waitForProcessExit(session.browserProcess); await removeBrowserProfile(session.profilePath); }
    await server.close();
  }
  console.log('Validated full ranking values, active-tab refresh, rank navigation, objective privacy, live hooks, scrolling, keyboard tabs, and fixed management actions.');
}
main().catch(error => { console.error(error.stack || error); process.exitCode=1; });
