"use strict";
const $ = id => document.getElementById(id);
const number = value => Number(value).toLocaleString("en-US");
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
let campKey = "gold", camp = CAMP_DEFINITIONS.gold;
let sample = "owned", fixture = campFixture(sample, campKey), section = "overview", actionOrigin = null;
const status = message => parent.postMessage({type: "camp-status", message}, location.origin);
const reward = (f, index) => Math.max(camp.minimums[index], Math.floor(f.rate * camp.hours[index]));
const duration = seconds => `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
const holdMinutes = () => camp.holdSeconds / 60;
const productionCamp = () => Boolean(camp.minimums);
const heading = () => productionCamp() ? "Your next estimated reward" : "Your next hold reward";
const payoutDestination = () => campKey === "gold" ? "Gold is paid into your treasury." : campKey === "troops" ? "Reward troops are delivered to your Main City." : campKey === "items" ? "One random usable item is added to your Bag." : "One eligible random neutral city becomes yours at its existing level, with zero troops.";

function identityMarkup(f) {
  return `<figure class="camp-plate"><img src="${camp.art}" alt="${esc(camp.artDescription)}"><figcaption>${esc(camp.map)} · The Core</figcaption></figure>
    <div class="controller"><span class="ruler-mark" aria-hidden="true"><img src="assets/flag-symbols/selected/svg/lion.svg" alt=""></span><div><small>Controller${f.owned ? " · You" : f.ally ? " · Clan ally" : ""}</small>${f.neutral ? '<span class="plain-owner">Neutral</span>' : `<button class="name-link" data-action="profile">${esc(f.owner)}</button>`}</div></div>
    <div class="identity-facts"><div><small>Required hold</small><strong>${holdMinutes()} minutes</strong></div><div><small>Garrison limit</small><strong>Unlimited</strong></div></div>`;
}

function rewardBanner(f) {
  if (f.rewardStatus) {
    const loading = f.rewardStatus === "loading";
    return `<section class="reward-banner unavailable" aria-label="Your reward progress"><div class="reward-topline"><h2>${heading()}</h2></div><div class="reward-amount"><img src="${camp.icon}" alt=""><div><strong>${loading ? "Reading your ledger…" : "Ledger unavailable"}</strong></div></div><p>${loading ? "Your daily reward progress is loading." : "Your daily progress could not be loaded. Reward eligibility is unavailable."} The public hold timer is shown below.</p></section>`;
  }
  if (f.reserved) return `<section class="reward-banner reserved" aria-label="Your reserved city award"><div class="reward-topline"><h2>Your city award is reserved</h2><span class="step-label">1 of 1 used</span></div><div class="reward-amount"><img src="${camp.icon}" alt=""><div><strong>1 city</strong><small>pending</small></div></div><p>No eligible city was available. Your earned award is reserved and will be granted automatically when one becomes available. The camp has reset and return marches were sent.</p></section>`;
  const complete = f.claimed >= camp.limit;
  const amount = complete ? "0" : productionCamp() ? number(reward(f, f.claimed)) : "1";
  const unit = productionCamp() ? camp.unit : complete ? campKey === "items" ? "items" : "cities" : campKey === "items" ? "random usable item" : "random neutral city";
  const copy = complete ? `Further successful holds award no additional ${camp.unit === "city" ? "city" : camp.unit} today. Daily rewards reset at 00:00 UTC.` : f.payout ? `${productionCamp() ? "Estimated payout." : "Hold ended."} Waiting for confirmation before your reward is recorded.` : productionCamp() ? f.owned ? `Complete this hold to earn your next reward. Final ${camp.unit} ${campKey === "troops" ? "are" : "is"} calculated when the hold resolves.` : `Your estimate for your next successful hold. Capture this camp and hold it for ${holdMinutes()} minutes.` : `${f.owned ? "Complete this hold." : `Capture and hold for ${holdMinutes()} minutes.`} ${payoutDestination()}`;
  return `<section class="reward-banner" aria-label="${heading()}"><div class="reward-topline"><h2>${complete ? "Your daily rewards are complete" : heading()}</h2><span class="step-label">${complete ? `${camp.limit} of ${camp.limit} ${campKey === "deed" ? "used" : "earned"}` : `Reward ${f.claimed + 1} of ${camp.limit}`}</span></div>
    <div class="reward-amount"><img src="${camp.icon}" alt=""><div><strong>${amount}</strong><small>${unit}</small></div></div><p>${copy}</p></section>`;
}

function holdMarkup(f) {
  const progress = f.neutral ? 0 : Math.round((camp.holdSeconds - f.seconds) / camp.holdSeconds * 100);
  return `<section class="hold-card" aria-label="Public hold timer"><div class="hold-heading"><div><h2>${f.neutral ? "Awaiting a ruler" : f.payout ? "Hold complete" : "Hold in progress"}</h2><small>${f.neutral ? "The timer begins after capture" : "Public timer · Current controller"}</small></div><strong>${f.neutral ? `${holdMinutes()}m hold` : f.payout ? "Resolving…" : duration(f.seconds)}</strong></div><div class="hold-track" role="progressbar" aria-label="Current hold progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div><p>${f.payout ? "Waiting for the server to confirm the payout and return stationed troops." : f.neutral ? `Capture starts a fresh ${holdMinutes()}-minute hold. Defeating the camp alone does not award a reward.` : `A change of control restarts the full ${holdMinutes()}-minute hold.`}</p></section>`;
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
  const title = productionCamp() ? "Four holds. Richer rewards." : campKey === "items" ? "Spoils from the outpost." : "New lands for your kingdom.";
  const intro = `<div class="panel-intro"><img src="${camp.icon}" alt=""><div><p class="eyebrow">YOUR DAILY LEDGER</p><h2>${title}</h2><p>Your progress is shared across all ${camp.name} locations in this realm.</p></div></div>`;
  if (f.rewardStatus) return `${intro}${rewardBanner(f)}<p class="formula-note">Your rewards are still tracked by the server. Reopen this panel once the connection is ready.</p>${campKey === "deed" ? deedHistoryMarkup({...f,historyStatus:f.rewardStatus}) : ""}`;
  const summary = `<div class="rewards-summary"><span><strong>${f.claimed} of ${camp.limit} ${campKey === "deed" ? "daily awards used" : "rewards earned"}</strong> · ${camp.limit - f.claimed} remaining today</span><span>Daily reset <strong>00:00 UTC</strong></span></div>`;
  if (campKey === "items") return intro + summary + relicRewardsMarkup(f);
  if (campKey === "deed") return intro + summary + `<div class="deed-award-record"><img src="${camp.icon}" alt=""><div><h3>${f.reserved ? "A city is reserved for you" : f.claimed ? "Today's award is used" : "One random neutral city"}</h3><p>${f.reserved ? "No eligible city was available at resolution. Your earned award will be granted automatically when one becomes available; it counts against the day you earned it." : f.claimed ? "Your daily reward has been awarded or reserved until an eligible city is available. Another daily award becomes available at 00:00 UTC." : "Hold for 60 minutes to receive one eligible neutral city from the active realm. Every eligible city has an equal chance; you do not choose the map or city."}</p><small>Existing city level · Zero troops · No Deed Token</small></div></div>` + deedHistoryMarkup(f);
  return `${intro}${summary}<div class="reward-ladder">${camp.minimums.map((minimum, i) => `<article class="reward-step ${i < f.claimed ? "claimed" : i === f.claimed ? "next" : ""}"><h3>Hold ${i + 1}<span>${i < f.claimed ? "Earned" : i === f.claimed ? "Next reward" : "Upcoming"}</span></h3><img src="${camp.icon}" alt=""><strong>${number(reward(f, i))}</strong><small>${camp.unit} · Current estimate</small><p class="step-rule"><b>${camp.hours[i]} ${camp.hours[i] === 1 ? "hour" : "hours"}</b> of ${camp.unit === "troops" ? "troop" : "gold"} production<br>At least <b>${number(minimum)} ${camp.unit}</b></p></article>`).join("")}</div>
    <p class="formula-note"><strong>Your raw kingdom production: ${number(f.rate)} ${camp.unit} per hour.</strong><br>Each reward uses the higher of its minimum or your production multiplied by the listed hours, rounded down. Amounts shown use current production; earned steps are progress markers, not a receipt of previous payouts. The final reward is calculated when each hold resolves. ${payoutDestination()}</p>
    <p class="intel-note">After four rewards, additional successful ${camp.name} holds award 0 ${camp.unit} until 00:00 UTC. Your progress applies across all ${camp.name}s, even when a different ruler controls this location.</p>`;
}

