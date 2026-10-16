"use strict";
(() => {
  if (location.hostname !== "127.0.0.1" || !window.__CROWNLANDS_BENCHMARK__ || !window.CrownlandsOnline?.__getBenchmarkTelemetry) throw Error("Isolated chat fixture required");
  const button=document.getElementById("chatToggleBtn"),root=document.documentElement;
  // Preserve the historical comparison after the approved art enters production.
  button.classList.remove("hud-image-button");
  button.querySelectorAll(".chat-toggle-image").forEach(image=>image.remove());
  if (!button.querySelector(".chat-toggle-chevron")) button.insertAdjacentHTML("afterbegin",'<svg class="cl-icon chat-toggle-chevron" aria-hidden="true"><use href="#cl-icon-back"></use></svg>');
  for (const direction of ["left","right"]) {
    const image=document.createElement("img");image.className="chat-image-draft chat-image-"+direction;
    image.src="/docs/visual-qa/chat-toggle-image-draft/images/chat-"+direction+"-r2.png";
    image.alt="";image.setAttribute("aria-hidden","true");image.draggable=false;button.append(image);
  }
  function apply({look="draft",open=false,unread=false}={}) {
    root.classList.toggle("chat-button-draft",look==="draft");
    root.dataset.chatDraftUnread=String(unread);
    window.CrownlandsChat.init().setMode(open?"quick":"closed");
  }
  const state=()=>parent.postMessage({type:"chat-image-state",open:button.getAttribute("aria-expanded")==="true"},location.origin);
  new MutationObserver(state).observe(button,{attributes:true,attributeFilter:["aria-expanded"]});
  window.__CROWNLANDS_BENCHMARK__.closeModal();pendingOfflineRewardsSummary=null;toast.classList.remove("visible");
  window.ChatImageDraft={apply};
})();
