(function (root) {
  "use strict";
  const art = "assets/optimized/location-map-flag-192x192-cf45708cfe0c.webp";
  let context = null, generation = 0, picker = null;
  const node = (tag, text, className) => {
    const result = root.document.createElement(tag);
    if (text !== undefined) result.textContent = text;
    if (className) result.className = className;
    return result;
  };
  function normalize(value) {
    if (!value || value.version !== 1 || !["city", "camp", "tower", "marauder"].includes(value.kind)
      || !/^[A-Za-z0-9_-]{1,96}$/.test(value.id || "") || !/^[A-Za-z0-9_-]{1,80}$/.test(value.regionId || "")) return null;
    return { version: 1, kind: value.kind, id: value.id, regionId: value.regionId,
      spawnId: String(value.spawnId || "").slice(0, 128), name: String(value.name || "Location").slice(0, 80),
      mapName: String(value.mapName || value.regionId).slice(0, 80), label: String(value.label || "Location").slice(0, 32),
      level: Number.isSafeInteger(value.level) ? Math.max(0, value.level) : 0 };
  }
  function start(options) {
    if (context?.uid !== options?.uid) stop();
    context = options;
  }
  function stop() { generation++; context = null; picker?.close(); picker?.remove(); picker = null; }
  function mountLink(container, raw, source) {
    const location = normalize(raw);
    if (!location || container.querySelector(".chat-location-link")) return;
    const button = node("button", undefined, "chat-location-link"); button.type = "button";
    const image = node("img"); image.src = art; image.alt = ""; image.draggable = false;
    const title = location.level && !/\b(?:lv\.?|level)\s*\d+/i.test(location.name) ? `${location.name} · Lv. ${location.level}` : location.name;
    button.append(image, node("strong", title), node("small", " · " + location.mapName));
    button.title = `${location.label} · ${location.name} · ${location.mapName}`;
    button.setAttribute("aria-label", `View ${location.name} on ${location.mapName}`);
    button.addEventListener("click", async event => {
      event.stopPropagation();
      if (!context || button.disabled) return;
      const scope = generation, active = context;
      button.disabled = true;
      try {
        const result = source.channel === "private"
          ? await active.api.social({ action: "resolveLocation", conversationId: source.conversationId, messageId: source.messageId })
          : await active.api.sendChatMessage({ action: "resolveLocation", ...source });
        if (scope !== generation) return;
        if (result.status !== "available") {
          const reason = { moved: "This castle has moved. This link points to its previous location.",
            "old-season": "This location belongs to a previous season.", unavailable: "This location is no longer available." };
          active.onToast(reason[result.status] || reason.unavailable); return;
        }
        await active.navigate(result.location);
      } catch (error) { if (scope === generation) active.onToast(error.message || "Location unavailable. Please retry."); }
      finally { if (scope === generation && button.isConnected) button.disabled = false; }
    });
    container.append(button);
  }
  function addShareButton(container, target) {
    if (!container || !target || !context || container.querySelector("[data-share-location]")) return;
    const button = node("button", "Share location", "chat-location-share-button"); button.type = "button";
    button.dataset.shareLocation = target.id;
    button.addEventListener("click", () => open(target));
    container.append(button);
  }
  function open(target) {
    if (!context) return;
    picker?.close(); picker?.remove();
    const active = context, scope = generation, clanId = String(active.getClanId() || "");
    const ref = { kind: target.kind, id: target.id, regionId: target.regionId,
      ...(target.kind === "marauder" ? { spawnId: target.spawnId } : {}) };
    let channel = "global", busy = false, pending = null, recipientVersion = 0, recipientUid = "";
    const dialog = node("dialog", undefined, "chat-location-share"), heading = node("header");
    picker = dialog;
    dialog.setAttribute("aria-labelledby", "chatLocationShareTitle");
    const title = node("h2", "Share location"); title.id = "chatLocationShareTitle";
    const close = node("button", "×"); close.type = "button"; close.setAttribute("aria-label", "Close share location");
    close.addEventListener("click", () => dialog.close()); heading.append(title, close);
    const form = node("form"), fields = node("div", undefined, "chat-location-fields"), preview = node("p", undefined, "chat-location-preview");
    const image = node("img"); image.src = art; image.alt = "";
    preview.append(image, node("strong", target.name || "Selected location"), node("span", target.mapName || ""));
    const channels = node("div", undefined, "chat-location-channels");
    channels.setAttribute("role", "group"); channels.setAttribute("aria-label", "Share destination");
    const recipients = node("fieldset", undefined, "chat-location-recipients"), list = node("div", undefined, "chat-location-contact-list");
    const more = node("button", "Load more contacts"); more.type = "button"; more.hidden = true;
    const help = node("small", "Choose a friend or an existing conversation.");
    recipients.append(node("legend", "Choose a recipient"), list, more, help); recipients.hidden = true;
    const label = node("label", "Note (optional)"), note = node("textarea");
    note.rows = 2; note.maxLength = 250; note.setAttribute("aria-label", "Optional location note"); label.append(note);
    const status = node("p", "", "chat-location-status"); status.setAttribute("role", "status");
    const footer = node("footer"), cancel = node("button", "Cancel"), send = node("button", "Share to Global");
    cancel.type = "button"; cancel.addEventListener("click", () => dialog.close()); send.type = "submit"; footer.append(cancel, send);
    send.className = "primary-btn";
    const valid = () => scope === generation && dialog.isConnected && dialog.open;
    const cursors = { friends: undefined, conversations: undefined }, contacts = new Map();
    let loading = false;
    async function loadContacts() {
      if (loading) return;
      loading = true; more.disabled = true; const version = ++recipientVersion; help.textContent = "Loading contacts…";
      try {
        const pages = await Promise.all(Object.keys(cursors).filter(kind => cursors[kind] !== null).map(async kind =>
          [kind, await active.api.social({ action: "list", kind, ...(cursors[kind] ? { cursor: cursors[kind] } : {}) })]));
        if (!valid() || version !== recipientVersion) return;
        for (const [kind, page] of pages) {
          cursors[kind] = page.next || null;
          for (const row of page.rows || []) if (!row.unavailable && row.peerUid && !contacts.has(row.peerUid)) {
            contacts.set(row.peerUid, row);
            const choice = node("label", undefined, "chat-location-recipient"), radio = node("input");
            radio.type = "radio"; radio.name = "chat-location-recipient"; radio.value = row.peerUid;
            const name = node("span", row.player?.name || "Ruler"); name.title = name.textContent;
            // A name-row tap selects its radio; it must not trigger map fullscreen entry.
            choice.addEventListener("pointerup", event => event.stopPropagation());
            radio.addEventListener("change", () => {
              if (!radio.checked || busy) return;
              recipientUid = radio.value;
              list.querySelectorAll("label").forEach(item => item.classList.toggle("is-selected", item === choice));
            });
            choice.append(radio, name); list.append(choice);
          }
        }
        more.hidden = Object.values(cursors).every(value => value === null);
        help.textContent = contacts.size ? "Only the selected player will receive this location." : "Add a friend or start a conversation from a player's profile first.";
      } catch (error) { if (valid()) { help.textContent = error.message || "Could not load contacts. Retry."; more.hidden = false; more.textContent = "Retry contacts"; } }
      finally { loading = false; more.disabled = false; }
    }
    more.addEventListener("click", () => void loadContacts());
    for (const [key, text] of [["global", "Global"], ["clan", "Clan"], ["private", "Messages"]]) {
      const button = node("button", text); button.type = "button"; button.dataset.channel = key;
      button.setAttribute("aria-pressed", String(key === channel)); button.disabled = key === "clan" && !clanId;
      if (button.disabled) button.title = "Join a clan to share in Clan Chat.";
      button.addEventListener("click", () => {
        channel = key; status.textContent = ""; recipients.hidden = key !== "private";
        channels.querySelectorAll("button").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
        send.textContent = `Share to ${text}`; note.maxLength = key === "private" ? 1000 : 250;
        if (key === "private" && !contacts.size) void loadContacts();
      });
      channels.append(button);
    }
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (busy || !valid()) return;
      if (Array.from(note.value.trim()).length > (channel === "private" ? 1000 : 250)) {
        status.textContent = `Shorten the note to ${channel === "private" ? "1,000" : "250"} characters for this chat.`; return;
      }
      if (channel === "private" && !recipientUid) { status.textContent = "Choose who should receive this location."; return; }
      if (channel === "clan" && String(active.getClanId() || "") !== clanId) { status.textContent = "Your clan changed. Close this window and choose the destination again."; return; }
      const payload = { text: note.value.trim(), location: ref, ...(channel === "private"
        ? { action: "send", peerUid: recipientUid } : { channel, ...(channel === "clan" ? { expectedClanId: clanId } : {}) }) };
      const signature = JSON.stringify(payload);
      if (!pending || pending.signature !== signature) pending = { signature, requestId: root.crypto.randomUUID() };
      busy = true; form.querySelectorAll("button,textarea,input").forEach(item => { item.disabled = true; });
      status.textContent = "Sharing…";
      try {
        const result = channel === "private" ? await active.api.social({ ...payload, requestId: pending.requestId })
          : await active.api.sendChatMessage({ ...payload, requestId: pending.requestId });
        if (!valid()) return;
        if (!result.ok) throw Error("Location could not be shared. Please retry.");
        dialog.close(); active.onToast(`Location shared to ${channel === "private" ? contacts.get(recipientUid)?.player?.name || "Ruler" : channel === "clan" ? "Clan Chat" : "Global Chat"}.`);
      } catch (error) { if (valid()) status.textContent = error.message || "Could not share. Retry to check the same message."; }
      finally {
        busy = false;
        form.querySelectorAll("button,textarea,input").forEach(item => { item.disabled = false; });
        channels.querySelector('[data-channel="clan"]').disabled = !clanId;
      }
    });
    dialog.addEventListener("close", () => { recipientVersion++; dialog.remove(); if (picker === dialog) picker = null; });
    fields.append(preview, channels, recipients, label, status); form.append(fields, footer); dialog.append(heading, form);
    root.document.body.append(dialog); dialog.showModal();
  }
  root.CrownlandsChatLocations = Object.freeze({ normalize, start, stop, mountLink, addShareButton, open });
})(window);
