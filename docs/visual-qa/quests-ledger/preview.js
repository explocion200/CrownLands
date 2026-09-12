/* Isolated review simulation. No production services or player data are used. */
"use strict";
(() => {
  const samples = window.QuestReviewSamples, icons = window.QuestReviewIcons;
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = value => Number(value || 0).toLocaleString('en-US');
  const chestArt = 'assets/icons/common-gear-chest-r1.svg';
  const items = {
    royal_tax_decree_30m: ['Royal Tax Decree', 'item-royal-tax-decree'],
    war_drums_30m: ['War Drums', 'item-war-drums'],
    swift_march_order: ['Swift March Order', 'item-swift-march'],
    recall_horn: ['Recall Horn', 'item-recall-horn'],
  };
  let state, selected, epoch = 0, pendingReplace = null, failNext = false;
  function announce(message) {
    $('liveStatus').textContent = message;
    parent.postMessage({ type: 'quests-status', message }, location.origin);
  }
  function engraving(key) { return `<svg viewBox="0 0 32 32" class="engraving" aria-hidden="true">${icons[key] || icons.ledger}</svg>`; }
  function iconKey(mission) {
    const icon = mission.icon;
    if (['upgrade', 'hammer'].includes(icon)) return 'upgrade';
    if (['city', 'cities', 'tower', 'camp', 'camp-types'].includes(icon)) return 'city';
    if (['gold', 'treasury'].includes(icon)) return 'coin';
    if (['swords', 'helmet', 'troops', 'march', 'warband', 'siege', 'stronghold-march'].includes(icon)) return 'troops';
    if (['banner', 'relic', 'stronghold', 'targets'].includes(icon)) return 'allegiance';
    return 'ledger';
  }
  function reward(m) {
    const r = m.reward;
    if (r.type === 'item') {
      const item = items[r.itemId] || [r.itemId, 'item-recall-horn'];
      return { label: item[0], amount: `×${number(r.quantity || r.lockedAmount || 1)}`, image: samples.art[item[1]], item: true, note: 'Item reward fixed when this quest was assigned.' };
    }
    return { label: r.type === 'gold' ? 'Gold' : 'Troops', amount: number(r.lockedAmount), image: r.type === 'gold' ? 'assets/icons/royal-shop-gold-r1.svg' : 'assets/icons/daily-login-troops-r1.svg', item: false, note: `Based on ${r.productionHours} ${r.productionHours === 1 ? 'hour' : 'hours'} of production at assignment. This reward stays fixed.` };
  }
  const isComplete = m => m.progress >= m.target;
  const isClaimed = m => Boolean(m.claimedAtMs);
  const status = m => isClaimed(m) ? 'Collected' : isComplete(m) ? 'Ready to claim' : 'Underway';
  const claimedCount = () => state.missions.filter(isClaimed).length;
  function progress(m) {
    return `<div class="progress-line"><span class="card-status">${status(m)}</span><strong>${number(m.progress)} / ${number(m.target)}</strong></div><span class="progress-track" role="progressbar" aria-label="${escape(m.title)} progress" aria-valuemin="0" aria-valuemax="${m.target}" aria-valuenow="${m.progress}"><i style="width:${Math.min(100, 100 * m.progress / m.target)}%"></i></span>`;
  }
  function renderCard(m, index) {
    const r = reward(m);
    return `<button class="quest-card ${isClaimed(m) ? 'collected' : isComplete(m) ? 'ready' : ''}" data-quest="${escape(m.id)}" aria-pressed="${selected === m.id}" aria-label="${escape(`${m.title}. ${status(m)}. ${number(m.progress)} of ${number(m.target)}. Reward: ${r.amount} ${r.label}.`)}"><span class="quest-emblem">${engraving(iconKey(m))}<span class="number">0${index + 1}</span></span><span class="quest-copy"><span class="card-kicker">${escape(m.difficulty)}<i class="difficulty-dot"></i>${escape(m.activityGroup)}</span><span class="quest-name">${escape(m.title)}</span><span class="quest-description">${escape(m.description)}</span>${progress(m)}</span><span class="card-reward ${r.amount.length > 7 ? 'large' : ''}"><img class="${r.item ? 'item' : ''}" src="${escape(r.image)}" alt=""><strong>${r.amount}</strong><small>${escape(r.label)}</small></span></button>`;
  }
  function renderChest() {
    const count = claimedCount();
    $('chestMilestone').innerHTML = `<button class="chest-button ${state.chestAwarded ? 'awarded' : ''}" data-select-chest aria-pressed="${selected === 'chest'}" aria-label="Daily chest. ${count} of 3 quest rewards collected${state.chestAwarded ? '. Chest added to Bag' : ''}"><img src="${chestArt}" alt="Common Gear Box"><span class="chest-copy"><span class="eyebrow">Daily completion reward</span><h3>${state.chestAwarded ? 'Your chest is in the Bag' : 'A chest for your service'}</h3><p>Collect all three quest rewards to earn a Common Gear Box.</p><span class="chest-progress" aria-hidden="true">${[0,1,2].map(i => `<i class="${i < count ? 'filled' : ''}"></i>`).join('')}</span><span class="chest-count">${count} / 3 rewards collected${state.chestAwarded ? ' · 1 Common Gear Box earned' : ''}</span></span></button>`;
  }
  function renderDetail() {
    if (selected === 'chest') {
      $('detailNumber').textContent = 'Daily completion';
      $('detailState').textContent = state.chestAwarded ? 'Collected' : `${claimedCount()} of 3`;
      $('detailScroll').innerHTML = `<div class="quest-hero"><span class="hero-medallion chest"><img src="${chestArt}" alt="Common Gear Box"></span><h2>Common Gear Box</h2><p class="eyebrow">A reward for all three duties</p></div><div class="ornament" aria-hidden="true">◆</div><section class="objective"><h3>Earn your chest</h3><p>Claim all three quest rewards today.</p></section><section class="reward-section"><h3>Daily completion reward</h3><div class="reward-box"><img src="${chestArt}" alt=""><div><strong>1 Common Gear Box</strong><small>Three Level 1 Common gear pieces.</small></div></div></section><ul class="task-checklist">${state.missions.map(m => `<li><span aria-hidden="true">${isClaimed(m) ? '✓' : '◇'}</span><div>${escape(m.title)}<br><small>${isClaimed(m) ? 'Reward collected' : 'Reward not yet collected'}</small></div></li>`).join('')}</ul>`;
      $('actionFooter').innerHTML = `<p>${state.chestAwarded ? 'Open the chest from your Bag.' : 'Added to your Bag after the final reward claim.'}</p><button disabled>${state.chestAwarded ? 'Chest added to Bag' : `${claimedCount()} / 3 rewards collected`}</button>`;
      return;
    }
    const m = state.missions.find(m => m.id === selected), r = reward(m);
    $('detailNumber').textContent = `Quest ${state.missions.indexOf(m) + 1} of 3`;
    $('detailState').textContent = status(m);
    const target = m.recommendedTarget;
    const recommendation = target ? `<section class="recommendation"><p class="eyebrow">Suggested target</p><strong>${escape(target.cityName)}</strong><p>West Marches · From ${escape(target.sourceCityName)}<br>Suggested troops: ${number(target.recommendedTroops)}<br>Estimated losses: ${number(target.estimatedLosses)}</p><button data-map>View on map</button><small>Check the latest battle forecast before attacking.</small></section>` : '';
    $('detailScroll').innerHTML = `<div class="quest-hero"><span class="hero-medallion">${engraving(iconKey(m))}</span><h2>${escape(m.title)}</h2><p class="eyebrow">${escape(m.difficulty)} · ${escape(m.activityGroup)} quest</p></div><div class="ornament" aria-hidden="true">◆</div><section class="objective"><h3>Your objective</h3><p>${escape(m.description)}.</p>${progress(m)}</section><section class="reward-section"><h3>${isClaimed(m) ? 'Reward collected' : 'Your reward'}</h3><div class="reward-box"><img class="${r.item ? 'item' : ''}" src="${escape(r.image)}" alt=""><div><strong>${r.amount} ${escape(r.label)}</strong><small>${isClaimed(m) ? 'Added to your realm.' : 'Collect when this quest is complete.'}</small></div></div><p class="reward-note">${escape(r.note)}</p></section>${recommendation}`;
    const busy = Boolean(state.busy);
    let label, note, action, secondary = false, disabled = busy;
    if (isClaimed(m)) { label = 'Reward collected'; note = 'New quests arrive at 00:00 UTC.'; disabled = true; }
    else if (isComplete(m)) { label = state.busy === m.id ? 'Collecting…' : 'Claim reward'; note = 'Ready for collection.'; action = 'claim'; }
    else { label = state.rerollsRemaining ? 'Replace quest' : 'No replacements left'; note = `${state.rerollsRemaining} / 1 daily replacement available`; action = 'replace'; secondary = true; disabled ||= !state.rerollsRemaining; }
    const error = state.error?.id === m.id ? state.error.message : '';
    $('actionFooter').innerHTML = `<p class="${error ? 'error' : ''}">${escape(error || note)}</p><button ${action ? `data-${action}` : ''} class="${secondary ? 'secondary' : 'primary'}" ${disabled ? 'disabled' : ''}>${label}</button>`;
  }
  function renderUnavailable() {
    const content = {
      loading: ['Preparing your quests', 'Your daily duties are being gathered.', ''],
      error: ['Quests could not load', 'Your progress is safe. Please try again.', 'Try again'],
      expired: ['A new day has begun', 'Load today’s quests to see your new objectives.', 'Load today’s quests'],
    }[state.phase];
    $('questList').innerHTML = `<div class="placeholder">${engraving('ledger')}<h3>${content[0]}</h3><p>${content[1]}</p>${content[2] ? `<button data-reload>${content[2]}</button>` : ''}</div>`;
    $('completionCount').textContent = '— / 3 complete';
    $('chestMilestone').innerHTML = '';
    $('detailNumber').textContent = 'Daily quests'; $('detailState').textContent = '';
    $('detailScroll').innerHTML = '<p class="detail-empty">Your quest objectives and rewards will appear here.</p>';
    $('actionFooter').innerHTML = '<p>Quest actions are temporarily unavailable.</p><button disabled>Awaiting quests</button>';
  }
  function render() {
    if (state.phase !== 'normal') { renderUnavailable(); return; }
    $('completionCount').textContent = `${state.missions.filter(isComplete).length} / 3 complete`;
    $('questList').innerHTML = state.missions.map(renderCard).join('');
    renderChest(); renderDetail();
  }
  function select(id) { selected = id; render(); $('detailScroll').scrollTop = 0; }
  function reset(sample = 'mixed') {
    epoch++; pendingReplace = null; failNext = false;
    if ($('replaceDialog').open) $('replaceDialog').close();
    const fixture = sample === 'item' ? 'item' : sample === 'large' ? 'large' : 'standard';
    state = { missions: structuredClone(samples[fixture].missions), fixture, rerollsRemaining: 1, phase: ['loading','error','expired'].includes(sample) ? sample : 'normal', busy: null, error: null, chestAwarded: false };
    state.missions.forEach((m, i) => {
      m.progress = Math.floor(m.target * [0.5,0,0.67][i]); m.completedAtMs = 0; m.claimedAtMs = 0;
      const done = ['ready','last','collected'].includes(sample) || (sample === 'mixed' && i !== 1) || (sample === 'item' && m.reward.type === 'item');
      if (done) { m.progress = m.target; m.completedAtMs = 1; }
      if (sample === 'collected' || (sample === 'last' && i < 2) || (sample === 'mixed' && i === 2)) m.claimedAtMs = 1;
    });
    selected = (sample === 'last' ? state.missions[2] : sample === 'item' ? state.missions.find(m => m.reward.type === 'item') : state.missions[0]).id;
    state.chestAwarded = claimedCount() === 3;
    $('countdown').textContent = sample === 'expired' ? '00:00:00' : '08:42:16';
    $('dismissed').hidden = true;
    if (!$('questDialog').open) $('questDialog').showModal();
    render(); $('detailScroll').scrollTop = 0;
    announce('Review simulation reset. No player data is used or changed.');
  }
  async function claim() {
    const m = state.missions.find(m => m.id === selected);
    if (!m || state.phase !== 'normal' || state.busy || !isComplete(m) || isClaimed(m)) return;
    const version = epoch, failure = failNext; failNext = false;
    state.busy = m.id; state.error = null; render();
    await new Promise(resolve => setTimeout(resolve, 450));
    if (epoch !== version) return;
    state.busy = null;
    if (failure) {
      state.error = { id: m.id, message: 'Could not collect. Please try again.' };
      render(); $('actionFooter').querySelector('[data-claim]')?.focus();
      announce('Simulated claim failure. Reward and chest progress are unchanged. Retry is available.'); return;
    }
    m.claimedAtMs = 1;
    const earnedChest = claimedCount() === 3 && !state.chestAwarded;
    if (earnedChest) state.chestAwarded = true;
    render();
    $('questList').querySelector(`[data-quest="${m.id}"]`)?.focus();
    const r = reward(m);
    announce(`Preview: collected ${r.amount} ${r.label}.${earnedChest ? ' The intended daily milestone adds one Common Gear Box to the Bag. See the implementation note below the preview.' : ''}`);
  }
  function beginReplace() {
    const m = state.missions.find(m => m.id === selected);
    if (!m || state.phase !== 'normal' || state.busy || isComplete(m) || !state.rerollsRemaining) return;
    pendingReplace = m.id;
    $('replaceText').textContent = `Replace “${m.title}”? You have ${number(m.progress)} of ${number(m.target)} progress.`;
    $('replaceDialog').showModal(); $('keepQuest').focus();
  }
  function confirmReplace() {
    const index = state.missions.findIndex(m => m.id === pendingReplace);
    if (index < 0 || !state.rerollsRemaining) return;
    const replacement = samples.replacements[state.fixture][pendingReplace];
    if (!replacement) { announce('No eligible replacement is available in this sample.'); $('replaceDialog').close(); return; }
    state.missions[index] = structuredClone(replacement); state.rerollsRemaining = 0;
    selected = replacement.id; state.error = null; pendingReplace = null;
    $('replaceDialog').close(); render(); $('detailScroll').scrollTop = 0;
    $('questList').querySelector(`[data-quest="${selected}"]`)?.focus();
    announce(`Preview: replaced quest with ${replacement.title}. Previous progress was removed. No daily replacements remain.`);
  }
  document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = engraving(el.dataset.icon); });
  $('questDialog').addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-quest')) { select(button.dataset.quest); $('questList').querySelector(`[data-quest="${selected}"]`)?.focus(); }
    else if (button.hasAttribute('data-select-chest')) { select('chest'); $('chestMilestone').querySelector('button').focus(); }
    else if (button.hasAttribute('data-claim')) void claim();
    else if (button.hasAttribute('data-replace')) beginReplace();
    else if (button.hasAttribute('data-reload')) { reset('progress'); announce('Preview: quests loaded.'); }
    else if (button.hasAttribute('data-map')) announce('Preview: View on map would open Stoneford in the game. This review contains no live map.');
    else if (button.dataset.tab && button.dataset.tab !== 'quests') announce(`${button.dataset.tab === 'daily' ? 'Daily Login' : 'Achievements'} remains unchanged. This draft focuses on Quests.`);
  });
  $('questList').addEventListener('keydown', event => {
    const current = event.target.closest('[data-quest]');
    if (!current || !['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const i = state.missions.findIndex(m => m.id === current.dataset.quest);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (i + (event.key === 'ArrowDown' ? 1 : 2)) % 3;
    select(state.missions[next].id); $('questList').querySelector(`[data-quest="${selected}"]`).focus();
  });
  $('keepQuest').addEventListener('click', () => { pendingReplace = null; $('replaceDialog').close(); announce('Quest kept. No daily replacement used.'); });
  $('confirmReplace').addEventListener('click', confirmReplace);
  $('replaceDialog').addEventListener('close', () => { $('actionFooter').querySelector('[data-replace]')?.focus(); });
  $('closeQuest').addEventListener('click', () => $('questDialog').close());
  $('questDialog').addEventListener('close', () => { $('dismissed').hidden = false; $('reopen').focus(); });
  $('reopen').addEventListener('click', () => { $('dismissed').hidden = true; $('questDialog').showModal(); });
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== parent || event.data?.type !== 'quests-review') return;
    const { action, sample } = event.data;
    if (action === 'reset') reset(sample);
    else if (action === 'complete') {
      const m = state.missions.find(m => m.id === selected);
      if (!m || state.phase !== 'normal' || state.busy || isClaimed(m)) { announce('Select an unfinished quest to complete in this preview.'); return; }
      m.progress = m.target; m.completedAtMs = 1; render(); announce(`Preview: ${m.title} is ready to claim.`);
    } else if (action === 'fail') {
      if (state.busy || $('replaceDialog').open) return;
      if (state.phase !== 'normal' || !state.missions.some(m => !isClaimed(m))) reset('ready');
      const m = state.missions.find(m => m.id === selected && !isClaimed(m)) || state.missions.find(m => !isClaimed(m));
      selected = m.id; m.progress = m.target; m.completedAtMs = 1; failNext = true; void claim();
    }
  });
  reset();
})();
