# Phase 1 correctness and visual QA

Date: 2026-08-13

## Correctness result

No gameplay correctness regression was found. The full repository validator
suite and lint pass after the production change.

The change does not modify mission timestamps, progress formulas, paths,
arrival, combat, troop state, server calls, or item behavior. King Power is
shared only inside a display batch and cleared before the next frame.

## Automated gameplay coverage

The repository's complete `functions` test script passed, including the focused
validators below:

| Behavior | Evidence |
|---|---|
| Attack/scout/transfer map position and endpoint behavior | `validate-map-interactions.js` |
| Active outgoing mission categories | `validate-active-operations.js` |
| Time-based authoritative launch/routes | `validate-authoritative-army-orders.js`, `validate-world-routes.js` |
| Swift March launch and active-march use | `validate-swift-march-order.js` |
| Swift March return progress/timing | `validate-peace-shield-returns.js`, `validate-allied-target-return.js` |
| Recall/return behavior | return, rally, and active-march validators in the full suite |
| Reinforcement travel/return/privacy | `validate-clan-reinforcements.js` |
| Rally lifecycle, movement, recall authority, settlement | `validate-clan-rallies.js` |
| Reconnect/foreground listener recovery | `validate-foreground-resume.js`, `validate-realtime-health.js` |
| Stable enemy visual tiers after delegated renderer wrapper | `validate-weaker-kingdom-protection.js` |
| King Power formula and display | `validate-king-power.js`, `validate-stat-breakdowns.js` |

`pnpm run lint` and `pnpm test` both exit 0. The expected invalid-audio decode
warning inside the audio-unlock negative test remains non-fatal and its validator
passes.

## Visual density matrix

The authenticated-equivalent loopback fixture was inspected in the in-app
browser at a 1440x900 viewport. Scenario C supplied enough entities for every
density while preserving its 150-city map.

| Requested marches | Visible tokens | Route nodes | Missing transforms | Result |
|---:|---:|---:|---:|---|
| 1 | 1 | 2 | 0 | Pass |
| 10 | 10 | 20 | 0 | Pass |
| 25 | 25 | 50 | 0 | Pass |
| 50 | 50 | 100 | 0 | Pass |
| 100 | 100 | 200 | 0 | Pass |

At every density, route shape, token placement, direction, badges, troop labels,
and city readability remained coherent. The 100-march view is intentionally
dense but does not omit marches or routes.

## Mission semantics

A five-march visual fixture forced one of each mission kind. DOM and visual
inspection confirmed:

| Mission | Token title/label | Route semantic class | Result |
|---|---|---|---|
| Attack | attack | `attack-route` | Pass |
| Transfer | transfer | `transfer-route` | Pass |
| Scout | scout | `scout-route` | Pass |
| Reinforcement | reinforce | support/transfer presentation | Pass |
| Rally join | rally_join | support/transfer presentation | Pass |

All five token transforms changed over a 1.1-second observation while their
countdown text remained on the slower clock. This confirms time-based movement
without per-frame countdown churn.

## Reload and map lifecycle

- Reload restored all five mixed mission types and all ten route nodes.
- Restored token positions had advanced according to timestamps; they did not
  restart from the route origin.
- The full benchmark switched to the neighboring region and back through the
  production map-switch runtime on every successful profile.
- After each round trip, the primary region restored its exact march count.
- Listener count returned to 17 with zero duplicates and the established eight
  region-listener removals/additions.

The deterministic fixture does not consume Swift March or Recall Horn items in
the browser because those actions require server-authoritative inventory
mutation. Their functional/timing paths are covered by the passing client/server
validators listed above; the Phase 1 production diff does not touch those paths.

## Known limitations

- Stable headless CDP exposes script/style/layout counters but not defensible
  paint or compositor duration. No paint/composite value is invented.
- B and C mobile 4x full workflows exceeded the 180-second watchdog.
- C nominal zoom remains below its capacity gate, although C now initializes
  and passes idle/pan/p95 targets.
- Physical Android device acceptance remains future work.
