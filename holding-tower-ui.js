(function initializeHoldingTowerUi(global) {
  "use strict";

  const number = value => Math.max(0, Math.floor(Number(value) || 0)).toLocaleString();
  const escape = value => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  const timestampMs = value => {
    if (typeof value?.toMillis === "function") return value.toMillis();
    if (Number.isFinite(Number(value?.seconds))) return Number(value.seconds) * 1000 + Number(value.nanoseconds || 0) / 1_000_000;
    return Number(value) || 0;
  };
  const countdown = (expiresAtMs, nowMs = Date.now()) => {
    let seconds = Math.max(0, Math.ceil((timestampMs(expiresAtMs) - nowMs) / 1000));
    if (!seconds) return "Ready";
    const hours = Math.floor(seconds / 3600);
    seconds -= hours * 3600;
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${minutes}:${String(remainder).padStart(2, "0")}`;
  };
  const elapsedPercent = (startedAtMs, completeAtMs, nowMs = Date.now()) => {
    const started = timestampMs(startedAtMs);
    const complete = timestampMs(completeAtMs);
    if (!started || complete <= started) return 0;
    return Math.min(100, Math.max(0, Math.floor((nowMs - started) * 100 / (complete - started))));
  };

  function createMapFeaturePresentation(regionId = "", towerDefinitions = [], catalogSummaries = null, camps = []) {
    const normalized = String(regionId || "").trim().toLowerCase();
    const catalogSummary = catalogSummaries?.get?.(normalized) || catalogSummaries;
    const hasClanTower = towerDefinitions.some(tower => String(tower?.regionId || "").trim().toLowerCase() === normalized);
    const hasCamp = Math.max(0, Math.floor(Number(catalogSummary?.campCount) || 0)) > 0
      || camps.some(camp => String(camp?.regionId || "").trim().toLowerCase() === normalized);
    return {
      hasClanTower,
      hasCamp,
      classNames: `${hasClanTower ? "has-clan-tower" : ""} ${hasCamp ? "has-camp" : ""}`,
      ariaPhrases: [hasClanTower ? "contains a Clan Tower" : "", hasCamp ? "contains a camp" : ""].filter(Boolean),
      markup: hasClanTower || hasCamp ? `<span class="island-map-feature-trim" aria-hidden="true"></span><span class="island-map-feature-badges" aria-hidden="true">${hasClanTower ? '<span class="island-map-feature-badge clan-tower" title="Clan Tower"><strong>T</strong><small>Tower</small></span>' : ""}${hasCamp ? '<span class="island-map-feature-badge camp" title="Camp"><strong>C</strong><small>Camp</small></span>' : ""}</span>` : "",
    };
  }
  const mapFeatureLegend = '<div class="island-map-feature-legend" aria-label="Map feature indicators"><span><strong class="clan-tower" aria-hidden="true">T</strong> Clan Tower</span><span><strong class="camp" aria-hidden="true">C</strong> Camp</span></div>';

  function createQaSnapshot(tower, scenario = "owner") {
    const nowMs = Date.now();
    const neutral = scenario === "neutral";
    const enemy = ["clan-owned", "enemy", "scout-success", "scout-veil"].includes(scenario);
    const ownerMember = !neutral && !enemy;
    const incoming = scenario === "incoming";
    const damaged = ["damaged", "repair"].includes(scenario);
    const repair = scenario === "repair"
      ? { id: "repair-qa", startIntegrityBps: 3_800, startedAtMs: nowMs - 11 * 60_000, completeAtMs: nowMs + 19 * 60_000 }
      : null;
    const queueCount = scenario === "queue" ? 5 : ["upgrading", "incoming"].includes(scenario) ? 2 : 0;
    const upgradeQueue = Array.from({ length: queueCount }, (_, index) => ({
      id: `qa-upgrade-${index + 1}`,
      fromLevel: 12 + index,
      targetLevel: 13 + index,
      cost: 6_250_000 * (index + 1),
      queuedAtMs: nowMs - 2 * 60_000,
      remainingMs: 600_000,
      progressStartedAtMs: index === 0 && !incoming ? nowMs - 4 * 60_000 : 0,
    }));
    const clanEmblem = {
      shape: "heater",
      division: "split",
      primary: "#7f252d",
      secondary: "#1d4352",
      borderColor: "#e0b65a",
      charge: "tower",
      chargeColor: "#f4dc91",
      secondaryCharge: "star",
      secondaryChargeColor: "#f4dc91",
      chargeLayout: "chief",
      trim: "double",
      finish: "aged",
    };
    const exactDefenders = neutral
      ? scenario === "scout-success" ? 10_000_000 : null
      : enemy
        ? scenario === "scout-success" ? 4_782_350 : null
        : 4_782_350;
    return {
      ...tower,
      targetType: "tower",
      worldActive: true,
      ownerKind: neutral ? "neutral" : "clan",
      clanId: neutral ? "" : "qa-crimson-watch",
      clanName: neutral ? "" : "The Crimson Watch",
      clanTag: neutral ? "" : "TCW",
      clanEmblem: neutral ? null : clanEmblem,
      wallLevel: neutral ? 1 : 12,
      wallIntegrityBps: damaged ? 3_800 : incoming ? 8_600 : 10_000,
      exactDefenders,
      neutralDefenders: neutral && exactDefenders !== null ? 10_000_000 : null,
      ownerMember,
      ownStationedTroops: ownerMember ? 685_200 : 0,
      garrison: ownerMember ? [
        { uid: "qa-self", ownerName: "Ricky", troops: 685_200 },
        { uid: "qa-john", ownerName: "John", troops: 1_842_150 },
        { uid: "qa-mike", ownerName: "Mike", troops: 2_255_000 },
      ] : [],
      eligibility: { eligible: ownerMember, remainingMs: 0 },
      permissions: {
        inspect: true,
        scout: true,
        createRallyAttack: enemy || neutral,
        reinforce: ownerMember,
        withdrawOwn: ownerMember,
        attackFrom: ownerMember,
        rallyFrom: ownerMember,
        manage: ownerMember,
      },
      repair,
      repairActive: Boolean(repair),
      repairCompleteAtMs: repair?.completeAtMs || 0,
      repairCost: damaged ? 3_875_000 : 0,
      upgradeQueue,
      upgradeActive: Boolean(upgradeQueue[0]?.progressStartedAtMs),
      upgradeTargetLevel: upgradeQueue[0]?.targetLevel || 0,
      upgradeCompleteAtMs: upgradeQueue[0]?.progressStartedAtMs
        ? upgradeQueue[0].progressStartedAtMs + upgradeQueue[0].remainingMs
        : 0,
      queuedUpgradeCount: upgradeQueue.length,
      nextWallUpgradeCost: 6_250_000 * (upgradeQueue.length + 1),
      attackBlocked: incoming,
      incomingRallyCount: incoming ? 1 : 0,
      veilActive: scenario === "scout-veil" || scenario === "veil-active",
      veilExpiresAtMs: scenario === "scout-veil" || scenario === "veil-active" ? nowMs + 7 * 60_000 : 0,
      veilCost: 1_250_000,
      veilUsage: { utcDate: new Date(nowMs).toISOString().slice(0, 10), count: scenario === "scout-veil" || scenario === "veil-active" ? 2 : 1 },
      veilUsesRemaining: scenario === "scout-veil" || scenario === "veil-active" ? 1 : 2,
      qaScenario: scenario,
      qaScoutResult: scenario === "scout-success" ? "success" : scenario === "scout-veil" ? "veil" : "",
      serverTimeMs: nowMs,
    };
  }

  function renderQueue(tower, nowMs) {
    const queue = Array.isArray(tower.upgradeQueue) ? tower.upgradeQueue : [];
    if (!tower.ownerMember) return "";
    const active = queue[0] || null;
    const queued = queue.slice(1);
    const activeProgress = active && !tower.attackBlocked
      ? elapsedPercent(active.progressStartedAtMs, tower.upgradeCompleteAtMs, nowMs)
      : 0;
    return `
      <section class="clan-quest-panel holding-tower-queue" aria-labelledby="holdingTowerQueueTitle">
        <div class="profile-section-heading clan-panel-heading holding-tower-section-heading">
          <span>Construction</span><h3 id="holdingTowerQueueTitle">Wall Upgrades</h3><b>${Math.max(0, 10 - queue.length)} slots open</b>
        </div>
        ${active ? `
          <div class="holding-tower-upgrade-current">
            <div class="holding-tower-upgrade-copy">
              <span>${tower.attackBlocked ? "Paused by incoming Rally" : "Current upgrade"}</span>
              <strong>Wall Level ${number(active.fromLevel)} → ${number(active.targetLevel)}</strong>
              <small>${number(active.cost || 0)} Gold · ${tower.attackBlocked ? "resumes after battle" : `${countdown(tower.upgradeCompleteAtMs, nowMs)} remaining`}</small>
            </div>
            <div class="clan-quest-progress holding-tower-timer">
              <div><strong>${tower.attackBlocked ? "Paused" : `${activeProgress}%`}</strong><span>${tower.attackBlocked ? "Enemy Rally incoming" : "10-minute build"}</span></div>
              <span class="clan-quest-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${activeProgress}"><i style="width:${activeProgress}%"></i></span>
            </div>
          </div>
          <div class="holding-tower-queued-levels">
            <span>Queued levels (${number(queued.length)})</span>
            <strong>${queued.length ? queued.map(entry => `L${number(entry.fromLevel)}→${number(entry.targetLevel)}`).join(" · ") : "None"}</strong>
            <small>Each queued level begins after the prior 10-minute build.</small>
          </div>`
          : `<div class="holding-tower-queue-empty"><strong>No upgrades queued</strong><span>Next: Wall Level ${number(tower.wallLevel || 1)} → ${number((tower.wallLevel || 1) + 1)} · ${number(tower.nextWallUpgradeCost || 0)} Gold</span></div>`}
      </section>`;
  }

  function renderActions(tower, actionBusy, nowMs) {
    const permissions = tower.permissions || {};
    const disabled = actionBusy ? "disabled" : "";
    const probation = tower.ownerMember && !tower.eligibility?.eligible;
    return `
      <section class="clan-social-card holding-tower-actions" aria-labelledby="holdingTowerActionsTitle">
        <div class="profile-section-heading clan-panel-heading holding-tower-section-heading"><span>Orders</span><h3 id="holdingTowerActionsTitle">Tower Actions</h3></div>
        ${probation ? `<div class="holding-tower-probation"><strong>24-hour access probation</strong><span>Military Tower actions unlock in ${countdown(nowMs + Number(tower.eligibility?.remainingMs || 0), nowMs)}.</span></div>` : ""}
        <div class="action-buttons holding-tower-action-grid">
          ${permissions.scout && !tower.ownerMember ? `<button type="button" class="secondary" data-tower-action="scout" ${disabled}>Scout Tower</button>` : ""}
          ${permissions.createRallyAttack ? `<button type="button" class="danger attack-action" data-tower-action="rally-attack" ${disabled}>Form Rally Attack</button>` : ""}
          ${permissions.reinforce ? `<button type="button" class="move-action" data-tower-action="reinforce" ${disabled}>Reinforce</button>` : ""}
          ${permissions.withdrawOwn ? `<button type="button" class="secondary" data-tower-action="withdraw" ${disabled}>Withdraw Mine</button>` : ""}
          ${permissions.attackFrom ? `<button type="button" class="danger attack-action" data-tower-action="attack-from" ${disabled}>Attack from Tower</button>` : ""}
          ${permissions.rallyFrom ? `<button type="button" class="danger attack-action" data-tower-action="rally-from" ${disabled}>Rally from Tower</button>` : ""}
        </div>
        ${permissions.manage ? `
          <div class="city-level-up-panel holding-tower-commandery">
            <div class="city-level-up-copy"><strong>Officer Commandery</strong><small>Server-authoritative Tower spending from the Clan Treasury.</small></div>
            <label>Wall Levels <input data-tower-upgrade-count type="number" min="1" max="${Math.max(1, 10 - (tower.upgradeQueue?.length || 0))}" value="1" /></label>
            <div class="city-level-up-actions holding-tower-command-actions">
              <button type="button" class="city-level-up-btn" data-tower-action="upgrade" ${actionBusy || tower.attackBlocked || tower.wallIntegrityBps < 10_000 || (tower.upgradeQueue?.length || 0) >= 10 ? "disabled" : ""}><span>Queue Upgrade</span><small>${number(tower.nextWallUpgradeCost || 0)} Gold</small></button>
              <button type="button" class="city-level-up-btn move-action" data-tower-action="repair" ${actionBusy || tower.attackBlocked || tower.wallIntegrityBps >= 10_000 || tower.repairActive ? "disabled" : ""}><span>Start Repair</span><small>${number(tower.repairCost || tower.repair?.paidCost || 0)} Gold</small></button>
              <button type="button" class="city-level-up-btn secondary" data-tower-action="veil" ${actionBusy || tower.veilActive || tower.veilUsesRemaining < 1 ? "disabled" : ""}><span>Veil of Silence</span><small>${number(tower.veilCost || 0)} Gold</small></button>
            </div>
          </div>` : ""}
      </section>`;
  }

  function renderPanel(tower, { actionBusy = false, clanShieldHtml = "", treasuryBalance = null, nowMs = Date.now() } = {}) {
    const integrity = Math.min(100, Math.max(0, Math.floor(Number(tower.wallIntegrityBps) || 0) / 100));
    const integrityBps = Math.min(10_000, Math.max(0, Math.floor(Number(tower.wallIntegrityBps) || 0)));
    const neutral = tower.ownerKind !== "clan";
    const exactKnown = tower.exactDefenders !== null && tower.exactDefenders !== undefined;
    const defenders = exactKnown ? number(tower.exactDefenders) : "Hidden";
    const repairProgress = tower.repairActive
      ? elapsedPercent(tower.repair?.startedAtMs, tower.repairCompleteAtMs || tower.repair?.completeAtMs, nowMs)
      : 0;
    const repairStatus = tower.repairActive
      ? `Repair in progress · ${countdown(tower.repairCompleteAtMs || tower.repair?.completeAtMs, nowMs)} remaining · ${number(tower.repair?.paidCost || tower.repairCost || 0)} Gold paid`
      : integrity < 100
        ? `Damaged · ${number(tower.repairCost || 0)} Gold to restore full durability`
        : "Fortifications fully repaired";
    return `
      <article class="holding-tower-panel ${neutral ? "neutral" : tower.ownerMember ? "owner" : "enemy"}" data-holding-tower-panel>
        <header class="clan-hero holding-tower-hero">
          <div class="clan-hero-shield holding-tower-crest ${neutral ? "neutral" : ""}" aria-hidden="true">${neutral ? "<span>✦</span>" : clanShieldHtml}</div>
          <div class="clan-hero-copy holding-tower-hero-copy">
            <span>${escape(tower.quadrant ? tower.quadrant.replace("-", " ") : "Crownlands foothold")}</span>
            <h2>${escape(tower.name)}</h2>
            <p>${neutral ? "Neutral Crownlands garrison" : `Held by <strong>${escape(tower.clanName || "Unknown Clan")}</strong> ${tower.clanTag ? `[${escape(tower.clanTag)}]` : ""}`}</p>
          </div>
          <div class="clan-power holding-tower-wall-level"><span>Wall Level</span><strong>${number(tower.wallLevel || 1)}</strong><small>${integrity}% durability</small></div>
        </header>
        ${tower.qaScoutResult === "success" ? `<div class="holding-tower-intel success"><strong>Scout intelligence obtained</strong><span>${defenders} defenders confirmed at ${escape(tower.name)}.</span></div>` : ""}
        ${tower.qaScoutResult === "veil" ? "<div class=\"holding-tower-intel veil\"><strong>Veil of Silence</strong><span>Tower intelligence could not be obtained. Public wall and clan details remain visible.</span></div>" : ""}
        ${tower.attackBlocked ? "<div class=\"holding-tower-alert\" role=\"alert\"><strong>Enemy Rally incoming</strong><span>Construction is paused. Reinforcements may still arrive before battle.</span></div>" : ""}
        <div class="city-stat-panel modal-city-stats holding-tower-vitals">
          <section class="stat-wide fortification-status holding-tower-wall-card ${integrity < 100 ? "damaged" : ""}">
            <div><span>Wall durability</span><strong>${number(integrityBps)} / 10,000</strong></div>
            <b>${integrity}%</b>
            <small>${repairStatus}</small>
            <div class="clan-quest-progress holding-tower-durability">
              <span class="clan-quest-progress-track holding-tower-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${integrity}"><i style="width:${integrity}%"></i></span>
            </div>
            ${tower.repairActive ? `<div class="clan-quest-progress holding-tower-repair-progress"><div><strong>${repairProgress}%</strong><span>Paid repair timer</span></div><span class="clan-quest-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${repairProgress}"><i style="width:${repairProgress}%"></i></span></div>` : ""}
          </section>
          <section class="stat-chip holding-tower-defender-card"><span>Stationed defenders</span><strong>${defenders}</strong><small>${!exactKnown ? "Successful scouting required" : neutral ? "Neutral NPC defenders" : "Combined clan garrison"}</small></section>
          ${tower.ownerMember ? `<section class="stat-chip holding-tower-own-card"><span>Your stationed troops</span><strong>${number(tower.ownStationedTroops || 0)}</strong><small>Only you may withdraw them</small></section>` : ""}
          <section class="stat-chip holding-tower-veil-card ${tower.veilActive ? "active" : ""}"><span>Veil of Silence</span><strong>${tower.veilActive ? countdown(tower.veilExpiresAtMs, nowMs) : "Inactive"}</strong><small>${tower.ownerMember ? `${number(tower.veilUsesRemaining ?? 3)} of 3 uses remain today` : "Public wall details remain visible"}</small></section>
        </div>
        ${tower.ownerMember && tower.garrison?.length ? `<section class="clan-roster-panel holding-tower-garrison-list"><div class="profile-section-heading clan-panel-heading holding-tower-section-heading"><span>Shared defense</span><h3>Clan Garrison</h3></div><ol>${tower.garrison.map(entry => `<li class="clan-member-row"><span>${escape(entry.ownerName || "Ruler")}</span><strong>${number(entry.troops || 0)}</strong></li>`).join("")}</ol></section>` : ""}
        ${renderQueue(tower, nowMs)}
        ${renderActions(tower, actionBusy, nowMs)}
        ${tower.ownerMember && Number.isFinite(Number(treasuryBalance)) ? `<footer class="stat-wide main-city-status holding-tower-treasury"><span>Clan Treasury</span><strong>${number(treasuryBalance)} Gold</strong><small>Season donations fund Walls, Repairs, and Veil.</small></footer>` : ""}
      </article>`;
  }

  global.CROWNLANDS_HOLDING_TOWER_UI = Object.freeze({ createMapFeaturePresentation, createQaSnapshot, mapFeatureLegend, renderPanel });
})(window);
