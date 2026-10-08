(function (root) {
  "use strict";
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const number = value => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const label = key => root.CrownlandsEstate.buildings.find(b => b.key === key)?.label
    || root.CrownlandsEstate.resources.find(r => r.key === key)?.label || key;
  const duration = ms => ms < 3600000 ? Math.ceil(ms / 60000) + " min" : number(ms / 3600000) + " hours";
  const list = amounts => Object.entries(amounts || {}).filter(([, v]) => v).map(([k, v]) => number(v) + " " + label(k)).join(" · ") || "None";
  function constructionTimers(host) {
    const viewport = host.querySelector(".estate-viewport"), layer = document.createElement("div");
    layer.className = "estate-construction-timers";
    viewport.append(layer);
    const sites = root.CrownlandsEstate.buildings.map(b => {
      const gauge = document.createElement("div"), note = document.createElement("small");
      gauge.className = "estate-construction-timer"; gauge.dataset.estateConstruction = b.key; gauge.hidden = true;
      gauge.setAttribute("role", "progressbar"); gauge.setAttribute("aria-valuemin", "0"); gauge.setAttribute("aria-valuemax", "100");
      gauge.innerHTML = '<svg viewBox="0 0 112 40" aria-hidden="true"><path class="estate-timer-edge" d="M7 31 Q56 -13 105 31"/><path class="estate-timer-track" d="M7 31 Q56 -13 105 31"/><path class="estate-timer-fill" d="M7 31 Q56 -13 105 31" pathLength="100"/></svg><span data-estate-time-left></span>';
      layer.append(gauge);
      const target = host.querySelector(`[data-inner-castle-building="${b.key}"]`), entry = host.querySelector(`[data-estate-directory-building="${b.key}"]`);
      note.className = "estate-construction-note"; note.id = "estateConstructionNote-" + b.key; note.hidden = true; entry.append(note);
      return { b, gauge, note, target, entry, fill:gauge.querySelector(".estate-timer-fill"), text:gauge.querySelector("[data-estate-time-left]"), job:null };
    });
    const remainingText = ms => {
      const seconds = Math.ceil(ms / 1000), minutes = Math.floor(seconds / 60), hours = Math.floor(minutes / 60);
      if (hours >= 24) return Math.floor(hours / 24) + "d " + hours % 24 + "h";
      if (hours) return hours + "h " + minutes % 60 + "m";
      return minutes + ":" + String(seconds % 60).padStart(2, "0");
    };
    let destroyed = false;
    return {
      update(estate, now) {
        if (destroyed) return;
        for (const site of sites) {
          const job = estate?.jobs.find(j => j.building === site.b.key && j.status === "running");
          site.job = job && Number.isFinite(job.completesAtMs) && Number.isFinite(job.durationMs) && job.durationMs > 0 ? job : null;
          const legacy = !site.job && estate?.jobs.find(j => j.building === site.b.key);
          site.note.hidden = !site.job && !legacy;
          for (const target of [site.target, site.entry]) {
            if (!site.note.hidden) target.setAttribute("aria-describedby", site.note.id);
            else target.removeAttribute("aria-describedby");
          }
          if (!site.job) {
            site.gauge.hidden = true;
            site.note.textContent = legacy ? "Paid work · " + (legacy.status === "paused" ? "Paused" : "Waiting for builder") : "";
            continue;
          }
          const left = Math.max(0, job.completesAtMs - now), progress = Math.max(0, Math.min(1, 1 - left / job.durationMs));
          const text = left ? remainingText(left) : "Finishing…";
          site.fill.style.strokeDashoffset = String(100 * (1 - progress));
          site.gauge.setAttribute("aria-valuenow", String(Math.round(progress * 100)));
          site.gauge.setAttribute("aria-label", site.b.label + " construction to Level " + job.target);
          site.gauge.setAttribute("aria-valuetext", Math.round(progress * 100) + "% complete · " + (left ? text + " remaining" : "Waiting for completion confirmation"));
          site.gauge.title = site.gauge.getAttribute("aria-label") + " · " + site.gauge.getAttribute("aria-valuetext");
          site.text.textContent = text; site.note.textContent = "Construction · " + text + (left ? " left" : "");
        }
      },
      place(zoom, selected) {
        if (destroyed) return;
        const view = viewport.getBoundingClientRect(), width = zoom < 2.5 ? 88 : 112, height = 40;
        const rect = e => { const r = e.getBoundingClientRect(); return {left:r.left - view.left, right:r.right - view.left, top:r.top - view.top, bottom:r.bottom - view.top}; };
        const overlaps = (a,b) => a.left < b.right + 2 && a.right > b.left - 2 && a.top < b.bottom + 2 && a.bottom > b.top - 2;
        const obstacles = [...host.querySelectorAll('.estate-site>img,.estate-camera-controls,.estate-map-hint,.estate-directory,.estate-detail,.estate-district:not([hidden])>span,.estate-nameplate:not([hidden]),.estate-building-target:not([hidden]),.estate-upgrade-targets button:not([hidden]),#fixtureControls')].filter(e => !e.hidden && e.getClientRects().length).map(rect);
        for (const site of [...sites].sort((a,b) => (b.b.key === selected) - (a.b.key === selected))) {
          if (!site.job) continue;
          const art = rect(host.querySelector(`[data-estate-site="${site.b.key}"]>img`)), cx = (art.left + art.right) / 2;
          const box = {left:cx - width / 2, right:cx + width / 2, top:art.top - height - 6, bottom:art.top - 6};
          site.gauge.hidden = box.left < 6 || box.top < 6 || box.right > view.width - 6 || box.bottom > view.height - 6 || obstacles.some(o => overlaps(box,o));
          if (!site.gauge.hidden) {
            site.gauge.style.left = box.left + "px"; site.gauge.style.top = box.top + "px"; site.gauge.style.width = width + "px";
            obstacles.push(box);
          }
        }
      },
      destroy() {
        destroyed = true; layer.remove();
        for (const site of sites) { site.note.remove(); site.target.removeAttribute("aria-describedby"); site.entry.removeAttribute("aria-describedby"); }
      },
    };
  }
  // Keep city-style action tokens on the map and normal buttons in panels.
  // The base estate renderer and offline artwork fixtures do not download these online controls.
  function mapActions(icon) {
    return {
      mountTimers:constructionTimers,
      button(b, action, context, level) {
        const upgrade = action === "upgrade", name = upgrade ? "Upgrade" : "Enter";
        const hint = upgrade ? "upgrade requirements and deposits" : level > 0 ? "enter building menu" : "construct this building before entering";
        const onMap = context === "target";
        const classes = onMap ? ` cl-action-button cl-action-${upgrade ? "level" : "send"}` : "";
        const content = onMap ? `<span class="wheel-icon" aria-hidden="true">${icon(upgrade ? "arrow-up" : "forward")}</span><span class="wheel-action-name">${name}</span>` : name;
        return `<button type="button" class="estate-site-action estate-${action}-${context}${classes}" data-estate-${action}="${b.key}" aria-label="${escape(b.label)} — ${hint}" title="${escape(b.label)} — ${hint}" ${onMap ? "hidden" : ""} ${!upgrade && !level ? "disabled" : ""}>${content}</button>`;
      },
      sync(host, levels) {
        host.querySelectorAll("[data-estate-enter]").forEach(button => {
          const key = button.dataset.estateEnter, hint = levels[key] > 0 ? "enter building menu" : "construct this building before entering";
          button.disabled = !(levels[key] > 0);
          button.title = label(key) + " — " + hint; button.setAttribute("aria-label", button.title);
        });
      },
      place(buttons, selected, buildings, artBoxes, obstacles, width, height) {
        const index = buildings.findIndex(b => b.key === selected), art = artBoxes[index];
        const pair = buttons.filter(b => (b.dataset.estateUpgrade || b.dataset.estateEnter) === selected);
        if (!art || pair.length !== 2) return;
        const size = parseFloat(getComputedStyle(pair[0]).getPropertyValue("--cl-action-size")) || 64;
        const cx = (art.left + art.right) / 2, cy = (art.top + art.bottom) / 2;
        const caption = pair[0].closest(".estate-viewport").querySelector(`[data-estate-nameplate="${selected}"]`);
        const spread = Math.max((art.right - art.left) / 2, 22, caption && !caption.hidden ? caption.offsetWidth / 2 : 0);
        const boxes = [cx - spread - size - 6, cx + spread + 6]
          .map(left => ({left, right:left + size, top:cy - size / 2, bottom:cy + size / 2}));
        const clear = boxes.every(box => box.left >= 6 && box.top >= 6 && box.right <= width - 6 && box.bottom <= height - 6
          && !obstacles.some(o => box.left < o.right + 2 && box.right > o.left - 2 && box.top < o.bottom + 2 && box.bottom > o.top - 2));
        buttons.forEach(button => {
          const i = pair.indexOf(button);
          // Do not briefly hide a focused button on every layout pass.
          button.hidden = !clear || i < 0;
          if (!button.hidden) { button.style.left = boxes[i].left + "px"; button.style.top = boxes[i].top + "px"; }
        });
      },
    };
  }
  function create(options) {
    const scope = options.scope(), api = options.api(), abort = new AbortController();
    const dialog = document.createElement("dialog");
    dialog.className = "estate-economy-dialog";
    dialog.setAttribute("aria-labelledby", "estateEconomyTitle");
    document.body.append(dialog);
    let data = null, view = null, quote = null, pending = null, busy = false, destroyed = false, deadlineTimer = 0, counterTimer = 0;
    let bench = [], cursor = "", error = "", opener = null, refreshPending = false, upgradeBill = null;
    const current = () => !destroyed && options.scope() === scope;
    const now = () => data ? data.serverNowMs + Math.max(0, Date.now() - data.receivedAtMs) : Date.now();
    function balances() {
      const projection = data?.estate.projection;
      if (!projection) return data?.estate.stock;
      const until = Math.min(now(), projection.untilMs ?? now());
      const hours = Math.max(0, until - data.serverNowMs) / 3600000;
      return Object.fromEntries(Object.entries(projection.stock).map(([key, value]) => [key, Math.max(0, Math.floor(value + projection.net[key] * hours + 1e-7))]));
    }
    function paintCounters() {
      clearTimeout(counterTimer);
      if (!current() || document.hidden || !options.visible() || !data) return;
      options.tick?.();
      if (Object.values(data.estate.projection?.net || {}).some(rate => Math.abs(rate) > 1e-7)
        || data.estate.jobs.some(j => j.status === "running" && j.completesAtMs > now())) counterTimer = setTimeout(paintCounters, 1000);
    }
    const button = (action, text, attributes = "") => `<button type="button" data-economy-action="${action}" ${attributes}>${text}</button>`;
    function accept(result) {
      if (!current()) return;
      options.apply?.(result);
      if (result.estate) {
        data = { ...result, receivedAtMs: Date.now() };
        options.update?.(data);
        schedule();
      }
    }
    function schedule() {
      clearTimeout(deadlineTimer);
      paintCounters();
      if (!current() || document.hidden || !options.visible() || !data) return;
      const times = [...data.estate.jobs.map(j => j.completesAtMs), ...data.estate.quests.map(q => q.completesAtMs)].filter(Number.isFinite);
      const upcoming = [...Object.values(data.estate.commissions).map(c => c.completesAtMs), ...Object.values(data.champions).map(c => c.recoveryUntilMs)].filter(t => Number.isFinite(t) && t > now());
      times.push(...upcoming);
      if (Number.isFinite(data.estate.projection?.untilMs)) times.push(data.estate.projection.untilMs);
      if (times.length) deadlineTimer = setTimeout(() => refresh(), Math.min(2147483647, Math.max(100, Math.min(...times) - now() + 100)));
    }
    async function refresh() {
      if (!current()) return;
      if (busy) { refreshPending = true; return; }
      busy = true;
      try { accept(await api.getEstateState()); error = ""; await loadUpgrade(); }
      catch (e) { if (current()) error = e.message || "Estate could not load."; }
      finally {
        busy = false;
        if (current()) { render(); if (refreshPending && !quote) { refreshPending = false; refresh(); } }
      }
    }
    async function loadUpgrade() {
      if (!current() || !dialog.open || view?.type !== "upgrade" || !data || quote) return;
      upgradeBill = null;
      const requestedView = view, key = view.key, s = data.estate;
      if (s.constructionPolicy !== "deposit-then-start" || s.levels[key] >= 100 || s.jobs.some(j => j.building === key)) return;
      const result = await api.getEstateQuote({action:"fund",building:key,count:1});
      if (!current() || !dialog.open || view !== requestedView) return;
      accept(result); upgradeBill = result.quote.value.jobs[0];
    }
    async function run(action) {
      if (!current() || busy) return;
      busy = true; error = ""; render();
      try { await action(); }
      catch (e) { if (current()) error = e.message || "The action could not finish. Try again."; }
      finally {
        busy = false;
        if (current()) { render(); if (refreshPending && !quote) { refreshPending = false; refresh(); } }
      }
    }
    async function review(input) {
      const reviewedView = view;
      await run(async () => {
        const result = await api.getEstateQuote(input);
        if (!current()) return;
        accept(result);
        if (dialog.open && view === reviewedView) { quote = result.quote; pending = null; }
      });
    }
    function open(next) {
      if (!current()) return;
      view = next; quote = null; pending = null; upgradeBill = null; error = "";
      if (!dialog.open) { opener = document.activeElement; dialog.showModal(); }
      render(); refresh();
    }
    function buildingBody(key) {
      const s = data.estate, level = s.levels[key];
      const producer = Object.values(s.resources).find(r => r.source === key);
      const commission = s.commissions[key];
      let body = `<p class="estate-economy-kicker">Permanent estate · Level ${level} / 100</p>
        <p>${escape(s.benefits[key].current)}</p>`;
      if (producer) {
        body += `<article><h3>Production</h3><p>${number(producer.gross)} / hour · ${number(producer.net)} net / hour</p>
          <p>Stored ${number(producer.available)} / ${number(producer.capacity)}. Production pauses when there is no room or usable input.</p></article>`;
        if (["sawmill", "smithy", "workshop", "windmill"].includes(key))
          body += button("processor", s.processors[key] === false ? "Resume processing" : "Pause processing")
            + `<p>Keep these amounts available for building. Reserves apply to every factory using the material.</p>${Object.keys(producer.inputs || {}).map(k=>`<label>${label(k)} reserve<input type="number" min="0" max="${s.resources[k].capacity}" step="1" value="${s.reserves[k]||0}" data-economy-reserve="${k}"></label>`).join("")}`
            + button("reserves", "Review reserves");
      }
      if (root.COMMON_GEAR?.BUILDINGS?.[key] || ["treasury", "barracks", "gatehouse", "royal-stables"].includes(key)) {
        body += `<article><h3>Officer commissions</h3><p>Choose one item family. Its rarity follows this building’s completed level; existing Gear remains yours.</p>`;
        if (commission) body += `<p>${escape(commission.rarity)} ${escape(commission.name)} · ${commission.completesAtMs > now() ? duration(commission.completesAtMs - now()) + " remaining" : "Ready to claim"}</p>`
          + button("claimCommission", "Claim commissioned Gear");
        else {
          const families = options.gear.DEFINITIONS.filter(d => d.buildingId === key && d.rarity === "common");
          body += `<label>Item family<select data-economy-family>${families.map(d => `<option value="${d.familyKey}">${escape(d.gearName)}</option>`).join("")}</select></label>` + button("commission", "Review commission");
        }
        body += "</article>";
      }
      if (key === "alehouse") {
        body += `<article><h3>Today’s champions</h3><p>Three stable offers each UTC day. Every recruit stays yours across seasons; a full active roster sends new recruits to your bench.</p>
          ${s.recruitOffers.offers.map(o => `<p>${escape(o.name)} · Level ${o.level} ${o.claimed ? "· Recruited" : button("recruit", "Review recruit", `data-id="${o.id}"`)}</p>`).join("")}</article>`;
      }
      if (key === "guild-master") {
        body += `<article><h3>Active champions</h3>${s.activeChampionIds.map(id => {
          const c = data.champions[id]; if (!c) return "";
          return `<label class="estate-economy-champion"><input type="checkbox" data-economy-champion value="${id}" ${c.questId || c.recoveryUntilMs > now() ? "disabled" : ""}>
            ${escape(c.name)} · Lv. ${c.level} · ${number(c.xp)} XP ${c.questId ? "· On quest" : c.recoveryUntilMs > now() ? "· Recovering " + duration(c.recoveryUntilMs - now()) : ""}
            ${button("bench", "Bench", `data-id="${id}"`)}</label>`;
        }).join("") || "<p>Recruit champions at the Alehouse to form a party.</p>"}
          ${button("benchList", "Browse permanent champion bench")}
          ${bench.filter(c => !s.activeChampionIds.includes(c.id)).map(c => `<p>${escape(c.name)} · Lv. ${c.level} ${button("activate", "Make active", `data-id="${c.id}"`)}</p>`).join("")}
          ${cursor ? button("moreBench", "Next page") : ""}</article>
          <article><h3>Expeditions</h3><div class="estate-economy-actions">
          <label>Tier<select data-economy-tier>${["Common","Uncommon","Rare","Epic","Legendary"].map((name,i)=>`<option value="${i}">${name}</option>`).join("")}</select></label>
          <label>Duration<select data-economy-hours><option value="2">2 hours</option><option value="4">4 hours</option><option value="8">8 hours</option></select></label>
          <label>Reward<select data-economy-resource>${["timber","stone","ore","planks","iron","tools"].map(k=>`<option value="${k}">${label(k)}</option>`).join("")}</select></label>
          <label>Split with<select data-economy-resource-second><option value="">Keep one material</option>${["timber","stone","ore","planks","iron","tools"].map(k=>`<option value="${k}">${label(k)}</option>`).join("")}</select></label>
          <label>Meal<select data-economy-meal><option value="none">No meal</option><option value="bread">Trail bread</option><option value="stew">Hearty stew</option><option value="feast">Guild feast</option></select></label>
          ${button("quest", "Review expedition")}</div>
          ${s.quests.map(q=>`<p>Tier ${q.tier+1} expedition · ${duration(Math.max(0,q.completesAtMs-now()))} remaining · ${escape(list(q.rewards))}</p>`).join("")}
          ${s.parcels.map(p=>`<p>${escape(list(p.rewards))} ${button("claimParcel","Claim what fits",`data-id="${escape(p.id)}"`)}</p>`).join("")}</article>`;
      }
      if (key === "market" || key === "wagon-yard")
        body += `<article><h3>Optional Crown supplies</h3><p>Shared limit: one production hour per UTC day across both shops. Free gathering is always available.</p>
          <div class="estate-economy-actions"><label>Material<select data-economy-resource>${(key==="market"?["grain","food"]:["timber","stone","ore","planks","iron","tools"]).map(k=>`<option value="${k}">${label(k)}</option>`).join("")}</select></label>
          <label>Delivery<select data-economy-pack><option value=".25">¼ hour · 5 Crowns</option><option value=".5">½ hour · 10 Crowns</option><option value="1">1 hour · 20 Crowns</option></select></label>
          ${button("supply","Review delivery")}</div></article>`;
      return body;
    }
    function upgradeBody(key) {
      const s = data.estate, level = s.levels[key], jobs = s.jobs.filter(j => j.building === key);
      let body = `<p class="estate-economy-kicker">${escape(label(key))} · Level ${level} / 100</p>
        <div class="estate-economy-benefits"><p><b>Now</b><br>${escape(s.benefits[key].current)}</p><p><b>Next level</b><br>${escape(s.benefits[key].next)}</p></div>
        <p>Builders working: ${s.jobs.filter(j => j.status === "running").length} / ${s.slots}. Upgrades start individually; no queue.</p>`;
      if (jobs.length) return body + jobs.map(j => `<article><b>Level ${j.target}</b> · ${j.status === "running" ? duration(Math.max(0,j.completesAtMs-now()))+" remaining" : "Previously paid work · "+escape(j.status)}
        ${j.status === "running" ? "" : button("pause",j.status === "paused" ? "Resume paid work" : "Pause paid work",`data-id="${escape(j.id)}" data-paused="${j.status !== "paused"}"`)}</article>`).join("") + "<p>Finish this building’s paid work before depositing toward its next level.</p>";
      if (level >= 100) return body + "<p>Maximum building level reached.</p>";
      if (s.constructionPolicy !== "deposit-then-start") return body + "<p>Building upgrades are waiting for the matching server update. Refresh shortly.</p>";
      const bill = upgradeBill;
      if (!bill) return body + "<p>Loading requirements. If unavailable, refresh to request them again.</p>";
      const remaining = Object.values(bill.remaining).some(v => v > 0), builderBusy = s.jobs.filter(j=>j.status==="running").length >= s.slots;
      const gold = options.gold?.() ?? data.gold, affordable = Number.isFinite(gold) && gold >= bill.gold;
      const amounts = Object.entries(bill.materials);
      body += `<h3>Requirements for Level ${bill.target}</h3><p>${duration(bill.durationMs)} · ${number(bill.gold)} Gold when you start</p>`;
      if (amounts.length) body += `<div class="estate-upgrade-requirements"><table><thead><tr><th>Material</th><th>Required</th><th>Deposited</th><th>Still needed</th><th>You have</th><th>Deposit</th></tr></thead><tbody>${amounts.map(([k,v])=>{
        const max=Math.min(bill.remaining[k],Math.floor(s.stock[k]));
        return `<tr><th>${escape(label(k))}</th><td>${number(v)}</td><td>${number(bill.deposited[k])}</td><td>${number(bill.remaining[k])}</td><td>${number(s.stock[k])}</td><td><input aria-label="Deposit ${escape(label(k))}" type="number" min="0" max="${max}" step="1" value="${max}" data-economy-deposit="${k}" ${max ? "" : "disabled"}></td></tr>`;
      }).join("")}</tbody></table></div><p>Deposits belong only to this building’s next level and stay through seasons. They do not start an upgrade automatically.</p>`;
      else body += "<p>First construction requires Gold only.</p>";
      const canDeposit=Object.entries(bill.remaining).some(([k,v])=>v>0&&s.stock[k]>=1);
      body += `<div class="estate-economy-actions">${remaining ? button("deposit","Review deposit",canDeposit?"":"disabled") : ""}${button("fund",level?"Upgrade to Level "+bill.target:"Construct Level 1",remaining||builderBusy||!affordable?"disabled":"")}</div>
        <p data-economy-upgrade-status>${remaining?"Deposit all required materials to unlock Upgrade.":builderBusy?"Materials are ready. Start when a builder becomes free.":!affordable?"Materials are ready. You need "+number(bill.gold)+" Gold to start.":"Ready to start. Your upgrade begins only when you confirm."}</p>`;
      return body;
    }
    function reviewBody() {
      const q = quote.value;
      return `<p class="estate-economy-kicker">Review before committing</p>
        ${q.jobs ? q.jobs.map(j => `<p>${label(j.building)} → Level ${j.target} · ${duration(j.durationMs)}<br>Bill: ${escape(list(j.materials))}<br>Already deposited: ${escape(list(j.deposited))}</p>`).join("") : ""}
        ${q.materials || q.amounts ? `<p><b>Additional materials:</b> ${escape(list(q.materials || q.amounts))}</p>` : ""}
        ${q.gold ? `<p><b>Gold:</b> ${number(q.gold)}</p>` : ""}
        ${q.crowns ? `<p><b>Crowns:</b> ${number(q.crowns)} · ${number(q.quantity)} ${label(q.resource)}</p>` : ""}
        ${q.durationMs ? `<p><b>Duration:</b> ${duration(q.durationMs)}</p>` : ""}
        ${q.rarity ? `<p>One ${escape(q.rarity)} Level 1 ${escape(q.name)}</p>` : ""}
        ${q.action === "recruit" ? `<p>${escape(q.name)} · Level ${q.level} · Permanent ownership</p>` : ""}
        ${q.food ? `<p><b>Food:</b> ${number(q.food)} · Meal: ${escape(q.meal)}</p>` : ""}
        ${q.rewards ? `<p><b>Rewards:</b> ${escape(list(q.rewards))}<br>Without meal: ${escape(list(q.baseRewards))}<br>Recovery: ${duration(q.recoveryMs)}</p>
          <p>XP retained: ${Object.values(q.training).map(t=>escape(t.champion.name)+": "+number(t.credited)).join(" · ")}</p>` : ""}
        ${q.received ? `<p>Receive now: ${escape(list(q.received))}. Any remainder waits safely.</p>` : ""}
        ${q.action === "processor" ? `<p>Processing ${q.enabled ? "on" : "paused"}. Shared input reserves: ${escape(list(q.reserves))}.</p>` : ""}
        ${q.action === "roster" ? `<p>Move champion to the ${q.active ? "active roster" : "permanent bench"}.</p>` : ""}
        ${q.action === "pause" ? `<p>${q.paused ? "Pause" : "Resume"} this paid contract. No additional payment.</p>` : ""}
        ${q.nonrefundable ? '<label class="estate-economy-commit"><input type="checkbox" data-economy-permanent> I understand: payments belong permanently to this building. No withdrawal, refund or transfer. Starting an upgrade cannot be cancelled.</label>' : ""}
        <p class="estate-economy-muted">This quote is valid for five minutes and until the estate changes.</p>
        <div class="estate-economy-actions">${button("confirm",pending ? "Retry same request" : "Confirm")}${button("cancelReview","Back")}</div>`;
    }
    function render() {
      if (!current() || !dialog.open || !view) return;
      const title = label(view.key) + (view.type === "resource" ? " ledger" : view.type === "upgrade" ? " · Upgrade" : "");
      let body = "<p>Loading your permanent estate…</p>";
      if (data) {
        if (quote) body = reviewBody();
        else if (view.type === "upgrade") body = upgradeBody(view.key);
        else if (view.type === "resource") {
          const r = data.estate.resources[view.key];
          body = r ? `<div class="estate-economy-benefits"><p><b>Available</b><br>${number(r.available)} / ${number(r.capacity)}</p><p><b>Deposited</b><br>${number(r.reserved)}</p></div>
            <p>${escape(r.status)}</p><p>Gross: ${number(r.gross)}/hour · Factory inputs: ${number(r.consumed)}/hour · Net: ${number(r.net)}/hour</p>
            <p>${r.timeToFullHours === null ? "Production is paused, balanced by consumption, or waiting for inputs." : "At this rate, storage fills in " + duration(r.timeToFullHours*3600000) + ". Rates can change at storage boundaries."}</p>
            ${button("source","Visit "+label(r.source),`data-id="${r.source}"`)}` : "<p>This currency uses your existing " + (view.key==="gold"?"seasonal realm wallet.":"permanent Crown wallet.") + "</p>";
        } else body = buildingBody(view.key);
      }
      const focused = dialog.contains(document.activeElement) ? document.activeElement?.dataset.economyAction : "";
      dialog.innerHTML = `<header><div><small>Inner Castle</small><h2 id="estateEconomyTitle">${escape(title)}</h2></div>${button("refresh","Refresh")}${button("close","Close")}</header>
        <div class="estate-economy-content" aria-busy="${busy}">${error ? `<p role="alert" class="estate-economy-error">${escape(error)}</p>` : ""}${body}</div>
        <footer>Buildings, materials, paid work and champions stay through every season. ${data ? "Updated "+new Date(data.serverNowMs).toLocaleTimeString() : ""}</footer>`;
      dialog.querySelectorAll("button,select,input").forEach(el => { if (busy && !["close"].includes(el.dataset.economyAction)) el.disabled = true; });
      if (focused) dialog.querySelector(`[data-economy-action="${focused}"]`)?.focus({preventScroll:true});
    }
    dialog.addEventListener("click", async event => {
      const target = event.target.closest("[data-economy-action]"); if (!target) return;
      const action = target.dataset.economyAction, key = view?.key;
      const value = selector => dialog.querySelector(selector)?.value;
      if (action === "close") { dialog.close(); return; }
      if (busy || !current()) return;
      if (action === "refresh") { quote = null; pending = null; await refresh(); return; }
      if (action === "cancelReview") { quote = null; pending = null; render(); return; }
      if (action === "source") { open({type:"building",key:target.dataset.id}); return; }
      if (action === "confirm") {
        const accepted = !!dialog.querySelector("[data-economy-permanent]")?.checked;
        if (quote.value.nonrefundable && !accepted) { error = "Confirm the permanent credit terms before continuing."; render(); return; }
        pending ||= { requestId: crypto.randomUUID(), quoteId: quote.id, acceptPermanentCredit: accepted };
        const confirmedView = view;
        await run(async () => {
          const result = await api.commitEstateAction(pending);
          if (!current()) return;
          accept(result);
          if (result.replayed) accept(await api.getEstateState());
          if (view === confirmedView) { quote = null; pending = null; await loadUpgrade(); }
        }); return;
      }
      if (action === "benchList" || action === "moreBench") {
        await run(async () => {
          const result = await api.getEstateChampions(action==="moreBench"?cursor:"");
          if (!current()) return; bench=result.champions; cursor=result.nextCursor;
        }); return;
      }
      const inputs = {
        fund:()=>({action,building:key,count:1}),
        deposit:()=>({action,building:key,amounts:Object.fromEntries([...dialog.querySelectorAll("[data-economy-deposit]")].filter(x=>Number(x.value)>0).map(x=>[x.dataset.economyDeposit,Number(x.value)]))}),
        processor:()=>({action,building:key,enabled:data.estate.processors[key]===false}),
        reserves:()=>({action:"processor",building:key,enabled:data.estate.processors[key]!==false,reserves:Object.fromEntries([...dialog.querySelectorAll("[data-economy-reserve]")].map(x=>[x.dataset.economyReserve,Number(x.value)]))}),
        pause:()=>({action,jobId:target.dataset.id,paused:target.dataset.paused==="true"}),
        commission:()=>({action,building:key,family:value("[data-economy-family]")}),
        claimCommission:()=>({action,building:key}),
        recruit:()=>({action,offerId:target.dataset.id}),
        bench:()=>({action:"roster",championId:target.dataset.id,active:false}),
        activate:()=>({action:"roster",championId:target.dataset.id,active:true}),
        quest:()=>({action,tier:Number(value("[data-economy-tier]")),hours:Number(value("[data-economy-hours]")),resources:[...new Set([value("[data-economy-resource]"),value("[data-economy-resource-second]")].filter(Boolean))],meal:value("[data-economy-meal]"),championIds:[...dialog.querySelectorAll("[data-economy-champion]:checked")].map(x=>x.value)}),
        claimParcel:()=>({action,parcelId:target.dataset.id}),
        supply:()=>({action,resource:value("[data-economy-resource]"),hours:Number(value("[data-economy-pack]"))}),
      };
      if (inputs[action]) await review(inputs[action]());
    }, {signal:abort.signal});
    dialog.addEventListener("close",()=>{quote=null;pending=null;opener?.isConnected&&opener.focus({preventScroll:true});},{signal:abort.signal});
    document.addEventListener("visibilitychange",()=>{if(document.hidden){clearTimeout(deadlineTimer);clearTimeout(counterTimer);}else if(options.visible())refresh();},{signal:abort.signal});
    const stop = api.subscribeEstateChanges?.(revision => {
      if (current() && data && revision > data.estate.revision) refresh();
    });
    refresh();
    return { refresh, balances, now, snapshot:()=>data, building:key=>open({type:"building",key}), upgrade:key=>open({type:"upgrade",key}), resource:key=>open({type:"resource",key}),
      visibilityChanged:schedule, destroy(){destroyed=true;abort.abort();stop?.();clearTimeout(deadlineTimer);clearTimeout(counterTimer);dialog.remove();} };
  }
  root.CrownlandsEstateEconomy = { create, mapActions };
})(window);
