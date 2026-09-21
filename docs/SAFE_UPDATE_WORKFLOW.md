# Safe update workflow

Every Crownlands update begins from a freshly synchronized `main` branch and ends in a pull request. Never begin the next update from the previous feature branch.

## One-time setup

Use Node 22, then enable the repository-managed Git hook for the current checkout:

```powershell
pnpm run setup:hooks
```

Git stores this setting locally. Run the setup command again after making a new clone or worktree.

## Start an update

From a clean workspace:

```powershell
pnpm run start-feature -- city-search
```

The command fetches GitHub, fast-forwards local `main`, verifies it exactly matches `origin/main`, and creates `codex/city-search` from that commit. It never resets, force-checks out, or stashes files.

Optional feature scopes make the final reversion audit stricter:

```powershell
pnpm run start-feature -- city-search --scope game.js --scope tools
```

If no scopes are provided, `prepare-pr` prints every changed file for manual scope review.
Scopes can also be supplied or corrected during preparation:

```powershell
pnpm run prepare-pr -- --scope game.js --scope tools
```

## Finish an update

Commit the finished work on the feature branch, then run:

```powershell
pnpm run prepare-pr
```

`prepare-pr` fetches GitHub again, stops if the branch is behind `origin/main`, audits and classifies the complete branch diff (`origin/main...HEAD`), confirms Node 22, runs selected local static checks and applicable build validation, records a local receipt for the exact commit and selected tests, pushes without force, and creates or updates the pull request. It never merges or deploys production.

## Select tests for this change

Normal updates test changed or added behavior and affected shared dependencies. Editing a large shared file such as `game.js` or `functions/index.js` no longer automatically runs the entire game suite.

Before committing, replace the previous branch's root `validation-plan.json` with a plan for this complete branch diff. Set `baseCommit` to the full SHA returned by `git merge-base origin/main HEAD`. Group every changed path with relevant tests and explain the affected behavior and shared dependencies:

```json
{
  "schemaVersion": 1,
  "baseCommit": "<full 40-character current merge-base SHA>",
  "coverage": [
    {
      "paths": ["game.js", "holding-tower-ui.css"],
      "tests": ["tools/validate-clan-tower-map-browser.js"],
      "reason": "Check Tower action sizing and placement across zoom levels, including shared city-map controls."
    }
  ]
}
```

This is an example of the format, not a universal Tower test list. Inspect the code and tests before choosing coverage. The author and reviewer must assess dependencies: the selector verifies complete file coverage, not the semantic completeness of the chosen assertions. Add a focused test when existing coverage does not exercise the new behavior. Include balance audits for balance changes, relevant emulator files for server-authoritative changes, and checks at desktop and landscape-mobile sizes for affected visual behavior.

The shared selector reads the committed plan against `origin/main...HEAD`. It rejects missing/stale plans, uncovered or unrelated paths, duplicate coverage, nonexistent tests, shell commands and unsafe paths. Renames require coverage for both names; deletions require remaining tests for affected behavior. The plan itself does not need a coverage entry. Ordinary documentation may use an empty test list with an explanation; executable/configuration/asset changes may not. Known server/authority paths require an emulator suite in their coverage group. Added or edited validator/test entry points execute automatically, and workflow changes always run workflow-protection tests.

Supported entry points are `tools/test-*.js`, `tools/validate-*.js`, `tools/audit-season-balance.js`, `tools/audio-browser-test-server.js`, and `functions/test/emulator-*.js`. Entries are file paths, never arbitrary shell commands. The balance audit uses `--check` and the audio server uses `--self-test`.

| Stage | What runs |
| --- | --- |
| Local preparation | Syntax checks on changed JavaScript, lint on changed files supported by the existing lint configuration, selected validators, dependency audit when manifests/locks change, and production build/artifact checks when runtime or selected browser/artifact tests need them |
| GitHub Static validation | The same selected static checks, independently on the PR commit |
| GitHub Multiplayer emulator validation | Only selected emulator files, each with the existing isolated Firebase lifecycle; an explicit successful explanation when no emulator coverage applies |
| GitHub Validate | Confirms classification and both required validation jobs succeeded |
| Authorized release | Verify the deployed build ID and smoke-test affected production behavior; visual changes use desktop and landscape-mobile sizes |

Local preparation defers expensive selected emulator runs to GitHub. It does not claim they passed locally. For debugging a relevant emulator suite locally, use `node tools/run-validation-tier.js --phase emulators --skip-install` after installing the locked dependencies. This uses the same committed plan.

Successful local static checks may be reused only on a clean tree with identical commit, base, selection, Node version, platform, build environment and lockfile. A changed commit/base/plan invalidates reuse. CI runs independently, and runs requiring disposable build artifacts always rebuild. Use `--no-cache` with the runner to force fresh checks. Routine output is brief; full command logs are saved under the Git state directory at `crownlands-safe-update/validation/logs`, with failure details printed when a command fails.

## Full regression runs

Full regression remains available for the scheduled nightly run, manual GitHub workflow runs and the `validation:full` PR label. It is not automatically repeated on every merge. These runs discover every emulator suite, with reset first. Selected runs execute reset only if it is in the plan.

```powershell
pnpm run validation:full
pnpm run prepare-pr -- --validation-full
```

These are explicit full overrides; a normal `prepare-pr` does not select them. GitHub retains the required `Static validation`, `Multiplayer emulator validation`, and `Validate` check names. All must pass before merge.

To validate and authorize a later manual push without creating a pull request, use:

```powershell
pnpm run prepare-pr -- --check-only
```

The pre-push hook permits only the exact prepared commit while it remains current with `origin/main`. A new commit or a newer `main` invalidates the receipt and requires `prepare-pr` again. The receipt records the selected tests and the local validation phase for that exact complete branch diff.

## Recovery messages

| Message | Safe response |
| --- | --- |
| Unfinished tracked or untracked work exists | Commit the intended work on its current branch, or move it deliberately. The command will not stash or discard it. |
| Local `main` cannot fast-forward | Inspect why local `main` diverged. Do not reset it automatically. |
| Feature branch is behind `origin/main` | Stop. Reconcile the latest `main` into the feature with an explicit reviewed operation, update the plan and affected dependency coverage, then run `prepare-pr` again. |
| Branch already exists | Choose a new feature name or inspect and intentionally resume the existing branch. Never overwrite it. |
| PR audit reports deleted/generated/out-of-scope files | Review the diff and remove unrelated changes. Expand declared scope only when those files are intentionally part of the feature. |
| Validation failed | Fix the reported failure and rerun `prepare-pr`; no push or PR update occurred. |
| Coverage is missing or stale | Review the complete branch diff and dependencies, update the plan and base SHA, commit it, then rerun preparation. Do not choose unrelated tests just to satisfy file coverage. |
| GitHub CLI is missing or signed out | Install `gh` if needed, run `gh auth login`, and retry. |
| Pull-request checks are pending | Wait for GitHub. Do not merge until all required checks pass. |
| Pull-request checks failed | Open the failed check, fix the branch, and run `prepare-pr` again. |

## GitHub protection after this workflow merges

Configure `main` to reject direct pushes, require pull requests, require the branch to be current, and require the repository validation checks. This is an administrator setting and is intentionally not changed by these scripts.
