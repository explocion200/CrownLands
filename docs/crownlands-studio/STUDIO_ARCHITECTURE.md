# Crownlands Studio Architecture

## Runtime boundary

```text
Windows / Electron main
  ├─ validates and remembers a trusted Crownlands project
  ├─ starts that project's editor service on 127.0.0.1:<ephemeral>
  ├─ owns native menu, folder picker, and close workflow
  └─ exposes a narrow preload bridge
       │
       ▼
Sandboxed Studio renderer
  ├─ existing editor.js: World + Balance
  ├─ existing hud-editor.js: HUD Layout
  ├─ studio.js: shell + previews + QA + dirty/log context
  ├─ codex-ai.js: AI planning, history, review, and settings UI
  └─ relative HTTP APIs only
       │
       ▼
Existing editor service
  ├─ current normalization and compatibility builders
  ├─ Studio context + QA endpoints
  └─ project-file-service.js
       ├─ explicit read/write allowlists
       ├─ root/traversal checks
       ├─ atomic replacement
       └─ .crownlands-studio/backups

Electron main AI workspace
  ├─ validates narrow AI IPC requests
  ├─ persists task records atomically
  ├─ creates protected Git task worktrees
  ├─ runs the official local Codex SDK sandbox
  ├─ validates and previews isolated results
  └─ applies only an explicitly approved checked patch
```

## Process responsibilities

### Electron main

- Native project selection and validation.
- Remembered last project in Electron `userData`.
- Project service lifecycle.
- Sandboxed `BrowserWindow` construction.
- Navigation/window-open restrictions.
- Native Save/Discard/Cancel coordination.

### Preload

The preload does not expose Node, `fs`, shell execution, paths, or generic IPC. It exposes named project/save messages and a frozen AI object whose methods map to validated task lifecycle handlers.

### Renderer

The renderer remains the existing framework-free editor. Existing element IDs and mode handlers are preserved. `studio.js` coordinates only the new shell, QA records, responsive previews, context, operation log, and shared dirty indicator.

### Editor service

World, economy, HUD, uploads, compatibility data, and legacy routes keep their existing sanitizers. Direct write operations were replaced with the project-file service. The service also exposes read-only Studio context and structured QA GET/POST endpoints.

## Write allowlist

Exact managed files:

- `world-config.js`
- `economy-config.js`
- `functions/economy-config.json`
- `functions/world-layout.json`
- `ui-layout-config.js`
- `assets/map-editor-data.js`
- `assets/worlds/world_01/world-layout.json`
- `.crownlands-studio/qa-issues.json`

Managed prefixes:

- `assets/worlds/world_01/regions/`
- `assets/worlds/world_01/maps/`

The seed file is readable but not writable. Backups are internal to the file service and never accepted as renderer-supplied paths.

## Preview strategy

Component and screen previews use sandboxed same-origin iframes and load the current game `styles.css` plus `interface-theme.css`. `studio-preview.css` isolates preview layout so game rules do not restyle the outer Studio shell.

Phase 1 deliberately avoids copying full production screens. The controlled screen route proves the shared-style contract without initializing Firebase or player state. Phase 2B can serve those preview routes from an isolated task worktree through a GET/HEAD-only static server with a strict CSP; AI-modified server code is never imported into the privileged main process. Future screen renderers should be extracted into shared modules and mounted by both game routes and Studio previews.

The complete Phase 2B lifecycle, persistence, routing, and future orchestration boundary are documented in `PHASE_2B_ARCHITECTURE.md`.

## Future migration path

1. Version and externalize semantic theme tokens.
2. Extract shared component renderers, starting with action hexes and report panels.
3. Extract controlled Profile, Scout Report, and Inner Castle renderers.
4. Add screenshot baselines per preview size.
5. Add a per-session API token or move project operations to narrow IPC.
6. Consider Tauri only after the Node service can be replaced or cleanly packaged as a separately secured sidecar.
