(function (root) {
  "use strict";
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const number = value => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const label = key => root.CrownlandsEstate.buildings.find(b => b.key === key)?.label
    || root.CrownlandsEstate.resources.find(r => r.key === key)?.label || key;
  const duration = ms => ms < 3600000 ? Math.ceil(ms / 60000) + " min" : number(ms / 3600000) + " hours";
  const list = amounts => Object.entries(amounts || {}).filter(([, v]) => v).map(([k, v]) => number(v) + " " + label(k)).join(" · ") || "None";
  function create(options) {
    const scope = options.scope(), api = options.api(), abort = new AbortController();
    const dialog = document.createElement("dialog");
    dialog.className = "estate-economy-dialog";
    dialog.setAttribute("aria-labelledby", "estateEconomyTitle");
    document.body.append(dialog);
    let data = null, view = null, quote = null, pending = null, busy = false, destroyed = false, deadlineTimer = 0;
    let bench = [], cursor = "", error = "", opener = null, refreshPending = false;
    const current = () => !destroyed && options.scope() === scope;
    const now = () => data ? data.serverNowMs + Math.max(0, Date.now() - data.receivedAtMs) : Date.now();
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
      if (!current() || document.hidden || !options.visible() || !data) return;
      const times = [...data.estate.jobs.map(j => j.completesAtMs), ...data.estate.quests.map(q => q.completesAtMs)].filter(Number.isFinite);
      const upcoming = [...Object.values(data.estate.commissions).map(c => c.completesAtMs), ...Object.values(data.champions).map(c => c.recoveryUntilMs)].filter(t => Number.isFinite(t) && t > now());
      times.push(...upcoming);
      if (times.length) deadlineTimer = setTimeout(() => refresh(), Math.min(2147483647, Math.max(100, Math.min(...times) - now() + 100)));
    }
    async function refresh() {
      if (!current()) return;
      if (busy) { refreshPending = true; return; }
      busy = true;
      try { accept(await api.getEstateState()); error = ""; }
      catch (e) { if (current()) error = e.message || "Estate could not load."; }
      finally { busy = false; if (current()) render(); }
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
      await run(async () => {
        const result = await api.getEstateQuote(input);
        if (!current()) return;
        accept(result); quote = result.quote; pending = null;
      });
    }
    function open(next) {
      if (!current()) return;
      view = next; quote = null; pending = null; error = "";
      if (!dialog.open) { opener = document.activeElement; dialog.showModal(); }
      render(); refresh();
    }
    function buildingBody(key) {
      const s = data.estate, level = s.levels[key], jobs = s.jobs.filter(j => j.building === key), deposit = s.deposits[key];
      const producer = Object.values(s.resources).find(r => r.source === key);
      const commission = s.commissions[key];
      let body = `<p class="estate-economy-kicker">Permanent estate · Level ${level} / 100</p>
        <div class="estate-economy-benefits"><p><b>Now</b><br>${escape(s.benefits[key].current)}</p><p><b>Next level</b><br>${escape(s.benefits[key].next)}</p></div>
        <p>Builders: ${s.jobs.filter(j => j.status === "running").length} / ${s.slots} · Funded contracts: ${s.jobs.length} / 30</p>
        ${jobs.map(j => `<article><b>Level ${j.target}</b> · ${j.status === "running" ? duration(Math.max(0, j.completesAtMs - now())) + " remaining" : escape(j.status)}
          ${j.status === "running" ? "" : button("pause", j.status === "paused" ? "Resume paid work" : "Pause paid work", `data-id="${escape(j.id)}" data-paused="${j.status !== "paused"}"`)}</article>`).join("")}
        ${deposit ? `<p>Committed to Level ${deposit.target}: ${escape(list(deposit.deposited))}</p>` : ""}
        ${level < 100 ? `<div class="estate-economy-actions"><label>Levels to fund <select data-economy-count>${[1,2,3,4,5].map(n => `<option>${n}</option>`).join("")}</select></label>
          ${button("fund", level ? "Review upgrade" : "Review construction")}${!jobs.length && level ? button("depositForm", "Deposit materials") : ""}</div>` : "<p>Maximum building level reached.</p>"}`;
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
        ${q.nonrefundable ? '<label class="estate-economy-commit"><input type="checkbox" data-economy-permanent> I understand: payments become permanent credit for this building. No withdrawal, refund or transfer. Unstarted funded work may be paused and resumed free.</label>' : ""}
        <p class="estate-economy-muted">This quote is valid for five minutes and until the estate changes.</p>
        <div class="estate-economy-actions">${button("confirm",pending ? "Retry same request" : "Confirm")}${button("cancelReview","Back")}</div>`;
    }
    function render() {
      if (!current() || !dialog.open || !view) return;
      const title = view.type === "resource" ? label(view.key) + " ledger" : label(view.key);
      let body = "<p>Loading your permanent estate…</p>";
      if (data) {
        if (quote) body = reviewBody();
        else if (view.type === "deposit") {
          const credit = view.bill;
          body = `<p>Credit is bound to ${label(view.key)} Level ${credit.target}. Depositing frees ordinary storage.</p>
            ${Object.entries(credit.remaining).map(([k,v])=>`<label>${label(k)} — required ${number(credit.materials[k])}, deposited ${number(credit.deposited[k])}, remaining ${number(v)}
              <input type="number" min="0" max="${Math.min(v,data.estate.stock[k])}" step="1" value="0" data-economy-deposit="${k}"></label>`).join("")}
            ${button("deposit","Review permanent deposit")}${button("cancelReview","Back")}`;
        } else if (view.type === "resource") {
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
      if (action === "cancelReview") { quote = null; pending = null; view = {type:"building",key}; render(); return; }
      if (action === "source") { open({type:"building",key:target.dataset.id}); return; }
      if (action === "confirm") {
        const accepted = !!dialog.querySelector("[data-economy-permanent]")?.checked;
        if (quote.value.nonrefundable && !accepted) { error = "Confirm the permanent credit terms before continuing."; render(); return; }
        pending ||= { requestId: crypto.randomUUID(), quoteId: quote.id, acceptPermanentCredit: accepted };
        await run(async () => {
          const result = await api.commitEstateAction(pending);
          if (!current()) return;
          accept(result); quote = null; pending = null; view = {type:"building",key};
          if (result.replayed) accept(await api.getEstateState());
        }); return;
      }
      if (action === "depositForm") {
        await run(async () => {
          const result = await api.getEstateQuote({action:"fund",building:key,count:1});
          if (!current()) return;
          accept(result); view={type:"deposit",key,bill:result.quote.value.jobs[0]};
        }); return;
      }
      if (action === "benchList" || action === "moreBench") {
        await run(async () => {
          const result = await api.getEstateChampions(action==="moreBench"?cursor:"");
          if (!current()) return; bench=result.champions; cursor=result.nextCursor;
        }); return;
      }
      const inputs = {
        fund:()=>({action,building:key,count:Number(value("[data-economy-count]"))}),
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
    document.addEventListener("visibilitychange",()=>{if(document.hidden)clearTimeout(deadlineTimer);else if(options.visible())refresh();},{signal:abort.signal});
    const stop = api.subscribeEstateChanges?.(revision => {
      if (current() && data && revision > data.estate.revision) refresh();
    });
    refresh();
    return { refresh, snapshot:()=>data, building:key=>open({type:"building",key}), resource:key=>open({type:"resource",key}),
      visibilityChanged:schedule, destroy(){destroyed=true;abort.abort();stop?.();clearTimeout(deadlineTimer);dialog.remove();} };
  }
  root.CrownlandsEstateEconomy = { create };
})(window);