function relicRewardsMarkup(f) {
  const earned = RELIC_DROPS.slice(0,f.claimed).map((drop,i)=>({...drop,at:`${String(8+i).padStart(2,"0")}:24 UTC`})).reverse();
  return `<div class="relic-ledger"><section><h3 class="ledger-heading">Possible item drops</h3><div class="drop-grid">${RELIC_DROPS.map(drop=>`<article class="drop-card"><div class="drop-art"><img src="${drop.art}" alt=""></div><div><h4>${drop.name}</h4><small>${drop.rarity}</small></div><strong>${drop.chance}%</strong></article>`).join("")}</div>
    <div class="bonus-chest"><img src="${CAMP_GEAR_BOX_ART}" alt="Common Gear Box"><div><h4>Common Gear Box <span>1% bonus chance</span></h4><p>A separate bonus on a rewarded hold, in addition to the usable item. The box contains three Common gear pieces.</p></div></div></section>
    <section><h3 class="ledger-heading">Today's rewards <small>Only your items</small></h3><ol class="award-history">${earned.length ? earned.map(drop=>`<li><img src="${drop.art}" alt=""><div><strong>${drop.name}</strong><small>${drop.rarity} · Added to your Bag</small></div><time>${drop.at}</time></li>`).join("") : '<li class="empty-history">No Relic Camp items earned today.</li>'}</ol><p class="intel-note">${f.claimed >= camp.limit ? "Daily limit reached. You may still contest this camp, but no further item or bonus chest is awarded today." : "Each rewarded hold gives one random usable item. Drop chances stay the same for all five daily rewards."}</p></section></div>`;
}

