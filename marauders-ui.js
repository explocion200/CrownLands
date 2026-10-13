/* exported applyOnlineMarauders, renderMarauders, renderMarauderScoutReport, renderBossReadiness, selectMarauder, selectedMarauderSpawnId, scoutMarauder, attackMarauder */
/* Shared NPC targets stay separate from capturable city and camp state. */
const marauderMaps = new Map();
const bossReadiness = new Map();
let selectedMarauderSpawnId = "";
function marauderArt(target) { return `assets/marauders/${target.classification === "boss" ? "boss" : "solo"}-v1.webp`; }
function applyOnlineMarauders(rows, regionId) {
  marauderMaps.set(regionId, { uid: getCurrentOnlineUid(), generation: RESET_GENERATION,
    rows: rows.filter(row => row.worldId === ONLINE_WORLD_ID && row.resetGeneration === RESET_GENERATION
      && row.regionId === regionId && row.status === "active").map(row => ({ ...row, owner: "neutral", ownerUid: "", troops: null })) });
  const selected = getMarauderById(selectedTargetId);
  if (selectedMarauderSpawnId && selected?.regionId === regionId && selected.spawnId !== selectedMarauderSpawnId && !sendMode) {
    selectedTargetId = null; selectedMarauderSpawnId = "";
  }
  renderCities(true);
}
function currentMarauders(regionId = getActiveMapRegionId()) {
  const map = marauderMaps.get(regionId);
  return map?.uid === getCurrentOnlineUid() && map.generation === RESET_GENERATION ? map.rows : [];
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
  for (const target of currentMarauders().filter(row => shouldRenderCampNode(row, bounds))) {
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
    node.setAttribute("aria-label", target.name); node.title = target.name;
    if (node.dataset.spawnId !== target.spawnId) {
      node.dataset.spawnId = target.spawnId;
      node.innerHTML = `<img src="${marauderArt(target)}" alt="" draggable="false"><span>${target.classification === "boss" ? "Boss" : "Marauder"} · ${Number(target.level)}</span>`;
    }
  }
  existing.forEach(node => node.remove());
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
function renderMarauderScoutReport(model) {
  const report = model.report, city = model.city;
  return `<section class="marauder-details"><h2>${escapeHtml(city.name)}</h2><p>${escapeHtml(getRegionLabel(report.regionId || city.regionId))}</p>
    <p>Scouted defenders: <strong>${formatNumber(report.troops)}</strong><br>Total defense: <strong>${formatNumber(report.totalDefense)}</strong></p>
    <p>1 defense per defender · No walls. Defenders can change before arrival. Intelligence applies only to this spawn.</p>
    ${renderHuntStamina()}</section>`;
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
function openMarauderDetails(id) {
  const target = getMarauderById(id);
  if (!target) { showToast("That enemy is no longer available."); return; }
  const intel = getScoutReportForTarget(target), balance = CrownlandsMarauders.balance(target.level);
  modal.className = "modal marauder-modal"; modalTitle.textContent = target.name;
  modalBody.innerHTML = `<section class="marauder-details"><img class="marauder-portrait" src="${marauderArt(target)}" alt="${escapeHtml(target.name)}">
    <h2>${escapeHtml(target.name)}</h2><p>${escapeHtml(getRegionLabel(target.regionId))} · ${target.classification === "boss" ? "Clan rally · 2–20 members" : "Solo army · Clan optional"}</p>
    <p>${intel ? `Scouted defenders: <strong>${formatNumber(intel.troops)}</strong> · ${formatNumber(Math.ceil(getScoutReportRemainingSeconds(intel) / 60))} minutes remaining` : "Scout this spawn to reveal its current defenders and combat forecast."}</p>
    <p>No walls · 1 defense per defender. Failed attacks leave surviving defenders.</p>
    <p>Victory pool: <strong>${formatNumber(balance.gold)} Gold</strong> · <strong>${formatNumber(balance.xp)} Hero XP</strong>${target.classification === "boss" ? ". Shared by damage contribution." : "."}<br>One item chance: ${(balance.itemChance * 100).toFixed(1)}%. Hero XP caps apply.</p>
    ${renderHuntStamina()}<footer><button class="cl-action-button cl-action-scout" type="button" data-npc-action="scout">${renderCrownlandsIcon("scout")} Scout</button><button class="cl-action-button cl-action-attack" type="button" data-npc-action="attack">${renderCrownlandsIcon("attack")} ${target.classification === "boss" ? "Prepare rally" : "Attack"}</button></footer><p>Scouting uses one troop and no stamina.</p></section>`;
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
function showNearbyMarauders() {
  modal.className = "modal marauder-modal"; modalTitle.textContent = "Find enemies";
  const source = cityById(selectedSourceId) || state.cities.find(city => city.owner === "player");
  const rows = currentMarauders().slice().sort((a, b) => source
    ? Math.hypot(a.x - source.x, a.y - source.y) - Math.hypot(b.x - source.x, b.y - source.y) || a.level - b.level
    : a.level - b.level);
  modalBody.innerHTML = `<section class="marauder-search"><p>${escapeHtml(getRegionLabel(getActiveMapRegionId()))} · ${source ? `Nearest to ${escapeHtml(source.name)}` : "Lowest level first"}</p>
    <label>Minimum level <input data-npc-min type="number" min="1" max="100" value="1"></label><label>Maximum level <input data-npc-max type="number" min="1" max="100" value="100"></label>
    <div data-npc-results>${rows.map(row => `<button type="button" data-enemy-id="${escapeHtml(row.id)}" data-level="${row.level}"><img src="${marauderArt(row)}" alt=""><span>${escapeHtml(row.name)}<small>${row.classification === "boss" ? "Clan rally" : "Solo hunt"}</small></span></button>`).join("")}</div>
    <p data-npc-empty ${rows.length ? "hidden" : ""}>No matching enemies on this map. Switch maps in the World Map, or check back after respawns. Bosses appear only in the central 5×5 Core; solo marauders appear only in New Lands.</p></section>`;
  if (!modal.open) modal.showModal();
  modalBody.querySelectorAll("input").forEach(input => input.addEventListener("input", () => {
    const min = Number(modalBody.querySelector("[data-npc-min]").value) || 1, max = Number(modalBody.querySelector("[data-npc-max]").value) || 100;
    const buttons = [...modalBody.querySelectorAll("[data-enemy-id]")];
    buttons.forEach(button => { button.hidden = Number(button.dataset.level) < min || Number(button.dataset.level) > max; });
    modalBody.querySelector("[data-npc-empty]").hidden = buttons.some(button => !button.hidden);
  }));
  modalBody.querySelectorAll("[data-enemy-id]").forEach(button => button.addEventListener("click", () => openMarauderDetails(button.dataset.enemyId)));
}
function renderBossReadiness(rally) {
  const checked = bossReadiness.get(rally.id), ready = checked?.participants, forecast = checked?.combatForecast;
  return `${renderHuntStamina("Each assembled member needs 10 stamina at launch.")}<div class="boss-readiness"><button type="button" data-boss-readiness="${escapeHtml(rally.id)}">Check member readiness</button><p role="status">${ready ? ready.map(row => `${escapeHtml((rally.participants || []).find(p => p.uid === row.uid)?.ownerName || "Member")}: ${row.ready ? "Ready" : "Needs stamina"}`).join(" · ") : "Member stamina readiness has not been checked."}</p>${checked ? "<small>Readiness at last check. Launch checks every member again.</small>" : ""}${forecast?.status === "scouted" ? `<p>Forecast at scout time: ${forecast.attackPower > forecast.defensePower ? "Victory expected" : "Defeat expected"} · ${formatNumber(forecast.defensePower)} defense. Current assembled force; bonuses are locked at launch.</p>` : "<p>Scout this boss spawn for a forecast.</p>"}</div>`;
}
document.addEventListener("click", async event => {
  if (event.target.closest("[data-find-marauders]")) showNearbyMarauders();
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
