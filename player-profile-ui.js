/* Approved Profile presentation; existing game handlers own all mutations. */
(function (root) {
  "use strict";
  let snapshot = null, selectedProduction = null, dialog = null;
  const $ = id => document.getElementById(id);
  const safeNumber = value => Math.max(0, Math.floor(Number(value) || 0));

  function closeProduction() {
    if (dialog?.open) dialog.close();
    selectedProduction = null;
  }

  function renderProduction() {
    if (!dialog?.open || !snapshot || !selectedProduction) return;
    const gold = selectedProduction === "gold", summary = snapshot.summary;
    const base = safeNumber(gold ? summary.baseGoldProductionPerHour : summary.baseTroopProductionPerHour);
    const total = Math.max(base, safeNumber(gold ? summary.goldProductionPerHour : summary.troopProductionPerHour));
    setTextIfChanged($("profileProductionTitle"), `${gold ? "Gold" : "Troops"} production`);
    setTextIfChanged($("profileProductionBase"), `${snapshot.format(base)}/h`);
    setTextIfChanged($("profileProductionBonus"), `+${snapshot.format(total - base)}/h`);
    setTextIfChanged($("profileProductionTotal"), `${snapshot.format(total)}/h`);
  }

  function openProduction(kind) {
    if (!snapshot || !$("profileScreen")?.classList.contains("profile-ledger-active")) return;
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "profileProductionDialog";
      dialog.setAttribute("aria-labelledby", "profileProductionTitle");
      dialog.innerHTML = '<header><h2 id="profileProductionTitle"></h2><button type="button" aria-label="Close production details">×</button></header><dl><div><dt>Base production</dt><dd id="profileProductionBase"></dd></div><div><dt>Bonus included</dt><dd id="profileProductionBonus"></dd></div><div><dt>Total production</dt><dd id="profileProductionTotal"></dd></div></dl><p>The green bonus is included in the total shown on your profile.</p>';
      document.body.append(dialog);
      // Keep this nested detail action from reaching the game's outside-close handlers.
      dialog.addEventListener("click", event => event.stopPropagation());
      dialog.addEventListener("keydown", event => {
        if (event.key === "Escape") event.stopPropagation();
      });
      dialog.querySelector("button").addEventListener("click", closeProduction);
      dialog.addEventListener("close", () => { selectedProduction = null; });
    }
    selectedProduction = kind;
    if (!dialog.open) dialog.showModal();
    renderProduction();
  }

  function setOverview(active) {
    $("profileScreen")?.classList.toggle("profile-ledger-active", active);
    if (!active) { closeProduction(); snapshot = null; }
  }

  function update(data) {
    snapshot = data;
    const summary = data.summary;
    $("profileScreen")?.classList.toggle("large-values", [summary.kingPower, summary.gold, summary.troops, summary.goldProductionPerHour, summary.troopProductionPerHour].some(value => String(data.format(safeNumber(value))).length > 9));
    const xp = safeNumber(data.xp), required = Math.max(1, safeNumber(data.xpRequired));
    const track = $("profileXpTrack");
    setAttrIfChanged(track, "aria-valuemin", 0); setAttrIfChanged(track, "aria-valuemax", required); setAttrIfChanged(track, "aria-valuenow", Math.min(xp, required));
    const complete = Math.min(40, safeNumber(data.completed));
    setTextIfChanged($("profileAchievementHero"), complete);
    const fill = $("profileAchievementFill"), width = `${complete / 40 * 100}%`;
    if (fill.style.width !== width) fill.style.width = width;
    setAttrIfChanged($("profileAchievementTrack"), "aria-valuemin", 0);
    setAttrIfChanged($("profileAchievementTrack"), "aria-valuemax", 40);
    setAttrIfChanged($("profileAchievementTrack"), "aria-valuenow", complete);
    const button = $("profileViewAchievementsBtn"), count = safeNumber(data.claimable);
    if (button) {
      let label = button.querySelector("[data-achievement-label]");
      if (!label) {
        label = document.createElement("span"); label.dataset.achievementLabel = "";
        label.textContent = "View Achievements"; button.replaceChildren(label);
      }
      let badge = button.querySelector(".ready-count");
      if (count) {
        if (!badge) { badge = document.createElement("span"); badge.className = "ready-count"; button.append(badge); }
        setTextIfChanged(badge, `${count} Ready`);
      } else badge?.remove();
      setAttrIfChanged(button, "aria-label", `View Achievements${count ? ` · ${count} Ready` : ""}`);
    }
    for (const [kind, total] of [["Gold", summary.goldProductionPerHour], ["Troop", summary.troopProductionPerHour]]) {
      setAttrIfChanged($("profile" + kind + "ProductionBtn"), "aria-label", `${kind === "Gold" ? "Gold" : "Troops"} production: ${data.format(safeNumber(total))} per hour. View base and included bonus.`);
    }
    renderProduction();
  }

  $("profileGoldProductionBtn")?.addEventListener("click", () => openProduction("gold"));
  $("profileTroopProductionBtn")?.addEventListener("click", () => openProduction("troops"));
  root.CrownlandsPlayerProfileUI = Object.freeze({ setOverview, update });
})(window);
