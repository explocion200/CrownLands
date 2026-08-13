# Phase 0 realtime budgets

Date: 2026-08-13

## What is measured

The loopback adapter reproduces the client-facing subscription lifecycle and records logical snapshots/documents. It proves listener ownership, replacement, duplicates, and expected payload cardinality without reading production Firebase.

It does not measure Firestore billing reads, wire bytes, regional network latency, reconnect billing, index performance, or production server fan-out. Those remain separate emulator/staging observability work.

## Active listener baseline and hard budgets

| Category | Baseline | Budget | Included keys |
|---|---:|---:|---|
| Player/session | 4 | Exactly 4 | Active session, daily mission, seasonal achievement, game-server membership |
| Player | 7 | Exactly 7 | Two army projections, two reinforcement views, held camps, reports, global stats |
| Global | 2 | Exactly 2 | Realm activity and Crown Citadel |
| Active region | 4 | Exactly 4 | Cities, camps, armies, presence |
| Clan/social | 0 | Exactly 0 while surfaces are closed | No panel-specific streams in this workflow |
| Total | 17 | Exactly 17 | Base authenticated gameplay state |

This is deliberately an exact regression budget, not “17 plus a little.” Any new always-on listener requires review, a named owner/category, lifecycle evidence, and an explicit budget change.

The category labels describe benchmark ownership. The mock's `globalStats` key is categorized under player because it is subscribed through the player gameplay bundle; do not infer Firestore path scope solely from the label.

## Duplicate and lifecycle budgets

| Invariant | Budget | Baseline |
|---|---:|---:|
| Duplicate active listener keys | 0 | 0 |
| Active listeners at neighbor | 17 | 17 |
| Active listeners after return | 17 | 17 |
| Old primary-region listeners after switch out | 0 | 0 |
| Neighbor-region listeners after return | 0 | 0 |
| Region listeners unsubscribed per switch leg | 4 | 4 |
| Region listeners subscribed per switch leg | 4 | 4 |
| Full round-trip region unsubscriptions/subscriptions | 8 / 8 | 8 / 8 |
| Player/session/global listener churn during switch | 0 | 0 |

Late-callback generation protection remains production runtime behavior, but the Phase 0 adapter does not inject delayed stale snapshots. Add that as a future emulator resilience test rather than claiming it here.

## Logical event budgets

The deterministic full workflow produces 23 logical snapshot deliveries and four local presence writes in every successful nominal run.

Document-delivery cardinality is:

`2 × primary city count + 2 × scenario march count + 49 neighbor cities + 9 fixed documents`

| Scenario | Expected logical documents | Baseline |
|---|---:|---:|
| A — 50/25 | 208 | 208 |
| B — 100/50 | 358 | 358 |
| C — 150/100 | 558 | Unavailable because C cannot complete startup |
| D — 100/0 | 258 | 258 |
| E — 50/100 | 358 | 358 |

The budget is exact for this deterministic adapter. A change in fixture design must version the formula/seed. A production listener implementation change should not increase snapshot delivery count or logical documents without review.

## Browser-network budgets

| Metric | Budget | Baseline |
|---|---:|---:|
| Firebase/Auth production backend requests | Exactly 0 | 0 in every profile |
| External application hosts | Google Fonts and `data:` only | Same |
| Total cold-workflow requests | ≤80 | 69–77 |
| Map asset requests through switch workflow | ≤5 | 4–5 |

These browser requests cover local app/assets and fonts. Mock logical snapshots do not create network requests, so total browser bytes cannot be interpreted as Firestore traffic.

## Clan/social boundary

Clan/social UI is not opened by this Phase 0 map workflow, so its base budget is zero. No numeric open-panel allowance is established because it was not measured. A future benchmark that opens those surfaces must report:

- Listener keys and category count before opening.
- Increment while open.
- Unsubscribe count and return to zero on close.
- Duplicate count.
- Initial and update document cardinality.

Do not fold an unmeasured clan/social allowance into the base 17.

## Regression policy

- Fail on any duplicate, missing unsubscribe, old-region listener, or nonzero production-backend request.
- Fail if base active listeners are not exactly 17 or category counts drift.
- Review any increase in 23 logical deliveries, four presence writes, or the document formula.
- Do not claim billing/read-rate success from the adapter. Use Firebase emulator/staging metrics before changing realtime architecture.
- Keep the broader audit recommendations—scoped presence, smaller activity/report live heads, and on-demand social streams—as Phase 1 candidates only; Phase 0 does not implement them.
