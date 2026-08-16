# Crownlands Studio Phase 1 — Builder Audit and Implementation Plan

Date: 2026-08-16

Baseline: commit `696eec4d` (`codex/map-scaling-phase-6f`)

Studio branch: `codex/crownlands-studio-phase-1`

## Executive decision

Phase 1 will preserve the existing browser builder and its Node service, evolve the current editor page into the Crownlands Studio shell, and package the same code in an Electron desktop window.

Electron is the Phase 1 desktop choice because the existing save layer is already a substantial CommonJS/Node service. Electron's main process can run that service without a second runtime, while a sandboxed renderer continues to use the existing HTML, CSS, JavaScript, and relative HTTP APIs. This is the lowest-risk path to a double-clickable Windows application without rewriting the editor or duplicating its file normalization logic.

Tauri remains a credible later optimization after the file service is independent of the HTTP server. Using it now would require either porting the current service to Rust or packaging Node as a sidecar. The audited machine also lacks `cargo`, `rustc`, and the required Tauri build toolchain. Tauri's Windows development requirements include Rust, Microsoft C++ Build Tools, and WebView2; its sidecar model supports external binaries but would add a second packaging layer. See the official [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), [process model](https://v2.tauri.app/concept/process-model/), and [sidecar documentation](https://v2.tauri.app/develop/sidecar/).

