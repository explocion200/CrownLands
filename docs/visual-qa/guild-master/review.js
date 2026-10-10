"use strict";
// Presentation-only artwork review. No API calls, economy or game persistence.
const rooms = {
  contracts: ["The contract board", "Choose work that suits the people in your guild: merchant escorts, village recruitment, quarry surveys, supply recovery and investigations.", "Noticeboard, dispatches and client correspondence."],
  planning: ["The planning table", "Choose a party and leader, weigh routes and provisions, and see how each decision affects the forecast before departure.", "A map table for preparation and saved parties."],
  infirmary: ["The infirmary", "Members begin resting when their mission finishes. Everyone recovers; viewing reports and claiming rewards do not control treatment.", "Linen cots, herbs and daylight."],
  training: ["The training area", "Develop specialties and arrange veteran mentoring. Personal ambitions give each member a story beyond their next level.", "Practice weapons, targets and room to learn."],
  archive: ["The archive", "Keep mission reports, member histories and discoveries. Reports explain outcomes without requiring attendance during a mission.", "Records, books and a quiet reading table."],
};
document.querySelector("#room-tabs").addEventListener("click", event => {
  const button = event.target.closest("[data-room]");
  if (!button || !rooms[button.dataset.room]) return;
  const [title, copy, status] = rooms[button.dataset.room];
  document.querySelectorAll("[data-room]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
  const image = document.querySelector(".hall-art img");
  image.src = `../../../assets/guild-master/room-${button.dataset.room}.webp`;
  image.alt = title + ". " + status;
  document.querySelector("#hall-title").textContent = title;
  document.querySelector("#room-copy").textContent = copy;
  document.querySelector(".room-status").textContent = status;
});
