# Gameplay transport and clan-panel responsiveness

Implementation branch: `codex/gameplay-transport-responsiveness`. This document
records implementation and isolated validation, not a production installation.
This is the second of the four owner-approved October 23 performance updates.

## Request scheduling and recovery

The existing six game-request slots are retained. Background document/watch/map
reads and list/status callables use at most four; commands and route previews
can use the remaining slots and overtake queued background work. Pending requests
remain bounded at 128. Aborted queued map requests and unsubscribed queued watches never reach the
server. The authorized held-chat channel uses one of the four background slots;
its held-response behavior and existing server admission limits remain.

Successful writes and mutating callables coalesce a subscription refresh; they
never automatically repeat a command. Account and world guards still reject stale
queued work. Read-only get/list/preview calls do not create refresh loops.
HTTP errors retain Retry-After (seconds or dates, bounded at two minutes). General
watch/chat retries and failed map reads apply bounded exponential backoff with
jitter, while normal update intervals remain unchanged. Map area changes cancel
obsolete work but cannot evade an overload delay.

## Capability-negotiated watch responses

Game health advertises `watch-revisions-v1`. New clients send aligned nullable
SHA-256 tokens only after that capability is advertised. Older clients continue
receiving full responses; older servers receive the original request shape.
Every target is freshly authorized in the current transaction, including query
scope, membership, per-document access and time expiry, before an unchanged
response can be returned. Tokens bind the principal, exact query and authorized
result. They are not permission grants. Existing count/byte budgets still apply.
Revocation returns an independent error and clears the listener's local snapshot.
A transient failure clears tokens so recovery delivers full data to error-cleared
interfaces. Held-chat delivery guards still prevent an older general response
from overwriting a newer chat message. Client snapshot diffing uses keyed lookups.

## Stable clan panels

Lost Holdings refreshes only its panel. Existing keyed rows, buttons, focus and
scroll positions survive unchanged reads and updates to other rows. Intelligence
uses the same narrow DOM reconciler; expiry counters only write changed text.
Periodic intelligence refresh pauses in a hidden document. Errors, ownership or
membership loss and expired intelligence still clear private content. No new data
is placed in public responses or browser persistent storage. Styling is unchanged.

## Validation and rollout

Targeted tests cover four/six-slot bounds, queued priority and cancellation,
legacy/capable negotiation, changed/unchanged/denied snapshots, Retry-After,
command refresh, session changes, real PostgreSQL HTTP permissions, membership,
Tower ownership, season and expiry revocation. Existing Clan Support fixtures
verify immutable report expiry and private board access. Desktop and landscape
browser fixtures verify retained rows/focus/scroll and all existing actions.
Required static, multiplayer emulator and Validate checks remain merge gates.

The backend changes only the optional health/watch protocol; no gameplay record
migration is needed. Install the compatible backend before releasing its matching
static package, using the established runtime fingerprint/publisher hold. Do not
bypass that hold. Installation, service restart and live verification require the
applicable separate deployment approval. No production history cleanup is part
of this update.

The keyed panel reconciler adds 2,308 bytes to the existing raw offline shell
(4,667,839 bytes total). Its 1,983-byte overage is bounded by a 2 KiB shared-budget
allowance; no artwork, dependencies or new installation-cache entries are added.

## Health-check compatibility correction

The first approved installation rolled back because capability negotiation added
a field to the permanent health response, which the existing publisher compares
exactly. Advertise `watch-revisions-v1` in `X-Crownlands-Capabilities` instead and
keep the health JSON identity unchanged. The client reads this optional header;
servers without it retain full watch responses. No installed publisher changes
or relaxed identity checks are needed. Permanent-runtime and source/minified
transport tests cover the actual health shape, header and legacy behavior.
Implementation and a successful merge do not establish deployment.
