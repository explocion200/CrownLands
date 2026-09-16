"use strict";
const $ = id => document.getElementById(id);
const number = value => Number(value).toLocaleString("en-US");
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const goldIcon = "assets/icons/royal-shop-gold-r1.svg";
let sample = "owned", fixture = CAMP_SAMPLES.owned, section = "overview", actionOrigin = null;
const status = message => parent.postMessage({type: "camp-status", message}, location.origin);
const reward = (f, index) => Math.max(GOLD_CAMP.minimums[index], Math.floor(f.rate * GOLD_CAMP.hours[index]));
const duration = seconds => `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;

function identityMarkup(f) {
  return `<figure class="camp-plate"><img src="${GOLD_CAMP.art}" alt="Gold Camp with a canvas shelter, wagon, coin table and supply barrels"><figcaption>Gilded Moor · The Core</figcaption></figure>
    <div class="controller"><span class="ruler-mark" aria-hidden="true"><img src="assets/flag-symbols/selected/svg/lion.svg" alt=""></span><div><small>Controller${f.owned ? " · You" : f.ally ? " · Clan ally" : ""}</small>${f.neutral ? '<span class="plain-owner">Neutral</span>' : `<button class="name-link" data-action="profile">${esc(f.owner)}</button>`}</div></div>
    <div class="identity-facts"><div><small>Required hold</small><strong>10 minutes</strong></div><div><small>Garrison limit</small><strong>Unlimited</strong></div></div>`;
}

function rewardBanner(f) {
  if (f.rewardStatus) {
    const loading = f.rewardStatus === "loading";
    return `<section class="reward-banner unavailable" aria-label="Your reward progress"><div class="reward-topline"><h2>Your next estimated reward</h2></div><div class="reward-amount"><img src="${goldIcon}" alt=""><div><strong>${loading ? "Reading your ledger…" : "Ledger unavailable"}</strong></div></div><p>${loading ? "Your daily progress and reward estimate are loading." : "Your daily progress could not be loaded. The reward estimate is unavailable."} The public hold timer is shown below.</p></section>`;
  }
  const complete = f.claimed >= 4;
  return `<section class="reward-banner" aria-label="Your next estimated reward"><div class="reward-topline"><h2>${complete ? "Your daily rewards are complete" : "Your next estimated reward"}</h2><span class="step-label">${complete ? "4 of 4 earned" : `Reward ${f.claimed + 1} of 4`}</span></div>
    <div class="reward-amount"><img src="${goldIcon}" alt=""><div><strong>${complete ? "0" : number(reward(f, f.claimed))}</strong><small>gold</small></div></div>
    <p>${complete ? "Further successful holds award no gold today. Your four rewards reset at 00:00 UTC." : f.payout ? "Estimated payout. Waiting for confirmation before your reward is recorded." : f.owned ? "Complete this hold to earn your next reward. Final gold is calculated when the hold resolves." : "Your estimate for your next successful hold. Capture this camp and hold it for 10 minutes."}</p></section>`;
}

function holdMarkup(f) {
  const progress = f.neutral ? 0 : Math.round((GOLD_CAMP.holdSeconds - f.seconds) / GOLD_CAMP.holdSeconds * 100);
  return `<section class="hold-card" aria-label="Public hold timer"><div class="hold-heading"><div><h2>${f.neutral ? "Awaiting a ruler" : f.payout ? "Hold complete" : "Hold in progress"}</h2><small>${f.neutral ? "The timer begins after capture" : "Public timer · Current controller"}</small></div><strong>${f.neutral ? "10m hold" : f.payout ? "Resolving…" : duration(f.seconds)}</strong></div><div class="hold-track" role="progressbar" aria-label="Current hold progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div><p>${f.payout ? "Waiting for the server to confirm the payout and return stationed troops." : f.neutral ? "Capture starts a fresh ten-minute hold. Defeating the camp alone does not award gold." : "A change of control restarts the full ten-minute hold."}</p></section>`;
}

function strengthMarkup(f) {
  const known = Number.isFinite(f.troops);
  const cards = [
    ["Camp troops", "assets/icons/daily-login-troops-r1.svg", "Includes reinforcements"],
    ["Total defense", "assets/icons/skills/shieldwallDiscipline.svg", "1.00 per troop · No walls"]
  ].map(([title, icon, help]) => `<article class="strength-card"><img src="${icon}" alt=""><div><h3>${title}</h3><strong>${known ? number(f.troops) : "Unknown"}</strong><small>${help}</small></div></article>`).join("");
  const note = f.expiry ? `<strong>Scout report snapshot · Expires in ${f.expiry}.</strong> Counts reflect the report's arrival, not later battles or reinforcements.` : f.owned ? '<strong>Live holder stats.</strong> Camps have no walls or defense bonuses.' : '<strong>Scout report required.</strong> Current troops and total defense are private until scouted, including camps held by clanmates.';
  return `<div class="strength-grid">${cards}</div><p class="intel-note">${note}</p>`;
}

