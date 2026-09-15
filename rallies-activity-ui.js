/* Approved Kingdom Activity presentation; shared Clan War Room and server actions remain authoritative. */
/* exported renderRalliesActivityHeader, renderRalliesActivityFooter, renderClanRallyOperationPanel, renderRalliesActivityCard, captureRalliesActivityView, bindRalliesActivityView */
let selectedActivityRallyId = "";
let activityRallyScope = "";

function getActivityRallyIdentity(rally) {
  const target = getArmyTargetById(rally.targetId) || getPlayableBaseCityById(rally.targetId);
  const citadel = rally.targetId === CROWN_CITADEL_ID || isCrownCitadel(target);
  return {
    art: `assets/clan-heraldry/art-set-v1/svg/full/${citadel ? "crown" : "fortress-keep"}.svg`,
    type: rally.targetType === "tower" ? "Holding Tower" : citadel ? "Crown Citadel" : isStronghold(target) ? "Stronghold" : "Objective",
    state: rally.status === "recalling" ? "returning" : rally.status === "launched" ? "launched" : "forming",
    label: rally.status === "recalling" ? "Returning" : rally.status === "launched" ? "Launched" : "Forming",
  };
}

function renderRalliesActivityHeader() {
  return `<header class="window-header"><img class="heading-art" src="assets/icons/skills/marchOrders.svg" alt=""><div class="heading"><p>ORDERS OF THE REALM</p><h2>Kingdom Activity</h2></div><div class="carried-items"><span>${renderItemIcon(getShopItemById(RECALL_HORN_ITEM_ID))}<span>Recall Horns <strong>${formatMarchesNumber(getProjectedInventoryCount(RECALL_HORN_ITEM_ID))}</strong></span></span></div><button class="close-button" data-close-marches type="button" aria-label="Close Kingdom Activity">×</button></header>`;
}

function renderRalliesActivityFooter() {
  return '<footer class="report-footer"><span>Forming targets are visible to your clan.</span><span>Scroll for all participants</span></footer>';
}

function renderClanRallyOperationPanel(rallies = []) {
  const scope = `${getCurrentOnlineUid()}:${state?.clanId || ""}`;
  if (activityRallyScope !== scope) { selectedActivityRallyId = ""; activityRallyScope = scope; }
  if (!rallies.length) {
    selectedActivityRallyId = "";
    return `<div class="rallies-content is-empty"><section class="empty-state"><div class="empty-emblem"><img src="assets/clan-heraldry/art-set-v1/svg/full/fortress-keep.svg" alt=""></div><h3>No active clan rallies</h3><p>Leaders and Officers can begin a rally from an eligible objective on the map. Your clan's active rallies will appear here.</p><button data-close-marches type="button">Return to map</button></section></div>`;
  }
  const selected = rallies.find(rally => rally.id === selectedActivityRallyId) || rallies[0];
  selectedActivityRallyId = selected.id;
  return `<div class="rallies-content"><aside class="rally-sidebar"><header class="sidebar-heading"><h3>Clan rallies</h3><strong>${rallies.length} / ${CLAN_ACTIVE_RALLY_LIMIT}</strong></header><nav class="rally-picker" aria-label="Active clan rallies">${rallies.map(rally => {
    const identity = getActivityRallyIdentity(rally);
    const participants = Array.isArray(rally.participants) ? rally.participants : [];
    const count = participants.filter(person => ["assembled", "inbound"].includes(person.status)).length || participants.length;
    const name = escapeHtml(rally.targetName || rally.targetId || "Objective");
    return `<button class="rally-pick" data-activity-rally="${escapeHtml(rally.id)}" type="button" aria-pressed="${rally.id === selected.id}" aria-label="${name}, ${identity.label}"><img src="${identity.art}" alt=""><strong>${name}</strong><small>${escapeHtml(getRegionLabel(rally.targetRegionId))}<span class="pick-kind"> · ${identity.type}</span></small><span class="pick-meta"><span class="status-pill ${identity.state}">${identity.label}</span><span>${count} / ${CLAN_RALLY_MAX_PARTICIPANTS}</span></span></button>`;
  }).join("")}</nav></aside>${renderClanRallyCard(selected, true)}</div>`;
}

