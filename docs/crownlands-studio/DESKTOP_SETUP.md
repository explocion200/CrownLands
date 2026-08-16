# Crownlands Studio Desktop Setup

## Use the built Windows application

The local Phase 2B build provides both:

- `release-artifacts/crownlands-studio-phase-2b/Crownlands Studio Setup 0.2.0.exe` — Windows installer.
- `release-artifacts/crownlands-studio-phase-2b/Crownlands Studio 0.2.0.exe` — portable application.

Start either one. On first launch, choose the Crownlands Phase 2B repository/worktree. Studio validates the folder and remembers the last valid project under Electron's per-user application-data directory.

No command prompt or external browser is required. Use **File → Open Project** or the header's **Open Project** button to switch worktrees.

## Run from source

Requirements: Node.js 24+ and pnpm 11+.

```powershell
cd tools\crownlands-studio
pnpm install
pnpm start
```

For a deterministic local launch:

```powershell
pnpm start -- --project="C:\path\to\Crownlands"
```

The desktop package is isolated from the root game package. Installing it does not add Electron to the deployed game.

## Build the Windows artifacts

```powershell
cd tools\crownlands-studio
pnpm run check
pnpm dist:win
```

Fresh installs use pnpm's hoisted linker so the NSIS toolchain stays below legacy Windows path limits. Output is written to `tools/crownlands-studio/dist/` and is ignored by Git.

## Project selection rules

Studio accepts a folder only when it contains the expected game, editor, service, world, economy, UI-layout, and asset-manifest markers. An older Crownlands checkout without the Phase 1 Studio files must be updated before it can be opened.

The selected repository is trusted local development code. Studio does not scan or open unrelated folders and does not expose a general filesystem API to its renderer.

## Saving and recovery

The header's Unsaved chip covers World, Balance, HUD Layout, and QA changes. **Save to Game** writes all four branches and only clears the dirty state after every branch succeeds.

Before each replacement, Studio stores the previous file under:

```text
.crownlands-studio/backups/<project-relative-path>.bak
```

QA edits are stored at:

```text
.crownlands-studio/qa-issues.json
```

Both locations are local and ignored by Git. If required data fails to load, Save is disabled; fix the source error and reopen or reload the project.

## Codex AI prerequisites and task storage

Codex AI uses the official local SDK bundled in the desktop package and the user's existing Codex authentication/configuration. Confirm the runtime banner says **Local Codex ready** before running a task. A normal browser tab intentionally remains planning-disabled because privileged task operations are available only through hardened Electron IPC.

Safe Edit and Full Development require both the Studio dirty-state chip and `git status` to be clean. Task branches are named `codex/studio-task-<task-id>`, while development-local task records are stored at:

```text
.crownlands-studio/ai/tasks.json
.crownlands-studio/ai/attachments/<task-id>.png
.crownlands-studio/ai/patches/<task-id>.patch
```

Task worktrees are kept outside the selected repository under the protected Studio task-worktree root. Failed or cancelled worktrees remain available for review, retry, escalation, or explicit discard.

## Troubleshooting

- **Folder rejected:** review the missing-file list in the native dialog and select the Phase 1 worktree root, not `tools/` or another subfolder.
- **Windows publisher warning:** the Phase 2B developer build has no trusted publisher certificate. Verify the SHA-256 values in the implementation report.
- **Save failed:** leave Studio open, expand Development Log, correct the reported file/validation issue, and save again. Existing dirty data remains in memory.
- **Port conflict:** desktop mode uses an ephemeral loopback port, so it normally avoids conflicts automatically.
- **AI task cannot start:** save/discard Studio edits, make the active Git worktree clean, and retry. Studio never stashes or overwrites local work automatically.
- **Configured model unavailable:** Studio records the fallback in the task log and tries the configured fallback, then the Codex default. Change capability mappings under **AI Routing** if needed.
- **Interrupted task:** reopen the task from history. Relaunch marks it Failed and preserves its isolated worktree and thread context for retry.
