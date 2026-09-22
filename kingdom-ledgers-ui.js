(function initializeKingdomLedgersUi(global) {
  "use strict";
  // Decorative presentation is cached on demand, like the other ledger modules.
// Same specialization icons used by the approved Strongholds ledger.
const ATLAS_STRONGHOLD_BONUS_ICONS = Object.freeze({
 "core-v2-greybanner-hold-p0-m1": "assets/icons/daily-login-troops-r1.svg",
 "core-v2-aurum-keep-m1-p0": "assets/icons/royal-shop-gold-r1.svg",
 "core-v2-swiftgate-p1-p0": "assets/icons/skills/marchOrders.svg",
 "core-v2-ironwatch-p0-p1": "assets/icons/skills/shieldwallDiscipline.svg"
});
// Decorative SVG overlays stay outside layout and never intercept map gestures.
function atlasFeatureFrame(kind, citadel = false, bonusIcon = "", hasClanFlag = false) {
 const corners = (art, inset = 0, bottomArt = art) => [
  `translate(${inset} ${inset})`,
  `translate(${262-inset} ${inset}) scale(-1 1)`,
  `translate(${inset} ${203-inset}) scale(1 -1)`,
  `translate(${262-inset} ${203-inset}) scale(-1 -1)`
 ].map((transform, index) => `<g transform="${transform}">${index < 2 ? art : bottomArt}</g>`).join("");
 let art = "";
 if (kind === "tower") {
  const turret = `<path d="M2 29V3h6v5h5V2h6v6h5V3h6v26l-5 5H7Z" fill="#607557" stroke="#293e2d" stroke-width="1.6"/>
   <path d="M5 12h22M4 21h24M11 13v7m10-7v7M15 22v9" fill="none" stroke="#344b35" stroke-width="1.2"/>
   <path d="M4 29V11m2 0h21M3 4h3m9-1h3m8 1h3" fill="none" stroke="#c4cc9b" stroke-width="1.2"/>
   <path d="M13 29v-5a3 3 0 0 1 6 0v5" fill="#263c2a"/>`;
  art = `<rect x="8" y="8" width="246" height="187" rx="1" fill="none" stroke="#293e2d" stroke-width="11"/>
   <rect x="8" y="8" width="246" height="187" fill="none" stroke="#526c44" stroke-width="8"/>
   <rect x="13" y="13" width="236" height="177" fill="none" stroke="#c4cc9b" stroke-width="1.3"/>
   <path d="M38 7h72m42 0h72M38 196h186M7 42v119m248-119v119" fill="none" stroke="#94a477" stroke-width="1"/>
   ${corners(turret, 0, '<path d="M2 26V3h29v8H11v15Z" fill="#607557" stroke="#293e2d" stroke-width="1.5"/><path d="M5 24V6h23M13 7v3m8-3v3" fill="none" stroke="#c4cc9b" stroke-width="1"/><circle cx="7" cy="7" r="2" fill="#344b35"/>')}
   ${hasClanFlag ? "" : `<g class="neutral-tower-crest"><path d="M116 1h30v17l-15 12-15-12Z" fill="#354e36" stroke="#c4cc9b" stroke-width="1.5"/>
   <path d="M123 19V8h4V4h3v4h3V4h3v4h3v11Zm6 0v-5h4v5" fill="#d8d9ad" stroke="#233825" stroke-width=".7"/></g>`}`;
 } else if (kind === "camp") {
  const fitting = `<path d="M1 1h27v6H11l-4 4v17H1Z" fill="#dcb465" stroke="#755323" stroke-width="1.4"/>
   <path d="M3 26V3h23M10 9l4-4" fill="none" stroke="#fff0ba" stroke-width="1.2"/>
   <path d="m3 3 7 7" fill="none" stroke="#8d662d" stroke-width="1"/>
   <circle cx="5" cy="5" r="2" fill="#82602f" stroke="#ffedb3" stroke-width=".7"/>
   <circle cx="23" cy="4" r="1.4" fill="#80602c"/><circle cx="4" cy="23" r="1.4" fill="#80602c"/>`;
  art = `<rect x="16" y="16" width="230" height="171" fill="none" stroke="#775724" stroke-width="7"/>
   <rect x="16" y="16" width="230" height="171" fill="none" stroke="#e6c16f" stroke-width="5"/>
   <rect x="19" y="19" width="224" height="165" fill="none" stroke="#fff1ba" stroke-width="1"/>
   <path d="M46 16h69m32 0h69M46 187h170M16 46v111m230-111v111" fill="none" stroke="#a47d38" stroke-width="1" stroke-dasharray="2 4"/>
   ${corners(fitting, 12, '<path d="M0 23V0h28v4H4v19Z" fill="#dcb465" stroke="#755323" stroke-width="1"/><path d="M2 21V2h24" fill="none" stroke="#fff0ba" stroke-width="1"/><circle cx="2" cy="2" r="1.5" fill="#80602c"/>')}
   <circle cx="131" cy="13" r="12" fill="#dab366" stroke="#755323" stroke-width="1.5"/>
   <circle cx="131" cy="13" r="9.5" fill="none" stroke="#ffedb2"/>
   <path d="m122 19 9-15 9 15Zm9-15v15m-5 0 5-8 5 8" fill="#f6e4a7" stroke="#694d23" stroke-width="1.2" stroke-linejoin="round"/>`;
 } else if (kind === "royal") {
  const flourish = `<path d="M0 22V4L4 0h18l-3 5H9L5 9v10Z" fill="#d9b56d" stroke="#633923" stroke-width="1.2"/>
   <path d="M3 17V6l3-3h11" fill="none" stroke="#fff0bd" stroke-width="1.2"/>
   <path d="M9 10c14-10 19 1 9 5 5-7-4-8-9-5Zm1-1c-10 14 1 19 5 9-7 5-8-4-5-9Z" fill="#c69a53" stroke="#683e26" stroke-width=".9"/>
   <path d="m5 5 4 3-1 4-4-3Z" fill="#923c32" stroke="#ffdf97" stroke-width=".7"/>`;
  // Show each Stronghold's specialization; only Crown Citadel uses the crown.
  const crest = citadel ? `<g class="citadel-crest">
   <path d="M110 5q21-12 42 0l-3 19-18 12-18-12Z" fill="#7e3029" stroke="#dcb775" stroke-width="1.7"/>
   <path d="m113 8 4 15 14 9 14-9 4-15" fill="none" stroke="#b36d51" stroke-width="1"/>
   <path d="m117 10 7 5 7-12 7 12 7-5-4 14h-20Z" fill="#e6c17e" stroke="#593924" stroke-width="1.2" stroke-linejoin="round"/>
   <path d="M121 21h20m-16-4 6-10 5 10" fill="none" stroke="#fff1b9" stroke-width="1.2"/>
   <circle cx="117" cy="9" r="2" fill="#f4d895" stroke="#593924" stroke-width=".7"/>
   <circle cx="145" cy="9" r="2" fill="#f4d895" stroke="#593924" stroke-width=".7"/>
   <path d="m131 1 3 3-3 3-3-3Z" fill="#fff3c5" stroke="#593924" stroke-width=".7"/>
   <path d="m105 6-7-3 3 7m56-4 7-3-3 7M124 28l7 4 7-4" fill="none" stroke="#f1d897" stroke-width="1.5"/>
   </g>` : `<g class="stronghold-crest">
   <path d="M106 0q25-12 50 0l-3 23-22 15-22-15Z" fill="#7e3029" stroke="#dcb775" stroke-width="1.7"/>
   <path d="M110 2q21-9 42 0l-3 19-18 12-18-12Z" fill="#dfcba0" stroke="#a57e47" stroke-width="1"/>
   ${bonusIcon ? `<image class="stronghold-bonus-icon" href="${bonusIcon}" x="114" y="-3" width="34" height="34" preserveAspectRatio="xMidYMid meet"/>` : ''}
   </g>`;
  art = `<rect x="8" y="8" width="246" height="187" rx="2" fill="none" stroke="#542b24" stroke-width="13"/>
   <rect x="8" y="8" width="246" height="187" rx="1" fill="none" stroke="#8e352e" stroke-width="10"/>
   <rect x="2.8" y="2.8" width="256.4" height="197.4" rx="2" fill="none" stroke="#d0a25d" stroke-width="1.5"/>
   <rect x="13.2" y="13.2" width="235.6" height="176.6" fill="none" stroke="#f0d492" stroke-width="1.5"/>
   <path d="M39 7h67m50 0h67M39 196h68m48 0h68M7 39v125m248-125v125" fill="none" stroke="#bb7860" stroke-width="1"/>
   ${corners(flourish)}
   <path d="m119 190 12-5 12 5v9l-12 4-12-4Z" fill="#89362d" stroke="#d7b373" stroke-width="1.2"/>
   <path d="m131 189 4 5-4 5-4-5Z" fill="#e1bd78"/>
   ${crest}`;
 }
 return `<svg class="feature-frame frame-${kind}" viewBox="0 0 262 203" aria-hidden="true" focusable="false">${art}</svg>`;
}

function formatLedgerNumber(value) {
  return Math.floor(Number(value) || 0).toLocaleString("en-US");
}

function formatLedgerBaseAndBonus(baseValue, totalValue) {
  const base = Math.max(0, Math.floor(Number(baseValue) || 0));
  const total = Math.max(base, Math.floor(Number(totalValue) || 0));
  return `${formatLedgerNumber(base)} (+${formatLedgerNumber(total - base)})`;
}

function updateLeaderboardStanding(panel, category, entries, currentUid, clanId, limit) {
  const clans = category === "clans";
  const standing = panel?.querySelector('.leaderboard-standing');
  if (!standing) return;
  const index = entries.findIndex(entry => clans ? entry.id === clanId : entry.uid === currentUid);
  const entry = entries[index];
  standing.innerHTML = entry
    ? `<span>${clans ? "Your clan" : "Your standing"}</span><strong>#${index + 1}</strong><b>${formatLedgerNumber(clans ? entry.totalKingPower || 0 : entry.kingPower)} <small>${clans ? "Clan" : "King"} Power</small></b><button type="button" data-find-rank>Find my ${clans ? "clan" : "rank"} ↓</button>`
    : `<span>Your ${clans ? "clan" : "kingdom"} is not in this Top ${formatLedgerNumber(limit)}.</span>`;
  standing.querySelector('[data-find-rank]')?.addEventListener('click', () => {
    const row = panel.querySelector('.leaderboard-row.current');
    row?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    row?.focus({ preventScroll: true });
  });
}

  global.CrownlandsKingdomLedgersUi = Object.freeze({ formatLedgerNumber, formatLedgerBaseAndBonus, atlasFeatureFrame, updateLeaderboardStanding, strongholdIcons: ATLAS_STRONGHOLD_BONUS_ICONS });
})(window);
