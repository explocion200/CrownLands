# Crownlands Studio desktop shell

This package wraps the existing Crownlands editor in a Windows desktop application. The selected project still owns all game and editor code; the desktop shell starts that project's editor service on an ephemeral loopback port and opens it in a sandboxed Electron window. Phase 2B adds the Codex AI task workspace through narrow Electron IPC and the official local Codex SDK.

## Run from source

From this directory:

```powershell
pnpm install
pnpm start
```

On first launch, choose the Crownlands repository/worktree containing this Studio implementation. Studio validates required project markers before starting. The last valid project is remembered in Electron's per-user application data.

For local automation or a deterministic development launch, pass a validated project directly:

```powershell
pnpm start -- --project="C:\path\to\Crownlands"
```

## Build Windows artifacts

```powershell
pnpm dist:win
```

The NSIS installer and portable executable are written to `dist/`. Build output, dependencies, Studio settings, QA edits, and automatic backups are ignored by Git.

## Codex AI workflow

1. Open **Codex AI**, or select a Theme, Component, Screen, HUD item, or QA issue and choose **Ask Codex / Fix with Codex**.
2. Enter a development task. AUTO selects a Crownlands agent and capability role; advanced settings map those roles to available model IDs.
3. Review the generated plan, likely files, tests, affected systems, and risk, then choose **Run Task**.
4. Review Only runs in a read-only sandbox. Safe Edit and Full Development require a clean active project and create `codex/studio-task-<task-id>` in an isolated worktree.
5. Review the recorded result, validation evidence, changed-file list, unified diff, and optional read-only preview.
6. Explicitly **Apply to Project** or **Discard**. Apply checks the original base commit and clean project state, saves a recovery patch, and applies the complete task diff without committing or merging.

The Codex SDK uses the same local account/configuration as the installed Codex environment. Studio does not accept or store an API key in the renderer.

## Safety boundary

- Renderer sandboxing and context isolation remain enabled; Node integration is disabled.
- The preload bridge only exposes named dirty-state, project-picker, coordinated-save, and AI-task messages.
- Project writes pass through `project-file-service.js`, a root-constrained allowlist using atomic replacement and pre-write backups.
- User-authored QA data lives at `.crownlands-studio/qa-issues.json` inside the selected project. Backups live under `.crownlands-studio/backups/`.
- AI history, screenshots, and recovery patches live under `.crownlands-studio/ai/`; edit execution is confined to validated task worktrees.
- Task processes use a secret-minimized environment, network-disabled Codex sandbox, redacted bounded logs, and no automatic commit, merge, push, deploy, or production mutation.
- A failed world, economy, HUD, or QA load disables the combined save path rather than writing fallback data.