function renderRalliesActivityCard(rally, context) {
  const { currentUid, participants, activeParticipants, assembledTroops, inboundTroops, returningTroops, ownParticipant, leader, canManageFormingRally, forming, launched, recalling, busy, canRecall } = context;
  const identity = getActivityRallyIdentity(rally);
  const force = recalling ? returningTroops || assembledTroops : assembledTroops;
  const ready = activeParticipants.filter(person => person.status === "assembled").length;
  const count = activeParticipants.length || participants.length;
  const allReady = activeParticipants.length >= CLAN_RALLY_MIN_PARTICIPANTS && ready === activeParticipants.length;
  const horns = getProjectedInventoryCount(RECALL_HORN_ITEM_ID);
  const recallBusy = recallHornRequests.has(String(rally.armyId || ""));
  const actionBusy = busy || recallBusy;
  const command = (action, label, style = "", disabled = false) => `<button class="rally-command ${style}" data-rally-action="${action}" data-rally-id="${escapeHtml(rally.id)}" ${action === "recall" ? `data-rally-army-id="${escapeHtml(rally.armyId || "")}"` : ""} type="button" ${disabled || actionBusy ? "disabled" : ""}>${label}</button>`;
  let note = "", controls = "";
  if (forming && canManageFormingRally) {
    note = allReady ? "<strong>All contributions are ready.</strong> Launch when you choose." : activeParticipants.length < CLAN_RALLY_MIN_PARTICIPANTS ? `At least ${CLAN_RALLY_MIN_PARTICIPANTS} rulers must be ready to launch.` : `${activeParticipants.length - ready} ${activeParticipants.length - ready === 1 ? "contribution is" : "contributions are"} still inbound. Every army must arrive before launch.`;
    controls = command("cancel", "Cancel", "danger") + command("launch", "Launch", "primary", !allReady);
  } else if (forming && ownParticipant) {
    note = "Your contribution is committed. The creator or Clan Leader gives the launch order.";
    controls = command("withdraw", "Withdraw", "danger");
  } else if (forming && activeParticipants.length < CLAN_RALLY_MAX_PARTICIPANTS) {
    note = "Join with troops from one of your cities.";
    controls = command("join", "Join Rally", "primary");
  } else if (forming) note = `This rally is full. All ${CLAN_RALLY_MAX_PARTICIPANTS} participant places are occupied.`;
  else if (launched && leader) {
    note = !horns ? "A Recall Horn is needed to recall this army." : canRecall ? "Recall the combined army for 1 Recall Horn." : "This rally cannot be recalled at its current march state.";
    controls = command("recall", `${renderItemIcon(getShopItemById(RECALL_HORN_ITEM_ID))}Recall · 1 Horn`, "danger", !canRecall || horns < 1);
  } else if (launched) note = "The combined army is marching. Only its creator may recall it.";
  else note = "The rally is returning. Contributions remain assigned to their rulers.";
  if (actionBusy) note = recallBusy ? "Sounding the Recall Horn…" : "Sending your order…";
  return `<section class="rally-detail" data-activity-rally-detail="${escapeHtml(rally.id)}" aria-labelledby="activityRallyTitle">
    <header class="rally-title"><div class="target-seal"><img src="${identity.art}" alt=""></div><div class="target-heading"><h3 id="activityRallyTitle">${escapeHtml(rally.targetName || rally.targetId || "Objective")}</h3><p>${escapeHtml(getRegionLabel(rally.targetRegionId))} · ${identity.type}</p></div><span class="status-pill ${identity.state}">${identity.label}</span></header>
    <div class="rally-scroll" tabindex="0" aria-label="Rally information and all participants"><div class="rally-overview"><div class="rally-meta"><div><small>Rally creator</small>${renderPlayerNameLink(rally.leaderUid, rally.leaderName || "Ruler")}</div><div><small>Assembly city</small><strong>${escapeHtml(rally.assemblyCityName || rally.assemblyCityId || "City")}</strong></div></div>
    <div class="muster-totals ${Math.max(force, inboundTroops) > 9999999 ? "large" : ""}"><div><small>${recalling ? "Returning troops" : launched ? "Marching troops" : "Assembled troops"}</small><strong>${formatMarchesNumber(force)}</strong></div><div><small>Incoming troops</small><strong>${formatMarchesNumber(inboundTroops)}</strong></div><div><small>${forming ? "Rulers ready" : "Rulers in rally"}</small><strong class="ready-total">${forming ? `${ready} / ${activeParticipants.length}` : count}</strong></div></div></div>
    <div class="muster-heading"><h4>The muster</h4><span>${count} / ${CLAN_RALLY_MAX_PARTICIPANTS} rulers${forming ? " · All must be ready" : ""}</span></div>
    <table class="muster-table" aria-label="Rally participants"><thead><tr><th scope="col">Ruler</th><th scope="col">Troops</th><th scope="col">Status</th></tr></thead><tbody>${participants.map((person, index) => {
      const label = getClanRallyParticipantStatusLabel(rally, person);
      const statusClass = label === "Returning" ? "returning" : label === "Marching" ? "marching" : person.status === "inbound" ? "inbound" : "ready";
      const hint = label === "Ready" ? "At assembly" : label === "Marching" ? "With the rally" : label === "Returning" ? "Homeward" : person.status === "inbound" ? "To assembly" : "";
      return `<tr><td><div class="participant-identity"><span class="participant-number" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span><span>${renderPlayerNameLink(person.uid || person.ownerUid, person.ownerName || "Ruler")}<small>${person.role === "leader" ? "Leader" : "Ally"}${String(person.uid || person.ownerUid || "") === currentUid ? " · You" : ""}</small></span></div></td><td>${formatMarchesNumber(person.troops || 0)}</td><td class="participant-status ${statusClass}"><strong>${escapeHtml(label)}</strong>${hint ? `<small>${hint}</small>` : ""}</td></tr>`;
    }).join("")}</tbody></table></div><footer class="rally-actions" aria-busy="${actionBusy}"><div class="order-note" role="status">${note}</div><div class="action-buttons">${controls}</div></footer></section>`;
}

