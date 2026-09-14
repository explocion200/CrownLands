"use strict";
// Isolated presentation examples: no backend, audio, permission prompts, or storage.
const dialog = document.getElementById("settingsDialog");
const channelNames = {music:"Music",effects:"Effects"};
const defaults = {music:70,effects:80,musicMuted:false,effectsMuted:false,mode:"full",automatic:false,notifications:"off"};
const samples = {
  standard:{}, quiet:{musicMuted:true,effectsMuted:true,mode:"reduced"}, automatic:{mode:"reduced",automatic:true},
  enabled:{notifications:"on"}, blocked:{notifications:"blocked"}, connecting:{notifications:"connecting"},
  retry:{notifications:"retry"}, offline:{notifications:"offline"}, unsupported:{notifications:"unsupported"},
  insecure:{notifications:"insecure"}, "missing-key":{notifications:"missing-key"},
};
let settings = {...defaults};
function report(message) { window.parent.postMessage({type:"settings-review-status",message},location.origin); }
function renderAudio(channel) {
  const muted = settings[`${channel}Muted`], volume = settings[channel], name = channelNames[channel];
  document.getElementById(`${channel}Volume`).value = volume;
  document.getElementById(`${channel}Volume`).style.setProperty("--volume",`${volume}%`);
  document.getElementById(`${channel}VolumeValue`).innerHTML = `${volume}<span>%</span>`;
  document.getElementById(`${channel}Status`).textContent = muted ? `${name} muted` : volume === 0 ? "Volume at zero" : `${name} on`;
  const button = document.getElementById(`${channel}Mute`), label = `${muted ? "Unmute" : "Mute"} ${channel}`;
  button.setAttribute("aria-pressed",String(muted)); button.setAttribute("aria-label",label);
  button.querySelector(".mute-label").textContent = label;
  document.querySelector(`[data-channel="${channel}"]`).classList.toggle("muted",muted);
}
function renderMotion() {
  document.querySelectorAll("[data-mode]").forEach(button => button.setAttribute("aria-pressed",String(button.dataset.mode === settings.mode)));
  const name = settings.mode.charAt(0).toUpperCase()+settings.mode.slice(1);
  document.getElementById("animationModeStatus").textContent = `${name} animations selected${settings.automatic ? " automatically for your motion preference and performance" : ""}.`;
}
function renderNotifications() {
  const state = settings.notifications;
  const unavailable = ["connecting","offline","unsupported","insecure","missing-key"].includes(state);
  const messages = {on:"Notifications On",off:"Notifications Off",blocked:"Blocked",connecting:"Connecting…",retry:"Retry needed",offline:"Offline",unsupported:"Unavailable",insecure:"HTTPS required","missing-key":"Missing key"};
  const status = document.getElementById("pushAlertsStatus"); status.textContent = messages[state]; status.dataset.state = state;
  document.querySelectorAll("[data-notification]").forEach(button => {
    button.disabled = unavailable || (state === "blocked" && button.dataset.notification === "on");
    button.setAttribute("aria-pressed",String(button.dataset.notification === (state === "on" ? "on" : "off")));
  });
}
function reset(sample = "standard") {
  settings = {...defaults,...samples[Object.hasOwn(samples,sample) ? sample : "standard"]};
  Object.keys(channelNames).forEach(renderAudio); renderMotion(); renderNotifications();
  if (!dialog.open) dialog.showModal();
  document.getElementById("settingsBody").scrollTop = 0;
}
for (const channel of Object.keys(channelNames)) {
  document.getElementById(`${channel}Volume`).addEventListener("input",event => {
    settings[channel] = Math.max(0,Math.min(100,Math.round(Number(event.target.value)||0))); renderAudio(channel);
    report(`${channelNames[channel]} volume: ${settings[channel]}%. Preview only.`);
  });
  document.getElementById(`${channel}Mute`).addEventListener("click",() => {
    settings[`${channel}Muted`] = !settings[`${channel}Muted`]; renderAudio(channel);
    report(`${channelNames[channel]} ${settings[`${channel}Muted`] ? "muted" : "unmuted"}. Volume setting retained; no audio is played.`);
  });
}
document.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click",() => {
  settings.mode = button.dataset.mode; settings.automatic = false; renderMotion(); report(`${button.textContent} animations selected in the draft.`);
}));
document.querySelectorAll("[data-notification]").forEach(button => button.addEventListener("click",() => {
  if (button.disabled) return;
  if (settings.notifications !== "blocked") settings.notifications = button.dataset.notification;
  renderNotifications(); report(settings.notifications === "blocked" ? "Notifications remain blocked by the browser in this example." : `Notifications ${settings.notifications} in the draft. No browser permission was requested.`);
}));
document.getElementById("helpBtn").addEventListener("click",() => report("First steps & help opens the existing guidance in the game. This Settings draft preserves that action without changing your guidance preferences."));
document.querySelectorAll("[data-section]").forEach(button => button.addEventListener("click",() => report(button.dataset.section === "Settings" ? "You are viewing the Settings draft." : `${button.dataset.section} navigation is preserved. This draft focuses on Settings.`)));
document.getElementById("close").addEventListener("click",() => dialog.close());
dialog.addEventListener("close",() => {document.getElementById("reopen").focus();report("Settings closed. Open Settings to return to your draft choices.");});
document.getElementById("reopen").addEventListener("click",() => dialog.showModal());
window.addEventListener("message",event => {if(event.origin === location.origin && event.source === window.parent && event.data?.type === "settings-review") reset(event.data.sample);});
reset(new URLSearchParams(location.search).get("sample") || "standard");
