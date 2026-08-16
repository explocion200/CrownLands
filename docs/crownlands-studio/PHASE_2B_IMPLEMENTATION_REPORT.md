# Crownlands Studio Phase 2B implementation report

## Outcome

Phase 2B adds a complete Codex AI development workspace beside the existing World, Balance, UI Studio, HUD, Theme, Components, Screens, and QA tools. It supports plan-first deterministic routing, Crownlands specialist profiles, official local Codex execution, protected Git worktrees, evidence and unified diff review, read-only preview, native Apply/Discard confirmation, task history, contextual UI/QA handoff, retry/escalation, and production protections.

Implementation work is isolated at:

- Worktree: `C:\Users\ricmo\OneDrive\Documents\CrownLands\work\crownlands-studio-phase-2b`
- Branch: `codex/crownlands-studio-phase-2b`
- Base/HEAD: `696eec4d4`

No Phase 2B commit, merge, push, deployment, production Firebase change, database mutation, or production configuration change exists at handoff. The Phase 1 worktree was not modified.

## Delivered V1

- Primary **Codex AI** navigation, compact status dashboard, task form, persistent history, plan, results, validation evidence, logs, changed files, and unified diff.
- AUTO classification across UI, Feature, Bug, QA, Performance, Map, Economy, Refactor, Documentation, and Mixed work.
- Capability roles Deep, Fast, Visual, QA, Performance, and Review, mapped through editable settings rather than model-name branches.
- Crownlands Feature Builder, UI Craftsman, Bug Hunter, QA Inspector, Performance Engineer, Map Engineer, and Economy Designer profiles.
- Safe default workflow: classify → plan → isolated worktree → execute → validate → review → explicit Apply/Discard.
- Review Only, Safe Edit, and Full Development permission modes with the same production prohibitions.
- Exact task branch naming `codex/studio-task-<task-id>` and protected sibling worktree roots.
- Strict validated IPC, sandboxed/context-isolated renderer, frozen named preload API, no renderer filesystem/shell/Git/SDK exposure.
- Official `@openai/codex-sdk` 0.147.0 integration with thread start/resume, streamed events, image attachments, cancellation, read-only/workspace-write sandboxes, approval `never`, network/web-search disabled, a secret-minimized environment, and bounded redacted logs.
- Windows package-native Codex runtime under the short `resources/codex-runtime/` path, including sandbox helper and `rg` support.
- Clean active-project and Studio dirty-state gates; base-commit/conflict checks; recovery patch before Apply; no automatic commit/merge/push.
- Failed/cancelled/interrupted worktree retention, relaunch recovery, context-rich retry, and Fast → Deep escalation.
- Main-process native confirmation for Apply and Discard.
- GET/HEAD-only root-confined preview server with strict CSP; AI-modified server code is never imported by Electron main.
- Theme, selected component, selected screen, HUD selection, and QA **Ask/Fix with Codex** context, including optional Electron screenshot capture.
- Applied QA fixes move to **Fixed – Needs Verification**, not falsely Verified.
- High-complexity parent plans persist/display dependency-aware subtask graphs while V1 executes one coordinated lead thread.
- Repository `AGENTS.md`, source-backed context index, architecture, routing, profiles, security, setup, and this report.

## Automated verification

From `tools/crownlands-studio`:

```text
pnpm run check
tests 21
pass 21
fail 0
```

Coverage includes routing/agent/model-role selection, packaged runtime resolution, input and IPC validation, task creation, Review Only, isolated worktree creation, active-project isolation, diff and Apply, Discard, dirty/unsaved gates, failure retention, interrupted-run recovery, model fallback, no-diff failure, cancellation, retry/Deep escalation, QA/component context, traversal/boundary protection, editor API, project writes/backups, Studio structure, preview wiring, and Electron security.

Additional gates:

- `git diff --check`: passed at final handoff.
- Official SDK read-only authentication/model handshake: `CROWNLANDS_CODEX_READY` returned with a real thread and usage event.
- Windows `codex.exe --version`: `codex-cli 0.147.0`.
- Short packaged sandbox helper executed and decoded its input path (expected error for an intentionally invalid standalone payload), proving Windows could start it.

## Real packaged-runtime workflow

A disposable clean Crownlands repository was used so no test edit could affect Phase 2B. The final `app.asar` and `resources/codex-runtime` were loaded together and exercised through the real Studio renderer and native IPC:

