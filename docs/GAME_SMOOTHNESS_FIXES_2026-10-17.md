# Game smoothness fixes — October 17, 2026

This update addresses the four findings in the read-only server/browser audit at
base `71749743576c8947aa551809a3926043e0edae3d`. It changes no combat, travel-time,
economy, translation-allowance or social-access rule. Tests use isolated schemas
and synthetic players; no production orders, purchases or chat are submitted.

## Changes

- **Routes:** same-map travel solves only its terrain leg because returning to a
  visited map is forbidden. Cross-map searches use a feasible road-chain upper
  bound and obstacle-free lower bounds to avoid unnecessary terrain solves.
  Dijkstra ordering, exact terrain geometry, distance caps, canonical endpoint
  orientation and bounded caches remain. The immutable planner retains at most
  32 target bounds. Current Core/New Lands topology is the scope.
- **Database:** SERIALIZABLE transactions compare their proposed document fields
  with the snapshot before acquiring write locks. Unchanged projections no longer
  lock a document updated by another writer. Actual writes still lock, and stale
  writes, write skew and double spending still abort. Blind READ COMMITTED batches
  continue to lock before reading. Retry bounds, job fencing, receipts and atomic
  outbox delivery are retained. This removes one avoidable conflict source; it
  does not eliminate legitimate serialization retries.
- **Browser:** four expensive card-selector lists now index their individual
  classes. Repeated classes and zero-specificity type filters preserve the exact
  previous `(0,2,0)` specificity. Declarations and artwork are unchanged. The raw
  install shell grows by 7,974 bytes, about 1.7 KiB deflated, bounded by an 8 KiB
  budget increase. No new assets, dependencies or network requests are added.
- **Translation:** callers encountering an existing pending cache lease wait
  outside database transactions for at most six delays totaling 1.26 seconds.
  Each attempt rechecks authorization, source text, visibility and rate limits.
  A completed shared result incurs no second provider reservation. Slow leases
  retain the existing manual Retry. Diagnostics distinguish `pending-timeout`
  from `provider-unavailable` without including message text or identifiers.

## Evidence and limits

The route comparison uses separate canonical-engine and graph modules for the
base and candidate. It checks exact forward/reverse geometry, 16 additional
current-world pairs, nearest scout origins, 24-target batches, distance caps,
cache eviction and mutation safety. In one cold cross-map fixture, terrain-cache
misses fell from 189 to 7 and processing from about 643 ms to 44 ms. Warm p95 fell
from 1.85 ms to 0.17 ms. These are synthetic CPU measurements, not network times.
One subsequent tower route needed more first-use work because the optimized
planner had deliberately avoided warming unrelated terrain; warm results still
improved. This is not a promise that every individual cold route becomes faster.

The new PostgreSQL regression fails on the base runtime with a real serialization
abort and passes with the fix. It separately proves stale writes still abort all
accompanying receipts. Translation tests use independent service instances,
actual PostgreSQL reservations, one mock provider request, bounded waiting,
revoked-access/deleted-source refusals and unchanged quota accounting. Firestore
emulator coverage verifies the shared translation service and authoritative
travel/scouting/social access paths without making Google requests.

Chromium compares matching elements, specificity and computed paint/font/layout
properties against the base CSS for map, City Info (including selected-button
hover), profile, skills, city list and chat at 1440×900, 844×390 and 568×320.
The short desktop benchmark reduced City Info style work from about 553 to
512 ms across five interactions; long tasks fell from four to two and p95 frame
time from 66.6 to 33.4 ms. Map-switch style work fell from 218 to 204 ms, while
the existing transition animation kept switch time near 1.18 seconds. Physical
phones, internet latency and sustained high-player-count load remain unmeasured.

The older City Details browser validator expects obsolete pre-palette hover
colors, and the historical contrast validator expects old flag/HUD markup; both
fail on unchanged main. They are not selected release gates for this update.
The current-theme equivalence and UI lifecycle tests cover this change instead.
The lifecycle test's empty-march fixture was also corrected to create active
alerts before asserting that their pulse pauses behind a window.

## Release boundary

`validation-plan.json` records affected tests and the exact reviewed base. All
three required GitHub checks must pass for the final PR head before merge.
A merge alone does not install these changes. The local game/worker runtime must
be installed with saved rollback copies, isolated installed-code tests, service
health checks and verified runtime fingerprints before releasing the compatible
static publisher. No schema migration or Firebase deployment is needed.

After activation, verify both public `local-deployment.json` identities, game
assets, service health, worker queues and a fresh encrypted backup/recovery test.
Retain sanitized measurements and installation receipts under
`release-artifacts/game-smoothness-fixes/`; check live latency and retry rates
under actual activity before claiming the long-tail delays are fully resolved.
