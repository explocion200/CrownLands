# Clan Lost Holdings

Confirmed October 23, 2026. Implemented on `codex/clan-war-cities`;
the capture/return feature was verified live through PR #708 at build
`c28ca465aaf34db22c4440162881760db1190fb8`. The Lost Holdings naming and
location-icon refinement was verified live through PR #709 at
`7e0c16ecb98380f36b330f8ad04f9b37fc30db35`. Notifications were verified live through PR #710 at
`58aa9a8e6b59a1c3070212d84004fc9bf412a817`. The event log on
`codex/lost-holdings-log` is implemented and awaits validation, merge and a
separately authorized backend installation.

## Behavior

The fifth Clan tab preserves the current parchment/burgundy window on desktop
and landscape phones. Each row identifies the city and map, original clanmate,
captor at the loss, current holder and Lost/Recovered state. The tab is named
**Lost Holdings** and uses the existing map-and-flag location icon. Location navigates
without sending an army. Normal attacks and their existing protections still
govern recapture, including weak-player protection. Listing a city grants no
extra attack, retaliation or capture permission. The recovering owner gets the
Return city action on the same row, to the right of the location icon, when the
open board refreshes. Other members see who recovered it. This feature adds no
ordinary-city rally exception.

The Lost Holdings tab shows the shared burgundy circle with a white `!` when
there is a lost city to recover or a recovered city this member can return.
Reading the tab does not dismiss it. A recovery by another member is not this
member's return action. The notice indicates availability, not an unread count;
existing attack protection and final server return guards still apply.

Only the current recovering owner can voluntarily return a city, and both rulers
must remain current members of the same active clan. Officers cannot give away
another member's holdings. A confirmation identifies the recipient. The original
member receives the city at its current level, investment and wall state. Their
own remaining Shield deadline applies, including existing wall-repair eligibility.
The recovering player's troops march to the nearest eligible holding they own,
using the existing relinquishment safe-destination behavior and ordinary transfer
speed. No Stables bonus or instant troop donation applies. Allied reinforcements
are recalled by the existing ownership-change worker.

Main Cities/objectives cannot be returned. Incoming marches, assembled rally
troops and an active capture/retaliation no-abandon lock must clear first. A new
Main City designation is shown as a blocked return. Normal city capture remains
unchanged, including linked-account, former-clan, shield, power and neutral-cap
rules. A friendly restoration grants no XP, conquest credit, capture reward or
new neutral lineage; it does not damage walls or drop another level. This is a
specific restoration of a recorded loss, not arbitrary city gifting or daily
relinquishment to neutral ownership.

## Event log

The **Log** button opens a text-only history in the same window, with **Back**,
**Refresh**, local date/time and newest-first pagination. Current recovered rows
show **Awaiting return decision**. No Keep action is added. Successful losses,
clan recoveries, direct original-owner recovery, re-loss and an explicit completed
return are recorded. Canceling or failing a return, merely opening a location and
protected raids that do not transfer ownership do not create events.

Each event is written inside the existing capture/return transaction under
`clans/{clan}/warCityEvents/{id}`. Its deterministic ID is qualified by the current
realm/generation/shard and the combat event or sender/return operation ID. Return
receipts prevent duplicate decisions. One sortable timestamp plus ID handles tied
timestamps with strict newest-first cursors. History is retained for the season,
including after the claim closes or a contributor leaves; former members cannot
read it. The `clanWarCities` command's new `log` action rechecks active membership
and current realm on every page, reads at most 26 events and returns at most 25
whitelisted text/time/type summaries. It never reads all players or exposes raw
records, account fields or troop counts. Default-deny read/query/write adapters
continue to protect this new collection.

The client keeps no persistent history cache, discards old-clan replies, clears
history on failed reads and retains existing notification polling without adding
a second timer or background history polling. History loads on entry, refresh or
pagination. The list response advertises `logVersion: 1`; the Log control remains
disabled against an older backend. Empty history clearly distinguishes no events
from a loading or failed request. Historical recoveries cannot be reconstructed
reliably, so log capture begins at installation without player-data backfill.

## Persistence and privacy

`functions/clan-war-cities.js` records actual regular-city captures in the same
transaction as combat settlement. Each private `clans/{clan}/warCities/{key}`
record is qualified by world, generation, shard, map and city. A subsequent loss
by a recovering clanmate preserves the original member's claim. Direct recovery
by the original member closes it. Stale requests carry a different loss token
and cannot return a later loss. Operation receipts under the sender serialize
retries without duplicating cities or marching troops. Both economies and
ownership-derived stats settle atomically.

