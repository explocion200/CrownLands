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
    for (const [field, icon] of [['troops', 'daily-login-troops-r1.svg'], ['estimate', 'skills/shieldwallDiscipline.svg']]) {
      const value = take(field);
      if (!value) continue;
      value.querySelectorAll('small').forEach(note => { defenseNotes.push(note); note.remove(); });
      const card = create('div', 'strength-card');
      const image = create('img', '');
      image.src = `assets/icons/${icon}`;
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
  global.CrownlandsStrongholdDetailsUi = Object.freeze({ mount });
})(typeof window !== 'undefined' ? window : globalThis);
