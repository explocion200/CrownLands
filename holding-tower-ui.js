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
      upgradeQueue,
      upgradeActive: Boolean(upgradeQueue[0]?.progressStartedAtMs),
      upgradeTargetLevel: upgradeQueue[0]?.targetLevel || 0,
      upgradeCompleteAtMs: upgradeQueue[0]?.progressStartedAtMs
        ? upgradeQueue[0].progressStartedAtMs + upgradeQueue[0].remainingMs
        : 0,
      queuedUpgradeCount: upgradeQueue.length,
      attackBlocked: incoming,
      incomingRallyCount: incoming ? 1 : 0,
      veilActive: scenario === "scout-veil",
      veilExpiresAtMs: scenario === "scout-veil" ? nowMs + 7 * 60_000 : 0,
      veilUsage: { utcDate: new Date(nowMs).toISOString().slice(0, 10), count: scenario === "scout-veil" ? 2 : 1 },
      veilUsesRemaining: scenario === "scout-veil" ? 1 : 2,
      qaScenario: scenario,
      qaScoutResult: scenario === "scout-success" ? "success" : scenario === "scout-veil" ? "veil" : "",
      serverTimeMs: nowMs,
    };
  }

  function renderQueue(tower, nowMs) {
    const queue = Array.isArray(tower.upgradeQueue) ? tower.upgradeQueue : [];
    if (!tower.ownerMember) return "";
    return `
      <section class="holding-tower-queue" aria-labelledby="holdingTowerQueueTitle">
        <div class="holding-tower-section-heading">
          <span>Construction</span><h3 id="holdingTowerQueueTitle">Wall Upgrade Queue</h3><b>${Math.max(0, 10 - queue.length)} slots open</b>
        </div>
        ${queue.length ? `<ol>${queue.map((entry, index) => `
          <li class="${index === 0 ? "active" : ""}">
            <span>${index === 0 ? tower.attackBlocked ? "Paused" : "Building" : `Queued ${index + 1}`}</span>
            <strong>L${number(entry.fromLevel)} → L${number(entry.targetLevel)}</strong>
            <small>${index === 0
              ? tower.attackBlocked ? "Enemy Rally incoming" : countdown(tower.upgradeCompleteAtMs, nowMs)
              : "10:00 after prior level"}</small>
          </li>`).join("")}</ol>` : "<p>No Wall Levels are queued.</p>"}
      </section>`;
  }

  function renderActions(tower, actionBusy, nowMs) {
    const permissions = tower.permissions || {};
    const disabled = actionBusy ? "disabled" : "";
    const probation = tower.ownerMember && !tower.eligibility?.eligible;
    return `
      <section class="holding-tower-actions" aria-labelledby="holdingTowerActionsTitle">
        <div class="holding-tower-section-heading"><span>Orders</span><h3 id="holdingTowerActionsTitle">Tower Actions</h3></div>
        ${probation ? `<div class="holding-tower-probation"><strong>24-hour access probation</strong><span>Military Tower actions unlock in ${countdown(nowMs + Number(tower.eligibility?.remainingMs || 0), nowMs)}.</span></div>` : ""}
        <div class="holding-tower-action-grid">
          ${permissions.scout && !tower.ownerMember ? `<button type="button" data-tower-action="scout" ${disabled}>Scout Tower</button>` : ""}
          ${permissions.createRallyAttack ? `<button type="button" class="danger-action" data-tower-action="rally-attack" ${disabled}>Form Rally Attack</button>` : ""}
          ${permissions.reinforce ? `<button type="button" data-tower-action="reinforce" ${disabled}>Reinforce</button>` : ""}
          ${permissions.withdrawOwn ? `<button type="button" data-tower-action="withdraw" ${disabled}>Withdraw Mine</button>` : ""}
          ${permissions.attackFrom ? `<button type="button" data-tower-action="attack-from" ${disabled}>Attack from Tower</button>` : ""}
          ${permissions.attackFrom ? `<button type="button" data-tower-action="scout-from" ${disabled}>Scout from Tower</button>` : ""}
          ${permissions.rallyFrom ? `<button type="button" data-tower-action="rally-from" ${disabled}>Rally from Tower</button>` : ""}
        </div>
        ${permissions.manage ? `
          <div class="holding-tower-commandery">
            <div><strong>Officer Commandery</strong><small>All prices and permissions are verified by the server.</small></div>
            <label>Wall Levels <input data-tower-upgrade-count type="number" min="1" max="${Math.max(1, 10 - (tower.upgradeQueue?.length || 0))}" value="1" /></label>
            <button type="button" data-tower-action="upgrade" ${actionBusy || tower.attackBlocked || tower.wallIntegrityBps < 10_000 ? "disabled" : ""}>Queue Upgrade</button>
            <button type="button" data-tower-action="repair" ${actionBusy || tower.attackBlocked || tower.wallIntegrityBps >= 10_000 || tower.repairActive ? "disabled" : ""}>Start Paid Repair</button>
            <button type="button" data-tower-action="veil" ${actionBusy || tower.veilActive || tower.veilUsesRemaining < 1 ? "disabled" : ""}>Veil of Silence</button>
          </div>` : ""}
      </section>`;
  }

  function renderPanel(tower, { actionBusy = false, clanShieldHtml = "", treasuryBalance = null, nowMs = Date.now() } = {}) {
    const integrity = Math.min(100, Math.max(0, Math.floor(Number(tower.wallIntegrityBps) || 0) / 100));
    const neutral = tower.ownerKind !== "clan";
    const exactKnown = tower.exactDefenders !== null && tower.exactDefenders !== undefined;
    const defenders = exactKnown ? number(tower.exactDefenders) : "Hidden";
    return `
      <article class="holding-tower-panel ${neutral ? "neutral" : tower.ownerMember ? "owner" : "enemy"}" data-holding-tower-panel>
        <header class="holding-tower-hero">
          <div class="holding-tower-crest ${neutral ? "neutral" : ""}" aria-hidden="true">${neutral ? "<span>✦</span>" : clanShieldHtml}</div>
          <div>
            <span>${escape(tower.quadrant ? tower.quadrant.replace("-", " ") : "Crownlands foothold")}</span>
            <h2>${escape(tower.name)}</h2>
            <p>${neutral ? "Neutral Crownlands garrison" : `Held by <strong>${escape(tower.clanName || "Unknown Clan")}</strong> ${tower.clanTag ? `[${escape(tower.clanTag)}]` : ""}`}</p>
          </div>
          <div class="holding-tower-wall-level"><span>Wall Level</span><strong>${number(tower.wallLevel || 1)}</strong><small>${integrity}% integrity</small></div>
        </header>
        ${tower.qaScoutResult === "success" ? `<div class="holding-tower-intel success"><strong>Scout intelligence obtained</strong><span>${defenders} defenders confirmed at ${escape(tower.name)}.</span></div>` : ""}
        ${tower.qaScoutResult === "veil" ? "<div class=\"holding-tower-intel veil\"><strong>Veil of Silence</strong><span>Tower intelligence could not be obtained. Public wall and clan details remain visible.</span></div>" : ""}
        ${tower.attackBlocked ? "<div class=\"holding-tower-alert\" role=\"alert\"><strong>Enemy Rally incoming</strong><span>Construction is paused. Reinforcements may still arrive before battle.</span></div>" : ""}
        <div class="holding-tower-vitals">
          <section class="holding-tower-wall-card">
            <div><span>Wall durability</span><strong>${integrity}%</strong></div>
            <div class="holding-tower-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${integrity}"><i style="width:${integrity}%"></i></div>
            <small>${tower.repairActive ? `Repairing · ${countdown(tower.repairCompleteAtMs, nowMs)} remaining` : integrity < 100 ? "Damaged · paid repair required" : "Fortifications fully repaired"}</small>
          </section>
          <section class="holding-tower-defender-card"><span>Stationed defenders</span><strong>${defenders}</strong><small>${!exactKnown ? "Successful scouting required" : neutral ? "Neutral NPC defenders" : "All owner-clan garrisons combined"}</small></section>
          ${tower.ownerMember ? `<section class="holding-tower-own-card"><span>Your stationed troops</span><strong>${number(tower.ownStationedTroops || 0)}</strong><small>Only you may withdraw these troops</small></section>` : ""}
          <section class="holding-tower-veil-card ${tower.veilActive ? "active" : ""}"><span>Veil of Silence</span><strong>${tower.veilActive ? countdown(tower.veilExpiresAtMs, nowMs) : "Inactive"}</strong><small>${tower.ownerMember ? `${number(tower.veilUsesRemaining ?? 3)} of 3 uses remain today` : "Public wall details remain visible"}</small></section>
        </div>
        ${tower.ownerMember && tower.garrison?.length ? `<section class="holding-tower-garrison-list"><div class="holding-tower-section-heading"><span>Shared defense</span><h3>Clan Garrison</h3></div><ol>${tower.garrison.map(entry => `<li><span>${escape(entry.ownerName || "Ruler")}</span><strong>${number(entry.troops || 0)}</strong></li>`).join("")}</ol></section>` : ""}
        ${renderQueue(tower, nowMs)}
        ${renderActions(tower, actionBusy, nowMs)}
        ${tower.ownerMember && Number.isFinite(Number(treasuryBalance)) ? `<footer class="holding-tower-treasury"><span>Clan Treasury</span><strong>${number(treasuryBalance)} Gold</strong><small>Season donations fund Walls, Repairs, and Veil.</small></footer>` : ""}
      </article>`;
  }

  global.CROWNLANDS_HOLDING_TOWER_UI = Object.freeze({ createQaSnapshot, renderPanel });
})(window);
