"use strict";
const controls = Object.fromEntries(["relationship", "mission", "direction", "motion"].map(id => [id, document.getElementById(id)]));
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const hosts = [...document.querySelectorAll(".motion-host")];
function updateMotion() {
  hosts.forEach(host => { host.dataset.motion = controls.motion.checked && !document.hidden && !reduced.matches && host.dataset.visible === "true" ? "on" : "off"; });
  document.getElementById("motion-status").textContent = reduced.matches ? "Still preview · system reduced motion enabled" : controls.motion.checked ? "Walking poses and sample route playing" : "Animation paused";
}
function updatePreview() {
  document.body.dataset.relationship = controls.relationship.value;
  document.body.dataset.direction = controls.direction.value;
  const icon = document.querySelector(".mission-icon"), transfer = controls.mission.value === "transfer";
  icon.src = "../../../assets/icons/troop-orders/" + (transfer ? "marching-banner.svg" : "crossed-swords.svg");
  icon.alt = transfer ? "Transfer" : "Attack";
  // Sample exact counts appear only for your troops; this does not expose game data.
  document.querySelector(".troop-count").hidden = controls.relationship.value !== "player";
  document.getElementById("route-caption").textContent = controls.direction.value === "return" ? "Returning · Wyvernhollow → Thornford" : "Outbound · Thornford → Wyvernhollow";
  updateMotion();
}
const observer = new IntersectionObserver(entries => { entries.forEach(entry => { entry.target.dataset.visible = String(entry.isIntersecting); }); updateMotion(); });
hosts.forEach(host => observer.observe(host));
Object.values(controls).forEach(control => control.addEventListener("input", updatePreview));
document.addEventListener("visibilitychange", updateMotion);
reduced.addEventListener("change", updateMotion);
updatePreview();
Promise.all([...document.images].map(img => img.decode())).then(() => { document.documentElement.dataset.previewReady = "true"; }).catch(() => { document.documentElement.dataset.previewReady = "error"; document.getElementById("motion-status").textContent = "Preview artwork could not be loaded."; });