function captureRalliesActivityView() {
  if (!modal.classList.contains("outgoing-attack-modal") || !modal.classList.contains("rallies-activity-ledger")) return null;
  const focused = modalBody.contains(document.activeElement) ? document.activeElement : null;
  const attribute = ["data-activity-rally", "data-rally-action", "data-player-profile-uid", "data-close-marches", "data-active-operations-tab"].find(name => focused?.hasAttribute(name));
  const value = attribute ? focused.getAttribute(attribute) : null;
  return {
    scope: activityRallyScope, id: modalBody.querySelector(".rally-detail")?.dataset.activityRallyDetail,
    scroll: modalBody.querySelector(".rally-scroll")?.scrollTop || 0,
    picker: modalBody.querySelector(".rally-picker")?.scrollTop || 0,
    attribute, value, index: attribute ? [...modalBody.querySelectorAll(`[${attribute}]`)].filter(element => element.getAttribute(attribute) === value).indexOf(focused) : -1,
    scrollFocused: focused?.classList.contains("rally-scroll"),
  };
}

function bindRalliesActivityView(previous) {
  if (!modal.classList.contains("rallies-activity-ledger")) return;
  modalBody.querySelectorAll("[data-activity-rally]").forEach(button => button.addEventListener("click", () => {
    selectedActivityRallyId = button.dataset.activityRally;
    renderOutgoingAttacksModalContent();
  }));
  if (!previous || previous.scope !== activityRallyScope) return;
  const scroll = modalBody.querySelector(".rally-scroll"), picker = modalBody.querySelector(".rally-picker");
  if (picker) picker.scrollTop = previous.picker;
  if (scroll && previous.id === selectedActivityRallyId) scroll.scrollTop = previous.scroll;
  if (previous.attribute) {
    const replacement = [...modalBody.querySelectorAll(`[${previous.attribute}]`)].filter(element => element.getAttribute(previous.attribute) === previous.value)[previous.index];
    if (replacement && !replacement.disabled) replacement.focus({ preventScroll: true });
    else scroll?.focus({ preventScroll: true });
  } else if (previous.scrollFocused) scroll?.focus({ preventScroll: true });
}
