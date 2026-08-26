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

`prepare-pr` fetches GitHub again, stops if the branch is behind `origin/main`, audits the complete three-dot diff, confirms Node 22, runs the canonical static/build checks and every emulator gate, records a local receipt for the exact commit, pushes without force, and creates or updates the pull request. It never merges or deploys production.

To validate and authorize a later manual push without creating a pull request, use:

```powershell
pnpm run prepare-pr -- --check-only
```

The pre-push hook permits only the exact prepared commit while it remains current with `origin/main`. A new commit or a newer `main` invalidates the receipt and requires `prepare-pr` again.

## Recovery messages

| Message | Safe response |
| --- | --- |
| Unfinished tracked or untracked work exists | Commit the intended work on its current branch, or move it deliberately. The command will not stash or discard it. |
| Local `main` cannot fast-forward | Inspect why local `main` diverged. Do not reset it automatically. |
| Feature branch is behind `origin/main` | Stop. Reconcile the latest `main` into the feature with an explicit reviewed operation, rerun tests, then run `prepare-pr` again. |
| Branch already exists | Choose a new feature name or inspect and intentionally resume the existing branch. Never overwrite it. |
| PR audit reports deleted/generated/out-of-scope files | Review the diff and remove unrelated changes. Expand declared scope only when those files are intentionally part of the feature. |
| Validation failed | Fix the reported failure and rerun `prepare-pr`; no push or PR update occurred. |
| GitHub CLI is missing or signed out | Install `gh` if needed, run `gh auth login`, and retry. |
| Pull-request checks are pending | Wait for GitHub. Do not merge until all required checks pass. |
| Pull-request checks failed | Open the failed check, fix the branch, and run `prepare-pr` again. |

## GitHub protection after this workflow merges

Configure `main` to reject direct pushes, require pull requests, require the branch to be current, and require the repository validation checks. This is an administrator setting and is intentionally not changed by these scripts.
