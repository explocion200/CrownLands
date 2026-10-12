(function initializeStrongholdDetailsUi(global) {
  "use strict";

  // Presentation only: move the existing authoritative, report-gated stat nodes.
  // Moving (rather than cloning) preserves the live counters and action hooks.
  function mount(root, options) {
    const overview = root.querySelector('[data-stronghold-info-panel="overview"], [data-citadel-info-panel="overview"]');
    const source = overview?.querySelector('.modal-city-stats');
    if (!source) return;
    const doc = root.ownerDocument;
    const create = (tag, className) => {
      const node = doc.createElement(tag);
      node.className = className;
      return node;
    };
    const take = field => source.querySelector(`[data-holding-field="${field}"]`);
    const identity = create('aside', 'identity-column');
    identity.setAttribute('aria-label', 'Holding identity');
    const portrait = create('div', 'keep-illustration');
    const art = create('img', '');
    art.src = options.art;
    art.alt = options.name;
    const level = create('span', 'keep-level');
    const levelLabel = create('small', '');
    levelLabel.textContent = 'Defense level';
    const levelValue = create('strong', '');
    levelValue.textContent = options.level;
    level.append(levelLabel, levelValue);
    portrait.append(art, level);
    identity.append(portrait);
    const owner = take('owner');
    if (owner) identity.append(owner);
    const clan = source.querySelector('[data-objective-clan-affiliation]');
    if (clan) identity.append(clan);
    const reign = take('reign');
    if (reign) identity.append(reign);
    if (!options.crown) {
      const limit = take('limit') || create('div', 'holding-limit');
      if (!limit.hasChildNodes()) limit.textContent = 'Garrison limit · Unlimited';
      identity.append(limit);
    }

    const details = create('div', 'details-column');
    const benefits = create('div', options.crown ? 'crown-benefits' : 'holding-benefit');
    benefits.innerHTML = options.benefitMarkup;
    details.append(benefits);
    const strength = create('div', 'strength-overview');
    const defenseNotes = [];
    for (const [field, icon] of [['troops', 'assets/optimized/troops-helmet-192x192-8c144647d31b.webp'], ['estimate', 'assets/icons/skills/atlas-v1/shieldwallDiscipline.webp']]) {
      const value = take(field);
      if (!value) continue;
      value.querySelectorAll('small').forEach(note => { defenseNotes.push(note); note.remove(); });
      const card = create('div', 'strength-card');
      const image = create('img', '');
      image.src = icon;
      image.alt = '';
      card.append(image, value);
      strength.append(card);
    }
    details.append(strength);
    const rallyAssembly = source.querySelector("[data-city-rally-assembly]");
    if (rallyAssembly) details.append(rallyAssembly);
    const walls = source.querySelector('.fortification-status');
    if (walls) details.append(walls);
    const disclosures = create('div', 'overview-disclosures');
    const fold = (title, hint) => {
      const node = create('details', 'detail-fold');
      const summary = create('summary', '');
      const label = create('span', '');
      label.textContent = title;
      const small = create('small', '');
      small.textContent = hint;
      summary.append(label, small);
      const content = create('div', 'fold-content');
      node.append(summary, content);
      disclosures.append(node);
      return content;
    };
    const defense = fold('Defense & repair', 'Walls, garrison & intelligence');
    const benefitDetails = fold('Holding benefits', 'Controller & clan sharing');
    defense.append(...defenseNotes);
    if (options.benefitDetailsMarkup) benefitDetails.innerHTML = options.benefitDetailsMarkup;
    const reinforcement = source.querySelector('[data-holding-reinforcement-panel]');
    const relinquish = source.querySelector('.relinquish-city-action-panel');
    if (reinforcement) reinforcement.remove();
    if (relinquish) relinquish.remove();
    for (const node of [...source.children]) {
      (node.dataset.holdingField === 'benefits' ? benefitDetails : defense).append(node);
    }
    details.append(disclosures);
    if (reinforcement) details.append(reinforcement);
    overview.classList.add('overview-panel');
    overview.replaceChildren(identity, details);

    const wrapper = overview.parentElement;
    wrapper.dataset.holding = options.kind;
    const footer = create('footer', 'holding-footer');
    if (relinquish) footer.append(relinquish);
    else footer.textContent = options.accessNote;
    wrapper.append(footer);
    const tabs = [...wrapper.querySelectorAll('[role="tab"]')];
    const update = () => {
      const active = tabs.find(tab => tab.getAttribute('aria-selected') === 'true');
      footer.hidden = active?.getAttribute('aria-controls') !== overview.id;
      tabs.forEach(tab => { tab.tabIndex = tab === active ? 0 : -1; });
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', update);
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        tabs[next].click();
        tabs[next].focus();
      });
    });
    update();
  }
  function normalizeCrownCitadelReignEntry(raw = {}, cleanName) {
    return {
      playerId: String(raw.playerId || raw.id || ""),
      playerName: cleanName(raw.playerName || raw.displayName || "Ruler") || "Ruler",
      worldId: String(raw.worldId || ""),
      resetGeneration: String(raw.resetGeneration || ""),
      totalHeldMs: Math.max(0, Math.floor(Number(raw.totalHeldMs) || 0)),
      currentHeldSinceMs: Math.max(0, Math.floor(Number(raw.currentHeldSinceMs) || 0)),
      isCurrentHolder: Boolean(raw.isCurrentHolder),
    };
  }

  function getCrownCitadelReignScoreMs(entry, nowMs = Date.now()) {
    const totalHeldMs = Math.max(0, Number(entry?.totalHeldMs) || 0);
    const currentHeldSinceMs = Math.max(0, Number(entry?.currentHeldSinceMs) || 0);
    return totalHeldMs + (currentHeldSinceMs > 0 ? Math.max(0, nowMs - currentHeldSinceMs) : 0);
  }

  function rankReigns(entries, { holderUid, holderName, heldSinceMs, worldId, resetGeneration, cleanName, nowMs = Date.now() }) {
    const byPlayer = new Map((Array.isArray(entries) ? entries : [])
      .map(entry => normalizeCrownCitadelReignEntry(entry, cleanName))
      .filter(entry => (!entry.worldId || entry.worldId === worldId)
        && (!entry.resetGeneration || entry.resetGeneration === resetGeneration))
      .filter(entry => entry.playerId)
      .map(entry => [entry.playerId, {
        ...entry,
        currentHeldSinceMs: 0,
        isCurrentHolder: false,
      }]));

    if (holderUid) {
      const current = byPlayer.get(holderUid) || normalizeCrownCitadelReignEntry({
        playerId: holderUid,
        playerName: holderName,
      }, cleanName);
      byPlayer.set(holderUid, {
        ...current,
        playerName: holderName || current.playerName,
        currentHeldSinceMs: heldSinceMs,
        isCurrentHolder: true,
      });
    }

    return [...byPlayer.values()]
      .sort((a, b) => getCrownCitadelReignScoreMs(b, nowMs) - getCrownCitadelReignScoreMs(a, nowMs)
        || a.playerName.localeCompare(b.playerName))
      .slice(0, 100);
  }

  function reignMarkup(ranked, status, { formatNumber, formatDuration, renderPlayerNameLink, escapeHtml }) {
    if (status === "loading") {
      return `<div class="citadel-reign-empty">Loading the Reign Ledger...</div>`;
    }
    if (status === "error") {
      return `<div class="citadel-reign-empty">The Reign Ledger could not be loaded right now.</div>`;
    }
    if (!ranked.length) {
      return `<div class="citadel-reign-empty">No ruler has held the Crown Citadel yet.</div>`;
    }
    return `
      <div class="citadel-reign-heading">
        <span>Rank</span><span>Ruler</span><span>Time held</span>
      </div>
      <div class="citadel-reign-list">
        ${ranked.map((entry, index) => `
          <article class="citadel-reign-row ${entry.isCurrentHolder ? "current" : ""}" data-citadel-reign-player="${escapeHtml(entry.playerId)}">
            <strong class="citadel-reign-rank">#${formatNumber(index + 1)}</strong>
            <span class="citadel-reign-ruler">
              ${renderPlayerNameLink(entry.playerId, entry.playerName, "citadel-reign-player-link")}
              ${entry.isCurrentHolder ? `<small>Current Citadel ruler</small>` : ""}
            </span>
            <strong class="citadel-reign-time" data-citadel-reign-score data-total-held-ms="${entry.totalHeldMs}" data-current-held-since-ms="${entry.currentHeldSinceMs}">${formatDuration(Math.floor(getCrownCitadelReignScoreMs(entry) / 1000))}</strong>
          </article>`).join("")}
      </div>
      <p class="citadel-reign-note">Scores are cumulative. The current ruler's score continues rising until the Citadel changes hands.</p>`;
  }

  function updateReignRanks(panel, ranked, formatters) {
    const { formatNumber } = formatters;
    const list = panel?.querySelector(".citadel-reign-list");
    if (!list) return;
    const rows = [...list.querySelectorAll("[data-citadel-reign-player]")];
    if (rows.length === ranked.length && rows.every((row, index) => row.dataset.citadelReignPlayer === ranked[index].playerId)) return;
    // Only a rank crossing changes the list. Keep existing links and scrolling
    // intact while scores tick, including when the holder enters the top 100.
    const scroll = list.scrollTop;
    const focus = panel.ownerDocument.activeElement;
    const byPlayer = new Map(rows.map(row => [row.dataset.citadelReignPlayer, row]));
    let replacement = null;
    ranked.forEach((entry, index) => {
      let row = byPlayer.get(entry.playerId);
      if (!row) {
        if (!replacement) {
          replacement = panel.ownerDocument.createElement("div");
          replacement.innerHTML = reignMarkup(ranked, "ready", formatters);
        }
        row = [...replacement.querySelectorAll("[data-citadel-reign-player]")].find(candidate => candidate.dataset.citadelReignPlayer === entry.playerId);
      }
      if (!row) return;
      const rank = row.querySelector(".citadel-reign-rank");
      const text = `#${formatNumber(index + 1)}`;
      if (rank.textContent !== text) rank.textContent = text;
      if (list.children[index] !== row) list.insertBefore(row, list.children[index] || null);
      byPlayer.delete(entry.playerId);
    });
    byPlayer.forEach(row => row.remove());
    if (focus?.isConnected && panel.ownerDocument.activeElement !== focus) focus.focus({ preventScroll: true });
    list.scrollTop = scroll;
  }

  global.CrownlandsStrongholdDetailsUi = Object.freeze({ mount, rankReigns, reignMarkup, updateReignRanks });
})(typeof window !== 'undefined' ? window : globalThis);
