# Crownlands Global and Clan Chat

## Audit summary

Crownlands uses the Firebase Web SDK 10.12.5 from `firebaseClient.js`. Google Auth supplies the signed-in UID, Firestore supplies realtime reads, and callable Cloud Functions in `functions/index.js` own shared-state mutations. The current realm is identified by the pinned `resetGeneration` and `worldId` in `functions/release-config.json` and its browser equivalents.

The authoritative player identity is `players/{uid}`. Chat uses `playerName` first and `displayName` only as a fallback. The same profile carries the current `clanId`. Clan access also requires the active, current-realm documents `clans/{clanId}` and `clans/{clanId}/members/{uid}`. Clan join, leave, kick, and transfer flows already update the profile and membership records transactionally.

Browser writes to shared gameplay data are generally denied by `firestore.rules`; mutation callables validate auth, realm compatibility, and server-owned state in transactions. Realtime listeners return explicit unsubscribe functions and are retired when their owning game scope changes. The chat implementation follows those conventions.

## Data model

| Path | Purpose | Browser access |
| --- | --- | --- |
| `globalChat/{resetGeneration}/messages/{messageId}` | Current-realm Global messages | Current-realm signed-in players may read visible records; no browser writes |
| `clans/{clanId}/messages/{messageId}` | Private Clan messages | Only players whose current profile and active membership both identify this clan may read visible records; no browser writes |
| `players/{uid}/chatSendRequests/{messageId}` | 24-hour idempotency receipt | Server only |
| `serverRateLimits/chat_{uid}` | Per-account cross-channel send cooldown state | Server only |
| `realmSecurity/{resetGeneration}/chatRestrictions/{uid}` | Future moderation record (`banned`, `status`, or `mutedUntilMs`) | Server only |

Message IDs are deterministic hashes of the authenticated UID and client request ID. A message stores schema version, channel, channel ID, authenticated sender UID, profile-derived display name, validated text, status, realm fields, server timestamp, numeric creation time, and expiry. Client-supplied identity, clan ID, privilege, and timestamp fields are rejected.

## Authorization and abuse controls

`sendChatMessage` requires Firebase Auth and the current client release contract. It normalizes a Global or Clan channel, strips control characters, trims whitespace, and enforces a 250-Unicode-character maximum. Clan sends derive `clanId` from the player profile and transactionally verify the clan and membership before writing.

The same transaction checks the private moderation record, request receipt, and per-player cooldown record. Exact retries replay the first result without creating a duplicate or restarting the cooldown. Reusing a request ID for different content fails. Successfully accepted messages start one authoritative three-second cooldown shared by Global and Clan Chat; validation failures do not update it. Operation logs record callable outcome and duration without logging message contents.

Rendering uses DOM `textContent` for both names and messages. No chat-authored string is inserted as HTML.

## Client lifecycle and UI

While a signed-in kingdom is active, `chat-ui.js` owns exactly one Global listener and at most one listener for the profile's current clan. Starting the same session is idempotent. Clan changes unsubscribe the previous Clan listener before subscribing to the new path without interrupting Global. Logout, online-world teardown, page hide, and account replacement unsubscribe both. A generation guard ignores late snapshots from retired listeners.

The initial query is newest-first and bounded to 80 messages. The client reverses those for chronological display, offers explicit older-history pages of at most 50, and caps retained/rendered DOM history at 200. Live arrivals preserve scroll position when the player is reading older messages and expose a New Messages control. Global and each clan have independent last-read keys in local storage.

The HUD has closed, quick-peek, and full modes. Its 56-pixel toggle is a separate editable HUD component vertically centered immediately left of the unchanged 64-pixel Bag. Quick-peek extends left from the toggle on the same HUD row and measures visible left-side HUD blockers whenever movement-control occupancy, layout, or viewport state changes. It displays three, two, or one recent message as room contracts, with a 160-pixel readability floor; below that floor only the preview body is suppressed while the logical Quick Peek state, Chat toggle, unread indicator, Bag, and movement controls remain intact. Full mode uses the existing dialog convention, Global/Clan tabs, accessible labels, sender-to-profile actions, Enter-to-send, Shift+Enter newline, validation, disabled/error states, and a non-blocking Send countdown. The player can keep typing during the cooldown.

## Retention and operations

Messages expire after seven days. Idempotency receipts expire after 24 hours. The hourly `cleanupExpiredChat` scheduler deletes expired `messages` and `chatSendRequests` collection-group records in bounded 450-document batches, up to eight batches per run. Firestore's `expiresAt` timestamp is also ready for a managed TTL policy if one is enabled later; the scheduler remains the explicit application guarantee.

Operational signals are `crownlands_operation` logs for `sendChatMessage`, cleanup summaries with deleted batches/documents, callable error codes (especially `resource-exhausted` and `permission-denied`), and client realtime recovery errors. Message bodies are intentionally excluded from logs.

Deploy rules and indexes before or with Functions, then publish the client. For a staged launch, hide or omit the client entry point first while leaving server/rules compatible, verify write latency, denial rates, listener errors, and cleanup backlog, then expose the HUD. Rollback the client first; leaving unread chat collections and the callable in place is safe. Do not relax rules or restore direct client writes. If a server rollback removes the callable, the client already surfaces a recoverable send error while reads remain bounded.

## Verification

`tools/validate-chat.js` covers validation helpers, collision geometry and suppression thresholds, cooldown timing/cleanup, UI transitions, duplicate-listener prevention, clan listener replacement, logout cleanup, inert unsafe-string rendering, and source integration contracts. `functions/test/emulator-chat.js` exercises authenticated and unauthenticated sends, validation, spoof attempts, direct write denial, Global/Clan query authorization, no-clan behavior, leave/switch revocation, profile identity, moderation, idempotency, all same/cross-channel cooldown combinations, clean remaining-duration responses, and retention fields against the Firebase emulators.
