/* Shared with the game client. Never pass account, city, army, or form data here. */
(() => {
  'use strict';
  const measurementId = 'G-K5W0M2NPFN';
  const cookieName = 'cl_analytics_v1';
  const game = /^\/play(?:\/index\.html|\/)?$/.test(location.pathname) || location.hostname === 'game.playcrownlands.com';
  const production = location.protocol === 'https:' && [
    'playcrownlands.com', 'www.playcrownlands.com', 'game.playcrownlands.com',
  ].includes(location.hostname);
  const privatePage = /\/(support|privacy|terms|game-rules)(?:\.html)?\/?$/.test(location.pathname);
  const allowed = new Set(['homepage_view', 'play_click', 'game_entry', 'first_action']);
  const actions = new Set(['city_upgrade', 'attack', 'scout', 'transfer']);
  const denied = { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };
  let loaded = false;
  let panel;
  let trigger;
  const seen = new Set();
  const preference = () => document.cookie.split('; ').find(c => c.startsWith(cookieName + '='))?.split('=')[1];
  function command() { window.dataLayer = window.dataLayer || []; window.dataLayer.push(arguments); }
  function load() {
    if (!production || privatePage || preference() !== 'yes' || loaded) return;
    loaded = true;
    window['ga-disable-' + measurementId] = false;
    command('consent', 'default', denied);
    command('consent', 'update', { ...denied, analytics_storage: 'granted' });
    command('js', new Date());
    command('config', measurementId, {
      send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
      cookie_domain: 'playcrownlands.com', cookie_expires: 15552000, cookie_update: false,
      cookie_flags: 'SameSite=Lax;Secure', page_location: location.origin + location.pathname,
      page_referrer: '', page_title: game ? 'Crownlands game' : 'Crownlands website',
    });
    const script = document.createElement('script');
    script.async = true; script.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
    document.head.append(script);
  }
  function track(name, action) {
    try {
      if (!production || privatePage || preference() !== 'yes' || !allowed.has(name)) return;
      if (name === 'first_action' && (!actions.has(action) || !seen.has('game_entry'))) return;
      load();
      // A fresh game-entry event is required in this page before its first action.
      if (name !== 'play_click' && seen.has(name)) return;
      seen.add(name);
      command('event', name, { send_to: measurementId, surface: game ? 'game' : 'website',
        ...(name === 'first_action' ? { action_type: action } : {}),
        page_location: location.origin + location.pathname, page_referrer: '',
      });
    } catch { /* Analytics must never interrupt play, including blocked storage. */ }
  }
  function clearCookies() {
    for (const cookie of document.cookie.split('; ')) {
      const name = cookie.split('=')[0];
      if (!/^_ga(?:_|$)/.test(name)) continue;
      for (const domain of ['', '; Domain=playcrownlands.com', '; Domain=' + location.hostname]) {
        document.cookie = name + '=; Max-Age=0; Path=/' + domain + '; SameSite=Lax; Secure';
      }
    }
  }
  function choose(value) {
    try {
      document.cookie = `${cookieName}=${value}; Max-Age=15552000; Path=/; SameSite=Lax${production ? '; Secure; Domain=playcrownlands.com' : ''}`;
      if (value === 'yes') {
        window['ga-disable-' + measurementId] = false;
        if (loaded) command('consent', 'update', { ...denied, analytics_storage: 'granted' });
        else load();
        if (!game && location.pathname === '/') track('homepage_view');
      } else {
        window['ga-disable-' + measurementId] = true;
        if (loaded) command('consent', 'update', denied);
        clearCookies(); seen.clear();
      }
      panel.hidden = true;
      trigger.textContent = `Analytics: ${value === 'yes' ? 'allowed' : 'off'}`;
      trigger.focus();
    } catch { panel.querySelector('[data-choice-note]').textContent = 'Your browser blocked saving this preference. Optional analytics stays off.'; }
  }
  function mount() {
    panel = document.createElement('section');
    panel.className = 'journey-choice'; panel.setAttribute('aria-label', 'Optional analytics');
    panel.innerHTML = '<strong>Help improve Crownlands?</strong><p>Allow Google Analytics to measure the steps from this website into the game? Optional cookies identify this browser; we do not send your name, email, chat, or gameplay records.</p><p data-choice-note>These choices apply across the Crownlands website and game. Advertising consent is separate.</p><div><button type="button" data-choice="yes">Allow analytics</button><button type="button" data-choice="no">Keep analytics off</button><a href="https://playcrownlands.com/privacy.html#analytics">Privacy details</a></div>';
    panel.querySelectorAll('[data-choice]').forEach(button => button.addEventListener('click', () => choose(button.dataset.choice)));
    trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'journey-settings';
    trigger.textContent = 'Analytics choices';
    trigger.addEventListener('click', () => { panel.hidden = !panel.hidden; if (!panel.hidden) panel.querySelector('button').focus(); });
    panel.addEventListener('keydown', event => { if (event.key === 'Escape') { panel.hidden = true; trigger.focus(); } });
    const host = document.querySelector('[data-analytics-settings]') || document.querySelector('.footer-legal') || document.body;
    host.append(trigger); document.body.append(panel);
    panel.hidden = Boolean(preference()) || !production;
    if (!production) panel.querySelector('[data-choice-note]').textContent = 'Preview mode: analytics collection is disabled.';
    load();
    if (!game && location.pathname === '/') track('homepage_view');
    document.addEventListener('click', event => {
      const anchor = event.target.closest('a[href]');
      if (anchor && /^https:\/\/playcrownlands\.com\/play\//.test(anchor.href)) track('play_click');
    });
    // Reconcile a choice changed in another Crownlands tab before any further collection.
    window.addEventListener('focus', () => {
      if (preference() !== 'yes') {
        window['ga-disable-' + measurementId] = true;
        if (loaded) command('consent', 'update', denied);
        clearCookies(); seen.clear();
      } else {
        window['ga-disable-' + measurementId] = false;
        if (loaded) command('consent', 'update', { ...denied, analytics_storage: 'granted' });
        else load();
      }
    });
  }
  window.CrownlandsJourney = Object.freeze({ track });
  try { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount(); } catch { /* Optional UI and storage cannot block the game. */ }
})();