The authenticated `clanWarCities` command returns at most 25 summaries per page,
checking current clan/roster membership and current city ownership on every read
and return. Raw records and receipts have no client read/write permission under
the existing default-deny adapters. No private troop numbers, profile inventory
or account fields enter public clan/city responses. Leaving, disbanding, realm
rollover and membership changes revoke access. Archived records are neither
modified nor surfaced in the current season. The open Lost Holdings page refreshes
on the existing five-second tick.
Other Clan sections check availability every fifteen seconds. Both reuse one
in-flight request and timer; the notice examines one bounded page per tick until
it finds an eligible city or reaches the end, without moving the displayed page.
It never scans players or reads raw records. Backgrounding pauses requests and
closing the Clan window stops polling; unrelated map/HUD rendering adds no reads.
Identity changes discard pending responses and
clear its in-memory board; errors clear stale entries. No localStorage board cache.

Tracking starts with captures after installation. Existing ownership events do
not reliably record clan membership at the time of loss, so no historical clan
claims or player-data backfill are inferred.

## Validation

- Shared adapter cases: original loss, recapture/re-loss lineage, direct recovery,
  membership and generation isolation, private summaries, bounded pagination,
  concurrent return retries and stale-loss rejection.
- Event history: loss/recovery/return actors, same-transaction settlement, failed
  return exclusion, duplicate operations, persistence after return, equal-time
  pagination, current-member access, former-member/wrong-realm/shard rejection,
  raw read/query denial and public-field minimization.
- Real PostgreSQL commands: three fictional players, actual combat loss and
  recapture, protected raid without a weak-player bypass, guarded return, matching
  Shield deadline, unchanged walls/level,
  preserved XP, both ownership stats, real return march and duplicate settlement.
- Source and built UI: 1440×900 mouse and 844×390 / 568×320 simulated touch;
  five-tab layout, text log/Back/Refresh and pagination, escaped names, empty/error
  states, unsupported-backend gating, stale log replies, unchanged frame, shared location icon, same-row live recovery, safe location-only
  navigation, scrolling/focus, confirmation/cancellation, failed requests and
  old-session response rejection, background/resume polling, notice appearance before
  opening the board, recovery/return clearing, paginated availability and failed-read
  backoff. Screenshots and measurements are generated in
  ignored `release-artifacts/war-cities/`.
- Selected existing combat, travel, relinquishment, Shield and Clan UI regressions
  are listed with exact-base dependency coverage in `validation-plan.json`.

The lazy Clan stylesheet stays below 90 KiB. The original board allowance was
8 KiB; the notification change adds 2 KiB of bounded shell headroom and no artwork
or dependencies. The log adds 1,834 client bytes; existing headroom plus a
bounded 1.5 KiB covers the offline cache and main script. Board/notice polling is confined to the open Clan window, never
the map rendering loop.

## Rollout

The supported production topology remains `core-expansion-v1`, backed by the local
PostgreSQL command adapter. The verified current realm before implementation was
`main-realm-2026-10` / `realm-2026-10` / `shard_0001`. No archived-world work or SQL
schema migration is needed; the document store persists new records on captures.
The retained Firestore index declaration covers the equivalent bounded query for
emulator/adapter compatibility; this does not authorize a Firebase deployment.

Install the reviewed `functions/index.js` and new `functions/clan-war-cities.js`
with the matching release manifest through the existing approved backend workflow,
then release the compatible client. Verify service health, source fingerprints,
authority epoch and the public build before calling the feature live. The static
publisher must hold the merged client until this backend is installed; do not
update its compatibility fingerprint merely to bypass the hold. An older backend
returns an unavailable state and cannot enable the return controls. Installation
needs separate authorization; merging alone neither installs nor deploys this
feature. No production ownership rewrite or database backup is part of this change.

### Event-log rollout

The log requires only the reviewed `functions/clan-war-cities.js` and generated
`functions/release-manifest.json` in the existing local runtime. The Firestore
index declaration mirrors the new bounded query for retained adapter compatibility;
no Firebase deployment or SQL schema change is needed. Old loss records and return
receipts remain valid, and old clients continue to use list/return unchanged.
Install the merged server candidate using the reviewed installer, run the isolated
PostgreSQL cases against its installed dependencies, verify service health and the
active current-realm pointer, and only then update the compatible publisher policy.
A fingerprint hold is expected until separately authorized installation completes.
Rollback restores the previous server/manifest/policy; additive event records need
no rewrite. No production account, city or troop records are migrated or backfilled.

Validation results and exact deployed identity are reported separately; this
section does not assert that the log has been installed.
