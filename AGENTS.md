# Crown Lands Codex Instructions

## Sources of truth

- Before modifying anything, inspect the current repository. Never invent filenames, functions, collections, APIs, or architecture.
- For intended game behavior and confirmed design decisions, treat `docs/CROWNLANDS_MASTER_DEVELOPMENT_SPECIFICATION.md` as authoritative.
- Read the relevant Master Specification sections before changing gameplay, progression, balance, multiplayer behavior, releases, or player-facing rules.
- The current repository and backend are authoritative for the existing technical implementation.
- A merge does not prove a feature is deployed or live.
- If the user’s request conflicts with the Master Specification, identify the conflict before implementing it. Do not silently change an established rule.
- Only update the Master Specification when a design decision has been explicitly confirmed. Include that update in the same pull request as the implementation when appropriate.

## Safe update workflow

- Never implement changes directly on `main` and never push directly to `main`.
- At the beginning of every new fix, feature, mechanic, documentation update, or maintenance task, inspect the current branch and workspace status.
- If starting a new update from a clean workspace, run:

  `pnpm run start-feature <descriptive-feature-name>`

- Let `start-feature` fetch GitHub, synchronize local `main`, and create the new `codex/<descriptive-feature-name>` branch.
- If unfinished work, divergence, or another unsafe Git condition exists, stop and report it. Never automatically discard, reset, overwrite, or stash user work.
- Use one branch for one clearly defined update.
- Never begin a new update from a previous feature branch.
- If already on the correct `codex/` branch for the current task, continue that task instead of starting another branch.

### Post-merge local synchronization

- Pushing a feature branch does not update local `main`. After any pull request is confirmed merged, whether merged by Codex or elsewhere, synchronize the local repository before reporting that the workspace is ready for another update.
- Only synchronize when the workspace is clean. If tracked or untracked work exists, or if Git reports divergence or another unsafe condition, stop and report it. Never automatically discard, reset, overwrite, or stash user work.
- From a clean workspace, run:

  `git fetch origin`

  `git switch main`

  `git merge --ff-only origin/main`

- Verify all of the following before claiming local synchronization:
  - `git status --short --branch` shows clean `main` tracking `origin/main`.
  - `git rev-parse main` and `git rev-parse origin/main` return the same commit.
  - `git rev-list --left-right --count main...origin/main` returns `0 0`.
- If the fast-forward or any verification fails, stop and report the exact condition. Do not begin the next update until local `main` and `origin/main` are safely reconciled.

## Implementation rules

- Keep changes limited to the requested task.
- Preserve unrelated files, behavior, and user changes.
- Do not perform broad rewrites, formatting passes, dependency upgrades, generated-file changes, or reversions unless required by the task.
- Investigate the root cause before implementing a fix.
- Check the complete difference from `origin/main` for unrelated deletions, reversions, or out-of-scope changes.
- Never expose, commit, or print secrets, tokens, credentials, or private production data.
- Do not change production data, deploy, merge a pull request, or publish a release without explicit user authorization.

## Validation and pull requests

- Use Node.js 22 and `pnpm`.
- Run focused tests during implementation when relevant.
- Commit the completed update on its feature branch.
- When the update is ready, run:

  `pnpm run prepare-pr`

- Allow `prepare-pr` to fetch the latest `main`, audit the complete change, run validation and emulator gates, push safely, and create or update the pull request.
- Never force-push.
- If the branch is behind `origin/main`, stop and reconcile the latest `main` carefully. Rerun all validation afterward.
- Do not consider a pull request ready until it is current with `main` and these required GitHub checks pass:
  - `Static validation`
  - `Multiplayer emulator validation`
  - `Validate`
- If implementation changes after validation, rerun `prepare-pr`.
- Do not merge while required checks are pending or failing.

## Completion report

When finishing a task, clearly report:

- The feature branch used.
- What changed.
- Which validation checks passed or failed.
- The pull-request number and link, if created.
- Whether the pull request is ready to merge.
- After a merge, whether local `main` was synchronized with and verified against `origin/main`.
- Whether anything was deployed.
- Any remaining risks, conflicts, or manual verification steps.

Never describe a feature as live unless its deployment to the named release channel has been verified.
