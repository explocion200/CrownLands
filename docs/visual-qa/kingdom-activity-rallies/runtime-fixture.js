/* Synthetic local snapshots through the real game renderer. Excluded from production. */
(async function () {
  if (location.hostname !== "127.0.0.1" || !window.__CROWNLANDS_BENCHMARK__) throw Error("Local benchmark required");
  const deadline = Date.now() + 60000;
  while (window.__CROWNLANDS_BENCHMARK__.getStatus().status !== "ready") {
    if (Date.now() > deadline) throw Error("Benchmark initialization timed out");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const source = state.cities.find(city => city.owner === "player");
  const target = state.cities.find(city => city.owner !== "player");
  const region = getCityRegionId(source), uid = getCurrentOnlineUid();
  const readApi = getOnlineApi;
  const pending = action => request => {
    document.documentElement.dataset.rallyRuntimeAction = `${action}:${request.rallyId}`;
    return new Promise(() => {});
  };
  getOnlineApi = () => ({ ...readApi(), isSignedIn: () => true, launchClanRally: pending("launch"), cancelClanRally: pending("cancel"), withdrawClanRallyContribution: pending("withdraw") });
  beginJoinClanRallyContribution = rally => { document.documentElement.dataset.rallyRuntimeAction = `join:${rally.id}`; showToast("Local review: existing join entry received the selected rally."); };
  useRecallHornOnMission = id => { document.documentElement.dataset.rallyRuntimeAction = `recall:${id}`; recallHornRequests.add(id); patchMarchItemActionUi(); };
  const snapshot = () => ({ marches: [], rallies: onlineClanRallies, reinforcements: [], camps: [], strongholds: [{ ...source, kind: "stronghold", strongholdType: "gold", name: "Ironwatch" }] });
  getActiveOperationsSnapshot = snapshot;
  getRenderableArmies = () => onlineClanRallies.filter(rally => rally.status === "launched").map(rally => ({ id: rally.armyId, owner: "player", kind: "attack", remaining: 500 }));
  const samples = ["standard", "ready", "join", "member", "leader", "full", "many", "long", "no-horns", "pending", "empty"];
  function show(sample) {
    rallyActionRequests.clear(); recallHornRequests.clear();
    state.clanId = "local-review-clan"; state.clanRole = sample === "leader" ? "leader" : "member";
    state.shopItems[RECALL_HORN_ITEM_ID] = sample === "no-horns" ? 0 : 2;
    selectedActivityRallyId = "";
    onlineClanRallies = window.__rallyReviewFixtures(sample).map(row => ({
      id: row.id, clanId: state.clanId, leaderUid: row.owned ? uid : `review-${row.creator}`,
      leaderName: row.creator, targetId: row.kind === "citadel" ? CROWN_CITADEL_ID : target.id,
      targetName: row.target, targetRegionId: region, assemblyCityId: source.id, assemblyCityName: row.assembly,
      status: row.state === "returning" ? "recalling" : row.state, armyId: `rally_attack_${row.id}`,
      participants: row.participants.map(person => ({ uid: person.own ? uid : `review-${person.name}`, ownerName: person.name, role: person.creator ? "leader" : "ally", status: person.state, troops: person.troops, arrivesAtMs: Date.now() + person.seconds * 1000 })),
    }));
    if (sample === "pending") rallyActionRequests.add(onlineClanRallies[0].id);
    activeOperationsTab = "rallies";
    modal.className = "modal outgoing-attack-modal"; renderOutgoingAttacksModalContent(snapshot());
    if (!modal.open) modal.showModal();
    document.documentElement.dataset.rallyRuntimeSample = sample;
  }
  const controls = document.createElement("div"); controls.style = "position:fixed;top:0;right:0;z-index:999999;display:flex;gap:4px;background:#e8dbb8;color:#352f23";
  const picker = document.createElement("select"); picker.setAttribute("aria-label", "Runtime rally example"); picker.innerHTML = samples.map(sample => `<option>${sample}</option>`).join(""); picker.addEventListener("change", () => show(picker.value)); controls.append(picker);
  const refresh = document.createElement("button"); refresh.textContent = "Refresh snapshot"; refresh.addEventListener("click", () => renderOutgoingAttacksModalContent(snapshot())); controls.append(refresh);
  const reopen = document.createElement("button"); reopen.textContent = "Reopen Rallies"; reopen.addEventListener("click", () => show(picker.value)); controls.append(reopen);
  const remove = document.createElement("button"); remove.textContent = "Remove selected"; remove.addEventListener("click", () => { onlineClanRallies = onlineClanRallies.filter(rally => rally.id !== selectedActivityRallyId); renderOutgoingAttacksModalContent(snapshot()); }); controls.append(remove);
  modal.append(controls); show("standard"); document.documentElement.dataset.rallyRuntimeReady = "true";
})();