function deedHistoryMarkup(f) {
  let history = DEED_HISTORY;
  if (f.historyStatus === "empty" || sample === "neutral") history = [];
  if (f.historyStatus === "loading" || f.historyStatus === "error") return `<h3 class="ledger-heading">Your latest city awards</h3><div class="history-state"><strong>${f.historyStatus === "loading" ? "Loading reward history…" : "Reward history unavailable"}</strong><p>${f.historyStatus === "loading" ? "Retrieving your city awards from all Deed Camp locations." : "The server history has not changed. Reopen this tab once the connection is ready."}</p></div>`;
  return `<h3 class="ledger-heading">Your latest city awards <small>Across all Deed Camps</small></h3><ol class="award-history deed-history">${history.length ? history.map((row,i)=>`<li><img src="${camp.icon}" alt=""><div><strong>${esc(sample === "long" ? `${row.name} of the Far Northern Marches` : row.name)}</strong><small>${esc(row.map)} · Awarded to you</small><time>${row.at}</time></div><button class="paper-button" data-action="location" data-row="${i}" aria-label="Go to ${esc(row.name)}">View on Map</button></li>`).join("") : '<li class="empty-history"><strong>No cities awarded to you yet</strong><small>Your successful Deed Camp awards will appear here.</small></li>'}</ol><p class="intel-note">Showing your latest ${history.length} of up to 10 city awards. These are past awards, not a list of cities currently eligible for selection.</p>`;
}

function rulesMarkup() {
  const rewardRules = productionCamp() ? ["Reward calculation", `The four rewards use 0.5, 1, 1.5 and 2 hours of raw kingdom ${camp.unit === "troops" ? "troop" : "gold"} production, with minimums of ${camp.minimums.map(number).join(", ")} ${camp.unit}. Each reward is the higher amount, rounded down.`] : campKey === "items" ? ["Item rewards", "Each rewarded hold gives one random usable item directly to your Bag. Your Rewards shows all six possible items and their chances. There is also a separate 1% chance of a Common Gear Box in addition to the item. The payout gives no gold, troops, battle XP or leaderboard points."] : ["City selection", "Every eligible neutral regular city in the active realm has an equal chance. Selection covers all active maps, including ordinary cities on the Crown Citadel map. Main Cities, objectives, occupied cities, inactive maps and the former Crownlands Heart are excluded.", "The selected city immediately becomes yours at its existing level with zero troops, without a battle or troop march. No Deed Token, inventory item or battle XP is awarded. The normal neutral-city capture limit is separate."];
  const blocks = [
    ["Capture & hold", `Capture the camp and remain its controller for ${holdMinutes()} minutes. A new capture or change of control restarts the timer. The current controller and hold timer are public.`],
    [`${camp.limit === 1 ? "One daily award" : `${camp.limit} daily rewards`}`, `You may earn ${camp.limit} ${camp.limit === 1 ? "award" : "rewards"} per UTC day, shared across every ${camp.name} in the realm. Your private allowance resets at 00:00 UTC. Further holds award no additional ${camp.unit === "city" ? "city" : camp.unit}. You can still attack, capture, reinforce and hold the camp.`],
    rewardRules,
    ["Defenses & scouting", `A fresh neutral ${camp.name} starts with 20,000 troops. This starting rule does not reveal its current garrison after battles. Current troops and total defense require ownership or a valid scout report.`, "There are no walls or camp levels. Every defending troop contributes 1.00 defense, including reinforcements. Camps receive no defense bonuses and have no garrison cap."],
    ["Payout & troop return", `The server confirms completed holds. ${payoutDestination()} Stationed troops return to their origin cities, using the sender's Main City if the original city is no longer owned. The camp becomes neutral again with its fixed defenders, including after a no-reward completion.`],
    ["A field outpost", "Camps do not count as cities, cannot be shielded and ignore weaker-kingdom attack restrictions. Clan reinforcements can be sent home by the holder; senders can recall their own troops."]
  ];
  if (campKey === "deed") blocks.push(["When no city is available", "An earned reward is reserved for you until an eligible city becomes available. The reservation uses the allowance for the day it was earned. Your troops return and the camp resets normally. A later holder cannot take your reserved reward. Reports explain the reservation and the eventual city award."]);
  return `<div class="panel-intro"><img src="${camp.icon}" alt=""><div><p class="eyebrow">${camp.name.toUpperCase()} CHARTER</p><h2>Know the ground you hold.</h2><p>Capture the outpost, complete the hold, receive the reward.</p></div></div><div class="rules-grid">${blocks.map(([title, ...paragraphs]) => `<article class="rule-block"><h3>${title}</h3>${paragraphs.map(p => `<p>${p}</p>`).join("")}</article>`).join("")}</div>`;
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
  status(`${camp.name} · ${sample} example · ${next === "rewards" ? "Your Rewards" : next === "rules" ? "Camp Rules" : "Overview"}`);
}