Electron's main/renderer split directly matches the current Node-service/web-UI split. The renderer will keep Node integration disabled, context isolation and sandboxing enabled, and receive only a narrow desktop bridge. See Electron's official [process model](https://www.electronjs.org/docs/latest/tutorial/process-model), [IPC guidance](https://www.electronjs.org/docs/latest/tutorial/ipc), and [security checklist](https://www.electronjs.org/docs/latest/tutorial/security).

## Current builder architecture

### Entry and launch flow

| Concern | Current behavior |
| --- | --- |
| Editor page | `tools/map-editor/index.html` |
| Frontend scripts | `tools/map-editor/editor.js`, then `tools/map-editor/hud-editor.js` |
| Editor styles | One global file: `tools/map-editor/styles.css` |
| Backend entry | `tools/editor-server.js` |
| Launcher | `tools/start-editor.ps1` |
| Bind address | `127.0.0.1` only |
| Preferred port | `8791`, with fallback through 20 subsequent ports |
| Editor URL | `http://127.0.0.1:8791/editor/` |
| Game preview URL | `http://127.0.0.1:8791/game/` |

The PowerShell launcher resolves the repository from its own location, locates Node on `PATH` or in the Codex runtime cache, changes to the repository, and runs the Node server in the foreground. A terminal must remain open and a normal browser must be opened separately. This is why Codex or a manual shell/browser sequence is currently needed.

The editor cannot function as plain static HTML. Static rendering is possible, but authoritative world, economy, HUD, and map-image operations depend on `/api/*` routes. A failed world request currently creates an in-memory fallback world; economy and HUD load failures are reported through the status line.

### Frontend structure

The builder is a framework-free single-page application.

- `index.html` contains the toolbar, World Layout, Region Edit, Economy, Game UI/HUD layout editor, inspector, validation, counts, and status bar.
- `editor.js` is an IIFE containing world/economy state, normalization, rendering, drag/pan/zoom behavior, import/export, validation, and save orchestration.
- `hud-editor.js` is a second IIFE containing device presets, component layout state, snapping, resizing, alignment, visibility/locking, undo/redo, validation, load, and save.
- `styles.css` contains the full editor presentation. It uses root color variables but is otherwise one global stylesheet organized by feature blocks rather than modules.

There is no frontend bundler, framework runtime, or production dependency for the editor page.

### Existing functionality to preserve

The audit confirms the following implemented tools:

- World grid layout and region selection.
- Add, drag, select, edit, and delete regions.
- Region image upload with 4:3 validation and immediate preview.
- Region pan and zoom from 15% to 300%.
- Add, drag, edit, size, horizontally flip, and delete cities, Camps, Strongholds, and the Crown Citadel where applicable.
- City UI-footprint and overlap visualization.
- Camp types and reward overrides.
- Stronghold types, rewards/bonuses, levels, troops, and art paths.
- North/south/east/west edge connections and draggable switch-arrow points.
- JSON import/export.
- World, layout, object, connection, economy, and HUD validation.
- Economy editing for shop items, pickups, production, combat/siege values, costs, skills, level rewards, and Camp defaults.
- HUD layout editing with landscape-tablet and desktop presets, snapping, drag/resize, alignment, reset, undo/redo, and preview-only mode.
- Feature search across map, economy, and HUD controls.

### Browser APIs and assumptions

The frontend uses standard DOM events, Pointer Events, wheel events, `fetch`, `Blob`, object URLs, anchor-download behavior, `File`, `FileReader`, `Image`, file inputs, `window.confirm`, and `beforeunload` in the HUD module.

No browser File System Access API is used. UI components never receive arbitrary filesystem paths. All project writes go through the local Node service.

Relative `/api/*`, `/assets/*`, and `/game/*` URLs assume an HTTP origin. Hardcoded localhost text exists in documentation and error guidance, while the runtime endpoints themselves are relative. The current service contains a GitHub download URL for a legacy world-config import route, but the current editor UI does not call that route.

### Backend and file access

`tools/editor-server.js` uses only Node built-ins plus two local Crownlands modules:

- `tools/city-name-utils.js`
- `region-catalog.js`

It also reads `assets/optimized/manifest.json` during startup. No npm package is required for the existing service.

The backend performs schema cleaning and numeric bounds checking before saving. It uses temporary files plus rename for economy and HUD configuration, but world writes are currently direct and sequential. Static-file path resolution uses a `safeJoin` check. Map uploads sanitize IDs/extensions and restrict deletion to a region-prefixed filename under the world map directory.

#### Files directly written

- `assets/worlds/world_01/world-layout.json`
- `assets/worlds/world_01/regions/*.json`
- `assets/worlds/world_01/maps/*` for uploaded images; a previous editor-owned image may be removed
- `assets/map-editor-data.js`
- `functions/world-layout.json`
- `economy-config.js`
- `functions/economy-config.json`
- `ui-layout-config.js`
- `world-config.js` only through legacy API routes not used by the current editor page

#### Files directly read

- All written data sources above
- `assets/optimized/manifest.json`
- map images, thumbnails, icons, and other `/assets/*` preview resources
- selected root game files exposed through the local preview server
- local code modules listed above

The game reads the world-region/catalog outputs, economy outputs, and HUD layout output. The editor therefore modifies development source and generated compatibility/server artifacts, not player/Firebase data.

### Save and dirty state

The current top-level Save action sends world, economy, and HUD writes concurrently and reports partial failures. Map JSON export includes the HUD configuration. World/economy edits set a shared `state.dirty`; the HUD has its own dirty flag and a `beforeunload` guard.

Gaps found:

- World/economy dirty state does not currently have its own `beforeunload` guard.
- Individual world/economy save functions clear the shared dirty flag before all three save branches have succeeded.
- Browser `beforeunload` cannot offer named Save/Discard/Cancel actions.
- A world-load error constructs editable fallback data, which creates an accidental-overwrite risk if Save is later allowed.
- There is no project-root selection or validation; the server assumes its parent directory is the project.
- There is no backup layer for project writes.

### Development and production dependencies

The root `package.json` contains development benchmark scripts and no dependency declarations. The existing editor requires Node at development/runtime only because its backend is Node. The browser game remains a static client plus Firebase services and is not being converted into a desktop dependency.

Phase 1 will add Electron and the Windows packager only in `tools/crownlands-studio`. They are Studio development/package dependencies and do not enter the game runtime or deployment output.

## Desktop technology comparison

| Option | Reuse | Package/runtime | Security model | Phase 1 risk | Decision |
| --- | --- | --- | --- | --- | --- |
| Tauri 2 | Reuses frontend, but not the Node service without a sidecar | Small native shell when backend is Rust; Node sidecar removes much of that advantage | Strong capability scopes and OS WebView | High: backend port/sidecar work, missing local toolchain | Revisit after service extraction |
| Electron | Reuses frontend and Node service directly | Larger because Chromium and Node ship with the app | Sandboxed renderer, context isolation, narrow preload bridge | Low/medium: packaging weight, careful IPC required | Selected for Phase 1 |
| Packaged local server + generic WebView | Reuses everything | Requires independently managing WebView and Node/server lifetime | Depends on wrapper; easier to leave writable loopback APIs exposed | Medium/high maintenance with no clear benefit over Electron | Not selected |

The selected design is still a packaged local-server/webview model internally, but Electron owns both lifetimes. The user sees one Windows application window, no browser tab, no URL, and no visible command prompt.

## Phase 1 target architecture

```text
Electron main process
  ├─ remembered project settings (Electron userData)
  ├─ native folder picker + project validation
  ├─ native File → Open Project
  ├─ close/save/discard/cancel coordination
  └─ existing Node editor service on loopback random port
       ├─ central allowlisted project file service
       ├─ world/economy/HUD APIs (preserved)
       ├─ QA issue API (local development store)
       ├─ Studio context/log API
       └─ editor + controlled game preview assets

Sandboxed renderer
  ├─ Crownlands Studio shell
  │    ├─ World → existing World Layout / Region Edit
  │    ├─ Balance → existing Economy
  │    ├─ UI Studio → Theme / Components / Screens
  │    └─ QA → structured local issue tracker
  ├─ existing editor.js and hud-editor.js
  ├─ Studio-only UI controller
  └─ narrow preload bridge (dirty state, save request, Open Project)
```

## Project-root and filesystem model

First launch uses a native directory picker. A folder is accepted only when known markers are present, including the current editor entry/service, world layout, browser/server economy configuration, optimized asset manifest, and game entry file. The chosen root is stored under Electron's per-user application-data directory, never hardcoded into project code.

The renderer receives project context but no direct filesystem API. Project writes remain behind the Node service. A new allowlisted project-file service will:

- Resolve and canonicalize the project root.
- Reject traversal and any resolved path outside that root.
- Restrict writes to specific config/data files and world region/map prefixes.
- Perform atomic temporary-file replacement.
- Maintain recoverable last-write backups under `.crownlands-studio/backups/`.
- Return readable errors with operation and project-relative path.

The QA store will use `.crownlands-studio/qa-issues.json`; this local development state and backups will be ignored by Git. A tracked seed file provides the known initial issues.

## Security implications and controls

Granting Studio write access can modify game and server-authoritative configuration. The main risks are wrong-root selection, path traversal, compromised renderer code, and interrupted multi-file saves.

Phase 1 controls:

- Validate markers before accepting a project.
- Bind the service to loopback on an ephemeral port in desktop mode.
- Disable renderer Node integration.
- Enable renderer sandboxing and context isolation.
- Expose a narrow preload API rather than `fs` or generic IPC.
- Keep all write paths in a central allowlist.
- Use atomic replacement and backups.
- Block Save after required-data load failures.
- Warn on close with Save, Discard, and Cancel.
- Do not load remote pages with desktop privileges.

Residual Phase 1 risk: another local process could discover the ephemeral loopback service and call its API while Studio is running. The allowlist limits the blast radius to Studio-managed project files. Replacing loopback APIs with direct authenticated IPC is a future hardening option once the service boundary is stable.

## Incremental implementation plan

1. Add the project/file service, QA seed/store, context endpoint, and integration tests without changing game logic.
2. Rework the existing editor HTML into the Studio shell while retaining every existing element ID and editor mode.
3. Route World and Balance to the existing views; place the existing HUD editor under UI Studio Screens.
4. Add read-only Theme and shared-style component previews, plus desktop/phone-landscape/small-phone-landscape viewport controls.
5. Add the QA Center with structured issues, filters, editing, notes, and persisted local state.
6. Add the compact project/branch/dirty status and expandable operation log.
7. Integrate global dirty/save state and load-error protection.
8. Add the Electron main/preload package with first-run project selection, remembered root, native menu, safe close workflow, and Windows build scripts.
9. Add Studio-specific structural, service, persistence, and desktop smoke tests.
10. Run existing editor, HUD, economy, routing, and game-runtime validators; perform visual and interactive checks at each major Studio area.

## Preservation and regression strategy

No gameplay logic, Firebase schema, production configuration, world data, economy values, art, or deployment configuration will be changed in Phase 1.

Existing IDs and functions used by `editor.js` and `hud-editor.js` will remain in place. New navigation will call the existing mode switchers rather than reimplementing map/economy/HUD behavior. The new component and screen previews will be isolated so game CSS cannot override the editor shell.

Baseline validations passed before implementation:

- `node tools/validate-map-editor-layout.js` — 1,059 editor positions and 9 object sizes validated.
- `node tools/validate-ui-layout-editor.js` — passed.
- `node tools/validate-economy-balance.js` — passed.
- `node tools/validate-world-routes.js` — 15 maps and 36 edge connections, no route issues.
- `node tools/validate-runtime.js` — 15 maps and server-authoritative manifest validated.

These checks, new Studio checks, API smoke tests, browser interaction checks, and a packaged desktop smoke test form the Phase 1 exit gate.