function supportMarkup(f) {
  if (!f.owned && !f.ally && !f.support?.length) return "";
  const rows = f.support || [];
  return `<details class="support-fold"><summary><span>${f.owned ? "Clan reinforcements" : "Your reinforcements"}</span><small>${rows.length ? `${number(rows.reduce((sum, row) => sum + row.troops, 0))} troops` : "None stationed"}</small></summary><div class="support-content">${rows.map((row, index) => `<div class="support-row"><div><strong>${esc(row.name)}</strong><small>${number(row.troops)} troops · From ${esc(row.origin)}</small></div><button class="paper-button" data-action="support" data-row="${index}">${esc(row.action)}</button></div>`).join("")}<p>${f.owned ? "Reinforcements are included in camp troops and total defense. The holder can send allied troops home." : "Only your contribution is shown here. Your clanmate's full garrison remains private until scouted."}</p></div></details>`;
}

function rewardsMarkup(f) {
  const intro = `<div class="panel-intro"><img src="${goldIcon}" alt=""><div><p class="eyebrow">YOUR DAILY LEDGER</p><h2>Four holds. Richer rewards.</h2><p>Your progress is shared across all Gold Camp locations in this realm.</p></div></div>`;
  if (f.rewardStatus) return `${intro}${rewardBanner(f)}<p class="formula-note">The daily ladder remains four successful ten-minute holds. Your completed count and reward amounts will appear when your progress is available.</p>`;
  return `${intro}<div class="rewards-summary"><span><strong>${f.claimed} of 4 rewards earned</strong> · ${4 - f.claimed} remaining today</span><span>Daily reset <strong>00:00 UTC</strong></span></div>
    <div class="reward-ladder">${GOLD_CAMP.minimums.map((minimum, i) => `<article class="reward-step ${i < f.claimed ? "claimed" : i === f.claimed ? "next" : ""}"><h3>Hold ${i + 1}<span>${i < f.claimed ? "Earned" : i === f.claimed ? "Next reward" : "Upcoming"}</span></h3><img src="${goldIcon}" alt=""><strong>${number(reward(f, i))}</strong><small>gold · Current estimate</small><p class="step-rule"><b>${GOLD_CAMP.hours[i]} ${GOLD_CAMP.hours[i] === 1 ? "hour" : "hours"}</b> of gold production<br>At least <b>${number(minimum)} gold</b></p></article>`).join("")}</div>
    <p class="formula-note"><strong>Your raw kingdom production: ${number(f.rate)} gold per hour.</strong><br>Each reward uses the higher of its minimum or your production multiplied by the listed hours, rounded down. Amounts shown use current production; earned steps are progress markers, not a receipt of previous payouts. Final gold is calculated when each hold resolves.</p>
    <p class="intel-note">After four rewards, additional successful Gold Camp holds award 0 gold until 00:00 UTC. Your progress applies across all Gold Camps, even when a different ruler controls this location.</p>`;
}

function rulesMarkup() {
  const blocks = [
    ["Capture & hold", "Capture the camp and remain its controller for 10 minutes. A new capture or change of control restarts the timer. The current controller and hold timer are public."],
    ["Four daily rewards", "Your first four successful Gold Camp holds share one daily reward ladder across every Gold Camp in the realm. Rewards reset at 00:00 UTC. Further successful holds award 0 gold that day."],
    ["Gold calculation", "The four rewards use 0.5, 1, 1.5 and 2 hours of raw kingdom gold production, with minimums of 20,000, 40,000, 60,000 and 80,000 gold. Each reward is the higher amount, rounded down."],
    ["Defenses & scouting", "A fresh neutral Gold Camp starts with 20,000 troops. This starting rule does not reveal its current garrison after battles. Current troops and total defense require ownership or a valid scout report.", "There are no walls or camp levels. Every defending troop contributes 1.00 defense, including reinforcements. Camps receive no defense bonuses and have no garrison cap."],
    ["Payout & troop return", "When the server resolves a completed hold, gold is paid into the holder's treasury and stationed troops return to their origin cities, using the sender's Main City if the original city is no longer owned. The camp becomes neutral again."],
    ["A field outpost", "Camps do not count as cities, cannot be shielded and ignore weaker-kingdom attack restrictions. Clan reinforcements can be sent home by the holder; senders can recall their own troops."]
  ];
  return `<div class="panel-intro"><img src="${goldIcon}" alt=""><div><p class="eyebrow">GOLD CAMP CHARTER</p><h2>Know the ground you hold.</h2><p>Capture the outpost, complete the hold, receive the reward.</p></div></div><div class="rules-grid">${blocks.map(([title, ...paragraphs]) => `<article class="rule-block"><h3>${title}</h3>${paragraphs.map(p => `<p>${p}</p>`).join("")}</article>`).join("")}</div>`;
}

