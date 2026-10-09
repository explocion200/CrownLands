(function (root) {
  "use strict";
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const number = value => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const label = key => root.CrownlandsEstate.buildings.find(b => b.key === key)?.label
    || root.CrownlandsEstate.resources.find(r => r.key === key)?.label || key;
  const duration = ms => ms < 3600000 ? Math.ceil(ms / 60000) + " min" : number(ms / 3600000) + " hours";
  const list = amounts => Object.entries(amounts || {}).filter(([, v]) => v).map(([k, v]) => number(v) + " " + label(k)).join(" · ") || "None";
  const qualities = ["Common", "Uncommon", "Rare", "Epic", "Legendary"], milestones = [1, 25, 50, 75, 100];
  const tierAt = level => milestones.reduce((tier, milestone, i) => level >= milestone ? i : tier, 0);
  const power = champion => Math.floor(champion.level * (1 + .25 * champion.quality));
  const constructionAction = level => level > 0 ? "Upgrade" : "Build";
  const setText = (element, text) => { if (element.textContent !== text) element.textContent = text; };
  const setAttribute = (element, name, value) => { if (element.getAttribute(name) !== value) element.setAttribute(name, value); };
  const setHidden = (element, hidden) => { if (element.hidden !== hidden) element.hidden = hidden; };
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
          setHidden(site.note, !site.job && !legacy);
          for (const target of [site.target, site.entry]) {
            if (!site.note.hidden) setAttribute(target, "aria-describedby", site.note.id);
            else target.removeAttribute("aria-describedby");
          }
          if (!site.job) {
            setHidden(site.gauge, true);
            setText(site.note, legacy ? "Paid work · " + (legacy.status === "paused" ? "Paused" : "Waiting for builder") : "");
            continue;
          }
          const left = Math.max(0, job.completesAtMs - now), progress = Math.max(0, Math.min(1, 1 - left / job.durationMs));
          const text = left ? remainingText(left) : "Finishing…";
          const offset = String(100 * (1 - progress));
          if (site.fill.style.strokeDashoffset !== offset) site.fill.style.strokeDashoffset = offset;
          setAttribute(site.gauge, "aria-valuenow", String(Math.round(progress * 100)));
          setAttribute(site.gauge, "aria-label", site.b.label + " construction to Level " + job.target);
          setAttribute(site.gauge, "aria-valuetext", Math.round(progress * 100) + "% complete · " + (left ? text + " remaining" : "Waiting for completion confirmation"));
          setAttribute(site.gauge, "title", site.gauge.getAttribute("aria-label") + " · " + site.gauge.getAttribute("aria-valuetext"));
          setText(site.text, text); setText(site.note, "Construction · " + text + (left ? " left" : ""));
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
  function mapActions(icon, economy) {
    return {
      mountTimers(host) {
        const timers = constructionTimers(host), management = economy?.mountManagement(host);
        return { update(...args) { timers.update(...args); management?.update(); }, place:timers.place,
          destroy() { timers.destroy(); management?.destroy(); } };
      },
      button(b, action, context, level) {
        const upgrade = action === "upgrade", name = upgrade ? constructionAction(level) : "Enter";
        const hint = upgrade ? name.toLowerCase() + " requirements" : level > 0 ? "enter building menu" : "construct this building before entering";
        const onMap = context === "target";
        const classes = onMap ? ` cl-action-button cl-action-${upgrade ? "level" : "send"}` : "";
        const content = onMap ? `<span class="wheel-icon" aria-hidden="true">${icon(upgrade ? "arrow-up" : "forward")}</span><span class="wheel-action-name">${name}</span>` : name;
        return `<button type="button" class="estate-site-action estate-${action}-${context}${classes}" data-estate-${action}="${b.key}" aria-label="${escape(b.label)} — ${hint}" title="${escape(b.label)} — ${hint}" ${onMap ? "hidden" : ""} ${!upgrade && !level ? "disabled" : ""}>${content}</button>`;
      },
      sync(host, levels) {
        host.querySelectorAll("[data-estate-upgrade]").forEach(button => {
          const key = button.dataset.estateUpgrade, name = constructionAction(levels[key]);
          const text = button.querySelector(".wheel-action-name") || button;
          if (text.textContent !== name) text.textContent = name;
          button.title = label(key) + " — " + name.toLowerCase() + " requirements";
          button.setAttribute("aria-label", button.title);
        });
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
    let bench = [], cursor = "", error = "", opener = null, refreshPending = false, upgradeBill = null, upgradeQuote = null;
    let renderedView = null, renderedQuote = null, formDraft = null, reviewDraft = null;
    let directoryFilter = "all", guideHidden = false, completions = [], feedback = null, management = null, overviewRequested = false;
    const guideKey = "crownlands-estate-guide-v1:" + (options.preferenceScope?.() || scope);
    try { guideHidden = localStorage.getItem(guideKey) === "dismissed"; } catch (_) { /* Device preferences are optional. */ }
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
        if (data) for (const [key, level] of Object.entries(result.estate.levels)) {
          if (level > data.estate.levels[key]) {
            const note = `${label(key)} Level ${level} completed. ${result.estate.benefits[key].current}.`;
            completions.unshift(note); completions = completions.slice(0, 5);
            feedback = { text:note, until:Date.now() + 12000 };
          }
        }
        const overview = result.upgradeOverview || (result.estate.revision === data?.estate.revision ? data?.upgradeOverview : null);
        data = { ...result, upgradeOverview:overview, receivedAtMs: Date.now() };
        options.update?.(data);
        schedule();
      }
    }
    function milestone(key, level) {
      if (level >= 100) return "";
      const rows = [[1, "This building’s service becomes available."]];
      if (["treasury", "barracks", "gatehouse", "royal-stables"].includes(key))
        milestones.slice(1).forEach((n, i) => rows.push([n, qualities[i+1] + " commissions."]));
      if (key === "builders-yard") rows.push([10,"Second builder."],[50,"Third builder."]);
      if (key === "alehouse") rows.push([10,"Trail bread preparation."],[25,"Uncommon recruits and hearty stew."],[50,"Rare recruits and guild feast."],[75,"Epic recruits."],[100,"Legendary recruits."]);
      if (key === "guild-master") rows.push([25,"Three champions per party and two expeditions; Uncommon quests also need Alehouse 25."],[50,"Four champions per party; Rare quests also need Alehouse 50."],[60,"Three concurrent expeditions."],[75,"Epic quests also need Alehouse 75."],[100,"Legendary quests also need Alehouse 100; champion training reaches Level 100."]);
      if (key === "wagon-yard") rows.push([25,"Plank and Iron supply packs."],[34,"Half-hour supply packs."],[50,"Tool supply packs."],[100,"One-hour supply packs."]);
      if (key === "market") rows.push([34,"Half-hour supply packs."],[100,"One-hour supply packs."]);
      const next = rows.filter(([n]) => n > level).sort((a,b) => a[0]-b[0])[0];
      return next ? `<aside class="estate-milestone"><b>Next unlock · Level ${next[0]}</b><progress max="${next[0]}" value="${level}" aria-label="${escape(label(key))} progress toward Level ${next[0]}"></progress><p>${escape(next[1])} ${next[0]-level} levels to go.</p></aside>`
        : `<p class="estate-economy-muted">Every completed level improves this service through Level 100. The next-level benefit is shown in Upgrade requirements.</p>`;
    }
    function productionHelp(key) {
      const s = data.estate, r = s.resources[key];
      if (!r || r.status === "Producing") return "";
      if (r.status === "Source not built") return `<p>Construct ${escape(label(r.source))} to begin gathering ${escape(label(key))}. ${button("upgradeSite","Review construction",`data-id="${r.source}"`)}</p>`;
      if (r.status === "Storage full") {
        const store = ["grain","food"].includes(key) ? "granary" : "storehouse";
        return `<p>${escape(label(key))} storage is full. Building upgrades and services can free space; ${escape(label(store))} expands capacity. ${button("source","Visit "+label(store),`data-id="${store}"`)}</p>`;
      }
      if (r.status === "Processing paused") return `<p>Processing is paused by your preference. ${button("source","Visit "+label(r.source),`data-id="${r.source}"`)}</p>`;
      const inputs = Object.keys(r.inputs || {}).filter(k => !s.levels[s.resources[k].source] || s.resources[k].available <= (s.reserves[k] || 0));
      return inputs.length ? inputs.map(k => `<p>${escape(label(key))} needs usable ${escape(label(k))}. ${s.reserves[k] ? number(s.reserves[k])+" is protected by your shared reserve. " : ""}${button("source","Visit "+label(s.resources[k].source),`data-id="${s.resources[k].source}"`)} ${s.reserves[k] ? button("source","Review processor reserves",`data-id="${r.source}"`) : ""}</p>`).join("")
        : `<p>Shared processing can be constrained by ingredients, reserves or downstream storage. ${button("source","Review "+label(r.source),`data-id="${r.source}"`)}</p>`;
    }
    function championCard(c, active) {
      const unavailable = c.questId || c.recoveryUntilMs > now(), xpMax = 4*c.level;
      const status = c.questId ? "Questing" : c.recoveryUntilMs > now() ? "Recovering · "+duration(c.recoveryUntilMs-now()) : "Ready";
      const identity = `<span><strong>${escape(c.name)}</strong><small>${qualities[c.quality] || "Common"} · Lv. ${c.level} · Power ${power(c)}</small></span>`;
      return `<div class="estate-economy-champion estate-champion-card" data-champion-card="${escape(c.id)}">
        ${active ? `<label><input type="checkbox" data-economy-champion value="${escape(c.id)}" ${unavailable ? "disabled" : ""}>${identity}</label>` : identity}
        <span class="estate-champion-state">${status}</span>
        ${button(active?"bench":"activate",active?"Bench":"Make active",`data-id="${escape(c.id)}" ${unavailable || (!active && data.estate.activeChampionIds.length >= 6+Math.floor(18*(data.estate.levels["guild-master"]-1)/99)) ? "disabled" : ""}`)}
        <div class="estate-champion-xp">${c.level >= 100 ? "Maximum champion level" : `<progress max="${xpMax}" value="${Math.min(c.xp,xpMax)}" aria-label="${escape(c.name)} XP progress"></progress>${number(c.xp)} / ${xpMax} XP · Guild training ceiling Lv. ${data.estate.levels["guild-master"]}${c.level >= data.estate.levels["guild-master"] ? " · Extra XP stays banked" : ""}`}</div>
      </div>`;
    }
    function statusBody() {
      const s = data.estate, working = s.jobs.filter(j=>j.status==="running").length;
      const claims = Object.entries(s.commissions).filter(([,c])=>c.completesAtMs<=now());
      let body = `<div class="estate-status-totals"><p><b>${Math.max(0,s.slots-working)} / ${s.slots}</b> builders free</p><p><b>${s.jobs.length}</b> construction projects</p><p><b>${claims.length+s.parcels.length}</b> rewards to review</p></div><p>Use Buildings to filter projects. Readiness uses the latest server quote summary; every start is reviewed and checked again.</p>`;
      body += `<article><h3>Construction</h3>${s.jobs.map(j=>`<p>${escape(label(j.building))} → Level ${j.target} · ${j.status==="running" ? j.completesAtMs>now()?duration(j.completesAtMs-now())+" remaining":"Finishing…" : "Paid work · "+escape(j.status)} ${button("upgradeSite","View project",`data-id="${j.building}"`)}</p>`).join("") || "<p>No construction running. Select Build or Upgrade in a building’s requirements to start work.</p>"}</article>`;
      body += `<article><h3>Ready to collect</h3>${claims.map(([key,c])=>`<p>${escape(label(key))} · ${escape(c.name)} ${button("source","View commission",`data-id="${key}"`)}</p>`).join("")}${s.parcels.length ? `<p>${s.parcels.length} quest reward parcels · ${button("source","Visit Guild Master",'data-id="guild-master"')}</p>` : ""}${!claims.length&&!s.parcels.length ? "<p>No completed rewards waiting.</p>" : ""}<p>Claiming remains a separate review. Rewards that do not fit stay available.</p></article>`;
      if (completions.length) body += `<article><h3>Recently completed this visit</h3>${completions.map(n=>`<p>${escape(n)}</p>`).join("")}</article>`;
      body += `<article><h3>Getting started ${button("guide",guideHidden?"Show guide":"Dismiss guide")}</h3>`;
      if (!guideHidden) {
        const steps = [
          [["foresters-lodge","quarry","mine","farmstead"],"Gather raw materials","Timber, Stone, Iron Ore and Grain feed the estate."],
          [["storehouse","granary"],"Make room for resources","Each material has its own capacity; existing stocks are retained."],
          [["sawmill","smithy","workshop"],"Build the crafting chain","2 Timber → Plank; 3 Ore + Timber → Iron; Plank + Iron → Tool."],
          [["windmill"],"Prepare Food","2 Grain → Food for expeditions and meals."],
          [["guild-master"],"Open your guild","Recruit at the Alehouse, then activate champions at the Guild Master."],
        ];
        body += `<ol class="estate-starter-guide">${steps.map(([keys,title,text])=>{
          const missing=keys.filter(k=>!s.levels[k]);
          return `<li><b>${missing.length?"Next":"Built"} · ${title}</b><p>${text}</p>${missing.length ? missing.map(k=>button("upgradeSite","Review "+label(k),`data-id="${k}"`)).join(" ") : button("source","Visit "+label(keys[0]),`data-id="${keys[0]}"`)}</li>`;
        }).join("")}<li><b>${s.activeChampionIds.length>=2?"Ready":"Next"} · Form a party</b><p>Activate at least two champions. Check power, Food and recovery before an expedition.</p>${button("source","Visit Guild Master",'data-id="guild-master"')}</li><li><b>Gather, then build or upgrade</b><p>Other buildings follow the completed Great Hall level. Select a building’s external Build or Upgrade button to review resources, time and next-level benefits. Start when you have the materials, Gold and a free builder; payment happens together when you start. No upgrade queue. Estate materials and progress persist; world Gold remains seasonal.</p>${button("upgradeSite","Review Great Hall",'data-id="great-hall"')}</li></ol>`;
      }
      return body + "</article>";
    }
    function mountManagement(host) {
      management?.destroy();
      const localAbort = new AbortController(), header = host.querySelector(".estate-header"), directory = host.querySelector(".estate-directory");
      const entry = document.createElement("button"); entry.type="button";entry.dataset.estateStatus="";entry.textContent="Estate";
      header.insertBefore(entry,header.querySelector("[data-estate-directory-toggle]"));
      const filters = document.createElement("div"); filters.className="estate-directory-filters";
      filters.innerHTML='<label>Show buildings<select data-estate-filter><option value="all">All buildings</option><option value="ready">Ready to upgrade</option><option value="constructing">Under construction</option><option value="materials">Needs materials</option><option value="unbuilt">Not built</option></select></label><p data-estate-filter-count role="status"></p>';
      directory.prepend(filters); const select = filters.querySelector("select");select.value=directoryFilter;
      const empty=document.createElement("p");empty.dataset.estateFilterEmpty="";empty.hidden=true;empty.textContent="No buildings match this filter.";directory.append(empty);
      const notice=document.createElement("div");notice.className="estate-completion-feedback";notice.hidden=true;notice.setAttribute("role","status");
      notice.innerHTML='<span></span><button type="button" aria-label="Dismiss completion notice">×</button>';header.querySelector("div").append(notice);
      let feedbackTimer=0;
      const update=()=>{
        if (!data || !current()) return;
        const s=data.estate, claims=Object.values(s.commissions).filter(c=>c.completesAtMs<=now()).length+s.parcels.length;
        const title=`Estate overview · ${Math.max(0,s.slots-s.jobs.filter(j=>j.status==="running").length)} builders free · ${claims} rewards waiting`;
        setAttribute(entry,"title",title);setAttribute(entry,"aria-label",title);
        select.querySelectorAll('[value="ready"],[value="materials"]').forEach(option=>{const disabled=!data.upgradeOverview;if(option.disabled!==disabled)option.disabled=disabled;});
        let count=0;
        directory.querySelectorAll(".estate-directory-site").forEach(row=>{
          const key=row.querySelector("[data-estate-directory-building]").dataset.estateDirectoryBuilding, state=data.upgradeOverview?.[key];
          setHidden(row,directoryFilter==="all"?false:directoryFilter==="unbuilt"?!!s.levels[key]||s.jobs.some(j=>j.building===key):directoryFilter==="constructing"?!s.jobs.some(j=>j.building===key&&j.status==="running"):!state||state.status!==directoryFilter);
          if (!row.hidden) count++;
          let note=row.querySelector(".estate-readiness-note");if(!note){note=document.createElement("small");note.className="estate-readiness-note";row.querySelector("[data-estate-directory-building]").append(note);}
          const text=state?.reason||"Refresh Estate for upgrade readiness.";if(note.textContent!==text)note.textContent=text;
        });
        directory.querySelectorAll(":scope > section").forEach(section=>setHidden(section,![...section.querySelectorAll(".estate-directory-site")].some(row=>!row.hidden)));
        const text=`${count} of 20 buildings${data.upgradeOverview?"":" · Readiness awaiting server update"}`;
        setText(filters.querySelector("p"),text);setHidden(empty,count!==0);
        setText(empty,!data.upgradeOverview&&["ready","materials"].includes(directoryFilter)?"Refresh Estate for current upgrade readiness.":"No buildings match this filter.");
        clearTimeout(feedbackTimer);setHidden(notice,!feedback||feedback.until<=Date.now()||document.hidden);
        if(!notice.hidden){setText(notice.firstElementChild,feedback.text);setAttribute(notice,"title",feedback.text);feedbackTimer=setTimeout(()=>{notice.hidden=true;feedback=null;},Math.max(1,feedback.until-Date.now()));}
      };
      entry.addEventListener("click",()=>open({type:"status",key:"estate"}),{signal:localAbort.signal});
      select.addEventListener("change",()=>{directoryFilter=select.value;update();directory.scrollTop=0;},{signal:localAbort.signal});
      host.addEventListener("click",event=>{if(event.target.closest("[data-estate-directory-toggle]"))queueMicrotask(()=>{if(!localAbort.signal.aborted&&!directory.hidden){select.focus({preventScroll:true});refresh(true);}});},{signal:localAbort.signal});
      notice.querySelector("button").addEventListener("click",()=>{feedback=null;notice.hidden=true;clearTimeout(feedbackTimer);entry.focus();},{signal:localAbort.signal});
      management={update,needsOverview:()=>!directory.hidden,destroy(){localAbort.abort();clearTimeout(feedbackTimer);entry.remove();filters.remove();empty.remove();notice.remove();management=null;}};
      update();return management;
    }
    function schedule() {
      clearTimeout(deadlineTimer);
      paintCounters();
      if (!current() || document.hidden || (!options.visible() && !dialog.open) || !data) return;
      const times = [...data.estate.jobs.map(j => j.completesAtMs), ...data.estate.quests.map(q => q.completesAtMs)].filter(Number.isFinite);
      const upcoming = [...Object.values(data.estate.commissions).map(c => c.completesAtMs), ...Object.values(data.champions).map(c => c.recoveryUntilMs)].filter(t => Number.isFinite(t) && t > now());
      times.push(...upcoming);
      if (Number.isFinite(data.estate.projection?.untilMs)) times.push(data.estate.projection.untilMs);
      if (["alehouse", "guild-master", "market", "wagon-yard"].some(key => data.estate.levels[key]))
        times.push((Math.floor(now() / 86400000) + 1) * 86400000);
      if (times.length) deadlineTimer = setTimeout(() => refresh(), Math.min(2147483647, Math.max(100, Math.min(...times) - now() + 100)));
    }
    async function refresh(includeUpgradeOverview = false) {
      if (!current()) return;
      overviewRequested ||= includeUpgradeOverview || (dialog.open && view?.type === "status") || management?.needsOverview();
      if (busy) { refreshPending = true; return; }
      busy = true;
      const overview = !!overviewRequested; overviewRequested = false;
      try { accept(await api.getEstateState(overview)); error = ""; await loadUpgrade(); }
      catch (e) { if (current()) error = e.message || "Estate could not load."; }
      finally {
        busy = false;
        if (current()) { render(); if (refreshPending && !quote) { refreshPending = false; refresh(); } }
      }
    }
    async function loadUpgrade() {
      if (!current() || !dialog.open || view?.type !== "upgrade" || !data || quote) return;
      upgradeBill = null; upgradeQuote = null;
      const requestedView = view, key = view.key, s = data.estate;
      if (s.constructionPolicy !== "pay-on-start" || s.levels[key] >= 100 || s.jobs.some(j => j.building === key) || s.buildingPrerequisites?.[key]?.length) return;
      const result = await api.getEstateQuote({action:"fund",building:key,count:1});
      if (!current() || !dialog.open || view !== requestedView) return;
      accept(result); upgradeBill = result.quote.value.jobs[0]; upgradeQuote = result.quote;
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
        if (dialog.open && view === reviewedView) { quote = result.quote; pending = null; reviewDraft = null; }
      });
    }
    async function commitQuote() {
      const confirmedView = view, request = pending;
      await run(async () => {
        const result = await api.commitEstateAction(request);
        if (!current()) return;
        accept(result);
        if (result.replayed) accept(await api.getEstateState());
        refreshPending = true;
        if (view === confirmedView) { quote = null; pending = null; formDraft = null; reviewDraft = null; renderedView = null; await loadUpgrade(); }
      });
    }
    function open(next) {
      if (!current()) return;
      view = next; quote = null; pending = null; upgradeBill = null; upgradeQuote = null; error = "";
      formDraft = null; reviewDraft = null;
      if (!dialog.open) { opener = document.activeElement; dialog.showModal(); }
      render(); refresh();
    }
    function buildingBody(key) {
      const s = data.estate, level = s.levels[key];
      const producer = Object.values(s.resources).find(r => r.source === key);
      const commission = s.commissions[key];
      let body = `<p class="estate-economy-kicker">Permanent estate · Level ${level} / 100</p>
        <p>${escape(root.CrownlandsEstate.buildings.find(b => b.key === key)?.role)}</p>
        <p><b>Current benefit:</b> ${escape(s.benefits[key].current)}</p>` + milestone(key,level);
      if (!level) return body + "<p>This service becomes available after Level 1 completes. Close this window and use the building’s Build button to review construction.</p>";
      if (producer) {
        body += `<article><h3>${escape(label(Object.keys(s.resources).find(k => s.resources[k] === producer)))} production</h3><p>${escape(producer.status)} · ${number(producer.gross)} / hour · ${number(producer.net)} net / hour</p>
          <p>Stored ${number(producer.available)} / ${number(producer.capacity)}. Production pauses when there is no room or usable input.</p></article>`;
        body += productionHelp(Object.keys(s.resources).find(k=>s.resources[k]===producer));
        if (Object.keys(producer.inputs || {}).length) body += `<p><b>Recipe per unit:</b> ${escape(list(producer.inputs))}. Inputs are consumed only while processing can produce output.</p>`;
        if (["sawmill", "smithy", "workshop", "windmill"].includes(key))
          body += button("processor", s.processors[key] === false ? "Resume processing" : "Pause processing")
            + `<p>Keep these amounts available for building. Reserves apply to every factory using the material.</p>${Object.keys(producer.inputs || {}).map(k=>`<label>${label(k)} reserve<input type="number" min="0" max="${s.resources[k].capacity}" step="1" value="${s.reserves[k]||0}" data-economy-reserve="${k}"></label>`).join("")}`
            + button("reserves", "Review reserves");
      }
      if (["storehouse", "granary", "wagon-yard", "market"].includes(key)) {
        const food = ["granary", "market"].includes(key);
        body += `<article><h3>Storage</h3><p>Each material has its own capacity. Previously paid building credit is separate; existing stock is never discarded.</p><div class="estate-storage-list">${Object.entries(s.resources).filter(([k]) => ["grain", "food"].includes(k) === food).map(([k, r]) =>
          button("ledger", `${escape(label(k))}<br>${number(r.available)} / ${number(r.capacity)}`, `data-id="${k}"`)).join("")}</div></article>`;
      }
      if (key === "great-hall") body += "<p>Only completed Hall levels unlock other building upgrades. Gather the required materials, then select Build or Upgrade in its requirements to pay and start work.</p>";
      if (key === "builders-yard") body += `<p>Builders working: ${s.jobs.filter(j => j.status === "running").length} / ${s.slots}. A new builder arrives at Level 10 and another at Level 50. Time reductions apply to new contracts; paid work keeps its accepted timer.</p>`;
      if (root.COMMON_GEAR?.BUILDINGS?.[key] || ["treasury", "barracks", "gatehouse", "royal-stables"].includes(key)) {
        body += `<article><h3>Officer commissions</h3><p>Choose one item family. Its rarity follows this building’s completed level; existing Gear remains yours. Common / Uncommon / Rare / Epic / Legendary unlock at Levels 1 / 25 / 50 / 75 / 100. Each order returns one Level 1 item; review its materials and timer before spending.</p>`;
        if (commission) body += `<p>${escape(commission.rarity)} ${escape(commission.name)} · ${commission.completesAtMs > now() ? duration(commission.completesAtMs - now()) + " remaining" : "Ready to claim"}</p>`
          + button("claimCommission", "Claim commissioned Gear", commission.completesAtMs > now() ? "disabled" : "");
        else {
          const families = options.gear.DEFINITIONS.filter(d => d.buildingId === key && d.rarity === "common");
          body += `<label>Item family<select data-economy-family>${families.map(d => `<option value="${d.familyKey}">${escape(d.gearName)}</option>`).join("")}</select></label>` + button("commission", "Review commission");
        }
        body += "</article>";
      }
      if (key === "alehouse") {
        body += `<article><h3>Today’s champions</h3><p>Three stable offers each UTC day. Every recruit stays yours across seasons; a full active roster sends new recruits to your bench.</p>
          ${!s.levels["guild-master"] ? "<p>Construct the Guild Master to unlock recruitment.</p>" : ""}
          ${s.recruitOffers.offers.map(o => `<div class="estate-expedition-card"><b>${escape(o.name)}</b><p>${qualities[o.quality] || "Common"} · Level ${o.level} · Power ${power(o)} ${o.claimed ? "· Recruited" : ""}</p>${o.claimed ? "" : button("recruit", "Review recruit", `data-id="${escape(o.id)}"`)}</div>`).join("")}
          <p>Recruitment quality improves at Levels 1 / 25 / 50 / 75 / 100. Review a recruit’s seasonal Gold fee before spending. Preparation meals unlock at Alehouse Levels 10, 25 and 50; select them when planning an expedition at the Guild Master.</p></article>`;
      }
      if (key === "guild-master") {
        const roster = 6 + Math.floor(18 * (level - 1) / 99), party = level >= 50 ? 4 : level >= 25 ? 3 : 2, parties = level >= 60 ? 3 : level >= 25 ? 2 : 1;
        const unlockedTier = Math.min(tierAt(level), tierAt(s.levels.alehouse));
        body += `<article><h3>Active champions · ${s.activeChampionIds.length} / ${roster}</h3><p>Select up to ${party} idle champions. Each tier requires a minimum party and power. Questing and recovering champions stay active until ready.</p>${s.activeChampionIds.map(id => data.champions[id] ? championCard(data.champions[id],true) : "").join("") || "<p>Recruit champions at the Alehouse to form a party.</p>"}
          ${button("benchList", "Browse permanent champion bench")}
          ${bench.filter(c => !s.activeChampionIds.includes(c.id)).map(c => championCard(c,false)).join("")}
          ${cursor ? button("moreBench", "Next page") : ""}</article>
          <article><h3>Expeditions · ${s.quests.length} / ${parties} parties</h3><p>Quest tiers require both the Guild Master and Alehouse at Levels 1 / 25 / 50 / 75 / 100. Construct the Farmstead and Windmill for Food. Shared daily reward budget remaining: ${number(Math.max(0, 2.4 - (s.questUsage.day === new Date(now()).toISOString().slice(0,10) ? s.questUsage.hours : 0)))} / 2.4 resource hours.</p><div class="estate-economy-actions">
          <label>Tier<select data-economy-tier>${qualities.map((name,i)=>`<option value="${i}" ${i > unlockedTier ? "disabled" : ""}>${name}${i > unlockedTier ? " · Both buildings Lv. " + milestones[i] : ""}</option>`).join("")}</select></label>
          <label>Duration<select data-economy-hours><option value="2">2 hours</option><option value="4">4 hours</option><option value="8">8 hours</option></select></label>
          <label>Reward<select data-economy-resource>${["timber","stone","ore","planks","iron","tools"].map(k=>`<option value="${k}">${label(k)}</option>`).join("")}</select></label>
          <label>Split with<select data-economy-resource-second><option value="">Keep one material</option>${["timber","stone","ore","planks","iron","tools"].map(k=>`<option value="${k}">${label(k)}</option>`).join("")}</select></label>
          <label>Meal<select data-economy-meal><option value="none">No meal</option>${[["bread", "Trail bread", 10], ["stew", "Hearty stew", 25], ["feast", "Guild feast", 50]].map(([id,name,min]) => `<option value="${id}" ${s.levels.alehouse < min ? "disabled" : ""}>${name} · Alehouse Lv. ${min}</option>`).join("")}</select></label>
          ${button("quest", "Review expedition", s.quests.length >= parties || s.quests.length + s.parcels.length >= 6 ? "disabled" : "")}</div><p data-economy-party-status role="status"></p>
          ${s.quests.map(q=>`<div class="estate-expedition-card"><b>${qualities[q.tier]} expedition</b><p>${q.completesAtMs>now()?duration(q.completesAtMs-now())+" remaining":"Finishing…"} · ${escape(list(q.rewards))}</p><p>${(q.championIds||[]).map(id=>escape(data.champions[id]?.name||"Champion")).join(" · ")}</p></div>`).join("")}
          ${s.parcels.map(p=>`<div class="estate-expedition-card"><b>Rewards ready</b><p>${escape(list(p.rewards))}</p>${button("claimParcel","Claim what fits",`data-id="${escape(p.id)}"`)}</div>`).join("")}</article>`;
      }
      if (key === "market" || key === "wagon-yard") {
        const used = s.supplyUsage.day === new Date(now()).toISOString().slice(0,10) ? s.supplyUsage.hours : 0, maxPack = .25 + .75 * (level - 1) / 99;
        body += `<article><h3>Optional Crown supplies</h3><p>Shared daily allowance remaining: ${number(Math.max(0, 1-used))} / 1 production hour across both shops. A completed material supply chain and space for the entire pack are required. Free gathering is always available.</p>
          <div class="estate-economy-actions"><label>Material<select data-economy-resource>${(key==="market"?["grain","food"]:["timber","stone","ore","planks","iron","tools"]).map(k=>{
            const min = ["planks","iron"].includes(k) ? 25 : k === "tools" ? 50 : 1;
            return `<option value="${k}" ${level < min ? "disabled" : ""}>${label(k)}${level < min ? " · Wagon Yard Lv. " + min : ""}</option>`;
          }).join("")}</select></label>
          <label>Delivery<select data-economy-pack>${[[.25,"¼",1],[.5,"½",34],[1,"1",100]].map(([hours,name,min])=>`<option value="${hours}" ${hours > maxPack + 1e-10 || hours + used > 1 + 1e-10 ? "disabled" : ""}>${name} hour · ${hours*20} Crowns${hours > maxPack + 1e-10 ? " · Lv. " + min : hours + used > 1 + 1e-10 ? " · Daily limit" : ""}</option>`).join("")}</select></label>
          ${button("supply","Review delivery", used + .25 > 1 + 1e-10 ? "disabled" : "")}</div></article>`;
      }
      return body;
    }
    function upgradeBody(key) {
      const s = data.estate, level = s.levels[key], jobs = s.jobs.filter(j => j.building === key);
      const trail = view.trail || [];
      let body = (trail.length ? `<nav class="estate-prerequisite-trail" aria-label="Building requirement chain"><p>${[...trail,key].map(k=>escape(label(k))).join(" → ")}</p>${button("prerequisiteBack","Back to "+escape(label(trail.at(-1))))}</nav>` : "")
        + `<p class="estate-economy-kicker">${escape(label(key))} · Level ${level} / 100</p>
        <div class="estate-economy-benefits"><p><b>Now</b><br>${escape(s.benefits[key].current)}</p><p><b>Next level</b><br>${escape(s.benefits[key].next)}</p></div>
        <p>Builders working: ${s.jobs.filter(j => j.status === "running").length} / ${s.slots}. Upgrades start individually; no queue.</p>` + milestone(key,level);
      if (pending && quote?.value.action === "fund") {
        const bill = quote.value.jobs[0];
        return body + `<h3>Waiting for Level ${bill.target} start result</h3><p>${duration(bill.durationMs)} · ${number(quote.value.gold)} Gold</p><p>Retry checks this same upgrade request without paying twice.</p>${button("fund", "Retry same upgrade")}`;
      }
      if (jobs.length) return body + jobs.map(j => `<article><b>Level ${j.target}</b> · ${j.status === "running" ? duration(Math.max(0,j.completesAtMs-now()))+" remaining" : "Previously paid work · "+escape(j.status)}
        ${j.status === "running" ? "" : button("pause",j.status === "paused" ? "Resume paid work" : "Pause paid work",`data-id="${escape(j.id)}" data-paused="${j.status !== "paused"}"`)}</article>`).join("") + "<p>Finish this building’s paid work before its next upgrade.</p>";
      if (level >= 100) return body + "<p>Maximum building level reached.</p>";
      if (s.constructionPolicy !== "pay-on-start") return body + "<p>Building upgrades are waiting for the matching server update. Refresh shortly.</p>";
      const prerequisites = s.buildingPrerequisites?.[key] || [];
      if (prerequisites.length) return body + `<section class="estate-building-prerequisites" aria-label="Required buildings"><h3>Buildings required for Level ${level + 1}</h3>
        ${prerequisites.map(required=>`<article><p><b>${escape(label(required.building))} · Level ${required.requiredLevel} required</b><br>Completed level: ${required.currentLevel}. Only completed levels count.</p>
          ${button("prerequisite",constructionAction(required.currentLevel)+" "+escape(label(required.building)),`data-id="${escape(required.building)}"`)}</article>`).join("")}
        <p>Follow a required building to review its next level and any prerequisites of its own.</p>${button("close","Cancel","data-economy-cancel")}</section>`;
      const bill = upgradeBill;
      if (!bill) return body + (error ? "<p>Resolve the condition above, then refresh to review this building’s requirements.</p>" : "<p>Loading requirements. If unavailable, refresh to request them again.</p>");
      const materialsReady = Object.entries(bill.remaining).every(([k,v])=>v<=s.stock[k]), builderBusy = s.jobs.filter(j=>j.status==="running").length >= s.slots;
      const gold = options.gold?.() ?? data.gold, affordable = Number.isFinite(gold) && gold >= bill.gold;
      const amounts = Object.entries(bill.materials);
      body += `<h3>Requirements for Level ${bill.target}</h3><p>${duration(bill.durationMs)} · ${number(bill.gold)} Gold when you start</p>`;
      const hasCredit = Object.values(bill.deposited).some(v=>v>0);
      if (amounts.length) body += `<div class="estate-upgrade-requirements"><table><thead><tr><th>Material</th><th>Required</th>${hasCredit ? "<th>Already paid</th><th>Due now</th>" : ""}<th>You have</th></tr></thead><tbody>${amounts.map(([k,v])=>
        `<tr><th>${escape(label(k))}</th><td>${number(v)}</td>${hasCredit ? `<td>${number(bill.deposited[k])}</td><td>${number(bill.remaining[k])}</td>` : ""}<td>${number(s.stock[k])}</td></tr>`
      ).join("")}</tbody></table></div>${hasCredit ? "<p>Your previously paid materials stay credited to this level. You pay only the amount due now.</p>" : ""}`;
      else body += "<p>First construction requires Gold only.</p>";
      body += `<div class="estate-economy-actions">${button("fund",level?"Upgrade to Level "+bill.target:"Build Level 1",!materialsReady||builderBusy||!affordable?"disabled":"")}${button("close","Cancel","data-economy-cancel")}</div>
        <p data-economy-upgrade-status>${!materialsReady?"Gather the required materials, then refresh to start.":builderBusy?"Materials are ready. Start when a builder becomes free.":!affordable?"Materials are ready. You need "+number(bill.gold)+" Gold to start.":"Ready to start. Select Build or Upgrade to pay the shown Gold and materials and begin construction."} Started work cannot be cancelled.</p>`;
      return body;
    }
    function reviewBody() {
      const q = quote.value;
      return `<p class="estate-economy-kicker">Review before committing</p>
        ${q.jobs ? q.jobs.map(j => `<p>${label(j.building)} → Level ${j.target} · ${duration(j.durationMs)}<br>Bill: ${escape(list(j.materials))}<br>Already paid: ${escape(list(j.deposited))}</p>`).join("") : ""}
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
    function partyStatus() {
      const status = dialog.querySelector("[data-economy-party-status]");
      if (!status || !data) return;
      const tier = Number(dialog.querySelector("[data-economy-tier]").value), ids = [...dialog.querySelectorAll("[data-economy-champion]:checked")].map(el => el.value);
      const total = ids.reduce((n, id) => n + power(data.champions[id]), 0);
      status.textContent = `Selected ${ids.length} champions · Power ${total}. ${qualities[tier]} requires at least ${[2,2,3,4,4][tier]} champions and ${[2,60,160,320,600][tier]} power. Review shows the exact Food cost, rewards, XP retained and recovery before you spend.`;
    }
    const controlId = el => JSON.stringify([el.tagName, el.type, el.dataset, el.matches("[data-economy-champion]") ? el.value : ""]);
    function saveForm() {
      return {
        fields: [...dialog.querySelectorAll("input,select")].map(el => ({ id:controlId(el), value:el.value, checked:el.checked })),
        focus: dialog.contains(document.activeElement) && document.activeElement.matches("button,input,select")
          ? controlId(document.activeElement) : (renderedQuote ? reviewDraft : formDraft)?.focus,
        scroll: dialog.querySelector(".estate-economy-content")?.scrollTop || 0,
      };
    }
    function render() {
      if (!current() || !dialog.open || !view) return;
      const focusTitle = document.activeElement === dialog.querySelector("#estateEconomyTitle")
        || (renderedView !== view && Array.isArray(view.trail));
      if (renderedView === view) {
        if (!renderedQuote) formDraft = saveForm();
        else if (renderedQuote === quote) reviewDraft = saveForm();
      }
      const draft = quote ? reviewDraft : formDraft;
      const title = view.type === "status" ? "Estate overview" : label(view.key) + (view.type === "resource" ? " ledger" : view.type === "upgrade" ? " · " + constructionAction(data?.estate.levels[view.key]) : "");
      let body = "<p>Loading your permanent estate…</p>";
      if (data) {
        if (quote && quote.value.action !== "fund") body = reviewBody();
        else if (view.type === "status") body = statusBody();
        else if (view.type === "upgrade") body = upgradeBody(view.key);
        else if (view.type === "resource") {
          const r = data.estate.resources[view.key];
          body = r ? `<div class="estate-economy-benefits"><p><b>Available</b><br>${number(r.available)} / ${number(r.capacity)}</p><p><b>Previously paid</b><br>${number(r.reserved)}</p></div>
            <p>${escape(r.status)}</p><p>Gross: ${number(r.gross)}/hour · Factory inputs: ${number(r.consumed)}/hour · Net: ${number(r.net)}/hour</p>
            <p>${r.timeToFullHours === null ? "Production is paused, balanced by consumption, or waiting for inputs." : "At this rate, storage fills in " + duration(r.timeToFullHours*3600000) + ". Rates can change at storage boundaries."}</p>
            ${productionHelp(view.key)}${button("source","Visit "+label(r.source),`data-id="${r.source}"`)}` : "<p>This currency uses your existing " + (view.key==="gold"?"seasonal realm wallet.":"permanent Crown wallet.") + "</p>";
        } else body = buildingBody(view.key);
      }
      dialog.innerHTML = `<header><div><small>Inner Castle</small><h2 id="estateEconomyTitle" tabindex="-1">${escape(title)}</h2></div>${button("refresh","Refresh")}${button("close","Close")}</header>
        <div class="estate-economy-content" aria-busy="${busy}">${error ? `<p role="alert" class="estate-economy-error">${escape(error)}</p>` : ""}${body}</div>
        <footer>Buildings, materials, paid work and champions stay through every season. ${data ? "Updated "+new Date(data.serverNowMs).toLocaleTimeString() : ""}</footer>`;
      for (const el of dialog.querySelectorAll("input,select")) {
        const saved = draft?.fields.find(field => field.id === controlId(el));
        if (!saved || el.disabled) continue;
        if (el.type === "checkbox") el.checked = saved.checked;
        else if (el.tagName === "SELECT") { if ([...el.options].some(o => o.value === saved.value && !o.disabled)) el.value = saved.value; }
        else el.value = saved.value === "" ? "" : el.type === "number" ? Math.max(Number(el.min || 0), Math.min(Number(el.max || Infinity), Number(saved.value))) : saved.value;
      }
      partyStatus();
      dialog.querySelectorAll("button,select,input").forEach(el => { if (busy && !["close"].includes(el.dataset.economyAction)) el.disabled = true; });
      const focused = [...dialog.querySelectorAll("button,select,input")].find(el => controlId(el) === draft?.focus && !el.disabled);
      focused?.focus({preventScroll:true});
      if (focusTitle) dialog.querySelector("#estateEconomyTitle").focus({preventScroll:true});
      if (!draft && quote) dialog.querySelector('[data-economy-action="confirm"]')?.focus({preventScroll:true});
      if (draft) dialog.querySelector(".estate-economy-content").scrollTop = draft.scroll;
      renderedView = view; renderedQuote = quote;
    }
    dialog.addEventListener("click", async event => {
      const target = event.target.closest("[data-economy-action]"); if (!target) return;
      const action = target.dataset.economyAction, key = view?.key;
      const value = selector => dialog.querySelector(selector)?.value;
      if (action === "close") { dialog.close(); return; }
      if (busy || !current()) return;
      if (action === "refresh") { quote = null; pending = null; await refresh(); return; }
      if (action === "cancelReview") { quote = null; pending = null; if (view.type === "upgrade") await refresh(); else render(); return; }
      if (action === "source") { open({type:"building",key:target.dataset.id}); return; }
      if (action === "ledger") { open({type:"resource",key:target.dataset.id}); return; }
      if (action === "upgradeSite") { open({type:"upgrade",key:target.dataset.id}); return; }
      if (action === "prerequisite" || action === "prerequisiteBack") {
        const trail = [...(view.trail || [])], next = action === "prerequisiteBack" ? trail.pop() : target.dataset.id;
        if (!root.CrownlandsEstate.buildings.some(b=>b.key===next)) return;
        if (action === "prerequisite") trail.push(key);
        const selectedOpener = options.selectBuilding?.(next);
        if (selectedOpener) opener = selectedOpener;
        open({type:"upgrade",key:next,trail});return;
      }
      if (action === "guide") {
        guideHidden=!guideHidden;
        try { if(guideHidden)localStorage.setItem(guideKey,"dismissed");else localStorage.removeItem(guideKey); } catch (_) { /* Optional device preference. */ }
        render();return;
      }
      if (action === "fund") {
        if (!pending) {
          if (!upgradeQuote || !upgradeBill) return;
          quote = upgradeQuote;
          pending = { requestId: crypto.randomUUID(), quoteId: quote.id, acceptPermanentCredit: true };
        }
        await commitQuote(); return;
      }
      if (action === "confirm") {
        const accepted = !!dialog.querySelector("[data-economy-permanent]")?.checked;
        if (quote.value.nonrefundable && !accepted) { error = "Confirm the permanent credit terms before continuing."; render(); return; }
        pending ||= { requestId: crypto.randomUUID(), quoteId: quote.id, acceptPermanentCredit: accepted };
        await commitQuote(); return;
      }
      if (action === "benchList" || action === "moreBench") {
        await run(async () => {
          const result = await api.getEstateChampions(action==="moreBench"?cursor:"");
          if (!current()) return; bench=result.champions; cursor=result.nextCursor;
        }); return;
      }
      const inputs = {
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
    dialog.addEventListener("change",partyStatus,{signal:abort.signal});
    dialog.addEventListener("close",()=>{
      quote=null;pending=null;
      const target=opener?.isConnected?opener:[...document.querySelectorAll("[data-estate-officer-manage]")].find(el=>el.dataset.estateOfficerManage===opener?.dataset.estateOfficerManage);
      target?.focus({preventScroll:true});schedule();
    },{signal:abort.signal});
    document.addEventListener("visibilitychange",()=>{if(document.hidden){clearTimeout(deadlineTimer);clearTimeout(counterTimer);}else if(options.visible()||dialog.open)refresh();},{signal:abort.signal});
    const stop = api.subscribeEstateChanges?.(revision => {
      if (current() && data && revision > data.estate.revision) refresh();
    });
    refresh();
    return { refresh, balances, now, mountManagement, snapshot:()=>data, building:key=>open({type:"building",key}), upgrade:key=>open({type:"upgrade",key}), resource:key=>open({type:"resource",key}),
      visibilityChanged:schedule, destroy(){destroyed=true;management?.destroy();abort.abort();stop?.();clearTimeout(deadlineTimer);clearTimeout(counterTimer);dialog.remove();} };
  }
  root.CrownlandsEstateEconomy = { create, mapActions };
})(window);
