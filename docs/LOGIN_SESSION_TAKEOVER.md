# Login session takeover and first-player entry

The confirmed behavior is one active game session per account: a successful new sign-in takes over from the old device or tab. Login does not grant extra cities, Gold, troops, rewards, or permissions.

## Confirmed causes

- The former profile watcher accepted cached snapshots and compared client clocks. A controlled reproduction using an old cached session with a clock one day ahead signed out the winning client. Queued callbacks from stopped watchers also lacked lifecycle guards.
- Firebase LOCAL authentication is shared across same-origin tabs. The former forced sign-out cleared that shared authentication, which could sign out the winning tab too. [Firebase persistence documentation](https://firebase.google.com/docs/auth/web/auth-state-persistence) documents the cross-tab synchronization. Normal persistent sign-in remains enabled; a replaced same-browser tab retires its game client and ignores shared automatic auth events until an explicit sign-in.
- Session profile writes and realm membership admission were independent, and login retries had no durable receipt. A delayed old admission could replace the newer membership.
- Production Cloud Run logs show four joinGameServer HTTP 500 responses on September 6 caused by no available instance, including three between 16:08:03Z and 16:08:14Z. The source still limited this shared-realm admission function to one instance. The same requests later succeeded after a new instance started. This is a confirmed intermittent entry failure; the exact reports from individual new players have not been supplied.

## Implementation

`joinGameServer` accepts an optional session-activation request. One Firestore transaction writes the account session, its immutable `players/{uid}/loginSessions/{sessionId}` receipt, realm member, and membership. Server time and a monotonically increasing revision identify acceptance. Replaying the same attempt preserves its accepted time and cannot overwrite a later session. Ordinary joins and heartbeats cannot revive a superseded session; stale leave requests cannot remove the winning membership. New explicit Google sign-ins use a new attempt ID; reloads and automatic retries retain theirs. Legacy joins remain compatible with accounts that have not yet adopted authoritative sessions.

The browser starts its replacement watcher only after admission succeeds. It ignores cached/pending snapshots, older revisions, and callbacks from retired generations. Membership views require the current session ID. Late responses cannot restore a signed-out session. A replaced same-installation tab keeps the Firebase credential needed by the winning tab but immediately loses its game session; automatic auth events cannot revive it. A different device signs out Firebase locally. Server takeover removes only notification registrations belonging to the retired installation, preserving the winning device's registrations.

Firestore rules prevent clients from forging or overwriting version-2 authoritative sessions and keep session receipts inaccessible to client writes. Existing ownership, economy, reset, profile, and clan access controls remain in place. The admission function now allows 20 instances, matching the existing heartbeat limit, and its client request is bounded at 15 seconds. Transient failures retry with backoff and the same receipt key. Busy admission errors are distinguished from Google popup/redirect failures.

## Verification and release

- `tools/validate-login-session-behavior.js` executes the real client logic with controlled auth, Firestore, and callable boundaries. It covers first auth startup, coalesced requests, cache/clock skew, pending snapshots, stale callbacks, device/shared-tab replacement, explicit re-login, membership filtering, backoff, late responses, and blocked storage.
- `functions/test/emulator-first-time-onboarding.js` exercises actual Auth, Firestore rules, and Functions in the current Core expansion realm: fresh admission, one city/100 Gold/200 troops, retry receipts, two-device handoff, stale join/heartbeat/leave rejection, protected session writes, concurrent login serialization, identity/ownership preservation, and notification isolation.
- Existing login, realm admission, reset, profile rules, production-build, browser, and full multiplayer gates remain required. Physical phone testing remains excluded at the user's request.
- Production proof belongs in the release handoff. Read-only diagnostics target `crown-land-b15e0`, `realm-2026-09`, `main-realm-2026-09`, and `shard_0001`; no production player repair is performed.
- Release the compatible backend and rules after required checks pass, before publishing the client that requests authoritative activation. Verify backend source/configuration and the final merged web build independently. Session receipts are retained as small per-login audit records; no automatic receipt deletion is introduced.
