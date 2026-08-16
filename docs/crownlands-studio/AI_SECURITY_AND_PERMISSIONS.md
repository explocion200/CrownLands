# Codex AI security and permission model

## Permission modes

| Mode | Read | Write | Tests/builds | Active project mutation |
|---|---:|---:|---:|---:|
| Review Only | Selected project | No | Read-only inspection only | Never |
| Safe Edit (default) | Isolated task worktree | Focused worktree changes | Yes, local/non-production | Only after explicit Apply |
| Full Development | Isolated task worktree | Larger in-scope worktree changes | Yes, local/non-production | Only after explicit Apply |

All modes prohibit automatic commit, merge, push, deployment, DNS/hosting changes, production Firebase/database mutation, destructive production operations, and credential disclosure.

The local approval and sandbox choices are aligned with OpenAI's [agent approvals and security guidance](https://learn.chatgpt.com/docs/agent-approvals-security) and [non-interactive execution guidance](https://learn.chatgpt.com/docs/non-interactive-mode): permission boundaries are supplied by Studio, and a task cannot ask the renderer to broaden them.

## Enforced controls

- Electron keeps `sandbox: true`, `contextIsolation: true`, and `nodeIntegration: false`.
- Preload exposes named task methods only. Main-process handlers revalidate exact task-reference payloads, task input, context size/depth, agent/model values, and settings. Apply and Discard require a native main-process confirmation dialog, so the sandboxed renderer cannot bypass the user decision by imitating a UI click.
- The SDK receives an allowlisted process environment instead of inherited secrets.
- Codex task threads use `read-only` or `workspace-write`, `approvalPolicy: never`, no additional writable directories, and network/web search disabled.
- Edit execution is blocked when Studio has unsaved changes or the active Git worktree is dirty.
- Worktree and branch names are derived from a validated task ID. Stored paths must exactly match the protected task root before diff/apply/discard.
- Apply requires a clean active project at the original base commit, writes a recovery patch, checks the patch, and only then applies the full approved diff.
- Discard is an explicit confirmed action and removes only the exact task worktree/branch. Applied work is never automatically reversed.
- Logs omit reasoning, redact common key/token/password formats, bound event/output sizes, and never log the environment.
- Read-only previews use a trusted static server with root confinement, GET/HEAD only, no API, no connect permission, CSP, a sandboxed child window, and no preload.

## Failure guarantees

Cancellation, model/API failure, failed tests, or Studio shutdown never applies partial work to the active project. The isolated worktree remains available for diff, retry, Deep escalation, or explicit discard. Relaunch converts interrupted `Running` records to `Failed` and explains recovery.

If a requested task genuinely requires a credential, networked production access, deployment, merge, push, or destructive action, the agent must stop and describe the explicit user action required. The Phase 2B service does not provide an approval bypass for those operations.
