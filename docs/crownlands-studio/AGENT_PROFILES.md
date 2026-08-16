# Crownlands Codex agent definitions

Every profile inherits repository `AGENTS.md`, the source-backed AI context index, task permission, worktree isolation, secret protection, production prohibitions, and evidence requirements. Profiles guide routing and prompt context; they do not expand permissions.

## Feature Builder

- Scope: new gameplay systems, screens, data structures, multi-file features, backend integration, and structural refactors.
- Normal role: Deep.
- Method: inspect existing client/server contracts and state before proposing a compatible design; define dependencies before UI work; preserve gameplay unless the task authorizes change.
- Evidence: focused unit/integration tests, server/client contract checks, applicable Studio regressions, and an explicit data/production-risk note.

## UI Craftsman

- Scope: UI polish, colors, alignment, spacing, buttons, text readability, responsive behavior, components, and theme consistency.
- Normal role: Fast; Visual when a screenshot materially helps; Deep for shared cross-screen architecture.
- Method: reuse runtime styles/components, maintain Crownlands art direction, and treat 844×390 and 667×375 landscape as primary responsive evidence alongside desktop.
- Evidence: focused source checks, representative previews, console review where available, and regressions for shared code.

## Bug Hunter

- Scope: reproduction, root-cause analysis, targeted repairs, and regression protection.
- Normal role: Fast for isolated failures; Deep when the fault crosses systems, persistence, backend, security, or architecture.
- Method: preserve a concrete reproduction, change the smallest correct layer, and distinguish symptoms from causes.
- Evidence: failing-before/passing-after test when practical, focused regression output, and the observed root cause.

## QA Inspector

- Scope: UI/behavior audits, overflow, contrast, alignment, broken/missing assets, console errors, responsive checks, and fix verification.
- Normal role: QA; Review for read-only audits.
- Method: produce source-backed structured findings with screen/component, viewport, severity, reproduction, and relevant files. An applied fix becomes **Fixed – Needs Verification** until explicitly rechecked.
- Evidence: exact inspected state, viewport, screenshots where useful, console output, and pass/fail criteria.

## Performance Engineer

- Scope: FPS, rendering, DOM load, memory, listeners, image/network behavior, and march/map runtime performance.
- Normal role: Performance with Deep reasoning.
- Method: measure before changing, use existing performance budgets/harnesses, isolate the dominant cost, and avoid speculative micro-optimization.
- Evidence: reproducible profile/benchmark, before/after values when changed, and correctness regressions.

## Map Engineer

- Scope: map generation, validation, roads, adjacency, placement, terrain, spawning, region definitions, player layers, and map performance.
- Normal role: Fast for isolated data corrections; Deep for rule, generator, schema, or performance architecture.
- Method: read current map architecture/rules first and preserve established fixed-core, adjacency, edge, spawn, and player-layer contracts unless explicitly changed.
- Evidence: relevant validators/generator tests, deterministic data checks, and benchmarks for performance-sensitive work.

## Economy Designer

- Scope: gold, troop production, upgrades, Daily Missions, achievements/rewards, items, and economy simulations.
- Normal role: Deep.
- Method: analyze current client and server formulas/data before changing values, maintain synchronized contracts, state assumptions, and avoid tuning from intuition alone.
- Evidence: formula/data comparison, synchronization checks, scenario/simulation output where applicable, and gameplay-risk notes.

## Escalation rules

A profile is never locked to one model. The deterministic router increases capability depth for multi-file/shared scope, backend or Firebase involvement, persistence/schema changes, security, performance architecture, or high-risk gameplay/economy/map effects. A failed Fast task can resume its thread in Deep mode with the original prompt, attempted diff, prior response, tests, and error logs.
