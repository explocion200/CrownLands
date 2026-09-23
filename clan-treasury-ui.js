/* Approved Treasury presentation; balances and actions are supplied by the game. */
(function () {
"use strict";
const template = "<section class=\"clan-treasury-ui\">\n  <header class=\"window-header\"><div><p class=\"eyebrow\">Current season</p><h2>Clan Treasury</h2></div></header>\n  <div class=\"treasury-body\">\n   <section class=\"treasury-record scroll-panel\" aria-label=\"Clan funds\">\n    <p class=\"eyebrow\">For the strength of the clan</p>\n    <img class=\"treasury-art\" src=\"assets/optimized/pickup-gold-192x192-0f5238966f7a.webp\" alt=\"A leather purse filled with Gold coins\">\n    <p class=\"balance-label\">Treasury balance</p><strong id=\"ct-balance\" class=\"balance\">84,250,000</strong><span class=\"gold-unit\">Gold</span>\n    <div class=\"season-totals\"><div><span>Total donated</span><strong id=\"ct-totalDonated\">134,250,000</strong></div><div><span>Total spent</span><strong id=\"ct-totalSpent\">50,000,000</strong></div></div>\n    <p class=\"funds-note\">Shared Gold for your Clan Tower.<br>Leaders and Officers spend these funds.</p>\n    <details class=\"treasury-rules\"><summary>Treasury rules</summary><p>Every member can donate personal Gold. Donations are final and cannot be withdrawn.</p><p>The balance and seasonal totals reset each season. The balance also resets if the clan disbands.</p></details>\n   </section>\n   <section class=\"donation-panel scroll-panel\" aria-labelledby=\"ct-donationTitle\">\n    <div class=\"section-heading\"><div><p class=\"eyebrow\">Contribute to your clan</p><h2 id=\"ct-donationTitle\">Donate Gold</h2></div><span id=\"ct-allowanceBadge\" class=\"state-badge\">Allowance locked</span></div>\n    <div class=\"personal-stats\"><div><span>Your Gold</span><strong id=\"ct-personalGold\">32,400,000</strong></div><div><span>Can donate now</span><strong id=\"ct-canDonate\">18,000,000</strong></div></div>\n    <form id=\"ct-donationForm\" data-clan-treasury-form novalidate>\n     <label for=\"ct-amount\">Donation amount</label>\n     <div class=\"amount-control\"><img src=\"assets/icons/royal-shop-gold-r1.svg\" alt=\"\"><input id=\"ct-amount\" data-clan-treasury-donation type=\"number\" inputmode=\"numeric\" min=\"1\" step=\"1\" max=\"18000000\" value=\"4500000\" aria-describedby=\"ct-amountHint ct-amountError\"><button id=\"ct-max\" type=\"button\">Max</button></div>\n     <label class=\"sr-only\" for=\"ct-amountSlider\">Choose donation amount</label><input id=\"ct-amountSlider\" type=\"range\" min=\"0\" max=\"18000000\" step=\"1\" value=\"4500000\">\n     <div class=\"slider-labels\"><span>0</span><span id=\"ct-amountHint\">Maximum 18,000,000 Gold</span></div>\n     <p id=\"ct-amountError\" class=\"amount-error\" role=\"alert\" hidden></p>\n    </form>\n    <div class=\"after-donation\" aria-label=\"Balance preview\"><span>After donating</span><div><span>You keep</span><strong id=\"ct-personalAfter\">27,900,000</strong></div><div><span>Treasury becomes</span><strong id=\"ct-treasuryAfter\">88,750,000</strong></div></div>\n    <section class=\"allowance-card\" aria-labelledby=\"ct-allowanceTitle\">\n     <div class=\"allowance-heading\"><h3 id=\"ct-allowanceTitle\">Your daily allowance</h3><span>Resets 00:00 UTC</span></div>\n     <div class=\"allowance-numbers\"><div><span>Donated today</span><strong id=\"ct-donatedToday\">6,000,000</strong></div><div><span>Remaining today</span><strong id=\"ct-remaining\">18,000,000</strong></div><div><span>Daily cap</span><strong id=\"ct-dailyCap\">24,000,000</strong></div></div>\n     <div id=\"ct-allowanceProgress\" class=\"progress\" role=\"progressbar\" aria-label=\"Daily allowance used\" aria-valuemin=\"0\" aria-valuemax=\"100\" aria-valuenow=\"25\"><i></i></div>\n     <p id=\"ct-allowanceNote\">Today's cap is locked. Your first donation set it at 2,000,000 raw Gold/hour × 12.</p>\n    </section>\n   </section>\n  </div>\n  <footer class=\"donation-footer\"><div><p id=\"ct-feedback\" role=\"status\" aria-live=\"polite\">Every contribution strengthens your clan.</p><small id=\"ct-footerNote\">Gold donations are final. Review your amount before confirming.</small></div><button id=\"ct-reviewDonation\" class=\"primary\" form=\"ct-donationForm\" type=\"submit\">Review donation</button></footer></section>";
const number = value => new Intl.NumberFormat("en-US").format(value);
const safe = value => Math.max(0, Math.floor(Number(value) || 0));
const query = (root, id) => root.querySelector("#ct-" + id);
let confirmation = null;
function model(data) {
  const t = data.status?.treasury, a = data.status?.allowance;
  return { balance: t ? safe(t.balance) : null, totalDonated: t ? safe(t.totalDonated) : null,
    totalSpent: t ? safe(t.totalSpent) : null, personal: safe(data.personal), remaining: a ? safe(a.remaining) : null,
    cap: a ? safe(a.dailyCap) : null, donated: a ? safe(a.donatedToday) : null,
    locked: a?.locked === true, rate: safe(a?.locked ? a.rawGoldPerHourSnapshot : a?.previewRawGoldPerHour),
    loading: data.loading, busy: data.busy, ready: Boolean(t && a) };
}
function max(m) { return m.ready ? Math.min(m.personal, m.remaining) : 0; }
function value(m, view) { return view.amount === undefined ? String(Math.floor(max(m) / 4) || "") : String(view.amount); }
function cells(m) {
  return { balance: m.balance, totalDonated: m.totalDonated, totalSpent: m.totalSpent, personalGold: m.personal,
    canDonate: m.ready ? max(m) : null, donatedToday: m.donated, remaining: m.remaining, dailyCap: m.cap };
}
function render(data, view = {}) {
  const m = model(data);
  let html = template.replace("</header>", '<button id="ct-back" type="button" data-clan-action="reward-section" data-clan-reward="gifts">‹ Back to Rewards</button></header>');
  for (const [id, amount] of Object.entries(cells(m))) html = html.replace(new RegExp(`(id="ct-${id}"[^>]*>)[^<]*`), (_, tag) => tag + (amount === null ? "—" : number(amount)));
  return html;
}
function capture(root, view) {
  const panel = root?.querySelector?.(".clan-treasury-ui");
  if (!panel) return;
  view.amount = query(panel, "amount").value;
  view.scroll = [...panel.querySelectorAll(".scroll-panel")].map(node => node.scrollTop);
  view.rules = panel.querySelector(".treasury-rules").open;
  view.focus = panel.contains(document.activeElement) ? document.activeElement.id : "";
}
function bind(root, data, view = {}, retry) {
  const panel = root?.querySelector?.(".clan-treasury-ui");
  if (!panel) return;
  const m = model(data), q = id => query(panel, id), input = q("amount"), slider = q("amountSlider");
  input.value = value(m, view); input.max = max(m); slider.max = max(m);
  for (const node of [input, slider, q("max")]) node.disabled = !max(m) || m.busy || m.loading;
  q("allowanceBadge").textContent = !m.ready ? m.loading ? "Syncing…" : "Unavailable" : m.locked ? "Allowance locked" : "Allowance preview";
  q("allowanceBadge").classList.toggle("preview", !m.locked || !m.ready);
  q("allowanceNote").textContent = !m.ready ? "Your allowance is unavailable. Retry before making a donation." : m.locked
    ? `Today's cap is locked. Your first donation set it at ${number(m.rate)} raw Gold/hour × 12.`
    : `Based on ${number(m.rate)} current raw Gold/hour × 12. Your first successful donation locks today's cap until 00:00 UTC.`;
  const progress = m.cap ? Math.min(100, Math.floor(m.donated / m.cap * 100)) : 0;
  q("allowanceProgress").setAttribute("aria-valuenow", progress);
  q("allowanceProgress").setAttribute("aria-valuetext", m.ready ? `${number(m.donated)} of ${number(m.cap)} Gold donated today` : "Allowance unavailable");
  q("allowanceProgress").firstElementChild.style.width = progress + "%";
  q("amountHint").textContent = m.ready ? `Maximum ${number(max(m))} Gold` : "Allowance unavailable";
  const update = (edited = false) => {
    const amount = Number(input.value), valid = input.value.trim() !== "" && Number.isSafeInteger(amount) && amount > 0 && amount <= max(m);
    const selected = Number.isFinite(amount) ? Math.max(0, Math.min(amount, max(m))) : 0;
    slider.value = selected; slider.style.setProperty("--fill", (max(m) ? selected / max(m) * 100 : 0) + "%");
    slider.setAttribute("aria-valuetext", `${number(selected)} Gold`);
    q("personalAfter").textContent = valid ? number(m.personal - amount) : "—";
    q("treasuryAfter").textContent = valid ? number(m.balance + amount) : "—";
    const invalid = m.ready && max(m) > 0 && !valid && (edited || input.value !== "");
    input.setAttribute("aria-invalid", String(invalid));
    q("amountError").hidden = !invalid; q("amountError").textContent = `Enter a whole amount from 1 to ${number(max(m))} Gold.`;
    q("reviewDonation").disabled = m.busy || m.loading || (m.ready && !valid);
    q("reviewDonation").type = m.ready ? "submit" : "button";
    q("reviewDonation").textContent = m.loading ? "Syncing…" : !m.ready ? "Retry connection" : m.busy ? "Donating…" : view.feedback && !view.success ? "Review & retry" : "Review donation";
    q("feedback").textContent = m.busy ? "Sending your contribution…" : view.feedback || (!m.ready ? m.loading ? "Refreshing your Treasury…" : "Treasury could not be loaded." : !m.remaining ? "You've donated your full allowance today." : !m.personal ? "You have no Gold available to donate." : "Every contribution strengthens your clan.");
    q("feedback").className = view.success ? "success" : view.feedback || !m.ready ? "error" : "";
    q("footerNote").textContent = !m.ready ? "Reconnect to check your balance and allowance." : !m.remaining ? "Your daily allowance refreshes at 00:00 UTC." : "Gold donations are final. Review your amount before confirming.";
  };
  const edit = () => { view.amount = input.value; view.feedback = ""; view.success = false; update(true); };
  input.addEventListener("input", edit);
  slider.addEventListener("input", () => { input.value = slider.value; edit(); });
  q("max").addEventListener("click", () => { input.value = max(m); edit(); });
  q("reviewDonation").addEventListener("click", () => { if (!m.ready && !m.loading) retry?.(); });
  update();
  panel.querySelector(".treasury-rules").open = Boolean(view.rules);
  panel.querySelectorAll(".scroll-panel").forEach((node, i) => { node.scrollTop = view.scroll?.[i] || 0; });
  if (view.focus) panel.querySelector("#" + view.focus)?.focus({ preventScroll: true });
}
function closeConfirmation() { if (confirmation?.open) confirmation.close("cancel"); }
function confirm(data) {
  closeConfirmation();
  const m = model(data), amount = data.amount;
  const dialog = document.createElement("dialog");
  confirmation = dialog; dialog.className = "clan-treasury-confirmation";
  dialog.setAttribute("aria-labelledby", "ct-confirm-title");
  dialog.setAttribute("aria-describedby", "ct-confirm-note");
  dialog.innerHTML = `<form method="dialog"><h2 id="ct-confirm-title">Confirm your donation</h2>
    <div class="ct-confirm-amount"><img src="assets/icons/royal-shop-gold-r1.svg" alt="">${number(amount)} Gold</div>
    <p id="ct-confirm-note">This Gold leaves your personal balance and cannot be withdrawn from the Treasury.</p>
    <dl><div><dt>Your Gold afterward</dt><dd>${number(Math.max(0, m.personal - amount))}</dd></div><div><dt>Treasury afterward</dt><dd>${number(m.balance + amount)}</dd></div></dl>
    <p>${m.locked ? `${number(Math.max(0, m.remaining - amount))} Gold will remain in today's allowance.` : `This first donation locks today's allowance at ${number(m.cap)} Gold until 00:00 UTC.`}</p>
    <footer><button value="cancel" autofocus>Go back</button><button value="accept">Donate Gold</button></footer></form>`;
  document.body.append(dialog);
  return new Promise(resolve => {
    dialog.addEventListener("close", () => { const accepted = dialog.returnValue === "accept"; dialog.remove(); if (confirmation === dialog) confirmation = null; document.querySelector(".clan-treasury-ui #ct-reviewDonation")?.focus({ preventScroll: true }); resolve(accepted); }, { once: true });
    dialog.showModal();
  });
}
window.CrownlandsClanTreasuryUi = Object.freeze({ render, bind, capture, confirm, closeConfirmation });
})();
