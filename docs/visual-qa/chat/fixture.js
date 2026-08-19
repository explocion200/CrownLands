(function () {
  const nowMs = Date.now();
  const params = new URLSearchParams(window.location.search);
  const requestedAlertMode = params.get("alerts") || "none";
  const samples = {
    global: [
      { id: "global-1", channel: "global", channelId: "global", senderUid: "queen-elinor", senderDisplayName: "Queen Elinor", text: "The western roads are clear. Merchants may travel safely.", createdAtMs: nowMs - 210_000, status: "visible" },
      { id: "global-2", channel: "global", channelId: "global", senderUid: "thane-rowan", senderDisplayName: "Thane Rowan", text: "A storm gathers beyond Ironfall Hills.", createdAtMs: nowMs - 118_000, status: "visible" },
      { id: "global-3", channel: "global", channelId: "global", senderUid: "lady-maeve", senderDisplayName: "Lady Maeve", text: "Who will contest the Crown Citadel at dawn?", createdAtMs: nowMs - 34_000, status: "visible" },
    ],
    clan: [
      { id: "clan-1", channel: "clan", channelId: "qa-clan", senderUid: "marshal-alden", senderDisplayName: "Marshal Alden", text: "Rally at Graywood Hollow in five minutes.", createdAtMs: nowMs - 186_000, status: "visible" },
      { id: "clan-2", channel: "clan", channelId: "qa-clan", senderUid: "queen-elinor", senderDisplayName: "Queen Elinor", text: "Reinforcements are ready.", createdAtMs: nowMs - 62_000, status: "visible" },
    ],
  };
  const listeners = new Map();
  const subscriptionCounts = { global: 0, clan: 0 };
  const sendReceipts = new Map();
  let mockCooldownUntilMs = 0;
  let hudOccupancyEvents = 0;
  const api = {
    subscribeChatMessages(options, handlers) {
      const channel = options.channel === "clan" ? "clan" : "global";
      subscriptionCounts[channel] += 1;
      listeners.set(channel, handlers);
      window.setTimeout(() => handlers.onMessages(samples[channel], {
        initial: true,
        hasMore: false,
        changes: samples[channel].map(message => ({ type: "added", message })),
      }), 0);
      return () => listeners.delete(channel);
    },
    async loadOlderChatMessages() { return []; },
    async sendChatMessage(payload) {
      const acceptedAtMs = Date.now();
      const priorReceipt = sendReceipts.get(payload.requestId);
      if (priorReceipt) {
        return {
          ...priorReceipt,
          replayed: true,
          retryAfterMs: Math.max(0, priorReceipt.cooldownUntilMs - acceptedAtMs),
          serverNowMs: acceptedAtMs,
        };
      }
      if (acceptedAtMs < mockCooldownUntilMs) {
        const retryAfterMs = mockCooldownUntilMs - acceptedAtMs;
        const error = new Error(`Wait ${Math.max(1, Math.ceil(retryAfterMs / 1000))}s before sending again.`);
        error.code = "functions/resource-exhausted";
        error.details = { retryAfterMs, cooldownUntilMs: mockCooldownUntilMs, serverNowMs: acceptedAtMs };
        throw error;
      }
      const message = {
        id: `qa-${acceptedAtMs}`,
        channel: payload.channel,
        channelId: payload.channel === "clan" ? "qa-clan" : "global",
        senderUid: "qa-ruler",
        senderDisplayName: "QA Ruler",
        text: payload.text,
        createdAtMs: acceptedAtMs,
        status: "visible",
      };
      samples[payload.channel].push(message);
      listeners.get(payload.channel)?.onMessages(samples[payload.channel], {
        initial: false,
        hasMore: false,
        changes: [{ type: "added", message }],
      });
      mockCooldownUntilMs = acceptedAtMs + window.CrownlandsChat.CHAT_SEND_COOLDOWN_MS;
      const receipt = {
        ok: true,
        replayed: false,
        messageId: message.id,
        cooldownMs: window.CrownlandsChat.CHAT_SEND_COOLDOWN_MS,
        cooldownUntilMs: mockCooldownUntilMs,
        retryAfterMs: window.CrownlandsChat.CHAT_SEND_COOLDOWN_MS,
        serverNowMs: acceptedAtMs,
      };
      sendReceipts.set(payload.requestId, receipt);
      return receipt;
    },
  };
  const applyAlertMode = alertMode => {
    const outgoing = document.getElementById("outgoingAttackBtn");
    const incoming = document.getElementById("incomingAttackBtn");
    if (outgoing) outgoing.hidden = !["outgoing", "both"].includes(alertMode);
    if (incoming) incoming.hidden = !["incoming", "both"].includes(alertMode);
    document.body.dataset.chatQaAlerts = alertMode;
    hudOccupancyEvents += 1;
    window.dispatchEvent(new Event("crownlands:hud-occupancy-changed"));
  };
  document.addEventListener("click", event => {
    const alertControl = event.target.closest?.("[data-qa-alerts]");
    if (alertControl) applyAlertMode(alertControl.dataset.qaAlerts || "none");
    if (event.target.closest?.("[data-qa-reconstruct-hud]")) {
      const nav = document.querySelector(".bottom-nav");
      nav?.replaceWith(nav.cloneNode(true));
      applyAlertMode(document.body.dataset.chatQaAlerts || "none");
    }
    if (event.target.closest?.("[data-qa-server-cooldown]")) {
      mockCooldownUntilMs = Date.now() + 3000;
      document.body.dataset.chatQaForcedCooldownUntil = String(mockCooldownUntilMs);
    }
    const control = event.target.closest?.("#incomingAttackBtn, #outgoingAttackBtn");
    if (control) document.body.dataset.chatQaLastHudAction = control.id;
  });
  const controller = window.CrownlandsChat.init();
  controller.start({ api, uid: "qa-ruler", clanId: "qa-clan" });
  const qaControls = document.querySelector(".qa-controls");
  if (qaControls) qaControls.hidden = params.get("controls") !== "1";
  applyAlertMode(["none", "incoming", "outgoing", "both"].includes(requestedAlertMode) ? requestedAlertMode : "none");
  const mode = params.get("mode") || "closed";
  controller.setMode(["closed", "quick", "full"].includes(mode) ? mode : "closed");
  const publishDiagnostics = () => {
    const diagnostics = controller.diagnostics();
    document.body.dataset.chatQaMode = diagnostics.mode;
    document.body.dataset.chatQaListeners = String(diagnostics.totalListeners);
    document.body.dataset.chatQaGlobalSubscriptions = String(subscriptionCounts.global);
    document.body.dataset.chatQaClanSubscriptions = String(subscriptionCounts.clan);
    document.body.dataset.chatQaQuickVisible = String(diagnostics.quickPreviewVisible);
    document.body.dataset.chatQaQuickWidth = String(diagnostics.quickAvailableWidth);
    document.body.dataset.chatQaQuickMessages = String(diagnostics.quickMessageLimit);
    document.body.dataset.chatQaCollisionListeners = String(diagnostics.quickCollisionEventListeners);
    document.body.dataset.chatQaCollisionObservers = String(diagnostics.quickCollisionObservers);
    document.body.dataset.chatQaCooldownMs = String(diagnostics.cooldownRemainingMs);
    document.body.dataset.chatQaCooldownTimer = String(diagnostics.cooldownTimerActive);
    document.body.dataset.chatQaHudOccupancyEvents = String(hudOccupancyEvents);
  };
  document.addEventListener("click", () => window.setTimeout(publishDiagnostics, 0));
  document.addEventListener("keydown", () => window.setTimeout(publishDiagnostics, 0));
  window.addEventListener("crownlands:hud-occupancy-changed", () => window.setTimeout(publishDiagnostics, 0));
  if (params.get("reconstruct") === "1") {
    window.setTimeout(() => {
      const nav = document.querySelector(".bottom-nav");
      nav?.replaceWith(nav.cloneNode(true));
      applyAlertMode(document.body.dataset.chatQaAlerts || "none");
      publishDiagnostics();
    }, 50);
  }
  publishDiagnostics();
  window.CrownlandsChatVisualQa = Object.freeze({ api, controller, samples, publishDiagnostics, applyAlertMode });
})();
