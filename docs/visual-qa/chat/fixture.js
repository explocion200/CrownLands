(function () {
  const nowMs = Date.now();
  const params = new URLSearchParams(window.location.search);
  const requestedAlertMode = params.get("alerts") || "none";
  const requestedTerrain = params.get("terrain") || "bright";
  document.body.dataset.chatQaTerrain = ["bright", "dark", "detail"].includes(requestedTerrain)
    ? requestedTerrain
    : "bright";
  if (params.get("entry") === "fresh") {
    const label = document.querySelector(".qa-label");
    if (label) label.textContent = "Fresh game entry · default Quick active";
  }
  const samples = {
    global: [
      { id: "global-1", channel: "global", channelId: "global", senderUid: "ricky", senderDisplayName: "Ricky", text: "Anyone attacking the northern fortress?", createdAtMs: nowMs - 312_000, status: "visible" },
      { id: "global-2", channel: "global", channelId: "global", senderUid: "arthur", senderDisplayName: "Arthur", text: "I can reinforce from Graywood Hollow.", createdAtMs: nowMs - 251_000, status: "visible" },
      { id: "global-3", channel: "global", channelId: "global", senderUid: "henry", senderDisplayName: "Henry", text: "Citadel rally is ready.", createdAtMs: nowMs - 194_000, status: "visible" },
      { id: "global-4", channel: "global", channelId: "global", senderUid: "queen-elinor", senderDisplayName: "Queen Elinor", text: "The western roads are clear.", createdAtMs: nowMs - 136_000, status: "visible" },
      { id: "global-5", channel: "global", channelId: "global", senderUid: "thane-rowan", senderDisplayName: "Thane Rowan", text: "Sending 1,200 troops now.", createdAtMs: nowMs - 78_000, status: "visible" },
      { id: "global-6", channel: "global", channelId: "global", senderUid: "alexandria-vale", senderDisplayName: "Alexandria Vale", text: "I'm sending troops toward the northern fortress once the current march returns, then I can hold the eastern road until reinforcements arrive.", createdAtMs: nowMs - 24_000, status: "visible" },
    ],
    clan: [
      { id: "clan-1", channel: "clan", channelId: "qa-clan", senderUid: "marshal-alden", senderDisplayName: "Marshal Alden", text: "Rally at Graywood Hollow in five minutes.", createdAtMs: nowMs - 232_000, status: "visible" },
      { id: "clan-2", channel: "clan", channelId: "qa-clan", senderUid: "queen-elinor", senderDisplayName: "Queen Elinor", text: "Reinforcements are ready.", createdAtMs: nowMs - 166_000, status: "visible" },
      { id: "clan-3", channel: "clan", channelId: "qa-clan", senderUid: "thane-rowan", senderDisplayName: "Thane Rowan", text: "Scouts report the eastern road is open.", createdAtMs: nowMs - 98_000, status: "visible" },
      { id: "clan-4", channel: "clan", channelId: "qa-clan", senderUid: "lady-maeve", senderDisplayName: "Lady Maeve", text: "Move on my signal.", createdAtMs: nowMs - 31_000, status: "visible" },
    ],
  };
  const requestedMessageCount = Math.floor(Number(params.get("messages")));
  if ([1, 2, 3].includes(requestedMessageCount)) {
    samples.global = samples.global.slice(0, requestedMessageCount);
  }
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
    if (event.target.closest?.("[data-qa-map-change]")) simulateMapChange();
    if (event.target.closest?.("[data-qa-reconnect]")) simulateReconnect();
    if (event.target.closest?.("[data-qa-new-session]")) simulateNewSession();
    if (event.target.closest?.("[data-qa-unrelated-modal]")) {
      document.getElementById("qaUnrelatedModal")?.showModal();
    }
    if (event.target.closest?.("[data-qa-close-unrelated]")) {
      document.getElementById("qaUnrelatedModal")?.close();
    }
    if (event.target.closest?.("[data-qa-server-cooldown]")) {
      mockCooldownUntilMs = Date.now() + 3000;
      document.body.dataset.chatQaForcedCooldownUntil = String(mockCooldownUntilMs);
    }
    const control = event.target.closest?.("#incomingAttackBtn, #outgoingAttackBtn");
    if (control) document.body.dataset.chatQaLastHudAction = control.id;
  });
  window.addEventListener("crownlands:chat-player-profile", event => {
    document.body.dataset.chatQaProfileUid = String(event.detail?.uid || "");
  });
  const controller = window.CrownlandsChat.init();
  controller.start({ api, uid: "qa-ruler", clanId: "qa-clan" });
  if (params.get("rapid") === "1") {
    ["Ricky", "Arthur", "Henry"].forEach((senderDisplayName, index) => {
      window.setTimeout(() => {
        const message = {
          id: `rapid-${index + 1}`,
          channel: "global",
          channelId: "global",
          senderUid: `rapid-${index + 1}`,
          senderDisplayName,
          text: `Rapid field update ${index + 1}.`,
          createdAtMs: nowMs + index + 1,
          status: "visible",
        };
        samples.global.push(message);
        listeners.get("global")?.onMessages(samples.global, {
          initial: false,
          hasMore: false,
          changes: [{ type: "added", message }],
        });
      }, 120 + index * 30);
    });
  }
  const qaControls = document.querySelector(".qa-controls");
  if (qaControls) qaControls.hidden = params.get("controls") !== "1";
  applyAlertMode(["none", "incoming", "outgoing", "both"].includes(requestedAlertMode) ? requestedAlertMode : "none");
  if (params.has("mode")) {
    const mode = params.get("mode");
    controller.setMode(["closed", "quick", "full"].includes(mode) ? mode : "closed");
  }
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
    document.body.dataset.chatQaSessionStarted = String(diagnostics.sessionStarted);
    document.body.dataset.chatQaSessionUid = diagnostics.sessionUid;
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
  const simulateMapChange = () => {
    controller.start({ api, uid: "qa-ruler", clanId: "qa-clan" });
    window.dispatchEvent(new Event("crownlands:ui-layout-applied"));
    publishDiagnostics();
  };
  const simulateReconnect = () => {
    controller.dispose();
    controller.start({ api, uid: "qa-ruler", clanId: "qa-clan" });
    publishDiagnostics();
  };
  const simulateNewSession = () => {
    controller.dispose({ resetSession: true });
    controller.start({ api, uid: "qa-ruler", clanId: "qa-clan" });
    publishDiagnostics();
  };
  window.CrownlandsChatVisualQa = Object.freeze({
    api,
    controller,
    samples,
    publishDiagnostics,
    applyAlertMode,
    simulateMapChange,
    simulateReconnect,
    simulateNewSession,
  });
})();
