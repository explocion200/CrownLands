/* Approved Quests presentation. Status, rewards and actions are server-owned. */
(function () {
  "use strict";
  const views = new WeakMap();
  const chestArt = 'assets/icons/common-gear-chest-r1.svg';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = value => Math.floor(Number(value) || 0).toLocaleString('en-US');
  function createView(root) {
    const controller = new AbortController();
    let options, state, selected = '', scope = '', pendingReplace = null, expired = false;
    const $ = id => root.querySelector(id.startsWith('[') ? id : '#' + id);
    const engraving = key => options.icon(key).replace('<svg ', '<svg class="engraving" ');
    root.innerHTML = `<section id="dailyRewardPanelQuests" class="quests-panel quest-shell" role="tabpanel" aria-labelledby="dailyRewardTabQuests">
  <header class="quest-header"><span class="header-seal" data-icon="ledger" aria-hidden="true"></span><div class="heading-copy"><p>In service of your realm</p><h1 id="questTitle">Quests</h1></div><div class="reset-clock"><span>New quests in</span><strong id="countdown">08:42:16</strong><small>00:00 UTC</small></div></header>
  <div class="quest-body"><section class="ledger" aria-label="Daily quest ledger"><div class="ledger-heading"><div><h2>Today's duties</h2><p>Three deeds for the Crown.</p></div><span id="completionCount"></span></div><div id="questList" aria-label="Select a quest"></div><section id="chestMilestone" class="chest-milestone" aria-label="Daily chest milestone"></section></section>
  <section class="detail" aria-label="Selected quest"><div class="detail-heading"><span id="detailNumber"></span><span id="detailState"></span></div><div id="detailScroll" class="detail-scroll"></div><footer id="actionFooter" class="action-footer"></footer></section></div>
<dialog id="questReplaceDialog" aria-labelledby="replaceTitle"><div class="confirmation"><span class="confirmation-icon" data-icon="ledger" aria-hidden="true"></span><p class="eyebrow">One daily replacement</p><h2 id="replaceTitle">Replace this quest?</h2><p id="replaceText"></p><p class="replace-note">Its current progress will be lost. Your other two quests stay as they are.</p><div><button id="keepQuest" class="secondary">Keep quest</button><button id="confirmReplace" class="primary">Replace quest</button></div></div></dialog>
</section>`;
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
      const item = options.items[r.itemId] || {label:'Royal Item', art:chestArt};
      return { label: item.label, amount: `×${number(r.quantity || r.lockedAmount || 1)}`, image: item.art, item: true, note: 'Item reward fixed when this quest was assigned.' };
    }
    return { label: r.type === 'gold' ? 'Gold' : 'Troops', amount: number(r.lockedAmount), image: r.type === 'gold' ? 'assets/icons/royal-shop-gold-r1.svg' : 'assets/icons/daily-login-troops-r1.svg', item: false, note: `Based on ${r.productionHours} ${r.productionHours === 1 ? 'hour' : 'hours'} of production at assignment. This reward stays fixed.` };
  }
  const isComplete = m => Boolean(m.completedAtMs || m.claimedAtMs) || m.progress >= m.target;
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
    const recommendation = target ? `<section class="recommendation"><p class="eyebrow">Suggested target</p><strong>${escape(target.cityName)}</strong><p>${escape(options.regionLabel(target.regionId))} · From ${escape(target.sourceCityName)}<br>Suggested troops: ${number(target.recommendedTroops)}<br>Estimated losses: ${number(target.estimatedLosses)}</p><button data-map>View on map</button><small>Check the latest battle forecast before attacking.</small></section>` : '';
    $('detailScroll').innerHTML = `<div class="quest-hero"><span class="hero-medallion">${engraving(iconKey(m))}</span><h2>${escape(m.title)}</h2><p class="eyebrow">${escape(m.difficulty)} · ${escape(m.activityGroup)} quest</p></div><div class="ornament" aria-hidden="true">◆</div><section class="objective"><h3>Your objective</h3><p>${escape(m.description)}.</p>${progress(m)}</section><section class="reward-section"><h3>${isClaimed(m) ? 'Reward collected' : 'Your reward'}</h3><div class="reward-box"><img class="${r.item ? 'item' : ''}" src="${escape(r.image)}" alt=""><div><strong>${r.amount} ${escape(r.label)}</strong><small>${isClaimed(m) ? 'Added to your realm.' : 'Collect when this quest is complete.'}</small></div></div><p class="reward-note">${escape(r.note)}</p></section>${recommendation}`;
    const busy = Boolean(state.busy);
    let label, note, action, secondary = false, disabled = busy;
    if (isClaimed(m)) { label = 'Reward collected'; note = 'New quests arrive at 00:00 UTC.'; disabled = true; }
    else if (isComplete(m)) { label = state.busy === m.id ? 'Collecting…' : 'Claim reward'; note = 'Ready for collection.'; action = 'claim'; }
    else { label = state.rerollsRemaining ? 'Replace quest' : 'No replacements left'; note = `${state.rerollsRemaining} / 1 daily replacement available`; action = 'replace'; secondary = true; disabled ||= !state.rerollsRemaining; }
    const error = options.error || '';
    $('actionFooter').innerHTML = `<p class="${error ? 'error' : ''}" title="${escape(error || note)}" ${error ? 'role="alert"' : ''}>${escape(error || note)}</p><button ${action ? `data-${action}` : ''} class="${secondary ? 'secondary' : 'primary'}" ${disabled ? 'disabled' : ''}>${label}</button>`;
  }

    function renderUnavailable() {
      const content = !options.available
        ? ['Quests are unavailable', 'Enter your current realm to view its daily quests.', '']
        : expired ? ['A new day has begun', 'Load today’s quests to see your new objectives.', 'Load today’s quests']
        : options.loading ? ['Preparing your quests', 'Your daily duties are being gathered.', '']
        : ['Quests could not load', options.error || 'Please try again.', 'Try again'];
      $('questList').innerHTML = `<div class="placeholder" role="status">${engraving('ledger')}<h3>${content[0]}</h3><p>${escape(content[1])}</p>${content[2] ? `<button data-reload>${content[2]}</button>` : ''}</div>`;
      $('completionCount').textContent = '— / 3 complete';
      $('chestMilestone').innerHTML = '';
      $('detailNumber').textContent = 'Daily quests'; $('detailState').textContent = '';
      $('detailScroll').innerHTML = '<p class="detail-empty">Your quest objectives and rewards will appear here.</p>';
      $('actionFooter').innerHTML = '<p>Quest actions are temporarily unavailable.</p><button disabled>Awaiting quests</button>';
    }
    function actionable() { return options.available && !expired && !state.busy && state.missions.length === 3; }
    function render() {
      const scrollTop = $('detailScroll').scrollTop;
      if (!options.available || expired || state.missions.length !== 3) { renderUnavailable(); return; }
      $('completionCount').textContent = `${state.missions.filter(isComplete).length} / 3 complete`;
      $('questList').innerHTML = state.missions.map(renderCard).join('');
      renderChest(); renderDetail();
      $('detailScroll').scrollTop = scrollTop;
    }
    function focusSelected() {
      const button = selected === 'chest' ? $('[data-select-chest]') : [...root.querySelectorAll('[data-quest]')].find(b => b.dataset.quest === selected);
      button?.focus();
    }
    function select(id) { selected = id; render(); $('detailScroll').scrollTop = 0; focusSelected(); }
    function cancelReplace() { pendingReplace = null; $('questReplaceDialog').close(); }
    function beginReplace() {
      const m = state.missions.find(m => m.id === selected);
      if (!actionable() || !m || isComplete(m) || !state.rerollsRemaining) return;
      pendingReplace = { id:m.id, scope };
      $('replaceText').textContent = `Replace “${m.title}”? You have ${number(m.progress)} of ${number(m.target)} progress.`;
      $('questReplaceDialog').showModal(); $('keepQuest').focus();
    }
    function clock() {
      const remaining = Math.max(0, Math.ceil(((options.status?.resetsAtMs || options.now()) - options.now()) / 1000));
      $('countdown').textContent = options.status?.resetsAtMs ? [Math.floor(remaining/3600),Math.floor(remaining/60)%60,remaining%60].map(n=>String(n).padStart(2,'0')).join(':') : '--:--:--';
      const wasExpired = expired;
      expired = Boolean(options.status?.resetsAtMs && remaining <= 0);
      if (expired && !wasExpired) { cancelReplace(); render(); }
    }
    root.addEventListener('click', event => {
      if (!root.querySelector('.quests-panel')) return;
      const button = event.target.closest('button'); if (!button || !root.contains(button)) return;
      if (button.dataset.quest) select(button.dataset.quest);
      else if (button.hasAttribute('data-select-chest')) select('chest');
      else if (button.hasAttribute('data-claim')) {
        const m = state.missions.find(m => m.id === selected);
        if (actionable() && m && isComplete(m) && !isClaimed(m)) void options.claim(m.id, button);
      } else if (button.hasAttribute('data-replace')) beginReplace();
      else if (button.hasAttribute('data-reload')) void options.retry();
      else if (button.hasAttribute('data-map')) {
        const target = state.missions.find(m => m.id === selected)?.recommendedTarget;
        if (target) options.map(target);
      } else if (button.id === 'keepQuest') cancelReplace();
      else if (button.id === 'confirmReplace') {
        const pending = pendingReplace, m = state.missions.find(m => m.id === pending?.id);
        if (!pending || pending.scope !== scope || !actionable() || !m || isComplete(m) || !state.rerollsRemaining) { cancelReplace(); return; }
        cancelReplace(); void options.replace(m.id);
      }
   }, { signal:controller.signal });
    $('questList').addEventListener('keydown', event => {
      const current = event.target.closest('[data-quest]');
      if (!current || !['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const i = state.missions.findIndex(m => m.id === current.dataset.quest), count = state.missions.length;
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? count-1 : (i + (event.key === 'ArrowDown' ? 1 : count-1)) % count;
      select(state.missions[next].id);
    });
    $('questReplaceDialog').addEventListener('cancel', () => { pendingReplace = null; });
    $('questReplaceDialog').addEventListener('close', () => { root.querySelector('[data-replace]')?.focus(); });
    return { clock, destroy() { controller.abort(); root.querySelector('#questReplaceDialog')?.close(); }, update(next) {
      const priorIndex = state?.missions?.findIndex(m => m.id === selected) ?? -1;
      const focused = root.contains(document.activeElement) && !$('questReplaceDialog').open;
      options = next;
      const nextScope = `${options.scope}:${options.status?.cycleKey || ''}`;
      state = { missions:options.status?.missions || [], rerollsRemaining:options.status?.rerollsRemaining || 0,
        busy:options.busy, chestAwarded:Boolean(options.status?.allCompletedGearBoxAwardedAtMs) };
      if (nextScope !== scope) { scope = nextScope; selected = ''; cancelReplace(); }
      if (selected !== 'chest' && !state.missions.some(m => m.id === selected)) {
        selected = (state.missions[priorIndex] || state.missions.find(m => isComplete(m) && !isClaimed(m)) || state.missions[0])?.id || '';
      }
      clock();
      if (pendingReplace && (!actionable() || !state.rerollsRemaining || state.missions.some(m => m.id === pendingReplace.id && isComplete(m)))) cancelReplace();
      root.querySelector('[data-icon]').innerHTML = engraving('ledger');
      root.querySelector('.confirmation-icon').innerHTML = engraving('ledger');
      render(); if(focused) focusSelected();
    } };
  }
  window.CrownlandsQuestsUI = {
    mount(root, options) {
      let view = views.get(root);
      if (!root.querySelector('.quests-panel')) { view?.destroy(); view = createView(root); views.set(root, view); }
      view.update(options);
    },
    updateCountdown(root) { if(root?.querySelector('.quests-panel')) views.get(root)?.clock(); },
  };
})();
