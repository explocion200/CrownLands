(function () {
  "use strict";
  const byId = id => document.getElementById(id);
  const stack = byId("activeItemEffectsStack"), dialog = byId("boostDialog");
  const definitions = [
    ["shieldStatusBadge", "shield_12h", "Protection", "Your regular cities", "Protection from rival attacks", "Attacking another player cancels your shield under the existing attack rules. PvP dispatches prevent new shield activation for 15 minutes. Objective rally shield rules are unchanged."],
    ["warDrumsStatusBadge", "war_drums_30m", "Troop production", "Your owned cities", "troop", "Production boost only. It does not increase battle power."],
    ["taxDecreeStatusBadge", "royal_tax_decree_30m", "Gold production", "Your owned cities", "Gold", "Using another Decree extends the timer; the percentage stays the same."],
    ["veilStatusBadge", "veil_of_silence_30m", "Concealment", "Your regular cities", "Enemy scouting blocked", "Scouting protection only. This does not block attacks. This is your personal item effect, not a Clan Tower ability."],
  ];
  let selected = "", signature = "", returnFocus = null;
  const element = (tag, className, text) => {
    const node = document.createElement(tag); node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  function effects() {
    return definitions.map(([badgeId, itemId, category, scope, benefit, note]) => {
      const item = SHOP_ITEMS.find(item => item.id === itemId);
      const expiresAtMs = Number(byId(badgeId).dataset.expiresAtMs) || 0;
      return { id: badgeId, item, category, scope, note, expiresAtMs,
        benefit: ["troop", "Gold"].includes(benefit) ? "+" + economyNumber("shopItems." + itemId + ".bonusPercent", 0) + "% base " + benefit + " production" : benefit };
    }).filter(effect => effect.expiresAtMs > Date.now());
  }
  function image(effect, size) {
    const img = element("img", ""); img.src = effect.item.icon; img.alt = ""; img.width = size; img.height = size;
    return img;
  }
  function render(active) {
    if (!active.some(effect => effect.id === selected)) selected = active[0]?.id || "";
    const next = JSON.stringify([selected, active.map(effect => [effect.id, effect.benefit, effect.item.description])]);
    if (next !== signature) {
      signature = next;
      const list = byId("boostList"), detail = byId("effectDetail"); list.replaceChildren(); detail.replaceChildren();
      for (const effect of active) {
        const button = element("button", "boost-option"); button.type = "button"; button.dataset.effectId = effect.id;
        button.setAttribute("aria-pressed", String(effect.id === selected));
        const copy = element("span", ""); copy.append(element("strong", "", effect.item.label));
        const subline = element("span", "subline"); subline.append(element("span", "status-dot"), element("time", "")); copy.append(subline);
        button.append(image(effect, 54), copy);
        button.addEventListener("click", () => { selected = effect.id; signature = ""; render(effects()); byId("boostList").querySelector('[aria-pressed="true"]')?.focus(); });
        list.append(button);
      }
      const current = active.find(effect => effect.id === selected);
      if (current) {
        const hero = element("div", "effect-hero"), copy = element("div", "");
        copy.append(element("span", "detail-category", current.category), element("h2", "", current.item.label), element("p", "effect-benefit", current.benefit));
        hero.append(image(current, 106), copy); detail.append(hero);
        const timer = element("div", "detail-timer"); timer.append(element("span", "", "Time remaining"), element("time", "")); detail.append(timer);
        const track = element("div", "time-track"); track.setAttribute("aria-hidden", "true"); track.append(element("span", "")); detail.append(track);
        const facts = element("dl", "effect-facts");
        for (const [label, value] of [["Applies to", current.scope], ["Effect", current.item.description]]) {
          const fact = element("div", ""); fact.append(element("dt", "", label), element("dd", "", value)); facts.append(fact);
        }
        detail.append(facts, element("p", "effect-note", current.note));
      } else {
        const empty = element("div", "empty-effects"); empty.append(element("strong", "", "No active effects"), element("span", "", "Use an item from your Bag to activate protection or a production boost."));
        detail.append(empty);
      }
    }
    byId("effectCount").textContent = active.length + " active";
    for (const effect of active) {
      const remaining = Math.max(0, Math.ceil((effect.expiresAtMs - Date.now()) / 1000));
      const option = byId("boostList").querySelector('[data-effect-id="' + effect.id + '"]');
      option.querySelector("time").textContent = formatDuration(remaining);
      option.classList.toggle("expiring", remaining <= 60);
      if (selected === effect.id) {
        byId("effectDetail").querySelector("time").textContent = formatDuration(remaining);
        byId("effectDetail").classList.toggle("effect-expiry", remaining <= 60);
        const duration = economyNumber("shopItems." + effect.item.id + ".effectDurationMinutes", 30) * 60;
        byId("effectDetail").querySelector(".time-track span").style.width = Math.min(100, remaining / duration * 100) + "%";
        byId("effectDetail").querySelector(".effect-note").textContent = (remaining <= 60 ? "Ends in under a minute. " : "") + effect.note;
      }
    }
  }
  function update() {
    const active = effects();
    stack.dataset.activeCount = String(active.length);
    stack.classList.toggle("compact", active.length > 2); stack.classList.toggle("dense", active.length > 3);
    for (const [id] of definitions) byId(id).classList.toggle("expiring", active.some(effect => effect.id === id && effect.expiresAtMs - Date.now() <= 60000));
    if (dialog.open) render(active);
  }
  function open(id = "") {
    returnFocus = document.activeElement; selected = id; signature = "";
    updateShieldStatusBadge(); render(effects());
    if (!dialog.open) dialog.showModal();
  }
  byId("allEffects").addEventListener("click", () => open());
  for (const [id] of definitions) byId(id).addEventListener("click", () => open(id));
  for (const id of ["closeBoosts", "backToMap"]) byId(id).addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => { signature = ""; if (returnFocus?.isConnected && !returnFocus.hidden) returnFocus.focus(); });
  window.CrownlandsBoosts = Object.freeze({ update, open });
})();
