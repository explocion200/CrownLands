(function (root) {
  "use strict";
  const doc = root.document;
  let api, flagRenderer, pendingNotificationId = "", uid = "", generation = 0, ready = false, stopSignals, section = "", kind = "friends";
  let panel, list, thread, status, friendsTab, messagesTab, badge, listPage, listCursor = null, cursorStack = [];
  let current = null, history = [], older = null, before = null, viewVersion = 0, listVersion = 0;
  let conversationSession = 0;
  let presenceTimer, expiryTimer, refreshTimer, senderBusy = false, pendingDraft, lastSignals = {}, offset = 0, privateAlerts = false, privateReady = false;
  const dialog = () => doc.getElementById("chatDialog");
  const now = () => Date.now() + offset;
  const element = (tag, text, className) => { const node = doc.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; };
  const button = (label, action, className) => { const node = element("button", label, className); node.type = "button"; node.addEventListener("click", action); return node; };
  const visible = () => ready && section && dialog()?.open && !doc.hidden;
  const setStatus = text => { if (status) status.textContent = text || ""; };
  async function call(data) {
    const scope = generation, result = await api.social(data);
    if (scope !== generation || !uid) throw Object.assign(Error("Account changed."), { stale: true });
    if (result.serverNowMs) offset = result.serverNowMs - Date.now();
    return result;
  }
  async function run(task, control) {
    if (control?.disabled) return;
    if (control) control.disabled = true;
    const scope = generation;
    try { setStatus(""); return await task(); }
    catch (error) { if (scope === generation && !error.stale) setStatus(error.message || "Please try again."); }
    finally { if (scope === generation && control?.isConnected) control.disabled = false; }
  }
  function actionButton(label, payload, afterward) {
    let requestId = root.crypto.randomUUID();
    const node = button(label, () => run(async () => {
      await call({ ...payload, requestId }); requestId = root.crypto.randomUUID();
      await afterward?.(); await refreshList(); await refreshBadge();
    }, node)); return node;
  }
  function playerLabel(player) {
    const wrap = element("span", null, "social-player"), flag = element("span", null, "kingdom-flag social-flag");
    flag.setAttribute("aria-hidden", "true"); flag.append(element("span", null, "flag-symbol"));
    wrap.append(flag, element("strong", player.name || "Ruler"));
    if (player.clanTag) wrap.append(element("small", "[" + player.clanTag + "]"));
    flagRenderer?.render?.(flag, player.flag, { stableKey: player.uid, context: "social" });
    return wrap;
  }
  function init() {
    if (panel || !dialog()) return;
    friendsTab = button("Friends", () => open("friends")); friendsTab.id = "socialFriendsTab";
    messagesTab = button("Messages", () => open("messages")); messagesTab.id = "socialMessagesTab";
    for (const node of [friendsTab, messagesTab]) { node.hidden = true; node.setAttribute("role", "tab"); node.setAttribute("aria-controls", "socialPanel"); node.setAttribute("aria-selected", "false"); node.tabIndex = -1; }
    const tabs = dialog().querySelector(".chat-tabs"); tabs.append(messagesTab, friendsTab);
    tabs.addEventListener("click", event => { if (event.target.closest("[data-chat-channel]")) leave(); });
    tabs.addEventListener("keydown", event => {
      if (!ready || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const buttons = [...tabs.querySelectorAll('[role="tab"]')].filter(node => !node.hidden);
      const index = buttons.indexOf(doc.activeElement); if (index < 0) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].click(); buttons[next].focus();
    }, true);
    panel = element("section", null, "social-panel"); panel.id = "socialPanel"; panel.hidden = true; panel.setAttribute("role", "tabpanel");
    const toolbar = element("div", null, "social-toolbar"); toolbar.id = "socialToolbar";
    const workspace = element("div", null, "social-workspace");
    list = element("div", null, "social-list"); list.setAttribute("aria-label", "Friends and conversations");
    thread = element("section", null, "social-thread"); thread.hidden = true;
    workspace.append(list, thread); status = element("p", "", "social-status"); status.setAttribute("role", "status");
    panel.append(toolbar, workspace, status); dialog().querySelector(".chat-card").append(panel);
    badge = element("span", "", "social-hud-unread"); badge.hidden = true; doc.getElementById("chatToggleBtn")?.append(badge);
    new MutationObserver(() => { if (!dialog().open) { clearTimeout(presenceTimer); clearTimeout(expiryTimer); } else if (visible()) { void run(refreshList); if (current) void run(() => loadHistory()); } }).observe(dialog(), { attributes: true, attributeFilter: ["open"] });
    doc.addEventListener("visibilitychange", () => { if (visible()) { void run(refreshBadge); void run(refreshList); if (current) void run(() => loadHistory()); } });

  }
  function leave() {
    section = ""; viewVersion++; listVersion++; clearTimeout(presenceTimer); clearTimeout(expiryTimer);
    dialog()?.classList.remove("social-active", "social-thread-open"); if (panel) panel.hidden = true;
    for (const tab of [friendsTab, messagesTab]) if (tab) { tab.setAttribute("aria-selected", "false"); tab.tabIndex = -1; tab.classList.remove("active"); }
  }
  function open(next) {
    if (!ready) return;
    init(); section = next; kind = next === "friends" ? "friends" : "conversations";
    current = null; history = []; before = null; viewVersion++; listCursor = null; cursorStack = [];
    thread.hidden = true; thread.replaceChildren(); dialog().classList.remove("social-thread-open");
    if (!dialog().open) doc.getElementById("openChatLedger")?.click();
    if (!dialog().open) dialog().showModal();
    dialog().classList.add("social-active"); panel.hidden = false;
    for (const tab of dialog().querySelectorAll('[role="tab"]')) { const selected = tab === (next === "friends" ? friendsTab : messagesTab); tab.classList.toggle("active", selected); tab.setAttribute("aria-selected", String(selected)); tab.tabIndex = selected ? 0 : -1; }
    panel.setAttribute("aria-labelledby", next === "friends" ? friendsTab.id : messagesTab.id);
    renderToolbar(); void run(refreshList);
  }
  function renderToolbar() {
    const toolbar = doc.getElementById("socialToolbar"); toolbar.replaceChildren();
    const choices = section === "friends" ? [["friends", "Friends"], ["friendRequests", "Requests"], ["blocked", "Blocked"]] : [["conversations", "Conversations"], ["messageRequests", "Requests"]];
    for (const [value, label] of choices) {
      const control = button(label, () => { kind = value; listCursor = null; cursorStack = []; renderToolbar(); void run(refreshList); });
      control.setAttribute("aria-pressed", String(kind === value)); toolbar.append(control);
    }
    if (section === "messages") {
      const enableHere = privateAlerts && !privateReady;
      const control = button(enableHere ? "Enable private alerts here" : privateAlerts ? "Private alerts: On" : "Private alerts: Off", () => run(async () => {
        const scope = generation, enable = !privateAlerts || enableHere;
        if (enable) {
          if (api.getNotificationPermission?.() === "default" && doc.fullscreenElement && doc.exitFullscreen) await doc.exitFullscreen();
          const registration = await api.enablePushNotifications({ category: "private" });
          if (scope !== generation) throw Object.assign(Error("Account changed."), { stale: true });
          if (!registration.enabled) throw Error("Allow browser notifications to enable private alerts.");
          privateReady = true;
        }
        const result = await call({ action: "preference", enabled: enable }); privateAlerts = result.privateAlerts;
        if (!privateAlerts) { await api.disablePushNotifications({ category: "private" }); privateReady = false; }
        renderToolbar();
      }, control)); toolbar.append(control);
      if (enableHere) {
        const off = button("Turn private alerts off", () => run(async () => {
          await call({ action: "preference", enabled: false }); privateAlerts = false;
          await api.disablePushNotifications({ category: "private" }); privateReady = false; renderToolbar();
        }, off)); toolbar.append(off);
      }
    }
  }
  async function restorePrivateRegistration() {
    const scope = generation;
    privateReady = false;
    if (privateAlerts && api.getNotificationPermission?.() === "granted") {
      try { const result = await api.registerPushNotifications({ category: "private" }); if (scope === generation) privateReady = result.enabled === true; }
      catch { /* The Messages switch offers an explicit registration retry. */ }
    }
    if (scope === generation && visible()) renderToolbar();
  }

  async function refreshBadge() {
    if (!ready) return; const result = await call({ action: "unread" });
    const label = result.count ? String(result.count) + (result.more ? "+" : "") : "";
    messagesTab.textContent = "Messages" + (label ? " (" + label + ")" : "");
    badge.textContent = label; badge.hidden = !label; badge.setAttribute("aria-label", label + " unread private conversations");
  }
  async function refreshList() {
    if (!visible()) return;
    const version = ++listVersion, selectedKind = kind;
    const result = await call({ action: "list", kind, cursor: listCursor });
    if (version !== listVersion || selectedKind !== kind || !visible()) return;
    listPage = result; list.replaceChildren();
    if (!result.rows.length) list.append(element("p", kind === "friends" ? "Add friends from player profiles in chat, clans, the map, or leaderboards." : "Nothing here yet.", "social-empty"));
    for (const row of result.rows) {
      if (kind === "conversations" || kind === "messageRequests") {
        const contact = button("", () => run(() => openConversation({ id: row.id, peerUid: row.peerUid })), "social-contact social-conversation");
        const meta = element("span", null, "social-contact-meta");
        meta.append(element("small", kind === "messageRequests" ? row.from === uid ? "Awaiting acceptance" : "Message request" : row.lastMessageAtMs ? new Date(row.lastMessageAtMs).toLocaleDateString() : "Start a conversation"));
        if (row.unread) meta.append(element("span", "Unread", "social-unread"));
        contact.append(playerLabel(row.player), meta); list.append(contact);
        continue;
      }
      const article = element("article", null, "social-contact"), title = button("", () => root.dispatchEvent(new CustomEvent("crownlands:chat-player-profile", { detail: { uid: row.peerUid } })));
      title.className = "social-name"; title.append(playerLabel(row.player)); article.append(title);
      if (row.unread) article.append(element("span", "Unread", "social-unread"));
      const actions = element("div", null, "social-row-actions");
      if (kind === "friends") {
        const presence = element("small", "Checking status…", "social-presence"); presence.dataset.presenceUid = row.peerUid; article.append(presence);
        actions.append(button("Message", () => run(() => openConversation({ id: row.id, peerUid: row.peerUid }))), actionButton("Remove friend", { action: "friend", peerUid: row.peerUid, choice: "remove" }));
      } else if (kind === "blocked") actions.append(actionButton("Unblock", { action: "block", peerUid: row.peerUid, enabled: false }));
      else if (kind === "friendRequests") {
        article.append(element("small", row.friend === "incoming" ? "Wants to be your friend" : "Request sent"));
        if (row.friend === "incoming") actions.append(actionButton("Accept", { action: "friend", peerUid: row.peerUid, choice: "accept" }), actionButton("Decline", { action: "friend", peerUid: row.peerUid, choice: "decline" }));
        else actions.append(actionButton("Cancel request", { action: "friend", peerUid: row.peerUid, choice: "cancel" }));
      }
      article.append(actions); list.append(article);
    }
    const pages = element("div", null, "social-row-actions");
    if (cursorStack.length) pages.append(button("Previous", () => { listCursor = cursorStack.pop(); void run(refreshList); }));
    if (result.next) pages.append(button("More", () => { cursorStack.push(listCursor); listCursor = result.next; void run(refreshList); }));
    list.append(pages);
    if (kind === "friends") await refreshPresence();
  }
  async function refreshPresence() {
    clearTimeout(presenceTimer);
    if (!visible() || kind !== "friends" || !listPage?.rows.length) return;
    const version = listVersion, result = await call({ action: "presence", uids: listPage.rows.map(row => row.peerUid) });
    if (version !== listVersion || !visible()) return;
    for (const node of list.querySelectorAll("[data-presence-uid]")) {
      const player = result.players.find(item => item.uid === node.dataset.presenceUid);
      node.textContent = player?.online && player.expiresAtMs > now() ? "Online" : "Offline"; node.classList.toggle("is-online", node.textContent === "Online");
    }
    presenceTimer = setTimeout(() => void run(refreshPresence), 30000);
  }
  async function openConversation(target) {
    if (!ready) return;
    if (!section || section !== "messages") open("messages");
    const modal = doc.getElementById("modal"); if (modal?.open && modal.classList.contains("public-player-profile-modal")) modal.close();
    conversationSession++; current = { ...target }; history = []; before = null; pendingDraft = null; viewVersion++;
    thread.hidden = false; dialog().classList.add("social-thread-open"); thread.replaceChildren(element("p", "Loading private conversation…"));
    await loadHistory();
  }
  async function loadHistory() {
    if (!visible() || !current) return;
    const target = current, version = ++viewVersion;
    const result = await call({ action: "history", conversationId: target.id, peerUid: target.peerUid, ...(before ? { beforeSeq: before } : {}) });
    if (version !== viewVersion || current !== target || !visible()) return;
    current = { ...target, id: result.relation.id, peerUid: result.player.uid, relation: result.relation, player: result.player };
    history = result.messages; older = result.next; renderThread();
  }
  function renderThread() {
    if (!current || !visible()) return;
    clearTimeout(expiryTimer);
    const oldLog = thread.querySelector(".social-log"), draft = thread.querySelector("textarea")?.value || "";
    const nearBottom = !oldLog || oldLog.scrollHeight - oldLog.scrollTop - oldLog.clientHeight < 48;
    const previousTop = oldLog?.scrollTop || 0;
    const oldInput = thread.querySelector("textarea"), focused = doc.activeElement === oldInput, selection = [oldInput?.selectionStart || 0, oldInput?.selectionEnd || 0];
    history = history.filter(message => message.expiresAtMs > now());
    thread.replaceChildren();
    const heading = element("header", null, "social-thread-heading");
    heading.append(button("Back", () => { viewVersion++; current = null; history = []; thread.replaceChildren(); thread.hidden = true; dialog().classList.remove("social-thread-open"); }), playerLabel(current.player));
    const block = actionButton(current.relation.blocked ? "Unblock" : "Block", { action: "block", peerUid: current.peerUid, enabled: !current.relation.blocked }, loadHistory);
    heading.append(block); thread.append(heading);
    const relationship = current.relation;
    if (relationship.conversation === "incoming") {
      const actions = element("div", null, "social-row-actions");
      actions.append(element("span", "Accept this message request?"), actionButton("Accept", { action: "conversation", conversationId: current.id, choice: "accept" }, loadHistory), actionButton("Decline", { action: "conversation", conversationId: current.id, choice: "decline" }, loadHistory)); thread.append(actions);
    }
    const log = element("div", null, "social-log"); log.setAttribute("role", "log"); log.setAttribute("aria-label", "Private messages"); log.tabIndex = 0;
    const navigation = element("div", null, "social-row-actions social-history-nav");
    if (older) navigation.append(button("Older messages", () => { before = older; void run(loadHistory); }));
    const latest = button(before ? "Latest messages" : "New messages ↓", () => { before = null; if (oldLog && !before) log.scrollTop = log.scrollHeight; void run(loadHistory); }); latest.hidden = !before && nearBottom; latest.id = "socialLatest"; navigation.append(latest);
    thread.append(navigation);
    if (!history.length) log.append(element("p", "No messages in the past 90 days.", "social-empty"));
    for (const message of history) {
      const row = element("article", null, "social-message" + (message.senderUid === uid ? " is-own" : "")); row.dataset.messageId = message.id;
      const sender = element("div", null, "social-message-sender"), sentAt = new Date(message.createdAtMs);
      const time = element("time", sentAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
      time.dateTime = sentAt.toISOString(); time.title = sentAt.toLocaleString(); time.setAttribute("aria-label", time.title);
      sender.append(element("strong", message.senderDisplayName), time); row.append(sender);
      const text = element("p", message.text); text.dir = "auto";
      const tools = element("div", null, "social-row-actions");
      const translate = button("Translate", () => run(async () => {
        if (translate.dataset.translated) { text.textContent = message.text; translate.textContent = "Translate"; delete translate.dataset.translated; attribution.hidden = true; return; }
        const scope = generation, version = viewVersion, id = current.id;
        const language = String(root.navigator.language || "en").split("-")[0];
        const result = await api.translateChatMessages({ channel: "private", conversationId: id, messageIds: [message.id], targetLanguage: language, operation: "translate" });
        if (scope !== generation || version !== viewVersion || !row.isConnected) return;
        const translated = result.translations?.find(item => item.id === message.id) || result.messages?.find(item => item.id === message.id);
        if (!translated?.text) throw Error("Translation unavailable. Please retry.");
        text.textContent = translated.text; translate.textContent = "Show original"; translate.dataset.translated = "true"; attribution.hidden = false;
      }, translate)); translate.title = "Sends this message text to Google Translation when clicked.";
      tools.append(translate);
      if (message.senderUid !== uid) tools.append(button("Report", () => reportMessage(row, message)));
      tools.append(element("small", "Translate sends only this message to Google Translation.", "social-translation-note"));
      const menu = element("details", null, "social-message-menu"), summary = element("summary", "⋯"); summary.setAttribute("aria-label", "Message actions"); menu.append(summary, tools);
      const attribution = element("small", "Translated by Google"); attribution.hidden = true; row.append(text, menu, attribution); log.append(row);
    }
    thread.append(log);
    const form = element("form", null, "social-compose"), input = element("textarea"), send = element("button", "Send");
    input.setAttribute("aria-label", "Private message"); input.maxLength = 1000; input.rows = 2; input.value = draft; input.placeholder = relationship.canSend ? "Write a private message…" : "Send one message request…";
    input.disabled = senderBusy || relationship.unavailable || ["incoming", "outgoing"].includes(relationship.conversation);
    send.type = "submit"; send.disabled = input.disabled;
    const note = element("small", relationship.unavailable ? "Private contact is blocked." : relationship.conversation === "outgoing" ? "Waiting for this player to accept your request." : "90-day history · 1,000 characters · 3s between sends.", "social-thread-note");
    form.hidden = relationship.unavailable || ["incoming", "outgoing"].includes(relationship.conversation);
    form.append(input, send); thread.append(form, note);
    const submit = event => { event.preventDefault(); if (senderBusy || input.disabled || !input.value.trim()) return; const target = current, text = input.value, session = conversationSession, scope = generation;
      if (!pendingDraft || pendingDraft.id !== target.id || pendingDraft.text !== text) pendingDraft = { id: target.id, text, requestId: root.crypto.randomUUID() };
      senderBusy = true; input.disabled = true; send.disabled = true;
      void run(async () => { await call({ action: "send", conversationId: target.id, peerUid: target.peerUid, text, requestId: pendingDraft.requestId });
        if (session === conversationSession && scope === generation) { input.value = ""; pendingDraft = null; before = null; await loadHistory(); } await refreshList();
      }).finally(() => { if (scope !== generation) return; senderBusy = false; if (input.isConnected) { input.disabled = false; send.disabled = false; } else if (current?.id === target.id && visible()) renderThread(); });
    };
    form.addEventListener("submit", submit); input.addEventListener("keydown", event => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) submit(event); });
    if (nearBottom && !before) log.scrollTop = log.scrollHeight; else log.scrollTop = previousTop;
    const mark = () => { if (!visible() || before || log.scrollHeight - log.scrollTop - log.clientHeight >= 48 || !history.length) return; latest.hidden = true; void run(() => call({ action: "read", conversationId: current.id, throughSeq: history.at(-1).sequence })); };
    log.addEventListener("scroll", mark, { passive: true }); mark();
    if (focused && !input.disabled) { input.focus({ preventScroll: true }); input.setSelectionRange(...selection); }
    if (history.length) expiryTimer = setTimeout(renderThread, Math.max(1, Math.min(2147483647, Math.min(...history.map(item => item.expiresAtMs)) - now() + 1)));
  }
  function reportMessage(row, message) {
    if (row.querySelector(".social-report")) return;
    const controls = element("div", null, "social-report"), reason = element("select"); reason.setAttribute("aria-label", "Report reason");
    for (const value of ["harassment", "spam", "threat", "other"]) { const option = element("option", value); option.value = value; reason.append(option); }
    const send = button("Submit report", () => run(async () => {
      await call({ action: "report", conversationId: current.id, messageId: message.id, reason: reason.value });
      controls.replaceChildren(element("p", "Report submitted for review."));
    }, send)); controls.append(element("small", "The operator can review this message and up to five preceding messages. Evidence is kept for 90 days."), reason, send, button("Cancel", () => controls.remove())); row.append(controls);
  }
  async function start(context) {
    if (!context?.uid || !context.api?.social) return;
    if (uid === context.uid && ready) return;
    stop(); init(); api = context.api; flagRenderer = context.flagRenderer; uid = context.uid; const scope = generation;
    try {
      const result = await call({ action: "status" }); if (scope !== generation || !result.enabled) return;
      ready = true; privateAlerts = result.privateAlerts; friendsTab.hidden = false; messagesTab.hidden = false;
      void restorePrivateRegistration();
      stopSignals = api.subscribeSocialSignals(signals => {
        const changed = JSON.stringify(signals) !== JSON.stringify(lastSignals), preferencesChanged = signals.preferences !== lastSignals.preferences; lastSignals = signals;
        if (!changed || scope !== generation) return;
        clearTimeout(refreshTimer); refreshTimer = setTimeout(() => void run(async () => {
          if (preferencesChanged) { const state = await call({ action: "status" }); privateAlerts = state.privateAlerts; await restorePrivateRegistration(); }
          await refreshBadge(); if (visible()) { await refreshList(); if (current && !senderBusy) { if (before) { const latest = doc.getElementById("socialLatest"); if (latest) latest.hidden = false; } else await loadHistory(); } }
        }), 80);
      }, () => { if (visible()) setStatus("Messages are reconnecting…"); });
      await refreshBadge();
      const url = new URL(root.location.href), target = pendingNotificationId || url.searchParams.get("privateConversation"); pendingNotificationId = "";
      if (/^[a-f0-9]{40}$/.test(target || "")) { url.searchParams.delete("privateConversation"); root.history.replaceState(null, "", url); await openConversation({ id: target }); }
    } catch (error) { if (scope === generation && !error.stale && visible()) setStatus("Friends and Messages are reconnecting. Reopen chat to retry."); }
  }
  function stop() {
    generation++; conversationSession++; stopSignals?.(); stopSignals = null; clearTimeout(refreshTimer); clearTimeout(presenceTimer); clearTimeout(expiryTimer);
    ready = false; uid = ""; current = null; history = []; listPage = null; pendingDraft = null; senderBusy = false; lastSignals = {}; offset = 0; privateReady = false; leave();
    if (friendsTab) friendsTab.hidden = true; if (messagesTab) { messagesTab.hidden = true; messagesTab.textContent = "Messages"; }
    if (list) list.replaceChildren(); if (thread) thread.replaceChildren(); if (badge) badge.hidden = true;
    doc.querySelectorAll(".social-profile-actions").forEach(node => node.remove());
  }
  function profileActions(container, peerUid) {
    if (!ready || !container || peerUid === uid) return;
    container.querySelector(".social-profile-actions")?.remove();
    const holder = element("div", null, "social-profile-actions"); container.append(holder); const scope = generation;
    void run(async () => {
      const r = await call({ action: "relation", peerUid }); if (!holder.isConnected || scope !== generation) return;
      if (r.blocked) holder.append(actionButton("Unblock", { action: "block", peerUid, enabled: false }, () => profileActions(container, peerUid)));
      else if (!r.unavailable) {
        if (r.friend === "none") holder.append(actionButton("Add friend", { action: "friend", peerUid, choice: "request" }, () => profileActions(container, peerUid)));
        if (r.friend === "incoming") holder.append(actionButton("Accept friend", { action: "friend", peerUid, choice: "accept" }, () => profileActions(container, peerUid)));
        if (r.friend === "outgoing") holder.append(element("span", "Friend request sent"));
        holder.append(button("Message", () => run(() => openConversation({ id: r.id, peerUid }))));
      }
    });
  }
  root.navigator.serviceWorker?.addEventListener("message", event => {
    const message = event.data;
    if (message?.type !== "CROWNLANDS_NOTIFICATION_CLICK" || message.notification?.type !== "private_message" || !/^[a-f0-9]{40}$/.test(message.notification.conversationId || "")) return;
    if (ready) void run(() => openConversation({ id: message.notification.conversationId }));
    else pendingNotificationId = message.notification.conversationId;
  });
  root.addEventListener("crownlands:auth", () => { if (uid && root.CrownlandsOnline?.getUser?.()?.uid !== uid) stop(); });
  root.addEventListener("crownlands:session-replaced", stop);
  root.CrownlandsSocial = Object.freeze({ start, stop, open, profileActions, diagnostics: () => ({ ready, uid, section, conversationId: current?.id || "" }) });
})(window);