function render() {
  const f = fixture;
  document.body.dataset.camp = campKey;
  document.body.style.setProperty("--camp-map", `url("/assets/worlds/core-expansion-v1/maps/${camp.region}.webp")`);
  document.title = `${camp.name} preview`;
  $("campTitle").textContent = camp.name;
  $("campIcon").src = camp.icon;
  $("mapName").textContent = `${camp.map} · The Core`;
  $("campTabs").setAttribute("aria-label", `${camp.name} information`);
  $("footerTitle").textContent = camp.name;
  $("footerHint").textContent = `${holdMinutes()}-minute hold · Daily reset 00:00 UTC`;
  $("close").setAttribute("aria-label", `Close ${camp.name}`);
  $("reopen").textContent = `Open ${camp.name}`;
  $("dismiss").textContent = `Back to ${camp.name}`;
  $("ownership").textContent = f.owned ? "Your camp" : f.neutral ? "Neutral camp" : f.ally ? "Clan ally" : "Rival camp";
  $("ownership").className = `ownership ${f.neutral ? "neutral" : !f.owned && !f.ally ? "enemy" : ""}`;
  $("identity").innerHTML = identityMarkup(f);
  $("overview").innerHTML = rewardBanner(f) + holdMarkup(f) + strengthMarkup(f) + supportMarkup(f);
  $("rewardsPanel").innerHTML = rewardsMarkup(f);
  $("rulesPanel").innerHTML = rulesMarkup();
  selectTab(section);
}

function reset(next = "owned", nextCamp = campKey) {
  if ($("actionDialog").open) $("actionDialog").close();
  campKey = Object.hasOwn(CAMP_DEFINITIONS, nextCamp) ? nextCamp : "gold";
  camp = CAMP_DEFINITIONS[campKey];
  sample = Object.hasOwn(CAMP_SAMPLES, next) || (campKey === "deed" && ["reserved", "history-empty", "history-loading", "history-error"].includes(next)) ? next : "owned";
  fixture = campFixture(sample, campKey);
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
    $("actionCopy").textContent = `This link opens the controller's ruler profile in the game. Return to continue reviewing the ${camp.name}.`;
  } else if (button.dataset.action === "location") {
    const row = DEED_HISTORY[Number(button.dataset.row)];
    $("actionTitle").textContent = `View ${row.name} on the map`;
    $("actionCopy").textContent = `The game opens the awarded city's map and centers its location. ${row.name} in ${row.map} is a fictional review entry; this draft does not visit a real city.`;
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
window.addEventListener("message", event => { if (event.origin === location.origin && event.source === parent && event.data?.type === "camp-review") reset(event.data.sample, event.data.camp); });
const initialQuery = new URLSearchParams(location.search);
reset(initialQuery.get("sample") || "owned", initialQuery.get("camp") || "gold");
