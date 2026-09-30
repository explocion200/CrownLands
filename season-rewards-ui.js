(function () {
  "use strict";
  const names = { players: "Top Kingdoms", clans: "Top Clans", glory: "Field of Glory" };
  const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const seasonName = id => /^realm-\d{4}-\d{2}$/.test(id || "")
    ? new Date(id.slice(6) + "-02T00:00:00Z").toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" }) : "Season";
  const amount = value => Math.max(0, Math.floor(Number(value) || 0));
  function boxes(common, uncommon, compact = false) {
    return [["common", amount(common)], ["uncommon", amount(uncommon)]].filter(([, count]) => count)
      .map(([type, count]) => `<span class="season-box"><img src="assets/icons/${type}-gear-chest-r1.svg" alt=""/><strong>${count}</strong> ${type === "common" ? "Common" : "Uncommon"}${compact ? "" : count === 1 ? " Box" : " Boxes"}</span>`).join("") || '<span class="season-no-reward">No box reward</span>';
  }
  function reward(status, board, rank) {
    const tier = status.tiers?.find(row => rank > 0 && rank <= row.through);
    return tier ? tier[board === "clans" ? "clan" : "personal"] : [0, 0];
  }
  function honorsMarkup(honors, nowMs = Date.now()) {
    if (!honors?.length) return "";
    return `<section class="season-honors" aria-label="Season honors"><h3>Honors of the Realm</h3><div class="season-medals">${honors.map(honor => {
      const active = nowMs >= honor.activeFromMs && nowMs < honor.expiresAtMs;
      return `<article class="season-medal ${esc(honor.medal)}"><img src="assets/icons/hero-reward-crown.svg" alt=""/><div><strong>${esc(names[honor.board] || "Leaderboard")} · #${amount(honor.rank)}</strong><span>${esc(seasonName(honor.seasonId))} · Permanent medal</span>${active && honor.title ? `<b>${esc(honor.title)}</b>` : ""}${active && honor.decoration ? `<small>Decoration through ${esc(new Date(honor.expiresAtMs - 1).toLocaleDateString())}</small>` : ""}</div></article>`;
    }).join("")}</div></section>`;
  }
  function decorate(element, honor, nowMs = Date.now()) {
    if (!element || !honor?.decoration || nowMs < honor.activeFromMs || nowMs >= honor.expiresAtMs) return;
    // Keep heraldry SVGs intact; the cosmetic mark needs an HTML containing box.
    if (element.namespaceURI === "http://www.w3.org/2000/svg") {
      const wrapper = document.createElement("span");
      wrapper.className = "season-heraldry-frame";
      element.replaceWith(wrapper); wrapper.append(element); element = wrapper;
    }
    element.classList.add("season-decorated", "season-" + honor.medal);
    element.querySelector(".season-decoration-mark")?.remove();
    const mark = document.createElement("span");
    mark.className = "season-decoration-mark";
    mark.textContent = honor.decoration === "crown" ? "♛" : honor.decoration === "swords" ? "⚔" : "❧";
    mark.title = `${seasonName(honor.seasonId)} · ${names[honor.board]} #${honor.rank}${honor.title ? " · " + honor.title : ""}`;
    mark.setAttribute("aria-label", mark.title);
    element.append(mark);
  }
  function bestDecoration(honors, kind = "player", nowMs = Date.now()) {
    return (honors || []).filter(h => h.decoration && nowMs >= h.activeFromMs && nowMs < h.expiresAtMs
      && (kind === "clan" ? h.board === "clans" : h.board !== "clans"))
      .sort((a, b) => a.rank - b.rank || (a.board === "players" ? -1 : 1))[0];
  }
  function open(options) {
    const { host, api, currentSeason, isCurrent = () => host.isConnected, onBack, onClaim = () => {}, onLater = onBack } = options;
    let view = options.view === "results" ? "results" : "info";
    let selected = view === "info" ? currentSeason : options.seasonId || "";
    let state = null, request = 0, claiming = false, claimId = "", pollTimer = 0, timer = 0, disposed = false;
    const current = () => !disposed && isCurrent();
    const dispose = () => { disposed = true; clearTimeout(pollTimer); clearInterval(timer); };
    function seasons() {
      const end = new Date(currentSeason.slice(6) + "-01T00:00:00Z"), entries = [];
      end.setUTCMonth(end.getUTCMonth() - 1);
      for (let date = end; date >= new Date("2026-09-01T00:00:00Z"); date.setUTCMonth(date.getUTCMonth() - 1)) {
        const id = "realm-" + date.toISOString().slice(0, 7);
        entries.push(`<option value="${id}" ${id === (state?.seasonId || selected) ? "selected" : ""}>${esc(seasonName(id))}</option>`);
      }
      return entries.join("");
    }
    function shell(content, { claimable = false } = {}) {
      host.innerHTML = `<section class="season-panel"><header class="season-heading"><img src="assets/icons/hero-reward-crown.svg" alt=""/><div><p>THE CROWN’S BOUNTY</p><h2>${view === "info" ? "Current season rewards" : "Last Season Rewards"}</h2><span>${esc(seasonName(state?.seasonId || selected || currentSeason))}</span></div></header><nav class="season-navigation"><button type="button" data-season-info aria-pressed="${view === "info"}">Current season &amp; rewards</button><button type="button" data-season-results aria-pressed="${view === "results"}">Claim earned rewards</button><a class="season-archive-link" href="https://playcrownlands.com/season-rankings.html" target="_blank" rel="noopener noreferrer">Past season rankings ↗</a>${view === "results" && seasons() ? `<label>Reward season <select data-season-select aria-label="Rewards season">${seasons()}</select></label>` : ""}</nav><div class="season-scroll" tabindex="0">${content}</div><footer class="season-footer"><span role="status" data-season-message>${options.login ? "Unclaimed rewards stay in Leaderboards → Season Rewards." : ""}</span><div class="season-footer-actions">${options.login && claimable ? '<button type="button" class="season-claim" data-season-claim>Claim rewards</button>' : ""}<button type="button" data-season-back>${options.login ? "Later" : "Back to leaderboards"}</button></div></footer></section>`;
      host.querySelector("[data-season-back]").onclick = () => { dispose(); (options.login ? onLater : onBack)?.(); };
      host.querySelector("[data-season-info]").onclick = () => { view = "info"; selected = currentSeason; load(); };
      host.querySelector("[data-season-results]").onclick = () => { view = "results"; selected = selected === currentSeason ? "" : selected; load(); };
      const select = host.querySelector("[data-season-select]");
      if (select) select.onchange = event => { selected = event.target.value; load(); };
      host.querySelectorAll("[data-pending-season]").forEach(button => { button.onclick = () => { selected = button.dataset.pendingSeason; view = "results"; load(); }; });
    }
    function renderInfo() {
      const projections = Object.entries(names).map(([board, name]) => {
        const row = state.projected?.[board], score = row?.[board === "glory" ? "pvpKills" : "kingPower"];
        const known = Boolean(state.projected && Object.hasOwn(state.projected, board)
          && (row === null || (Number.isInteger(row?.rank) && row.rank > 0 && row.rank <= 100
            && (board === "clans" || (Number.isSafeInteger(score) && score >= 0))))
          && (board !== "clans" || typeof state.clanEligible === "boolean"));
        const eligible = known && row && (board === "clans" ? state.clanEligible : score > 0);
        const payout = eligible ? reward(state, board, row.rank) : [0, 0];
        const standing = !known ? "Standing unavailable" : board === "clans" && !state.clanEligible ? "No eligible clan"
          : row ? `Rank #${row.rank}` : "Outside Top 100";
        return { board, name, known, payout, standing };
      });
      const complete = projections.every(row => row.known);
      const total = projections.reduce((sum, row) => sum.map((value, index) => value + row.payout[index]), [0, 0]);
      const overview = projections.map(row => `<article class="season-projection-board" data-season-board="${row.board}"><h4>${esc(row.name)}</h4><span data-season-standing>${esc(row.standing)}</span><div data-season-payout>${row.known ? boxes(...row.payout, true) : '<span class="season-no-reward">Reward unavailable</span>'}</div></article>`).join("");
      const explanations = {
        players: "Ranked by published server King Power. Final scores are frozen when the season closes; no extra economy recalculation is added. A positive score is required for a reward. Ties use stable player ID in ascending order.",
        clans: "Ranked by published combined member King Power. Every member on the closing roster receives the clan’s listed reward directly. There is no minimum membership period or activity quota. You must remain a member when the season closes. Ties use stable clan ID in ascending order.",
        glory: "Ranked by enemy player-owned troops defeated, before recovery, in attack or defense, whether you win or lose. Shared battles divide kills by effective combat contribution. Neutral troops, friendly or self battles, wall damage, travel, donations and production do not count. A positive score is required for a reward. Ties use the earliest battle time reaching the total, then stable player ID. Delayed scoring keeps its original season.",
      };
      let previous = 0;
      const rows = state.tiers.map(tier => {
        const start = previous + 1; previous = tier.through;
        return `<tr><th scope="row">${start === tier.through ? start : `${start}–${tier.through}`}</th>${Object.keys(names).map(board => `<td>${boxes(...tier[board === "clans" ? "clan" : "personal"], true)}</td>`).join("")}</tr>`;
      }).join("");
      const scoring = Object.entries(names).map(([board, name]) => `<details><summary>${esc(name)} scoring &amp; eligibility</summary><p>${esc(explanations[board])}</p>${board === "glory" && state.seasonId === "realm-2026-09" ? `<p class="season-notice">September is a partial Glory season. ${state.trackingStartedAtMs ? `The first recorded battle was ${esc(new Date(state.trackingStartedAtMs).toLocaleString())}.` : "Scoring began with the Glory release."} Earlier battles are excluded.</p>` : ""}</details>`).join("");
      shell(`<section class="season-projection" aria-label="Current season reward overview"><header class="season-projection-total"><h3>Combined potential reward</h3><div data-season-total>${complete ? boxes(...total, true) : '<span class="season-no-reward">Total unavailable until all standings are available</span>'}</div></header><div class="season-projection-boards">${overview}</div><small>Gear boxes projected from your current standings. Final rewards are verified after the season closes.</small></section><div class="season-deadline"><strong>Season closes ${esc(new Date(state.endsAtMs).toLocaleString())}</strong><span>${esc(new Date(state.endsAtMs).toISOString().replace("T", " ").replace(".000Z", " UTC"))}</span><b data-season-countdown></b></div><h3 class="season-reward-table-title">Rewards by final rank</h3><table class="season-table season-comparison"><caption>Gear boxes from each leaderboard; Clan rewards are per closing-roster member.</caption><thead><tr><th scope="col">Rank</th><th scope="col">Kingdoms</th><th scope="col">Clans</th><th scope="col">Glory</th></tr></thead><tbody>${rows}</tbody></table><section class="season-rules"><h3>Scoring &amp; reward rules</h3>${scoring}<p>Common Box: 3 random Level 1 Common pieces. Uncommon Box: 1 random Level 1 Uncommon and 2 random Level 1 Common pieces.</p><p>Kingdom, Glory and Clan rewards all stack. Maximum: 19 Common + 5 Uncommon Boxes. Personal rewards require a positive score. Each place has one winner.</p><p>Claim unopened boxes in Last Season Rewards after reset. Earned boxes never expire, and full equipment inventory does not prevent claiming. Membership changes after closing cannot remove earned Clan rewards.</p><p>Rewarded placements earn permanent dated medals. Top-three decorations and first-place titles last through the following season and grant no combat bonus.</p></section>`);
      const started = performance.now();
      const tick = () => { if (!current()) return dispose(); const element = host.querySelector("[data-season-countdown]"); if (!element) return; const seconds = Math.max(0, Math.floor((state.endsAtMs - state.serverTimeMs - (performance.now() - started)) / 1000)); element.textContent = seconds ? `${Math.floor(seconds / 86400)}d ${Math.floor(seconds / 3600) % 24}h ${Math.floor(seconds / 60) % 60}m ${seconds % 60}s remaining` : "Season closed"; };
      tick(); timer = setInterval(tick, 1000);
    }
    function renderResults() {
      const award = state.award;
      const pending = state.pendingSeasons?.filter(id => id !== state.seasonId).map(id => `<button type="button" data-pending-season="${esc(id)}">Unclaimed: ${esc(seasonName(id))}</button>`).join("") || "";
      if (state.status !== "ready") {
        const waiting = ["closing", "captured", "finalizing"].includes(state.status);
        shell(`<div class="season-empty"><h3>${waiting ? "Last season’s results are being finalized" : "Results are not available yet"}</h3><p>Your earned rewards will remain available. You can return here from Leaderboards.</p><button type="button" data-season-retry>Refresh results</button></div>${pending}`);
        host.querySelector("[data-season-retry]").onclick = load;
        if (waiting) pollTimer = setTimeout(load, 10000);
        return;
      }
      if (!award) { shell(`<div class="season-empty"><h3>No box rewards this season</h3><p>Your next campaign awaits. Past season rankings are available on the website.</p></div>${pending}`); return; }
      shell(`<div class="season-award-rows">${award.placements.map(row => `<article><div><strong>${esc(names[row.board])}</strong><span>Final placement #${row.rank}${row.clanName ? ` · ${esc(row.clanName)}` : ""}</span></div><div>${boxes(row.commonGearBoxes, row.uncommonGearBoxes)}</div></article>`).join("")}</div><div class="season-total"><span>Your combined reward</span><div>${boxes(award.commonGearBoxes, award.uncommonGearBoxes)}</div><p>${award.claimed ? `Claimed ${esc(new Date(award.receipt.claimedAtMs).toLocaleString())}` : "Unopened boxes go to your Bag. These rewards do not expire."}</p>${award.claimed ? '<strong class="season-claimed">Rewards collected</strong>' : options.login ? "" : '<button type="button" class="season-claim" data-season-claim>Claim rewards</button>'}</div>${honorsMarkup(award.honors, state.serverTimeMs)}${pending}`, { claimable: !award.claimed });
      const button = host.querySelector("[data-season-claim]");
      if (button) button.onclick = async () => {
        if (claiming) return; claiming = true; button.disabled = true; button.textContent = "Collecting…";
        claimId ||= crypto.randomUUID();
        try {
          const response = await api.claimSeasonRewards({ seasonId: state.seasonId, requestId: claimId });
          if (!current()) return;
          await onClaim(response);
          if (current()) await load();
        } catch (error) {
          if (current()) { host.querySelector("[data-season-message]").textContent = error.message || "Could not claim. Please try again."; button.disabled = false; button.textContent = "Claim rewards"; }
        } finally { claiming = false; }
      };
    }
    async function load() {
      clearTimeout(pollTimer); clearInterval(timer);
      if (!current()) return;
      const token = ++request;
      shell('<p class="season-empty" role="status">Reading the season ledger…</p>');
      try {
        const next = await api.getSeasonRewardStatus({ seasonId: selected || undefined });
        if (!current() || token !== request) return;
        if (state?.seasonId !== next.seasonId) claimId = "";
        state = next; selected = next.seasonId;
        if (view === "info" && state.tiers) renderInfo();
        else renderResults();
      } catch (error) {
        if (!current() || token !== request) return;
        shell(`<div class="season-empty" role="status"><h3>Season rewards are unavailable</h3><p>${esc(error.message || "Please try again.")}</p><button type="button" data-season-retry>Try again</button></div>`);
        host.querySelector("[data-season-retry]").onclick = load;
      }
    }
    void load();
    return { dispose };
  }
  window.CrownlandsSeasonRewards = { open, boxes, seasonName, honorsMarkup, decorate, bestDecoration };
})();
