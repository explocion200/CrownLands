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
  const contexts = new WeakMap();
  function positionList(element) {
    const details = element.querySelector("details");
    if (!details.open) return;
    const panel = details.querySelector(".retaliation-list-panel");
    const view = element.ownerDocument.defaultView;
    const compact = view.innerHeight <= 600 && view.innerWidth > view.innerHeight;
    const anchor = element.getBoundingClientRect();
    const left = Math.max(8, Math.min(compact ? anchor.right + 8 : anchor.left, view.innerWidth - panel.offsetWidth - 8));
    let bottom = view.innerHeight - 8;
    const chat = element.ownerDocument.getElementById("quickChat");
    if (chat && !chat.hidden) {
      const rect = chat.getBoundingClientRect();
      if (rect.right > left && rect.left < left + panel.offsetWidth && rect.top > 8) bottom = Math.min(bottom, rect.top - 8);
    }
    const height = Math.min(compact ? 166 : 174, bottom - 8);
    const origin = details.getBoundingClientRect();
    Object.assign(panel.style, { left: (left - origin.left) + "px", top: (Math.max(8, Math.min(compact ? anchor.top : anchor.bottom + 4, bottom - height)) - origin.top) + "px", maxHeight: height + "px" });
  }
  function bindLocations(element) {
    element.querySelector("details").addEventListener("toggle", () => positionList(element));
    const chat = element.ownerDocument.getElementById("quickChat");
    if (chat) new MutationObserver(() => positionList(element)).observe(chat, { attributes: true, attributeFilter: ["style", "hidden"] });
    element.addEventListener("click", async event => {
      const button = event.target.closest("[data-retaliation-location]");
      const context = contexts.get(element);
      if (!button || !context?.navigate || context.pending) return;
      const record = activeRecords(context.snapshot.retaliation, context.nowMs + Date.now() - context.renderedAt)
        .find(entry => entry.id === button.dataset.retaliationLocation);
      if (!record) return;
      context.pending = true;
      button.disabled = true;
      const feedback = element.querySelector("[data-location-feedback]");
      feedback.textContent = "Opening map…";
      try {
        const located = await context.navigate(record.cityId, record.regionId);
        if (contexts.get(element).snapshot.uid !== context.snapshot.uid) return;
        if (located) element.querySelector("details").open = false;
        feedback.textContent = located ? "" : "Location unavailable. Reconnect and try again.";
      } catch {
        if (contexts.get(element).snapshot.uid === context.snapshot.uid)
          feedback.textContent = "Location unavailable. Reconnect and try again.";
      } finally {
        context.pending = false;
        contexts.get(element).pending = false;
        button.disabled = false;
      }
    });
  }
  function render(element, snapshot = {}, nowMs = Date.now(), navigate) {
    if (!element) return;
    if (!contexts.has(element)) bindLocations(element);
    const previous = contexts.get(element);
    contexts.set(element, { snapshot, nowMs, navigate, renderedAt: Date.now(), pending: previous?.pending });
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
    const signature = JSON.stringify([snapshot.uid, records.map(record => [record.id, record.cityName, record.cityId, record.regionId])]);
    if (list.dataset.signature !== signature) {
      list.innerHTML = records.map(record => `<li><span>${escape(record.cityName || record.cityId)}<small>${escape(record.regionId)} · ${escape(record.cityId)}</small></span><strong data-retaliation-time="${escape(record.id)}"></strong><button class="retaliation-location" type="button" data-retaliation-location="${escape(record.id)}" aria-label="View ${escape(record.cityName || record.cityId)} on map"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg>Map</button></li>`).join("");
      list.dataset.signature = signature;
      element.querySelector("[data-location-feedback]")?.remove();
      const feedback = element.ownerDocument.createElement("p");
      feedback.dataset.locationFeedback = "";
      feedback.setAttribute("role", "status");
      list.after(feedback);
    }
    const times = list.querySelectorAll("[data-retaliation-time]");
    records.forEach((record, index) => { times[index].textContent = remaining(record.expiresAtMs, nowMs); });
    positionList(element);
  }
  function renderFeedback(container, { records, activeId, getCityRecord, nowMs }) {
    container?.querySelectorAll("[data-retaliation-city]").forEach(element => {
      const record = getCityRecord(element.dataset.retaliationCity);
      element.hidden = !record;
      if (record) element.textContent = `Retaliation Available — ${remaining(record.expiresAtMs, nowMs)} remaining to launch one attack on this city.`;
    });
    const note = container?.querySelector("[data-retaliation-note]");
    if (!note) return;
    const record = activeRecords(records, nowMs).find(entry => entry.id === activeId);
    note.textContent = record
      ? `Retaliation Available — ${remaining(record.expiresAtMs, nowMs)} remaining. One attack on this city; King Power limits are lifted for this launch.`
      : "Retaliation unavailable or expired. Reopen Attack to review normal King Power limits.";
  }
  root.CrownlandsCombatTimersUI = { remaining, activeRecords, render, renderFeedback };
  if (typeof module !== "undefined") module.exports = root.CrownlandsCombatTimersUI;
})(globalThis);
