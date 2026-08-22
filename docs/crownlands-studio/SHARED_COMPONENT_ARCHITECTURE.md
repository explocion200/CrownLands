# Shared Component Architecture

Phase 2A adds a presentation-only component layer while leaving Crownlands gameplay and Firebase configuration authoritative and untouched.

## Files and responsibilities

- `ui-studio-config.json` is the single editable UI settings document. It holds shared component states, responsive overrides, minimal screen placement overrides, migration metadata, and generic visual overrides.
- `ui-component-runtime.js` validates safe CSS-shaped values and converts the saved configuration into a single runtime style element. Its source map connects Studio element IDs to real Crownlands selectors.
- `tools/crownlands-studio/ui-editor-service.js` owns the component/screen registry, sanitization, validation, contrast calculation, close-button audit, and protected atomic save.
- `tools/map-editor/ui-inspector.js` owns temporary preview state, selection, undo/redo, QA, pending history, and explicit save/source-control actions.
- `tools/crownlands-studio/project-file-service.js` remains the filesystem boundary. Only allowlisted paths can be written; writes are validated, atomic, backed up, and constrained to the selected project.

The renderer has no Node.js, filesystem, shell, or Git access. Desktop Git operations are exposed through narrow validated IPC methods in `preload.js` and `main.js`.

## Component registry

The initial library catalogs Close, Primary, Secondary, Destructive, Alert, Action, Claim, and Icon Buttons; Tab and Selected Tab; Modal Frame; Panel Header; Text Input; Progress Bar; and Badge. It records supported states and known usages without forcing a broad visual redesign.

The Close Button is the first normalized component. `.cl-shared-close` is attached to the three stable existing controls, so existing IDs, listeners, dialog closing, and profile/commander behavior remain unchanged. One central record controls all visuals; screen records contain placement only.

Each central component change increments its configuration version. This produces one reviewable config diff instead of duplicate CSS edits across every screen.
