const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname, '../player-journey.js'),'utf8');
function fixture(host='playcrownlands.com',cookie='',pathname='/') {
  const scripts=[];
  const document={cookie,readyState:'loading',addEventListener(){},createElement(){return {};},head:{append(script){scripts.push(script);}}};
  const window={};
  const context={document,window,location:{hostname:host,protocol:'https:',pathname,origin:'https://'+host}};
  vm.runInNewContext(source,context);
  return {document,window,scripts,track:window.CrownlandsJourney.track,events:()=>Array.from(window.dataLayer||[]).filter(x=>x[0]==='event')};
}
const denied=fixture();denied.track('homepage_view');assert.equal(denied.scripts.length,0);assert.equal(denied.events().length,0);
denied.document.cookie='cl_analytics_v1=yes';denied.track('homepage_view');
assert.equal(denied.scripts.length,1);assert.equal(denied.events().length,1);
assert.equal(denied.window.dataLayer[0][0],'consent');assert.equal(denied.window.dataLayer[0][2].analytics_storage,'denied');
assert.equal(denied.window.dataLayer[1][2].ad_storage,'denied');
denied.track('homepage_view');assert.equal(denied.events().length,1,'Same page view is not replayed');
denied.document.cookie='cl_analytics_v1=no';denied.track('play_click');assert.equal(denied.events().length,1,'Revocation stops events');
const game=fixture('game.playcrownlands.com','cl_analytics_v1=yes','/play/');
game.track('first_action','attack');assert.equal(game.events().length,0,'Entry must precede first action');
game.track('game_entry');game.track('first_action','account-private-value');assert.equal(game.events().length,1);
game.track('first_action','city_upgrade');game.track('first_action','attack');assert.equal(game.events().length,2);
assert.deepEqual(Object.keys(game.events()[1][2]).sort(),['action_type','page_location','page_referrer','send_to','surface']);
assert.equal(game.events()[1][2].page_location,'https://game.playcrownlands.com/play/');
assert.equal(game.events()[1][2].page_referrer,'');
game.track('ruler_name','private');assert.equal(game.events().length,2,'Unknown event names cannot transmit data');
for(const page of ['/support.html','/privacy.html','/terms.html','/game-rules.html']) {
  const quiet=fixture('playcrownlands.com','cl_analytics_v1=yes',page);quiet.track('play_click');assert.equal(quiet.scripts.length,0);
}
const preview=fixture('deploy-preview-4--crownlands-website-preview.netlify.app','cl_analytics_v1=yes');preview.track('homepage_view');assert.equal(preview.scripts.length,0);
const blocked=fixture();Object.defineProperty(blocked.document,'cookie',{get(){throw Error('Storage blocked');}});assert.doesNotThrow(()=>blocked.track('game_entry'));
const config=game.window.dataLayer.find(x=>x[0]==='config')[2];assert.equal(config.send_page_view,false);assert.equal(config.allow_google_signals,false);assert.equal(config.cookie_expires,15552000);
console.log('Journey checks passed: opt-in, revocation, no preview/utility collection, bounded events, first-action sequencing, and blocked storage.');
