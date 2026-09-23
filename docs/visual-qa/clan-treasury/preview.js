"use strict";
// Design review only. No storage, account, networking or gameplay APIs.
const $ = selector => document.querySelector(selector);
const dialog = $("#treasuryDialog"), confirmation = $("#confirmDialog");
const number = value => new Intl.NumberFormat("en-US").format(value);
const samples = new Set(["ready", "first", "low", "empty", "exhausted", "unavailable", "error"]);
let model, request = 0, timer = null;
const maximum = () => model.unavailable ? 0 : Math.max(0, Math.min(model.personal, model.cap - model.donated));
const selected = () => Number($("#amount").value);
const valid = () => $("#amount").value.trim() !== "" && Number.isSafeInteger(selected()) && selected() >= 1 && selected() <= maximum();
function notify(message) {
  if (parent !== window) parent.postMessage({ type: "treasury-status", message }, location.origin);
}
function reset(sample = "ready") {
  request++;
  clearTimeout(timer);
  if (!samples.has(sample)) sample = "ready";
  if (confirmation.open) confirmation.close();
  model = { sample, balance: 84250000, totalDonated: 134250000, totalSpent: 50000000, personal: 32400000, cap: 24000000, donated: 6000000, rate: 2000000, locked: sample !== "first", unavailable: sample === "unavailable", failOnce: sample === "error", pending: false, feedback: "", success: false };
  if (sample === "first") model.donated = 0;
  if (sample === "low") model.personal = 1200000;
  if (sample === "empty") model.personal = 0;
  if (sample === "exhausted") model.donated = model.cap;
  $("#amount").value = maximum() ? Math.floor(maximum() / 4) : "";
  $("#dismissed").hidden = true;
  if (!dialog.open) dialog.showModal();
  render();
  document.querySelectorAll(".scroll-panel").forEach(panel => { panel.scrollTop = 0; });
  $(".treasury-rules").open = false;
  notify("Interactive draft · Sample balances only");
}
function render() {
  const unavailable = model.unavailable;
  for (const [id, value] of Object.entries({ balance: model.balance, totalDonated: model.totalDonated, totalSpent: model.totalSpent, personalGold: model.personal, canDonate: maximum(), donatedToday: model.donated, remaining: model.cap - model.donated, dailyCap: model.cap })) $("#" + id).textContent = unavailable && id !== "personalGold" ? "—" : number(value);
  $("#allowanceBadge").textContent = unavailable ? "Unavailable" : model.locked ? "Allowance locked" : "Allowance preview";
  $("#allowanceBadge").classList.toggle("preview", !model.locked || unavailable);
  $("#allowanceNote").textContent = unavailable ? "Your allowance is unavailable. Retry before making a donation." : model.locked
    ? `Today's cap is locked. Your first donation set it at ${number(model.rate)} raw Gold/hour × 12.`
    : `Based on ${number(model.rate)} current raw Gold/hour × 12. Your first successful donation locks today's cap until 00:00 UTC.`;
  const progress = unavailable ? 0 : Math.round(model.donated / model.cap * 100);
  $("#allowanceProgress").setAttribute("aria-valuenow", String(progress));
  $("#allowanceProgress").setAttribute("aria-valuetext", unavailable ? "Allowance unavailable" : `${number(model.donated)} of ${number(model.cap)} Gold donated today`);
  $("#allowanceProgress i").style.width = progress + "%";
  for (const id of ["amount", "amountSlider", "max"]) $("#" + id).disabled = !maximum() || model.pending;
  $("#amount").max = maximum();
  $("#amountSlider").max = maximum();
  $("#amountHint").textContent = unavailable ? "Allowance unavailable" : `Maximum ${number(maximum())} Gold`;
  updateAmount(false);
}
function updateAmount(showError = false) {
  const amount = selected(), allowed = valid();
  const sliderValue = Number.isFinite(amount) ? Math.max(0, Math.min(amount, maximum())) : 0;
  $("#amountSlider").value = sliderValue;
  $("#amountSlider").style.setProperty("--fill", (maximum() ? sliderValue / maximum() * 100 : 0) + "%");
  $("#amountSlider").setAttribute("aria-valuetext", `${number(sliderValue)} Gold`);
  $("#personalAfter").textContent = allowed ? number(model.personal - amount) : "—";
  $("#treasuryAfter").textContent = allowed ? number(model.balance + amount) : "—";
  $("#amount").setAttribute("aria-invalid", String(showError && !allowed && maximum() > 0));
  $("#amountError").hidden = !showError || allowed || !maximum();
  $("#amountError").textContent = `Enter a whole amount from 1 to ${number(maximum())} Gold.`;
  const review = $("#reviewDonation");
  review.disabled = model.pending || (!allowed && !model.unavailable);
  review.textContent = model.unavailable ? "Retry connection" : model.pending ? "Donating…" : model.feedback && !model.success ? "Review & retry" : "Review donation";
  const feedback = model.feedback || (model.unavailable ? "Treasury could not be loaded." : model.donated >= model.cap ? "You've donated your full allowance today." : !model.personal ? "You have no Gold available to donate." : "Every contribution strengthens your clan.");
  $("#feedback").textContent = feedback;
  $("#feedback").className = model.success ? "success" : model.feedback || model.unavailable ? "error" : "";
  $("#footerNote").textContent = model.unavailable ? "Reconnect to check your balance and allowance." : model.donated >= model.cap ? "Your daily allowance refreshes at 00:00 UTC." : "Gold donations are final. Review your amount before confirming.";
}
function editAmount(value) {
  if (value !== undefined) $("#amount").value = value;
  model.feedback = "";
  model.success = false;
  updateAmount(true);
}
$("#amount").addEventListener("input", () => editAmount());
$("#amountSlider").addEventListener("input", event => editAmount(event.target.value));
$("#max").addEventListener("click", () => editAmount(maximum()));
$("#donationForm").addEventListener("submit", event => {
  event.preventDefault();
  if (model.pending) return;
  if (model.unavailable) { reset("ready"); return; }
  if (!valid()) { updateAmount(true); $("#amount").focus(); return; }
  $("#confirmAmount").textContent = number(selected());
  $("#confirmPersonal").textContent = number(model.personal - selected());
  $("#confirmTreasury").textContent = number(model.balance + selected());
  $("#confirmAllowance").textContent = model.locked ? `${number(model.cap - model.donated - selected())} Gold will remain in today's allowance.` : `This first donation locks today's allowance at ${number(model.cap)} Gold until 00:00 UTC.`;
  $("#confirmStatus").textContent = "";
  $("#cancelDonation").disabled = $("#confirmDonation").disabled = false;
  $("#confirmDonation").textContent = "Donate Gold";
  confirmation.showModal();
});
function cancelConfirmation() {
  if (model.pending) return;
  confirmation.close();
  $("#reviewDonation").focus();
}
$("#cancelDonation").addEventListener("click", cancelConfirmation);
confirmation.addEventListener("cancel", event => { event.preventDefault(); cancelConfirmation(); });
$("#confirmDonation").addEventListener("click", () => {
  if (model.pending || !valid() || !confirmation.open) return;
  const amount = selected(), token = ++request;
  model.pending = true;
  $("#cancelDonation").disabled = $("#confirmDonation").disabled = true;
  $("#confirmDonation").textContent = "Donating…";
  $("#confirmStatus").textContent = "Sending your contribution…";
  render();
  timer = setTimeout(() => {
    if (request !== token) return;
    model.pending = false;
    if (model.failOnce) {
      model.failOnce = false;
      model.feedback = "Donation failed. No Gold was spent. Try again.";
    } else {
      model.personal -= amount;
      model.balance += amount;
      model.totalDonated += amount;
      model.donated += amount;
      model.locked = true;
      model.success = true;
      model.feedback = `${number(amount)} Gold donated. Thank you for supporting your clan.`;
      $("#amount").value = Math.min(amount, maximum()) || "";
    }
    confirmation.close();
    render();
    $("#reviewDonation").focus();
    notify(model.success ? "Sample donation completed · No real Gold spent" : "Sample donation failed · Try again");
  }, 650);
});
function closeTreasury() {
  request++;
  clearTimeout(timer);
  model.pending = false;
  if (confirmation.open) confirmation.close();
  dialog.close();
  $("#dismissed").hidden = false;
  $("#reopen").focus();
}
$("#closeTreasury").addEventListener("click", closeTreasury);
dialog.addEventListener("cancel", event => { event.preventDefault(); closeTreasury(); });
$("#reopen").addEventListener("click", () => { $("#dismissed").hidden = true; dialog.showModal(); render(); });
window.addEventListener("message", event => {
  if (event.origin === location.origin && event.source === parent && event.data?.type === "treasury-review") reset(event.data.sample);
});
reset(new URLSearchParams(location.search).get("sample") || "ready");
document.documentElement.dataset.treasuryReady = "true";
