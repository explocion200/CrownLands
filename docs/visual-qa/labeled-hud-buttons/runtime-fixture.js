"use strict";
(() => {
  if (location.hostname !== "127.0.0.1" || !window.__CROWNLANDS_BENCHMARK__ || !window.CrownlandsOnline?.__getBenchmarkTelemetry) throw Error("Isolated HUD fixture required");
  const labels = { leaderboardBtn: "Leaderboard", clanHudBtn: "Clan", dailyLoginRewardBtn: "Daily", innerCityHudBtn: "Inner Castle" };
  const assets = { leaderboardBtn: "leaderboard", clanHudBtn: "clan", dailyLoginRewardBtn: "daily", innerCityHudBtn: "inner-castle" };
  const originalImages = {
    leaderboardBtn: "hud-leaderboard-ink-384x384-7781c5983020.webp",
    dailyLoginRewardBtn: "hud-daily-reward-ink-384x384-e2287cbf41c2.webp",
    innerCityHudBtn: "hud-inner-city-ink-192x192-677dc563cdd2.webp"
  };
  for (const [id, text] of Object.entries(labels)) {
    // Preserve the historical comparison now that production uses the approved images.
    const button = document.getElementById(id); button.classList.remove("hud-image-button");
    const runtimeImage = button.querySelector(".hud-button-image");
    if (runtimeImage && originalImages[id]) {
      runtimeImage.classList.remove("hud-button-image"); runtimeImage.src = "/assets/optimized/" + originalImages[id];
    } else if (runtimeImage) runtimeImage.remove();
    const image = document.createElement("img"); image.className = "hud-draft-image";
    image.src = "/docs/visual-qa/labeled-hud-buttons/images/" + assets[id] + "-button.png";
    image.alt = ""; image.setAttribute("aria-hidden", "true"); image.draggable = false;
    button.dataset.draftLabel = text; button.append(image);
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
    inform(look === "draft" ? "Image draft · Original button sizes and spacing · Player’s clan shield stays dynamic." : "Current game appearance · Original images and button sizes.");
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
