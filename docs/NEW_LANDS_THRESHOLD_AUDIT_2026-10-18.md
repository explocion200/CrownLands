# New Lands threshold and recent expansion audit

The owner confirmed a reduction of the New Lands admission reserve from 20 to
10 neutral regular cities on October 18, 2026. A claim with 11 neutral cities
may leave 10; at 10 or fewer the map closes to new arrivals and the next two
positions are prepared and verified. Every new map still starts with 40 Level 1
neutral cities. Captures and Deed awards consume the same neutral inventory.
Already closed maps and existing expansion receipts/cursors remain intact.

Implementation changes require the reviewed backend installation as well as the
compatible client publication. A merged PR alone does not establish deployment.

## Read-only production findings

The review on October 18, approximately 7 p.m. Eastern, used the preceding
48 hours. PostgreSQL queries ran with `default_transaction_read_only=on` and a
10-second statement timeout. The authoritative `realmConfig/current` pointer
was `main-realm-2026-10`, generation `realm-2026-10`, shared partition
`shard_0001`; both release configurations select `core-expansion-v1`. Installed
`functions/index.js`, `coreExpansionTopology.js` and `player-region-spawn.js`
matched the reviewed baseline. No player records were edited for this audit.

Four distinct new maps were created at **October 18, 9:34:53 a.m. Eastern**:

| Triggering map | Neutral cities when checked | Maps opened |
| --- | ---: | --- |
| Brightcliff Abbey (`new-lands-l03-p014`) | 19 | Coldcliff Abbey (p016), Crowcliff Abbey (p017) |
| Cedarcliff Abbey (`new-lands-l03-p015`) | 9 | Dawncliff Abbey (p018), Duncliff Abbey (p019) |

The evidence is the current generation's `expansion/current` receipt map,
its PostgreSQL change history (revisions 71 through 75), and the four canonical
island documents' creation timestamps. Public island projections were excluded
from the distinct-map count. The final state had 75 active New Lands maps plus
the 25-map Core, admission cursor 75, and no pending or queued activation.

Before activation, retained current-world ownership events within the review
window show 15 neutral-city captures, three Deed awards and one starting-city
claim in Brightcliff; Cedarcliff shows 29 neutral-city captures and one
starting-city claim. These are event totals within the window, not unique new
account counts or a reconstruction of every city's lifetime history.

Both threshold events were queued by the admission reconciliation path during
a starting-city request. The subsequent claim selected a city in Crowcliff.
The authoritative counts were 19 and 9, so both satisfied the former 20-city
rule. There is no duplicate pair in these receipts. Under the new rule,
Brightcliff at 19 would continue admitting, while Cedarcliff at 9 would still
open its next pair. This counterfactual does not remove any existing maps.

## Validation scope

Focused checks cover 40-city map generation, 11-to-10 admission, no early
expansion at 20/19/11, overdue depletion, concurrent claims and exact-once
activation, balanced placement, replay, preserved historical 20-city receipts,
initial two-layer admission order, later-layer growth, archived-generation
isolation, current catalog synchronization and client delivery. Local PostgreSQL
fixtures use random disposable schemas, including 50 starting-city claims at
concurrency 10 with no caller retries. The first local burst passed in 1.79
seconds, with 30/10/10 placement and one expansion pair; this is a synthetic
backend check, not an end-to-end player latency guarantee. The Firebase emulator
hit reservation contention at concurrency 10, so its compatibility gate retains
50 real claims using the existing five-request stress limit. The live PostgreSQL
gate keeps the higher burst. No production test players or captures are required.
