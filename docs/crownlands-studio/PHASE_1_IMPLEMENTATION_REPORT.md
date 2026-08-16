# Crownlands Studio — Phase 1 Implementation Report

Date: 2026-08-16

Branch: `codex/crownlands-studio-phase-1`

Baseline: `696eec4d`

## Outcome

Phase 1 is implemented as a preservation-first expansion of the existing Crownlands browser builder. World Layout, Region Edit, Balance, and HUD Layout still use their existing code paths. A new Studio shell adds project context, UI foundations, controlled previews, structured QA, a shared dirty/save lifecycle, safer project writes, and a packaged Windows desktop application.

No gameplay rules, Firebase schema, world content, balance values, production deployment configuration, or game-screen logic were changed.

## Delivered areas

| Area | Phase 1 result |
| --- | --- |
| Desktop shell | Electron 43 application, first-run native folder picker, remembered project, native File menu, no visible terminal or browser tab |
| Project validation | Requires the game entry, editor/server, Studio controller/service, asset manifest, world layout, economy files, and UI layout file |
| World | Existing World Layout and Region Edit preserved under the top-level World area |
| Balance | Existing Economy editor preserved under top-level Balance |
| UI Studio / Theme | Read-only semantic Crownlands token foundation; intentionally no unsafe whole-game theme migration |
| UI Studio / Components | Isolated preview using the live `styles.css` and `interface-theme.css`; seven current action-button variants plus shared panel/header/close examples |
| UI Studio / Screens | Controlled same-style screen-preview route with explicit Phase 2 extension points |
| UI Studio / HUD Layout | Existing drag/resize/snap/alignment/undo/redo editor preserved |
| Responsive previews | Desktop 1440×900, phone landscape 844×390, small phone landscape 667×375 |
| QA | Structured local issues, status/severity/categories, affected area, component, description, expected behavior, notes, relevant files, filters, and search |
| Context | Project, branch, shared unsaved state, status line, and expandable operation log |
| File safety | Root-constrained allowlists, traversal rejection, atomic writes, recoverable pre-write backups, and fail-closed load handling |

## Desktop architecture

Electron was selected for Phase 1 because the audited editor service is already Node/CommonJS and can be reused directly. The desktop main process validates and remembers the selected project, starts its editor service on an ephemeral `127.0.0.1` port, and opens one sandboxed window. The renderer has `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`. Its preload bridge exposes only project-picker, dirty-state, coordinated-save, and save-result messages.

Editor HTML is served with a restrictive Content Security Policy. Static path resolution uses a relative-path containment check, and the shared `interface-theme.css` source is explicitly available to the isolated preview routes.

Close or project-switch actions with unsaved changes present native Save, Discard, and Cancel choices. Save asks the renderer to complete the combined world/economy/HUD/QA save; a failed branch leaves the window open and reports the error.

See [STUDIO_ARCHITECTURE.md](STUDIO_ARCHITECTURE.md) for the detailed boundary and [DESKTOP_SETUP.md](DESKTOP_SETUP.md) for run/build instructions.

## File safety and persistence

`tools/crownlands-studio/project-file-service.js` is the single project-write boundary used by the existing editor service. It:

- Accepts only normalized project-relative paths.
- Rejects absolute paths, traversal, and paths outside the selected root.
- Restricts reads/writes to explicit files plus world region/map prefixes.
- Writes to a temporary sibling and atomically renames it.
- Copies the previous version to `.crownlands-studio/backups/<path>.bak` before replacement.
- Returns path-specific errors.

QA user state is saved to `.crownlands-studio/qa-issues.json`. That store, its backups, dependencies, packaging output, and release artifacts are ignored by Git. The tracked `tools/crownlands-studio/qa-seed.json` supplies the six initial issues.

If world, economy, HUD, or QA loading fails, Studio displays the error and disables the combined save path. Fallback UI data cannot overwrite the source files.

## Seeded QA records

1. City troop counter appears doubled.
2. Scout Report theme mismatch.
3. Action hex fill / conflicting colors.
4. Flag editor color swatches.
5. Flag heraldic symbols.
6. City owner flag rendering.

