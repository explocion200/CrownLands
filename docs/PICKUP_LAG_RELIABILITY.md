# Pickup reliability and map-read performance

This client correction starts from `fe06f833c` on
`codex/pickup-lag-reliability`. It uses the current `core-expansion-v1`
runtime and leaves reward values, caps, authoritative collection, two-minute
respawns, expiration, terrain rules, world data, and release contracts unchanged.

## Reproduced problems

- Collection removed the local pickup before the server answered. If its old
  spawn deadline had elapsed, simulation could request another spawn while the
  claim was pending. The overlapping responses could restore outdated pickup
  state. Pending claims now retain their disabled button and block competing
  spawn/relocation requests until the claim settles.
- Rendering recreated every pickup button on economy updates, including between
  pointer press and release. Buttons are now reconciled by pickup ID, preserving
  the original click target and keyboard focus.
- A pending-feedback exception prevented the request and stranded its lock.
  An audio or reward-animation exception after success restored an already
  collected pickup. Feedback is now isolated from request completion, and a
  confirmed claim cannot be restored by a presentation error.
- Late spawn/collection responses could alter another login session. Responses
  are now tied to the originating state and session generation; disconnect
  releases pickup locks without allowing old callbacks to release new locks.
- Placement evaluated every candidate in a zone even after finding its closest
  valid point. Candidates already increase in radius, so the first valid point
  is the same answer the full search returned.
- `getEditorMap` repeatedly rebuilt derived city, objective, camp, and connection
  data during geometry reads. A bounded cache now shares that derived data.
  Definition loading/eviction and descriptor registration invalidate it; changed
  definition identities and asset versions also cause a rebuild. Evicted city
  definitions are not retained by this cache. This also reduces repeated work
  in other map-rendering and terrain consumers.
- Synchronous spawn failures now release their lock. Reservations that make no
  progress use the existing five-second retry delay instead of an immediate
  request loop.

## Controlled evidence

`node tools/validate-pickup-browser.js --compare-main` uses the repository's
loopback fixture and the current active topology. It compares the original
placement and map-lookup functions from `origin/main` with the updated functions
in the same browser and uses the same ten random seeds/placements. No production
player records or gameplay requests are used. The full coordinate lists must
match exactly.

On the desktop fixture (`core-v2-north-support-p0-m2`, 1440 x 900), ten placements
took 5,639 ms before and 281 ms after, about 95% less synchronous work. Terrain
candidate checks fell from 3,010 to 1,656. Derived map construction calls fell
from 1,115,500 to zero with the normal warmed cache. These are total local work
times for ten searches, not production network latency or physical-device FPS.
Cold construction and invalidation are separately covered by runtime tests.
The 844 x 390 diagnostic with 4x CPU throttling measured 55,799 ms before and
2,684 ms after for the same ten searches, also about 95% less work. A remaining
average of roughly 268 ms per search under this artificial slowdown is a limit
of this fix; those results do not establish physical mobile responsiveness.

Browser coverage also dispatches a real press, rerenders the pickup, then
releases the pointer. It verifies one request, a stable disabled pending button,
no competing reservation, a usable retry after rejection, and removal after
confirmation. The standard responsive browser matrix runs these checks on
desktop, landscape, short landscape, and a 4x CPU landscape diagnostic.

The pickup runtime validator additionally exercises duplicate taps, rejected
claims preserving their deadline, display/audio failures, stale sessions,
synchronous reservation failure, cache invalidation/bounds, and early search
termination. The original implementation failed six of the initial seven
behavioral cases; the updated implementation passes them.

## Validation and release limits

The new runtime cases are called by the existing harvest validator; browser
cases are called by the existing responsive browser gate. Required static,
multiplayer emulator, production artifact, and GitHub checks remain required.
The completion report records their final outcomes and pull-request link.

This investigation does not establish current production server latency, remove
all possible sources of lag, or prove physical iOS/Android performance. No backend
deployment, production-data change, merge, or release is part of this update.
