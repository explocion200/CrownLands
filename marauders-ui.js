/* exported getClanRallyMaximumParticipants, installMarauderSearch, openMarauderDetails, applyOnlineMarauders, renderMarauders, updateMarauderRespawnTimers, renderBossReadiness, selectMarauder, selectedMarauderSpawnId, scoutMarauder, attackMarauder, getMarauderDetailsModel */
/* exported getMarauderBattleTargetLabel, getMarauderBattleRuleLabel, getMarauderReportTarget, normalizeMarauderReportTarget, marauderBattleReportSide, getMarauderBattleResultLabel, getLegacyMarauderBattleSides */
/* Shared NPC targets stay separate from capturable city and camp state. */
const marauderMaps = new Map();
const bossReadiness = new Map();
let selectedMarauderSpawnId = "";
function marauderArt(target) { return `assets/marauders/${target.classification === "boss" ? "boss" : "solo"}-v1.webp`; }
function applyOnlineMarauders(rows, regionId) {
  const scope = getOnlineSessionRequestScope(), previous = marauderMaps.get(regionId);
  const requests = previous?.scope === scope && previous.uid === getCurrentOnlineUid() ? previous.requests : new Set();
  const selected = getMarauderById(selectedTargetId);
  marauderMaps.set(regionId, { uid: getCurrentOnlineUid(), scope, generation: RESET_GENERATION,
    requests: new Set(rows.map(row => row.spawnId).filter(id => requests.has(id))),
    rows: rows.filter(row => row.worldId === ONLINE_WORLD_ID && row.resetGeneration === RESET_GENERATION
      && row.regionId === regionId && ["active", "defeated"].includes(row.status)).map(row => ({ ...row, owner: "neutral", ownerUid: "", troops: null })) });
  if (selectedMarauderSpawnId && selected?.regionId === regionId && getMarauderById(selected.id)?.spawnId !== selectedMarauderSpawnId && !sendMode) {
    selectedTargetId = null; selectedMarauderSpawnId = "";
  }
  renderCities(true);
}
function visibleMarauders(regionId = getActiveMapRegionId()) {
  const map = marauderMaps.get(regionId);
  return map?.uid === getCurrentOnlineUid() && map.generation === RESET_GENERATION
    && map.scope === getOnlineSessionRequestScope() ? map.rows : [];
}
function currentMarauders(regionId) {
  return visibleMarauders(regionId).filter(row => row.status === "active");
}
function getMarauderById(id) {
  for (const regionId of marauderMaps.keys()) {
    const target = currentMarauders(regionId).find(row => row.id === id);
    if (target) return target;
  }
  return null;
}
function renderMarauders(bounds) {
  const existing = new Map([...cityLayer.querySelectorAll("[data-marauder-id]")].map(node => [node.dataset.marauderId, node]));
  for (const target of visibleMarauders().filter(row => shouldRenderCampNode(row, bounds))) {
    let node = existing.get(target.id); existing.delete(target.id);
    if (!node) {
      node = document.createElement("button"); node.type = "button"; node.className = "marauder-node";
      node.dataset.marauderId = target.id;
      node.addEventListener("pointerdown", event => event.stopPropagation());
      node.addEventListener("click", event => { event.stopPropagation(); selectMarauder(node.dataset.marauderId); });
      cityLayer.append(node);
    }
    const point = worldToMapPoint(target);
    node.style.left = `${point.x}px`; node.style.top = `${point.y}px`;
    node.classList.toggle("marauder-node-boss", target.classification === "boss");
    node.disabled = target.status === "defeated";
    node.classList.toggle("marauder-node-defeated", node.disabled);
    node.setAttribute("aria-label", target.name); node.title = target.name;
    if (node.dataset.spawnId !== target.spawnId || node.dataset.status !== target.status) {
      node.dataset.spawnId = target.spawnId;
      node.dataset.status = target.status;
      const art = marauderArt(target).replace("-v1", node.disabled ? "-defeated-v1" : "-v1");
      node.innerHTML = `<img src="${art}" alt="" draggable="false"><span>${target.classification === "boss" ? "Boss" : "Marauder"} · ${Number(target.level)}${node.disabled ? '<small data-npc-respawn></small>' : ""}</span>`;
    }
  }
  existing.forEach(node => node.remove());
  updateMarauderRespawnTimers();
}
function updateMarauderRespawnTimers() {
  const now = getArmyClockNowMs(), api = getOnlineApi();
  for (const target of visibleMarauders().filter(row => row.status === "defeated")) {
    const seconds = Math.max(0, Math.ceil((Number(target.respawnAtMs) - now) / 1000));
    const label = seconds > 0 ? `Respawn ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "Awaiting respawn";
    const node = [...cityLayer.querySelectorAll("[data-marauder-id]")].find(item => item.dataset.spawnId === target.spawnId);
    if (node?.querySelector("[data-npc-respawn]")) {
      node.querySelector("[data-npc-respawn]").textContent = label;
      node.title = `${target.name} · Defeated · ${label}`; node.setAttribute("aria-label", node.title);
    }
    const requests = marauderMaps.get(target.regionId).requests;
    if (seconds === 0 && Number.isFinite(target.respawnAtMs) && !document.hidden && navigator.onLine
      && api?.isSignedIn?.() && api.refreshMarauderRespawn && !requests.has(target.spawnId)) {
      requests.add(target.spawnId);
      // One wake-up per identity/session; real-time replacement or the minute job completes it.
      api.refreshMarauderRespawn({ regionId: target.regionId, id: target.id, spawnId: target.spawnId }).catch(() => {});
    }
  }
}
function selectMarauder(id) {
  const target = getMarauderById(id);
  if (!target || isGamePausedByOutcome()) return;
  selectedTargetId = target.id; selectedMarauderSpawnId = target.spawnId;
  selectedTowerMapId = ""; holdingTowerSendContext = null;
  scoutNearbySourceId = null; regroupSourceId = null; sendMode = false;
  playGameSound("city_select", { cooldownMs: 60, regionId: target.regionId });
  renderSelectionChangeNow();
  requestAnimationFrame(() => {
    if (selectedTargetId !== target.id || sendMode || !isCurrentMarauderSpawn(target)) return;
    if (!centerOnWorldPoint(target, target.regionId)) return;
    const frame = mapFrame.getBoundingClientRect();
    const chat = getElementAvoidRect(document.getElementById("quickChat"), frame, 8);
    const wheel = cityLayer.querySelector("[data-marauder-spawn-id]");
    if (!chat || !wheel) return;
    const overlaps = [...wheel.querySelectorAll("button")].map(button => button.getBoundingClientRect())
      .filter(rect => rect.right - frame.left > chat.left && rect.left - frame.left < chat.right
        && rect.bottom - frame.top > chat.top && rect.top - frame.top < chat.bottom);
    if (overlaps.length) {
      camera.y += Math.max(...overlaps.map(rect => rect.bottom - frame.top - chat.top)) / zoom;
      updateCameraTransform();
    }
  });
}
function isCurrentMarauderSpawn(target) {
  return getMarauderById(target.id)?.spawnId === target.spawnId;
}
async function scoutMarauder(target) {
  if (!isCurrentMarauderSpawn(target)) { rejectGameAction("This spawn has changed. Choose the new enemy."); return; }
  if (pendingDirectScoutTargets.has(target.id) || getPendingScoutMission(target.id)) {
    showToast(`A scout is already being sent to ${target.name}.`); return;
  }
  const scope = getOnlineSessionRequestScope();
  pendingDirectScoutTargets.add(target.id); renderScoutRequestFeedback(target.id);
  try {
    const source = findPreferredAttackSource(target)?.city;
    if (!source) throw new Error("Choose one of your cities with available troops first.");
    const route = await requestAuthoritativeOrderRoute(source, target, "scout", 1);
    if (scope !== getOnlineSessionRequestScope()) return;
    if (!isCurrentMarauderSpawn(target)) throw new Error("This spawn has changed. Choose the new enemy.");
    if (!route?.points?.length) throw new Error(route?.authoritativeError || "No route is available.");
    const mission = launchScoutMission(source, target, route);
    if (mission && modal.open && modal.classList.contains("marauder-modal")) modal.close();
  } catch (error) {
    if (scope === getOnlineSessionRequestScope()) rejectGameAction(error.message || "The scout could not be dispatched.");
  } finally {
    if (scope === getOnlineSessionRequestScope()) {
      pendingDirectScoutTargets.delete(target.id); renderScoutRequestFeedback(target.id);
    }
  }
}
async function attackMarauder(target) {
  if (!isCurrentMarauderSpawn(target)) { rejectGameAction("This spawn has changed. Choose the new enemy."); return; }
  if (target.classification === "boss") { beginCreateClanRally(target); return; }
  const source = findPreferredAttackSource(target)?.city;
  if (!source) { rejectGameAction("Choose one of your cities with available troops first."); return; }
  rememberOwnedAttackSource(source);
  selectedSourceId = source.id; selectedTargetId = target.id; sendMode = true;
  selectedTowerMapId = ""; holdingTowerSendContext = null;
  scoutNearbySourceId = null; regroupSourceId = null; activeRallyOrderContext = null;
  activeTroopOrderKind = "attack"; selectedTroopAmount = Math.max(1, Math.floor(source.troops / 2));
  renderSelectionChangeNow();
  await showTroopSliderModalAsync(source, target);
}
function renderHuntStamina(note = "") {
  const stamina = CrownlandsStaminaUI.value();
  return `<div class="hunt-stamina"><span><strong data-hunt-stamina>Stamina ${stamina ? `${stamina.value}/100` : "—/100"} · Cost 10</strong>${note ? `<small>${escapeHtml(note)}</small>` : ""}</span><button type="button" data-open-stamina>Stamina &amp; refill</button></div>`;
}
const MARAUDER_BATTLE_RULE_LABEL = "NPC combat — 1.00 defense per defender; no walls, ownership or PvP credit";
function getMarauderBattleTargetLabel(target) {
  return target.targetType === "marauder" ? target.classification === "boss" || target.level >= 80 ? "Clan boss" : "Marauder" : "";
}
function getMarauderBattleRuleLabel(snapshot) {
  return snapshot?.target?.targetType === "marauder" ? MARAUDER_BATTLE_RULE_LABEL : "";
}
function getMarauderReportTarget(report) {
  return report.targetType === "marauder" ? { targetType: "marauder", name: report.cityName,
    level: report.marauderLevel, regionId: report.regionId, ruleLabel: MARAUDER_BATTLE_RULE_LABEL } : null;
}
function normalizeMarauderReportTarget(target) {
  return target.targetType === "marauder" ? { targetType: "marauder",
    targetSpawnId: String(target.targetSpawnId || "").slice(0, 128),
    classification: target.classification === "boss" ? "boss" : "solo", strongholdType: "",
    level: clamp(Math.floor(Number(target.level) || 1), 1, 100) } : {};
}
function marauderBattleReportSide(target, role) {
  return target?.targetType === "marauder" && role === "defender"
    ? { npc: true, npcClassification: target.classification } : {};
}
function getMarauderBattleResultLabel(report) {
  if (report.outcome === "target_unavailable") return "Target unavailable — your army is returning";
  if (report.bossRecovered) return "Boss recovered to full strength after this battle";
  return report.outcome === "victory" ? "Enemy defeated — survivors return" : "Enemy survived — your survivors return";
}
function getLegacyMarauderBattleSides(report) {
  const sides = getLegacyBattleSides({ ...report, targetType: "camp" }), defender = sides.defender;
  defender.primary.ownerName = report.opponentName || report.cityName || "Enemy";
  defender.npc = true;
  defender.npcClassification = report.marauderLevel >= 80 ? "boss" : "solo";
  defender.basePowerHelp = "1.00 defense per defender · No walls";
  defender.startingTroops = Math.max(defender.startingTroops, report.troopCount || 0);
  defender.basePower = defender.startingTroops;
  defender.finalPower = report.totalDefense;
  if (report.outcome === "target_unavailable") {
    for (const key of ["startingTroops", "basePower", "finalPower", "losses", "survivors"]) defender[key] = "Not attacked";
  }
  return sides;
}
function getMarauderDetailsModel(target) {
  const intel = getScoutReportForTarget(target), balance = CrownlandsMarauders.balance(target.level, target.balanceVersion), boss = target.classification === "boss";
  const count = cityDetailsNumber;
  return { kind: boss ? "Clan boss" : "Marauder", sections: [
    ["Defenders", [
      ["npcTroops", intel ? "Scouted defenders:" : "Defenders", intel ? count(intel.troops) : "Unknown", "troops", intel ? `${Math.ceil(getScoutReportRemainingSeconds(intel) / 60)} minutes until expiry` : "Scout this spawn to reveal its current defenders and combat forecast."],
      ["npcDefense", "Total defense", intel ? count(intel.totalDefense) : "Unknown", "troops", balance.version === 2 && boss ? "No walls · 1 defense per defender. A failed rally restores the boss to full strength." : "No walls · 1 defense per defender. Defeats leave survivors."]]],
    ["Victory rewards", [
      ["npcGold", balance.version === 2 && boss ? "Gold per member" : "Gold pool", count(balance.gold), "coin"],
      ["npcXp", balance.version === 2 && boss ? "Hero XP per member" : "Hero XP pool", count(balance.xp), "ledger", balance.version === 2 ? "Fixed NPC XP; no Hero-level cap." : "Hero XP caps apply."],
      ["npcItem", balance.version === 2 && boss ? "Consumable per member" : "One item chance", `${(balance.itemChance * 100).toFixed(2)}%`, "ledger"],
      ...(balance.version === 2 && boss ? [
        ["npcBox", "Gear Box per member", `${balance.boxChanceBps / 100}%`, "ledger", "Separate from the consumable roll; at most one box each."],
        ["npcRarity", "Uncommon box upgrade", `${balance.uncommonUpgradeBps / 100}%`, "ledger", "If a box drops, this chance replaces Common (3 Common pieces) with Uncommon (1 Uncommon + 2 Common). All pieces level 1."]
      ] : [])]]],
    note: boss ? balance.version === 2 ? "2–5 members. Send any number of troops, starting at one. Every member who launches receives the full listed Gold and XP if the rally wins, regardless of troop losses. Each member rolls separately for an item and a Gear Box. Check readiness before launch."
      : "The winning rally shares rewards by damage contribution. This existing spawn retains its original rules." : "",
    actions: `<aside class="cd-actions" aria-label="Hunt preparation"><div class="cd-upgrade-heading">${cityDetailsIcon("troops")}<span><strong>Prepare a hunt</strong><small>${boss ? `Clan rally · 2–${balance.version === 2 ? 5 : 20} members` : "Solo army · Clan optional"}</small></span></div>${renderHuntStamina(boss ? "Each member needs 10 stamina at launch." : "")}
      ${["scout", "attack"].map(action => `<button class="marauder-info-action" type="button" data-npc-action="${action}">${renderCrownlandsIcon(action)} <span>${action === "scout" ? "Scout" : boss ? "Prepare rally" : "Attack"}</span></button>`).join("")}<p class="cd-note">Scouting uses one troop and no stamina.</p></aside>` };
}
function openMarauderDetails(id) {
  const target = getMarauderById(id);
  if (!target) { showToast("That enemy is no longer available."); return; }
  modal.className = "modal marauder-modal"; modalTitle.textContent = target.name;
  modalBody.innerHTML = renderMarauderDetailsPanel(target);
  mountChatLocationShare(target, "marauder");
  if (!modal.open) modal.showModal();
  modalBody.querySelectorAll("[data-npc-action]").forEach(button => button.addEventListener("click", async () => {
    if (getMarauderById(id)?.spawnId !== target.spawnId) { showToast("This spawn has changed. Choose the new enemy."); return; }
    button.disabled = true;
    try {
      if (button.dataset.npcAction === "scout") await scoutMarauder(target);
      else await attackMarauder(target);
    } catch (error) { rejectGameAction(error.message || "The order could not be prepared."); }
    finally { if (button.isConnected) button.disabled = false; }
  }));
}
function installMarauderSearch(dialog, { isCurrent, canNavigate, onLocated }) {
  const panel = dialog.querySelector("[data-enemy-search]");
  panel.innerHTML = `<h3>Find enemies</h3><p class="enemy-search-intro">Search all active maps · Solo hunts &amp; clan bosses</p>
    <form class="enemy-search-filters"><label>Min level<input name="min" type="number" min="1" max="100" step="1" value="1" required></label>
    <label>Max level<input name="max" type="number" min="1" max="100" step="1" value="100" required></label><button type="submit">Search</button></form>
    <p data-enemy-status role="status">Choose a level range, then search.</p><div data-enemy-results role="list" aria-label="Available enemies"></div>`;
  const form = panel.querySelector("form"), results = panel.querySelector("[data-enemy-results]"), status = panel.querySelector("[data-enemy-status]");
  let request = 0, busy = false;
  const stop = () => {
    request++; busy = false; form.elements.min.disabled = false; form.elements.max.disabled = false; form.querySelector("button").disabled = false;
    results.replaceChildren(); status.textContent = "Choose a level range, then search.";
    results.removeAttribute("aria-busy");
  };
  form.addEventListener("input", stop);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy || !isCurrent()) return;
    const min = Number(form.elements.min.value), max = Number(form.elements.max.value);
    stop();
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max > 100 || min > max) {
      status.textContent = "Choose whole levels from 1 to 100, with minimum no higher than maximum."; return;
    }
    const token = request, scope = getOnlineSessionRequestScope(), api = getOnlineApi();
    const current = () => isCurrent() && token === request && scope === getOnlineSessionRequestScope();
    busy = true; form.querySelector("button").disabled = true; results.setAttribute("aria-busy", "true");
    status.textContent = "Checking active maps…";
    try {
      const realm = await api.getRealmInfo();
      if (!current()) return;
      if (realm.worldId !== ONLINE_WORLD_ID || realm.resetGeneration !== RESET_GENERATION || realm.worldTopology !== "core-expansion-v1") {
        throw new Error("The realm changed. Reconnect before searching.");
      }
      if (!Array.isArray(realm.coreExpansion?.activeRegionIds)) throw new Error("The active map list is unavailable. Try Search again.");
      applyCoreExpansionRealmState(realm);
      const maps = getRegionIds().map(regionId => ({ regionId, islandId: getOnlineIslandId(regionId) }));
      const rows = await api.loadActiveMarauders(maps, { min, max, isCurrent: current,
        onProgress: (done, total) => { if (current()) status.textContent = `Searching maps… ${done}/${total}`; } });
      if (!current()) return;
      rows.sort((a, b) => a.level - b.level || getRegionLabel(a.regionId).localeCompare(getRegionLabel(b.regionId)) || a.id.localeCompare(b.id));
      status.textContent = rows.length ? `${rows.length} enemies · ${maps.length} maps searched · Level ${min}–${max}` : `No available enemies at levels ${min}–${max} across ${maps.length} maps. Try another range or search again after respawns.`;
      results.innerHTML = rows.map((row, index) => `<div class="enemy-search-row" role="listitem"><img src="${marauderArt(row)}" alt="" loading="lazy"><div><strong>${escapeHtml(row.name)}</strong><small>Level ${row.level} · ${row.classification === "boss" ? "Clan boss" : "Solo hunt"} · ${escapeHtml(getRegionLabel(row.regionId))}</small></div><button type="button" class="location-icon-button" data-enemy-location="${index}" title="Locate ${escapeHtml(row.name)}" aria-label="Locate ${escapeHtml(row.name)} in ${escapeHtml(getRegionLabel(row.regionId))}">Location</button></div>`).join("");
      results.querySelectorAll("[data-enemy-location]").forEach(button => button.addEventListener("click", async () => {
        if (busy || !current()) return;
        if (!canNavigate()) { status.textContent = "Wait for your refill to finish before locating an enemy."; return; }
        busy = true; form.elements.min.disabled = true; form.elements.max.disabled = true; button.disabled = true; form.querySelector("button").disabled = true;
        const row = rows[Number(button.dataset.enemyLocation)], map = { regionId: row.regionId, islandId: getOnlineIslandId(row.regionId) };
        const verify = async () => {
          const fresh = await api.loadActiveMarauders([map], { isCurrent: current });
          if (!current()) return null;
          if (!fresh.some(target => target.id === row.id && target.spawnId === row.spawnId)) throw new Error("That enemy was defeated or replaced. Search again for available enemies.");
          return fresh;
        };
        status.textContent = `Locating ${row.name}…`;
        try {
          let fresh = await verify(); if (!fresh || !canNavigate()) return;
          if (!isWorldRegionRuntimeActive(row.regionId)) throw new Error("That map is no longer active. Search again.");
          if (row.regionId !== getActiveMapRegionId()) {
            const switched = await switchOnlineIsland(row.regionId, { preserveModal: true });
            if (!current()) return;
            if (!switched || row.regionId !== getActiveMapRegionId()) throw new Error("Could not open that map. Try the location button again.");
            fresh = await verify(); if (!fresh) return;
          }
          if (!current() || !canNavigate()) return;
          applyOnlineMarauders([...visibleMarauders(row.regionId).filter(target => target.id !== row.id),
            fresh.find(target => target.id === row.id)], row.regionId);
          if (modal.open) modal.close();
          onLocated(); selectMarauder(row.id); showToast(`Viewing ${row.name}`);
        } catch (error) { if (current()) status.textContent = error.message || "Could not locate that enemy. Try again."; }
        finally { if (current()) { busy = false; form.elements.min.disabled = false; form.elements.max.disabled = false; button.disabled = false; form.querySelector("button").disabled = false; } }
      }));
    } catch (error) {
      if (current()) { results.replaceChildren(); status.textContent = error.message || "Enemy search unavailable. Reconnect and try Search again."; }
    } finally {
      if (isCurrent() && token === request) {
        if (!current()) { stop(); status.textContent = "Your realm or session changed. Search again."; }
        busy = false; form.querySelector("button").disabled = false; results.removeAttribute("aria-busy");
      }
    }
  });
  return { stop };
}
function getClanRallyMaximumParticipants(rally) {
  const target = rally || {};
  return target.targetType === "marauder" && (target.targetBalanceVersion ?? target.balanceVersion) === CrownlandsMarauders.BALANCE_VERSION
    ? 5 : CLAN_RALLY_MAX_PARTICIPANTS;
}

function renderBossReadiness(rally) {
  const cached = bossReadiness.get(rally.id);
  const checked = rally.targetBalanceVersion === 2 && cached?.rallyUpdatedAtMs !== normalizeTimestampMs(rally.updatedAtMs) ? null : cached;
  const ready = checked?.participants, forecast = checked?.combatForecast;
  const contribution = checked?.contribution;
  const personalRewards = contribution?.rewardVersion === CrownlandsMarauders.BOSS_REWARD_VERSION;
  const shares = contribution ? `<div class="boss-contributions"><p>${contribution.eligible ? "Contributions qualify for launch." : escapeHtml(contribution.reason || "Adjust the contributions below before launching.")}</p>${personalRewards ? "<p>Every launched member gets the full Gold and XP on victory. Item and Gear Box chances are individual.</p>" : ""}${contribution.members.map(row => `<p><strong>${escapeHtml((rally.participants || []).find(p => p.uid === row.uid)?.ownerName || "Member")}</strong>: ${formatNumber(row.attackPower)} attack${personalRewards ? "" : ` · ${row.sharePercent}% share · minimum ${formatNumber(row.minimumPower)} power${contribution.maxSharePercent ? ` · maximum ${contribution.maxSharePercent}% share` : ""}`}<br>${row.eligible ? "Eligible" : escapeHtml(row.reason)} · On victory: ${formatNumber(row.gold)} Gold / ${formatNumber(row.xp)} XP${row.estimatedLosses === null ? "" : ` · Estimated losses: ${formatNumber(row.estimatedLosses)}`}</p>`).join("")}</div>` : "";
  return `${renderHuntStamina("Each assembled member needs 10 stamina at launch.")}<div class="boss-readiness"><button type="button" data-boss-readiness="${escapeHtml(rally.id)}">Check member readiness</button><p role="status">${ready ? ready.map(row => `${escapeHtml((rally.participants || []).find(p => p.uid === row.uid)?.ownerName || "Member")}: ${row.ready ? "Ready" : "Needs stamina"}`).join(" · ") : cached ? "This rally changed. Check readiness again before launching." : "Member stamina readiness has not been checked."}</p>${checked ? "<small>Readiness at last check. Launch checks every member again.</small>" : ""}${shares}${forecast?.status === "scouted" ? `<p>Forecast at scout time: ${forecast.attackPower > forecast.defensePower ? "Victory expected" : "Defeat expected"} · ${formatNumber(forecast.defensePower)} defense. Estimated losses: ${formatNumber(forecast.estimatedAttackerLosses || 0)}. Current assembled force; bonuses are locked at launch.${forecast.attackPower <= forecast.defensePower ? " Warning: this army is expected to lose; launch is still your choice." : ""}</p>` : "<p>Scout this boss spawn for a forecast.</p>"}</div>`;
}
document.addEventListener("click", async event => {
  const button = event.target.closest("[data-boss-readiness]");
  if (!button) return;
  button.disabled = true;
  try {
    const result = await getOnlineApi().getBossRallyReadiness({ clanId: state.clanId, rallyId: button.dataset.bossReadiness });
    bossReadiness.set(button.dataset.bossReadiness, result); renderClanView();
    if (modal.open && modal.classList.contains("outgoing-attack-modal")) renderOutgoingAttacksModalContent();
  } catch (error) { button.nextElementSibling.textContent = error.message || "Readiness unavailable."; }
  finally { if (button.isConnected) button.disabled = false; }
});