1. Created and rendered a plan from the packaged task UI.
2. Created `codex/studio-task-task-20260816163718-4342d39a` and its protected worktree.
3. Ran a real Feature Builder → Deep → `gpt-5.6-sol` task through the bundled Codex runtime.
4. Changed only tracked `docs/crownlands-studio/AI_CONTEXT_INDEX.md` in the disposable worktree.
5. Recorded a real thread ID, 72,995 input / 942 output / 136 reasoning tokens, agent command evidence, and two passing diff checks.
6. Rendered the result and unified diff in Studio.
7. Applied through the native confirmation; the active disposable project received the full patch and a recovery patch was preserved.
8. Relaunched Studio and confirmed the Applied task, model, and history were restored.
9. Separately confirmed native Discard removes the exact task worktree and branch.

The disposable repository and task worktrees were moved to the Windows Recycle Bin after verification. They remain recoverable until the Recycle Bin is emptied.

## Windows artifacts

Artifacts are intentionally ignored and uncommitted:

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `release-artifacts/crownlands-studio-phase-2b/Crownlands Studio Setup 0.2.0.exe` | 184,515,907 | `16FC747FECC79AB2CFFE36C91394EACE49B9EFD3234E994779A51FDD24977E36` |
| `release-artifacts/crownlands-studio-phase-2b/Crownlands Studio 0.2.0.exe` | 184,116,403 | `298216763982180A1A00E72832DDB5DDDC4A3BDDE462630F7946A0C19BDFAA46` |

The build also produced `tools/crownlands-studio/dist/win-unpacked/` for inspection. The bundled runtime contains `codex-cli 0.147.0`; its final executable and sandbox-helper paths are 186 and 220 characters respectively.

This developer build is unsigned. Windows Application Control blocked the final self-extracting executable in this test environment. The equivalent unpacked package was launched earlier, while final post-fix validation loaded the exact final `app.asar` and bundled resources with the signed development Electron host. Installer/portable execution may require the user or organization to allow the unsigned build, or a future release to be code-signed.

## Visual evidence

- `10-codex-ai-workspace.jpg`: web-safe workspace/fallback state.
- `11-codex-selected-component-context.jpg`: selected component context handoff.
- `12-codex-qa-fix-context.jpg`: QA issue prompt/context handoff.
- `13-packaged-windows-app.png`: packaged Windows shell with Phase 1 editors intact.
- `14-packaged-codex-ai-ready.png`: packaged SDK ready state and routing settings.
- `15-packaged-task-plan.png`: rendered plan with classification, risk, files, tests, and safety.
- `16-packaged-task-result-diff.png`: real result, token usage, validation evidence, and diff.
- `17-packaged-relaunch-history.png`: Applied task restored after relaunch.

## Known limitations

- V1 executes one lead thread. Multi-agent subtasks, dependencies, and parallel-safety metadata are future-ready but not scheduled concurrently.
- Apply is intentionally whole-task only; partial file/hunk apply is not exposed because V1 cannot guarantee safe dependency reconciliation.
- Visual preview is a controlled static component/screen surface, not a full authenticated production-game session or automated pixel-diff system.
- Task usage shows SDK token counts when available; Studio does not invent monetary cost.
- Model availability is checked when a task runs. Fallback is visible, but Studio cannot guarantee an account has access to every configured model.
- Safe Edit and Full Development require a clean active Git worktree. This uncommitted Phase 2B handoff must be reviewed and then committed/stashed by the user before running edit tasks against itself; Review Only remains available.
- The Windows artifacts are unsigned developer builds and may be blocked by organizational Application Control.

## Recommended Phase 2C / Phase 3

1. Add a conflict-aware coordinator that schedules only disjoint subtask worktrees and reconciles explicit dependencies.
2. Extract more production screen renderers into shared controlled-preview modules, then add screenshot baselines and pixel-diff review.
3. Add selectable-file/hunk Apply only after dependency and validation guarantees are designed.
4. Add opt-in PR creation and remote/cloud Codex tasks behind a separate explicit authorization boundary.
5. Add map-generation and economy-simulation specialist harnesses with durable benchmark/result artifacts.
6. Add code signing and CI-built Windows release provenance.
7. Add history retention/export controls and richer search/filtering without exposing raw task secrets.
