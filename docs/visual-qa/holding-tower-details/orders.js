/* Adapter for the existing city-order prototype; all state remains synthetic. */
(function initializePersonalTowerOrder() {
  "use strict";
  let order = null, selectedDestination = 0;
  const destinations = {
    attack: [
      {name: "Stonebridge Castle", map: "Ironwatch", level: 82, art: art.castle, label: "Enemy city"},
      {name: "Ashenfield", map: "Roseguard", level: 44, art: art.keep, label: "Enemy city"}
    ],
    transfer: [
      {name: "Aurum Watch", map: "Stoneward", level: 64, art: art.keep, label: "Your city", troops: 185000},
      {name: "Greenrook", map: "Lionwatch", level: 52, art: art.castle, label: "Your city", troops: 94000}
    ]
  };
  function renderPersonalOrder(selectedAmount) {
    const target = destinations[order.kind][selectedDestination];
    samples["tower-personal"] = {
      kind: order.kind, from: order.tower.name, fromMap: order.tower.map, fromArt: order.tower.art, fromLevel: null,
      to: target.name, toMap: target.map, toArt: target.art, toLevel: target.level, targetLabel: target.label,
      troops: order.own, amount: Math.min(order.own, Math.max(1, selectedAmount)),
      targetTroops: target.troops || 0, swift: 0,
      forecast: "unknown", seconds: selectedDestination ? 615 : 492, bonus: 20, swordmastery: 40, weaponLevel: 4
    };
    setSample("tower-personal");
    document.body.dataset.towerReady = "true";
    document.getElementById("reportTitle").textContent = order.kind === "attack" ? "Attack" : "Move troops";
    document.getElementById("orderKind").textContent = "Individual order";
    document.getElementById("headingArt").src = order.kind === "attack" ? "assets/icons/troop-orders/crossed-swords.svg" : "assets/icons/troop-orders/marching-banner.svg";
    document.getElementById("cancelOrder").textContent = "Back";
    document.getElementById("confirmOrder").textContent = order.kind === "attack" ? "Attack" : "Move";
    document.getElementById("actionNotice").textContent = "Only your stationed troops will leave the Clan Tower.";
    const origin = body.querySelector(".order-location:not(.destination)");
    origin.querySelector(".location-label").textContent = "From · Clan Tower";
    origin.querySelector(".location-meta").insertAdjacentHTML("beforeend", `<span class="location-level">Wall ${num(order.tower.wall)}</span>`);
    origin.querySelector(".location-copy p").textContent = `${order.tower.map} · ${order.viewer}`;
    const destinationTitle = body.querySelector(".destination h2");
    destinationTitle.outerHTML = `<select class="tower-destination" id="towerDestination" aria-label="${order.kind === "attack" ? "Attack target" : "Move destination"}">${destinations[order.kind].map((city, i) => `<option value="${i}" ${i === selectedDestination ? "selected" : ""}>${escape(city.name)}</option>`).join("")}</select>`;
    document.getElementById("towerDestination").addEventListener("change", event => {selectedDestination = Number(event.target.value); renderPersonalOrder(amount);});
    if (order.kind === "transfer") {
      // The Tower order endpoint has no Swift March consumable selection.
      body.querySelector(".transfer-options").outerHTML = `<section class="transfer-card" aria-label="Your command"><p class="transfer-card-title"><img src="assets/icons/troop-orders/marching-banner.svg" alt="">Your command</p><div class="transfer-swift-control"><div><strong>${escape(order.viewer)}</strong><small>Personal transfer. Other players keep control of their troops.</small></div></div></section>`;
    }
    body.querySelector(".force-column").insertAdjacentHTML("beforeend", `<p class="personal-order-note">${escape(order.viewer)} · Only your ${num(order.own)} troops are available. Other players' troops remain under their control.</p>`);
    // Keep the approved city slider, dynamic own-army breakdown and movement summary.
    // The target is deliberately unscouted: do not invent a predicted battle result.
    announce(`${order.kind === "attack" ? "Attack" : "Move"} preview · ${num(order.own)} personally stationed troops available. Destination and route are fictional examples.`);
  }
  window.addEventListener("message", event => {
    if (event.origin !== location.origin || event.source !== parent || event.data?.type !== "tower-personal-order") return;
    const data = event.data;
    if (!["attack", "transfer"].includes(data.kind) || !Number.isSafeInteger(data.own) || data.own < 1 || !data.tower) return;
    order = data; selectedDestination = 0;
    renderPersonalOrder(Math.max(1, Math.floor(order.own / 2)));
  });
  dialog.addEventListener("close", () => parent.postMessage({type: "tower-order-close"}, location.origin));
  parent.postMessage({type: "tower-order-ready"}, location.origin);
})();