These are records only. Phase 1 does not silently fix gameplay or production UI behavior.

## Verification evidence

Automated checks:

- `pnpm check` in `tools/crownlands-studio` — syntax checks plus 8/8 Studio service, API, shell, preview, and Electron-boundary tests passed.
- `node tools/validate-map-editor-layout.js` — 1,059 positions and 9 editor-controlled sizes passed.
- `node tools/validate-ui-layout-editor.js` — passed.
- `node tools/validate-economy-balance.js` — passed.
- `node tools/validate-world-routes.js` — 15 maps, 36 connections, no route issues.
- `node tools/validate-runtime.js` — 15 maps and server-authoritative manifest passed.
- `git diff --check` — passed.

Interactive checks in the local Studio page:

- World shell loaded 15 regions, 1,050 cities, 5 Strongholds, 4 Camps, and 36 edges.
- Crownlands Heart Region Edit rendered 102 city markers and 4 edge zones.
- Balance rendered all seven existing economy sections.
- Theme rendered all 14 semantic tokens.
- Component preview rendered seven action variants and the shared commander panel example.
- Component and screen previews switched to all three required viewport dimensions.
- HUD Layout rendered its 12 existing editable components and both existing device presets.
- QA rendered six seeded records; Gameplay / Functional Bug filtering returned two and `flag` search returned three.
- An unsaved QA form edit changed the shared header state from `No` to `Yes`.
- No console errors, browser warnings, or failed images were observed across the checked views.

The in-page validation command reports 1,787 existing content advisories, dominated by name/level overlap checks and one center-region capacity warning. These are visible existing map-content warnings; the dedicated map/runtime/route regression validators above all pass.

Desktop/package checks:

- Electron source checks and all eight Studio tests passed through `pnpm check`.
- `electron-builder` produced an x64 NSIS installer and portable executable.
- The unpacked packaged application launched against this isolated worktree, remained responsive, and opened its editor service on an ephemeral loopback port.
- The smoke-test process tree was stopped after verification.

Artifacts:

- `release-artifacts/crownlands-studio-phase-1/Crownlands Studio Setup 0.1.0.exe`
  - SHA-256: `0D04A70D10B200EEC0039AB471D231118789F861D8C3AE2E2351E73281F523B1`
- `release-artifacts/crownlands-studio-phase-1/Crownlands Studio 0.1.0.exe`
  - SHA-256: `15E80B02BD2E02438E0CB6E916624BDE40154034377041EE9E95B353F29B1B49`

## Screenshots

- `screenshots/01-world-studio.png`
- `screenshots/02-balance-studio.png`
- `screenshots/03-ui-theme.png`
- `screenshots/04-ui-components-desktop.png`
- `screenshots/05-ui-components-phone-844x390.png`
- `screenshots/06-ui-components-small-667x375.png`
- `screenshots/07-ui-screen-preview.png`
- `screenshots/08-ui-hud-layout.png`
- `screenshots/09-qa-studio.png`

## Remaining risks and Phase 2 candidates

- Theme values are a read-only semantic registry in Phase 1. Editable tokens require a shared game/runtime token contract first.
- The Screens surface is a controlled same-style foundation; Profile, detailed Scout Report, Inner Castle, and other live screen renderers should be extracted and mounted there in Phase 2.
- The loopback API is restricted to the local machine and an ephemeral port but is not authenticated. Direct IPC or a per-session token would further harden it.
- The selected project executes its own local `tools/editor-server.js` in the main process; the folder picker therefore accepts only trusted Studio-compatible Crownlands worktrees.
- Multi-file world saves are atomic per file and backed up, but are not one transaction across every compatibility output.
- Developer artifacts are not signed with a trusted publisher certificate, so Windows SmartScreen may warn on another machine.
- macOS/Linux packaging is outside the Phase 1 Windows deliverable.

Recommended next step: extract the first real shared screen renderer (Scout Report is a good candidate), add screenshot-based visual regression baselines for the three preview sizes, then migrate theme values behind a versioned token contract.
