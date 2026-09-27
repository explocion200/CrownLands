"use strict";

// Extend the existing synthetic review; no production game or Firebase code is loaded.
const originalOrderSample = setSample;
const originalOrderUpdate = update;
let amountError = "";
let editingAmount = false;
let editStartAmount = 1;
samples.limited = { amount: 175000, sendLimit: 350000 };
samples.one = { troops: 1, amount: 1 };
const permittedMaximum = () => Math.min(current.troops, current.sendLimit || current.troops);
const presetAmount = ratio => Math.max(1, Math.floor(permittedMaximum() * ratio));

function syncSelection() {
  const input = document.getElementById("exactAmount");
  if (!input) return;
  if (!editingAmount && !amountError) input.value = num(amount);
  input.setAttribute("aria-invalid", String(Boolean(amountError)));
  const error = document.getElementById("amountError");
  error.hidden = !amountError;
  error.textContent = amountError;
  const range = document.getElementById("troopRange");
  range.max = permittedMaximum();
  range.value = amount;
  range.style.setProperty("--fill", `${100 * (amount - 1) / Math.max(1, permittedMaximum() - 1)}%`);
  document.querySelectorAll("[data-fraction]").forEach(button => {
    const ratio = Number(button.dataset.fraction);
    button.setAttribute("aria-pressed", String(!amountError && amount === presetAmount(ratio) && (permittedMaximum() > 1 || ratio === 1)));
  });
  confirm.disabled = Boolean(amountError) || current.route !== "ready";
}

update = function updateSelectionDraft() {
  originalOrderUpdate();
  syncSelection();
};

setAmount = function selectDraftAmount(value) {
  amountError = "";
  amount = Math.min(permittedMaximum(), Math.max(1, Math.floor(Number(value) || 1)));
  update();
  announce(`${num(amount)} troops selected. ${num(current.troops - amount)} remain at source.`);
};

function readExactAmount() {
  const value = document.getElementById("exactAmount").value.trim();
  const validFormat = /^\d+$/.test(value) || /^\d{1,3}(,\d{3})+$/.test(value);
  const parsed = Number(value.replaceAll(",", ""));
  if (!value) amountError = "Enter the number of troops to send.";
  else if (!validFormat || !Number.isSafeInteger(parsed)) amountError = "Use a whole troop count, such as 125,000.";
  else if (parsed < 1 || parsed > permittedMaximum()) amountError = `Choose between 1 and ${num(permittedMaximum())} troops.`;
  else { amountError = ""; amount = parsed; }
  update();
}

setSample = function renderSelectionDraft(key) {
  amountError = "";
  editingAmount = false;
  originalOrderSample(key);
  if (current.blocked) return;
  // Reuse the approved full-width selector for Reinforce as well.
  document.querySelector(".order-columns").classList.add("selection-layout");
  document.querySelector(".contribution")?.remove();
  const readout = document.querySelector(".force-readout");
  readout.insertAdjacentHTML("beforeend", `<label class="exact-amount"><span class="sr-only">Exact troop count</span><input id="exactAmount" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" aria-describedby="selectionHint amountError" aria-invalid="false" value="${num(amount)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 15Z"/></svg></label>`);
  document.querySelector(".force-summary").insertAdjacentHTML("afterend", `<div class="selection-tools"><div class="quick-amounts" role="group" aria-label="Quick troop selection"><button type="button" data-fraction="0.25">25%</button><button type="button" data-fraction="0.5">50%</button><button type="button" data-fraction="1">Max</button></div><p id="selectionHint" class="selection-hint">${current.sendLimit ? `<strong>Protected max: ${num(permittedMaximum())}</strong><br>Shortcuts use this troop limit.` : "Tap the count to edit.<br>Shortcuts use the available maximum."}</p></div><p id="amountError" class="amount-error" role="alert" hidden></p>`);
  document.querySelector(".range-labels span:last-child").textContent = `${current.sendLimit ? "Protected max" : "Max"} ${num(permittedMaximum())}`;
  const input = document.getElementById("exactAmount");
  input.addEventListener("focus", () => {
    editingAmount = true;
    editStartAmount = amount;
    if (!amountError) input.value = String(amount);
    input.select();
  });
  input.addEventListener("input", readExactAmount);
  input.addEventListener("blur", () => { editingAmount = false; readExactAmount(); });
  input.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation();
      amountError = ""; input.value = String(editStartAmount); amount = editStartAmount; input.blur();
    } else if (event.key === "Enter") {
      event.preventDefault(); readExactAmount(); if (!amountError) input.blur();
    }
  });
  document.querySelectorAll("[data-fraction]").forEach(button => button.addEventListener("click", () => {
    editingAmount = false;
    setAmount(presetAmount(Number(button.dataset.fraction)));
  }));
  syncSelection();
};

// Guard the review action as well as its disabled presentation.
confirm.addEventListener("click", event => {
  if (amountError) { event.preventDefault(); event.stopImmediatePropagation(); }
}, true);
setSample(new URLSearchParams(location.search).get("sample") || "attack");
document.documentElement.dataset.selectionReady = "true";
