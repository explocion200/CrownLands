(function (root) {
  "use strict";
  const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  function remaining(expiresAtMs, nowMs) {
    const seconds = Math.max(0, Math.ceil((Number(expiresAtMs) - nowMs) / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }
  function activeRecords(records, nowMs) {
    return (Array.isArray(records) ? records : []).filter(record => record.status === "available"
      && !record.usedArmyId && Number(record.expiresAtMs) > nowMs)
      .sort((a, b) => a.expiresAtMs - b.expiresAtMs || String(a.id).localeCompare(String(b.id)));
  }
  function render(element, snapshot = {}, nowMs = Date.now()) {
    if (!element) return;
    const records = activeRecords(snapshot.retaliation, nowMs);
    const shieldActive = Number(snapshot.shieldExpiresAtMs) > nowMs;
    element.hidden = !shieldActive && !records.length;
    const shield = element.querySelector("[data-shield-cooldown]");
    shield.hidden = !shieldActive;
    shield.querySelector("strong").textContent = remaining(snapshot.shieldExpiresAtMs || 0, nowMs);
    const details = element.querySelector("details");
    details.hidden = !records.length;
    if (!records.length) details.open = false;
    details.querySelector("summary strong").textContent = records.length === 1
      ? remaining(records[0].expiresAtMs, nowMs) : `${records.length} Active`;
    details.querySelector("summary").title = records.length === 1
      ? `Retaliation available for ${records[0].cityName || records[0].cityId}` : "Cities available for retaliation";
    const list = details.querySelector("[data-retaliation-list]");
    const signature = records.map(record => record.id).join("|");
    if (list.dataset.signature !== signature) {
      list.innerHTML = records.map(record => `<li><span>${escape(record.cityName || record.cityId)}<small>${escape(record.regionId)} · ${escape(record.cityId)}</small></span><strong data-retaliation-time="${escape(record.id)}"></strong></li>`).join("");
      list.dataset.signature = signature;
    }
    const times = list.querySelectorAll("[data-retaliation-time]");
    records.forEach((record, index) => { times[index].textContent = remaining(record.expiresAtMs, nowMs); });
  }
  root.CrownlandsCombatTimersUI = { remaining, activeRecords, render };
  if (typeof module !== "undefined") module.exports = root.CrownlandsCombatTimersUI;
})(globalThis);
