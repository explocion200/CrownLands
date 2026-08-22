# Save, Commit, and Push Workflow

These are deliberately separate operations.

## Save

**Save Changes** writes only `ui-studio-config.json` through the selected project's protected file service. Studio shows the pending human-readable changes and affected file before confirmation. The service validates the project, allowlist, normalized path, schema, source mapping, value bounds, and contrast; writes to a temporary file; creates a backup; then atomically replaces the config.

A UI-only Save does not call map, economy, HUD, gameplay, deployment, or Firebase writers.

## Review and commit

The Source Control area always shows branch and dirty status. Existing unrelated changes are reported, not hidden. **Review Changes** displays the config diff and the inspector's human-readable pending summary.

**Commit Changes** requires a non-empty message and an explicit confirmation. It is restricted to `ui-studio-config.json`, refuses `main`/`master`, and refuses to proceed when unrelated files are already staged. Saving never commits automatically.

## Push

**Push** is enabled only after a clean commit and requires a separate confirmation showing the current branch, commit, and `origin` destination. It never merges and never deploys. A missing origin, protected branch, dirty UI config, or declined confirmation stops the operation with a visible explanation.

If Studio opens on a dirty project, the banner and source-control panel identify that state. Editing may continue safely in preview; Save remains constrained to the UI config and does not overwrite unrelated files. Review or commit the existing work separately as appropriate.
