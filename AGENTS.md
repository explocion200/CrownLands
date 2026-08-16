# Crownlands repository instructions

These instructions apply to the entire Crownlands repository. Read the source-backed context index at `docs/crownlands-studio/AI_CONTEXT_INDEX.md`, then inspect only the sources relevant to the task.

## Product and gameplay boundaries

- Crownlands is mobile-browser-first, with landscape phone/tablet as the primary layout. Desktop remains supported.
- Preserve existing gameplay, player state, economy, map rules, and backend contracts unless the task explicitly authorizes a behavior change.
- Reuse existing services, state, components, and configuration. Do not introduce a duplicate state or persistence system.
- Keep the restrained Crownlands visual direction: parchment, burgundy, antique brass, dark walnut, muted green/blue, dense readable hierarchy, and medieval character without sacrificing usability.
- Respect established world, region, city, camp, stronghold, Crown Citadel, road, adjacency, spawn, and player-layer rules. Read the relevant map documentation before changing them.
- Analyze current formulas and client/server configuration before changing economy values.
- Avoid unnecessary dependencies and consider mobile rendering, DOM, image, listener, memory, and network costs.

## Safety and authorization

- Work only inside the task's selected Git worktree.
- Do not commit, merge, push, deploy, change DNS/hosting, modify production Firebase configuration, mutate a production database, or perform destructive production operations unless the user explicitly authorizes that exact action.
- Never print, copy, inspect, or expose API keys, Firebase secrets, tokens, credentials, private keys, or `.env` contents. If protected access is essential, stop and describe the user action required.
- Do not disable `.gitignore`, renderer sandboxing, context isolation, path validation, write allowlists, atomic writes, backups, dirty-state checks, or explicit apply/discard review.
- Crownlands Studio renderer code must not receive Node.js, filesystem, child-process, Git, or shell access. Add privileged behavior only through narrow, validated main-process APIs.
- Do not write outside the selected task worktree. Read outside it only when the task provides an explicit attachment through the Studio service.

## Working method

- Inspect before editing. Keep changes scoped and preserve unrelated user work.
- For meaningful changes, state or maintain a short plan and update it as evidence changes.
- Use repository-relative paths in data, configuration, and logs. Do not hardcode a developer's absolute path.
- Prefer existing validators and focused regression tests. Report actual output; never claim a test or visual check passed when it was not run.
- Treat browser visual review as evidence, not a replacement for functional tests. Check representative desktop and 844×390 / 667×375 landscape layouts for UI work.
- For performance work, measure before and after with the existing benchmark/profile harness where applicable.
- Keep structured QA issues source-backed. When an applied fix addresses an issue, use `Fixed` as “needs verification”; only use `Verified` after an explicit verification pass.

## Common validation entry points

- Crownlands Studio: from `tools/crownlands-studio`, run `pnpm run check`.
- JavaScript syntax: `node --check <changed-file>` where the file is compatible with Node's parser.
- Map tooling and benchmarks: inspect the scripts in the root `package.json` and the guidance under `docs/map-scaling-audit/`; choose only checks relevant to the change.
- Always run `git diff --check` before presenting an edit task for review.

Do not broaden a focused task into a gameplay, architecture, dependency, or visual redesign without explicit scope.
