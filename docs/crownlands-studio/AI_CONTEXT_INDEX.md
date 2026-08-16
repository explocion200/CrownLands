# Crownlands AI context index

This index tells Codex agents where current repository truth lives. It is a routing document, not a duplicate design specification. Inspect the linked source before making claims or changes.

## Application architecture

- Game entry and shell: `index.html`, `app.js`, `styles.css`, `interface-theme.css`.
- UI layout configuration/runtime: `ui-layout-config.js`, `ui-layout-runtime.js`.
- Client Firebase access and state integration: locate the relevant modules from `app.js` imports/usages; do not infer production contracts from UI alone.
- Firebase Functions: `functions/`; inspect the exact callable/trigger and adjacent tests/config before changing it.
- Crownlands Studio architecture: `docs/crownlands-studio/STUDIO_ARCHITECTURE.md` and `docs/crownlands-studio/PHASE_2B_ARCHITECTURE.md`.
- Studio desktop trust boundary: `tools/crownlands-studio/main.js`, `preload.js`, `project-file-service.js`, and `ai/`.
- Studio renderer: `tools/map-editor/index.html`, `editor.js`, `studio.js`, `hud-editor.js`, and `codex-ai.js`.

## Gameplay and economy

- Client economy configuration: `economy-config.js`.
- Server economy configuration: `functions/economy-config.json`.
- Balance editor synchronization logic: `tools/editor-server.js`.
- Gameplay behavior: inspect the feature's current source and Firebase Function contract. Do not treat roadmap or QA prose as authoritative runtime behavior.
- Roadmap UI/data: `roadmap.html`, `roadmap.js`, `roadmap-data.js`. Treat it as product intent and verify implementation state in source.

## World and map rules

- Current world layout: `assets/worlds/world_01/world-layout.json`.
- Region definitions/maps: `assets/worlds/world_01/regions/` and `assets/worlds/world_01/maps/`.
- Region catalog and generation sources: locate `region-catalog` and generator modules referenced by `tools/editor-server.js` and current game code.
- Architecture and rule documentation: `docs/map-scaling-audit/CURRENT_ARCHITECTURE.md`, `DYNAMIC_REGION_READINESS.md`, and the relevant phase directory.
- Performance budgets and profiles: `docs/map-scaling-audit/phase-0/PERFORMANCE_BUDGETS.md`, `REALTIME_BUDGETS.md`, later phase results, and scripts in root `package.json`.
- Map changes must preserve established adjacency, edge, spawn, player-layer, and fixed-core assumptions unless the task explicitly changes those rules.

## UI and art direction

- Runtime styles: `styles.css` and `interface-theme.css`.
- HUD/device layout: `ui-layout-config.js` and `ui-layout-runtime.js`.
- Art direction: `docs/CROWNLANDS_ART_BIBLE.md` and the relevant shared visual spec under `docs/art-prompts/`.
- Current visual gaps/migration intent: `docs/CROWNLANDS_REMAINING_VISUAL_GAPS.md` and `docs/CROWNLANDS_VISUAL_MIGRATION.md`; verify current source before assuming an item is unfinished.
- Visual evidence: use the relevant `docs/visual-qa/` or `docs/map-scaling-audit/**/visuals/` artifact only when its date/phase matches the current code.

## Studio and QA state

- Phase 1 audit: `docs/crownlands-studio/PHASE_1_AUDIT_AND_PLAN.md`.
- Phase 1 implementation state: `docs/crownlands-studio/PHASE_1_IMPLEMENTATION_REPORT.md`.
- AI architecture/routing/security: the Phase 2B documents in this directory.
- Structured live QA state: `.crownlands-studio/qa-issues.json` (development-local and ignored). Seed only: `tools/crownlands-studio/qa-seed.json`.
- AI task history/attachments/recovery patches: `.crownlands-studio/ai/` (development-local and ignored).

## Context retrieval policy

1. Start with the task and attached Studio selection.
2. Read `AGENTS.md` and this index.
3. Inspect the listed authoritative source for the relevant subsystem.
4. Use current structured QA/context data only if the task attaches it or it exists locally.
5. Expand to adjacent modules only when imports, call paths, tests, or failures show they are relevant.
6. Cite exact files and actual test/measurement output in the final task report.

Do not paste the full context index into prompts; Codex automatically discovers `AGENTS.md`, and the task prompt points here when broader context is required.
