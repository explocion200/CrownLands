/* Design review only: synthetic examples, no storage or production services. */
"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const number = value => Number(value).toLocaleString("en-US");
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const established = { name: "Aldric", level: 42, xp: 18650, xpRequired: 28000, power: 184720, cities: 18, gold: 2456800, troops: 186450, goldBase: 192000, goldTotal: 268800, troopBase: 14200, troopTotal: 19880, clan: "[OAK] The Greywatch", completed: 19, claimed: 16, remaining: "17d 12h", ready: 3, phase: "ready" };
  const samples = {
    established,
    large: { ...established, name: "AlexandriaIronwood", level: 150, xp: 1854200, xpRequired: 2800000, power: 284720190, cities: 1284, gold: 9245680120, troops: 786452190, goldBase: 15248000, goldTotal: 23176960, troopBase: 2648000, troopTotal: 3972000, clan: "[WARD] Wardens of the Northern Marches" },
    new: { ...established, name: "New Ruler", level: 1, xp: 0, xpRequired: 250, power: 0, cities: 1, gold: 500, troops: 1000, goldBase: 150, goldTotal: 150, troopBase: 50, troopTotal: 50, clan: "", completed: 0, claimed: 0, ready: 0 },
    collected: { ...established, completed: 40, claimed: 40, ready: 0 },
    loading: { ...established, completed: 0, claimed: 0, ready: 0, remaining: "Loading…", phase: "loading" },
    unavailable: { ...established, completed: 0, claimed: 0, ready: 0, remaining: "Unavailable", phase: "unavailable" },
  };
  let state, activeSample;
  function announce(message) { $("liveStatus").textContent = message; parent.postMessage({ type: "profile-review-status", message }, location.origin); }
  function detail(title, html) {
    $("detailTitle").textContent = title; $("detailBody").innerHTML = html;
    if (!$("detailDialog").open) $("detailDialog").showModal();
  }
  function actionPreview(title, copy) { detail(title, `<p>${copy}</p><p><em>This draft previews the Profile overview. The existing ${escape(title)} screen will open here in the game.</em></p>`); announce(`${title} action preview opened.`); }
  function render() {
    document.body.classList.toggle("large-values", activeSample === "large");
    $("rulerName").textContent = state.name; $("rulerName").setAttribute("aria-label", `View ${state.name}'s public profile`);
    $("heroLevel").textContent = `Level ${number(state.level)}`;
    $("heroXp").textContent = `${number(state.xp)} / ${number(state.xpRequired)} XP`;
    $("xpFill").style.width = `${Math.min(100, state.xp / state.xpRequired * 100)}%`;
    $("xpTrack").setAttribute("aria-valuemin", "0"); $("xpTrack").setAttribute("aria-valuemax", state.xpRequired); $("xpTrack").setAttribute("aria-valuenow", state.xp);
    for (const [id, key] of Object.entries({ kingPower: "power", cities: "cities", gold: "gold", troops: "troops" })) $(id).textContent = number(state[key]);
    for (const type of ["gold", "troop"]) {
      $(type + "Rate").textContent = `${number(state[type + "Total"])}/h`;
      $(type + "Bonus").textContent = `(+${number(state[type + "Total"] - state[type + "Base"])}/h)`;
      $(type + "Production").setAttribute("aria-label", `${type === "gold" ? "Gold" : "Troops"} production: ${number(state[type + "Total"])} per hour, including ${number(state[type + "Total"] - state[type + "Base"])} bonus per hour. View breakdown.`);
    }
    $("clanAffiliation").hidden = !state.clan; $("clanName").textContent = state.clan;
    $("clanAffiliation").setAttribute("aria-label", `View ${state.clan} public clan profile`);
    $("completedHero").textContent = state.completed;
    $("completed").textContent = `${state.completed} / 40`; $("claimed").textContent = `${state.claimed} / 40`; $("remaining").textContent = state.remaining;
    $("honorsFill").style.width = `${state.completed / 40 * 100}%`;
    $("honorsTrack").setAttribute("aria-valuemin", "0"); $("honorsTrack").setAttribute("aria-valuemax", "40"); $("honorsTrack").setAttribute("aria-valuenow", state.completed);
    $("ready").textContent = `${state.ready} Ready`; $("ready").hidden = state.ready === 0;
    $("viewAchievements").disabled = state.phase === "unavailable";
    $("viewAchievements").setAttribute("aria-label", `View Achievements${state.ready ? ` · ${state.ready} Ready` : ""}`);
  }
  function cancelName() { $("nameEditor").hidden = true; $("nameDisplay").hidden = false; }
  function reset(sample) {
    activeSample = Object.hasOwn(samples, sample) ? sample : "established"; state = { ...samples[activeSample] };
    cancelName(); $("rulerFlag").style.removeProperty("background"); $("detailDialog").close();
    $("dismissed").hidden = true; if (!$("profileDialog").open) $("profileDialog").showModal(); render();
    announce("Profile draft loaded. All values and actions are local examples.");
  }
  $("editName").addEventListener("click", () => { $("nameDisplay").hidden = true; $("nameEditor").hidden = false; $("nameInput").value = state.name; $("nameInput").focus(); $("nameInput").select(); });
  $("cancelName").addEventListener("click", () => { cancelName(); $("editName").focus(); });
  $("nameInput").addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancelName(); $("editName").focus(); } });
  $("nameEditor").addEventListener("submit", event => { event.preventDefault(); const value = $("nameInput").value.trim(); if (!value) return; state.name = value.slice(0, 18); cancelName(); render(); $("editName").focus(); announce("Example ruler name updated in this draft only."); });
  $("flagButton").addEventListener("click", () => {
    detail("Kingdom flag", '<p>Your saved flag keeps its colors and symbol in the game. Try a sample cloth color below.</p><div class="flag-choices"><button data-dye="olive">Olive &amp; gold</button><button data-dye="burgundy">Burgundy &amp; linen</button><button data-dye="blue">Faded blue &amp; gold</button></div><p><em>These are preview samples. Your existing flag editor remains available.</em></p>');
    const colors = { olive: ["#596044", "#c5ad75"], burgundy: ["#794945", "#d9caa2"], blue: ["#506b7b", "#b8a16b"] };
    $("detailBody").querySelectorAll("[data-dye]").forEach(button => button.addEventListener("click", () => { const [a, b] = colors[button.dataset.dye]; $("rulerFlag").style.background = `linear-gradient(96deg,#0003,transparent 20%,#fff1 47%,#0002 70%,transparent),repeating-linear-gradient(0deg,transparent 0 2px,#eee0bb08 2px 3px),linear-gradient(135deg,${a} 0 49.5%,${b} 50%)`; $("detailDialog").close(); announce("Sample flag changed in the draft only."); }));
  });
  $("rulerName").addEventListener("click", () => actionPreview("Public player profile", `View ${escape(state.name)}'s public profile.`));
  $("clanAffiliation").addEventListener("click", () => actionPreview("Public clan profile", `View ${escape(state.clan)}.`));
  for (const type of ["gold", "troop"]) $(type + "Production").addEventListener("click", () => detail(`${type === "gold" ? "Gold" : "Troops"} production`, `<dl><div><dt>Base production</dt><dd>${number(state[type + "Base"])}/h</dd></div><div><dt>Bonus included</dt><dd>+${number(state[type + "Total"] - state[type + "Base"])}/h</dd></div><div><dt>Total production</dt><dd>${number(state[type + "Total"])}/h</dd></div></dl><p>The green bonus is included in the total shown on your profile.</p>`));
  $("innerCastle").addEventListener("click", () => actionPreview("Inner Castle", "Enter the Royal Bailey using the game's existing owned-city selection."));
  $("viewAchievements").addEventListener("click", () => {
    detail("Seasonal Achievements", `<p><strong>${state.completed} / 40 complete</strong> · ${state.claimed} / 40 claimed</p><p>${state.ready ? `${state.ready} rewards are ready to collect.` : "No rewards ready to collect."}</p><p>This action opens the approved Achievements ledger in the game.</p><button id="openAchievementDraft" class="primary">Open Achievements draft</button>`);
    $("openAchievementDraft").addEventListener("click", () => { location.href = new URL("docs/visual-qa/achievements-ledger/preview.html", document.baseURI).href; });
  });
  document.querySelectorAll("[data-section]").forEach(button => button.addEventListener("click", () => { if (button.dataset.section !== "Profile") actionPreview(button.dataset.section, `The ${escape(button.dataset.section)} tab keeps its current features.`); }));
  $("closeDetail").addEventListener("click", () => $("detailDialog").close());
  $("close").addEventListener("click", () => $("profileDialog").close());
  $("profileDialog").addEventListener("close", () => { $("dismissed").hidden = false; announce("Profile closed. Use Reopen Player Profile to return."); });
  $("reopen").addEventListener("click", () => { $("dismissed").hidden = true; $("profileDialog").showModal(); });
  window.addEventListener("message", event => { if (event.origin === location.origin && event.source === parent && event.data?.type === "profile-review") reset(event.data.sample); });
  reset(new URLSearchParams(location.search).get("sample") || "established");
})();
