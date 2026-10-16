"use strict";
(() => {
  if (location.hostname !== "127.0.0.1" || !window.__CROWNLANDS_BENCHMARK__ || !window.CrownlandsOnline?.__getBenchmarkTelemetry) throw Error("Isolated HUD fixture required");
  const labels = { leaderboardBtn: "Leaderboard", clanHudBtn: "Clan", dailyLoginRewardBtn: "Daily", innerCityHudBtn: "Inner Castle" };
  for (const [id, text] of Object.entries(labels)) {
    const label = document.createElement("span"); label.className = "hud-draft-label"; label.textContent = text; label.setAttribute("aria-hidden", "true");
    document.getElementById(id).append(label);
  }
  const inform = message => parent.postMessage({ type: "labeled-hud-status", message }, location.origin);
  const shield = { ...CLAN_HERALDRY_CONFIG.DEFAULT_V2, shape: "heater", division: "quartered", primary: "#7a2638", secondary: "#24445f", charge: "lion", secondaryCharge: "eagle", chargeColor: "#d8bd78", secondaryChargeColor: "#b7c3bf", borderColor: "#a18448", chargeLayout: "quartered", finish: "weathered" };
  function apply({ look = "draft", clan = "amber", badges = true } = {}) {
    document.documentElement.classList.toggle("hud-buttons-draft", look === "draft");
    const hasClan = clan !== "none";
    // Example state exists only inside the benchmark's synthetic account.
    state.clanId = hasClan ? "hud-draft-" + clan : "";
    state.clanName = clan === "raven" ? "The Raven Guard" : "The Amber Wardens";
    state.clanTag = clan === "raven" ? "RVN" : "AMBR";
    state.clanRole = "member";
    clanSnapshot = hasClan ? { id: state.clanId, name: state.clanName, tag: state.clanTag, shield: clan === "raven" ? { ...shield, primary: "#253f3a", secondary: "#202426", charge: "eagle", chargeLayout: "single" } : shield } : null;
    onlineClanRallies = hasClan && badges ? [{ id: "draft-rally-a" }, { id: "draft-rally-b" }] : [];
    lastClanHudSignature = ""; renderClanHudAccess();
    dailyLoginRewardBadge.hidden = !badges;
    document.documentElement.dataset.hudDraftBadges = String(badges);
    document.documentElement.dataset.hudDraftLook = look;
    document.documentElement.dataset.hudDraftClan = clan;
    inform(look === "draft" ? "Draft · Same artwork, visible names and the player’s clan shield." : "Current game appearance · Labels and new button frames hidden.");
  }
  document.addEventListener("click", event => {
    const target = event.target.closest(Object.keys(labels).map(id => "#" + id).join(","));
    if (!target) return;
    event.preventDefault(); event.stopImmediatePropagation();
    inform(labels[target.id] + " · Appearance preview only; no game action was sent.");
  }, true);
  window.__CROWNLANDS_BENCHMARK__.closeModal(); pendingOfflineRewardsSummary = null;
  window.LabeledHudDraft = { apply };
})();
