(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CrownlandsRewardLedger = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
  const amount = value => Math.max(0, Math.floor(Number(value) || 0)).toLocaleString("en-US");
  const amountClass = value => amount(value).length > 11 ? " long-amount" : "";
  const positiveAmount = value => (Number(value) > 0 ? "+" : "") + amount(value);

  function renderHero(reward, art) {
    return `
<section class="honor-panel" aria-label="Hero level advancement">
<div class="banner-rod" aria-hidden="true"></div><div class="level-banner"><div class="banner-stitch" aria-hidden="true"></div><img class="hero-crown" src="assets/icons/hero-reward-crown.svg" alt=""><span class="banner-label">HERO LEVEL</span><strong id="levelUpHeroLevel">${amount(reward.toLevel)}</strong><span class="banner-flourish" aria-hidden="true">◆</span></div>
<div class="advancement"><span class="advancement-caption">YOUR ADVANCEMENT</span><div class="level-step"><span data-reward-from>${amount(reward.fromLevel)}</span><svg viewBox="0 0 32 16" aria-hidden="true"><path d="M2 8h27m-7-6 7 6-7 6" fill="none" stroke="currentColor" stroke-width="1.4"/></svg><strong data-reward-to>${amount(reward.toLevel)}</strong></div><p data-reward-levels>${amount(reward.levelsGained)} ${reward.levelsGained === 1 ? "level" : "levels"} gained</p></div>
</section>
<section class="reward-ledger" aria-label="Rewards earned">
<div class="ledger-heading"><h2>Rewards earned</h2><span aria-hidden="true">I</span></div>
<div class="reward-list">
<article class="reward-row skill level-up-reward-item"><span class="reward-art level-up-reward-icon"><img src="assets/icons/reward-achievements-r1.svg" alt=""></span><div class="reward-copy"><h3 data-reward-skill-label>Skill ${reward.skillPoints === 1 ? "point" : "points"}</h3><strong class="amount${amountClass(reward.skillPoints)}" data-reward-amount="skillPoints">+${amount(reward.skillPoints)}</strong></div><p class="reward-purpose">For your<br>hero's skills</p></article>
<article class="reward-row gold level-up-reward-item"><span class="reward-art level-up-reward-icon"><img src="${escape(art.gold)}" alt=""></span><div class="reward-copy"><h3>Gold</h3><strong class="amount${amountClass(reward.gold)}" data-reward-amount="gold">+${amount(reward.gold)}</strong></div><p class="reward-purpose">To your<br>treasury</p></article>
<article class="reward-row troops level-up-reward-item"><span class="reward-art level-up-reward-icon"><img src="${escape(art.troops)}" alt=""></span><div class="reward-copy"><h3>Troops</h3><strong class="amount${amountClass(reward.troops)}" data-reward-amount="troops">+${amount(reward.troops)}</strong></div><p class="reward-purpose">To your<br>Main City</p></article>
</div>
<div class="troop-destination"><svg viewBox="0 0 48 48" aria-hidden="true"><g fill="#d6c395" stroke="#796348" stroke-width="1.5" stroke-linejoin="round"><path d="M6 43V20h4v5h5v-5h4v23m10 0V20h4v5h5v-5h4v23ZM19 43V13h10v30M22 13V7h4v6"/><path d="M18 43h12M4 43h40M19 20h10"/><path fill="#927551" d="M21 43v-9a3 3 0 0 1 6 0v9"/><path fill="#7b4439" d="M25 3v-2m0 2h10l-4 3 4 3H25"/><path d="M9 32h5m20 0h5M23 23h2"/></g></svg><div><span>Troop destination · Main City</span><strong data-reward-city>${escape(reward.cityName || "your main city")}</strong></div></div>
</section>
`;
  }

  function cityLedger(cities, total, inactivityMarkup) {
    const rows = cities.map((city,index) => `<li ${index >= 4 ? "hidden" : ""}><strong>${escape(city.name || city.id)}</strong><span>${escape(city.regionLabel)}</span></li>`).join("");
    const missing = Math.max(0, total - cities.length);
    const losses = total > 0 ? `<div class="loss-summary"><div><span>Cities lost while away</span><strong>${amount(total)}</strong></div><span class="loss-mark" aria-hidden="true">◆</span></div>
      <ul id="lostCities">${rows}</ul>
      ${cities.length > 4 ? `<button class="expand-cities" type="button" aria-expanded="false" aria-controls="lostCities" data-offline-expand>Show all ${amount(cities.length)} named cities</button>` : ""}
      ${missing ? `<p class="missing-cities">${amount(missing)} additional ${missing === 1 ? "city name" : "city names"} unavailable.</p>` : ""}` : "";
    return losses + inactivityMarkup || `<div  class="safe-status"><svg class="city-seal" viewBox="0 0 140 150" aria-hidden="true"><g stroke="#68724e" stroke-width="1.8" stroke-linejoin="round"><path d="M24 13Q70 0 116 13v59c0 28-22 50-46 64-24-14-46-36-46-64Z" fill="#d7d7b3"/><path d="M30 19Q70 9 110 19v52c0 25-19 44-40 58-21-14-40-33-40-58Z" fill="none" stroke="#98a07b"/><g fill="#ede4c7"><path d="M41 90V53h7v8h9v-8h7v37M77 90V53h7v8h9v-8h7v37M61 90V37h18v53"/><path d="m58 38 12-16 12 16Z" fill="#888567"/><path d="M66 90V75a4 4 0 0 1 8 0v15" fill="#8b8d6b"/><path d="M38 91h65M46 71h7m33 0h7M68 49h4"/></g><path d="m57 106 9 8 20-20" fill="none" stroke-width="3"/></g></svg><strong>No cities lost</strong><p>Your kingdom welcomes<br>you home.</p><span class="safe-count">0 cities lost</span></div>
`;
  }

  function renderOffline(reward, art, {elapsedText, lostCities, totalLost, inactivityMarkup = ""}) {
    return `<article class="parchment">
<header class="welcome-header"><div><p class="eyebrow">THE KINGDOM'S CHRONICLE</p><h1 id="offlineTitle" tabindex="-1">Welcome back</h1></div><div class="away-time"><svg viewBox="0 0 32 40" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 3h22M5 37h22M8 4c0 10 0 10 8 16-8 6-8 6-8 16m16-32c0 10 0 10-8 16 8 6 8 6 8 16"/><path d="M11 10h10l-5 6Zm5 15 5 8H11Z" fill="currentColor"/></g></svg><div><span>TIME AWAY</span><strong data-offline-elapsed>${escape(elapsedText)}</strong></div></div></header>
<div class="welcome-body">
<section class="earnings" aria-labelledby="earningsTitle"><div class="section-heading"><span class="folio" aria-hidden="true">I</span><h2 id="earningsTitle">While you were away</h2></div>
<div class="reward-list offline-reward-grid">
<div class="reward-row gold"><img src="${escape(art.gold)}" alt=""><div><h3>Gold collected</h3><strong data-offline-amount="gold" class="amount${amountClass(reward.goldGained)}">${positiveAmount(reward.goldGained)}</strong><p>Added to your treasury</p></div></div>
<div class="reward-row troops"><img src="${escape(art.troops)}" alt=""><div><h3>Troops produced</h3><strong data-offline-amount="troops" class="amount${amountClass(reward.troopsGained)}">${positiveAmount(reward.troopsGained)}</strong><p>Remaining in cities you still own</p></div></div>
</div>
<p class="receipt-note"><span aria-hidden="true">✦</span> A record of your kingdom's production.</p>
</section>
<section class="holdings" aria-labelledby="holdingsTitle"><div class="section-heading"><span class="folio" aria-hidden="true">II</span><h2 id="holdingsTitle">${inactivityMarkup ? "Your holdings" : "Your cities"}</h2></div>
<div id="offlineCityLedger" class="city-ledger" tabindex="0" role="region" aria-label="City status and losses">${cityLedger(lostCities,totalLost,inactivityMarkup)}</div></section>
</div>
<footer class="welcome-footer"><p><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M21 11v9H3V3h12" fill="none" stroke="currentColor"/></svg><span data-offline-receipt>${reward.goldGained || reward.troopsGained ? "Production already added to your kingdom." : "Your return summary has been recorded."}</span></p><button id="offlineCollectBtn" type="button">Collect <span aria-hidden="true">›</span></button></footer>
</article>`;
  }

  function bindOffline(root) {
    const button = root.querySelector("[data-offline-expand]");
    button?.addEventListener("click", () => {
      const expanded = button.getAttribute("aria-expanded") !== "true";
      const rows = [...root.querySelectorAll("#lostCities > li")];
      rows.forEach((row,index) => { row.hidden = !expanded && index >= 4; });
      button.setAttribute("aria-expanded", String(expanded));
      button.textContent = expanded ? "Show fewer cities" : `Show all ${amount(rows.length)} named cities`;
      if (!expanded) root.querySelector("#offlineCityLedger").scrollTop = 0;
    });
  }
  function renderNotice(title, markup) {
    return `<article class="parchment"><header class="welcome-header"><div><p class="eyebrow">THE KINGDOM'S CHRONICLE</p><h1>${escape(title)}</h1></div></header><section class="notice-body">${markup}</section><footer class="welcome-footer"><p>Your account and ruler identity remain.</p><button id="inactivityNoticeCloseBtn" type="button">Continue <span aria-hidden="true">›</span></button></footer></article>`;
  }
  return Object.freeze({renderHero, renderOffline, renderNotice, bindOffline});
});