function selectTab(next, focus = false) {
  section = next;
  document.querySelectorAll('[role="tab"]').forEach(tab => {
    const active = tab.dataset.tab === next;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    const panel = $(`${tab.dataset.tab}Panel`);
    panel.hidden = !active;
    if (active) panel.scrollTop = 0;
    if (active && focus) tab.focus();
  });
  $("rewardShortcut").hidden = next === "rewards";
  status(`${sample} example · ${next === "rewards" ? "Your Rewards" : next === "rules" ? "Camp Rules" : "Overview"}`);
}

function render() {
  const f = fixture;
  $("ownership").textContent = f.owned ? "Your camp" : f.neutral ? "Neutral camp" : f.ally ? "Clan ally" : "Rival camp";
  $("ownership").className = `ownership ${f.neutral ? "neutral" : !f.owned && !f.ally ? "enemy" : ""}`;
  $("identity").innerHTML = identityMarkup(f);
  $("overview").innerHTML = rewardBanner(f) + holdMarkup(f) + strengthMarkup(f) + supportMarkup(f);
  $("rewardsPanel").innerHTML = rewardsMarkup(f);
  $("rulesPanel").innerHTML = rulesMarkup();
  selectTab(section);
}

function reset(next = "owned") {
  if ($("actionDialog").open) $("actionDialog").close();
  sample = Object.hasOwn(CAMP_SAMPLES, next) ? next : "owned";
  fixture = CAMP_SAMPLES[sample];
  section = "overview";
  render();
  for (const id of ["identity", "overview", "rewardsPanel", "rulesPanel"]) $(id).scrollTop = 0;
  if (!$("campDialog").open) $("campDialog").showModal();
  $("overviewTab").focus();
}

document.querySelectorAll('[role="tab"]').forEach(tab => {
  tab.addEventListener("click", () => selectTab(tab.dataset.tab));
  tab.addEventListener("keydown", event => {
    const tabs = [...document.querySelectorAll('[role="tab"]')], current = tabs.indexOf(tab);
    const index = {ArrowRight: (current + 1) % tabs.length, ArrowLeft: (current + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1}[event.key];
    if (index !== undefined) { event.preventDefault(); selectTab(tabs[index].dataset.tab, true); }
  });
});
$("campDialog").addEventListener("click", event => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  actionOrigin = button;
  if (button.dataset.action === "profile") {
    $("actionTitle").textContent = fixture.owner;
    $("actionCopy").textContent = "This link opens the controller's ruler profile in the game. Return to continue reviewing the Gold Camp.";
  } else {
    const row = fixture.support[Number(button.dataset.row)];
    $("actionTitle").textContent = `${row.action} · ${number(row.troops)} troops`;
    $("actionCopy").textContent = `${row.action} would return this contribution to ${row.origin}. If that city is no longer owned, the sender's Main City is used. This is an action preview only.`;
  }
  $("actionDialog").showModal();
});
$("dismiss").addEventListener("click", () => $("actionDialog").close());
$("actionDialog").addEventListener("close", () => { if (actionOrigin?.isConnected) actionOrigin.focus(); });
$("rewardShortcut").addEventListener("click", () => selectTab("rewards", true));
for (const id of ["close", "back"]) $(id).addEventListener("click", () => $("campDialog").close());
$("campDialog").addEventListener("close", () => { $("reopen").focus(); status("Camp closed · Open Gold Camp to return"); });
$("reopen").addEventListener("click", () => { $("campDialog").showModal(); $(`${section}Tab`).focus(); });
window.addEventListener("message", event => { if (event.origin === location.origin && event.source === parent && event.data?.type === "camp-review") reset(event.data.sample); });
reset(new URLSearchParams(location.search).get("sample") || "owned");
