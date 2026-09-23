# Training Grounds design draft

Branch: `codex/training-grounds-draft`. Base: `5e7a2544e050f387e83a7449b728e62527e01033`.

An isolated, interactive design proposal following the approved Workshop and Infirmary layouts. Pending visual approval; this is not integrated into the game. All sample state stays in memory. Upgrade buttons cannot spend real Gold or call the backend.

## Presentation

- Existing staged Training Grounds artwork and completed level on the left, Overview / All levels on the right.
- Current and next-level rally attack strength, described as additional percentage points.
- Explain that every participant in a rally launched from this Tower receives the bonus, added to their own Swordmastery and equipped attack gear. The completed level is locked at launch and survives subsequent upgrades or ownership changes.
- Clarify that solo attacks, Tower defense, city-origin rallies and troop production receive no benefit.
- An expandable example uses 10,000 base attack power and selectable 0%, 30% or 50% combined skill/gear bonuses. It demonstrates additive arithmetic only; it is not a battle forecast or a proposal to change skill caps.
- Clan Treasury in the header; cost, construction time/countdown, upgrade action and reason stay visible in the footer. Detail and artwork columns scroll independently.

## Existing rules

The Master Development Specification's Clan Tower buildings section and `clan-tower-buildings.js` remain authoritative. Training Grounds adds 1 percentage point per completed level, up to 10 at Level 10. Level 0 adds none. Shared helpers provide art stages, bonuses, costs and durations.

Only Leaders and Officers start construction using Clan Treasury. Fully repaired walls, no incoming attacks and no other building project are required. Attack/damage pauses work; completed benefits remain active. There is no queue, cancellation or refund. This draft proposes no mechanics changes.

## Review

Run `node tools/map-benchmark/start-server.js 61704`, then open:

`http://127.0.0.1:61704/docs/visual-qa/training-grounds/index.html?viewport=desktop&level=4&sample=ready`

The review controls offer desktop (1440 × 900), mobile landscape (844 × 390) and small landscape (568 × 320), all at native dimensions. Use the full-window link to remove the review controls. Level and sample controls cover unbuilt through Level 10, ready, construction, pause, incoming attack, damaged walls, another building project, low/unavailable Treasury, ordinary member and retry after a failed sample upgrade. Reset/close cancels a pending simulated request.

## Validation

`node tools/validate-training-grounds-draft-browser.js` checks the three sizes, visible footer and click targets, independent scrolling and reachable level rows, loaded art stages, shared values, blocked states, simulated upgrades/retries/reset, additive example arithmetic and outer review controls. Screenshots and results go to ignored `release-artifacts/training-grounds/`.

Game integration, its live snapshot/action checks, PR preparation and deployment follow approval. No production source, backend function, game state or release configuration changes in this draft.
