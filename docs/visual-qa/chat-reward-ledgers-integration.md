# Approved Chat and reward ledger integration

Branch: `codex/approved-chat-and-reward-ui`. The user approved integrating, merging and deploying all three pending layouts. This record covers Global/Clan Chat, Hero Level-Up and Welcome Back; the approved shared pickup artwork is already the canonical runtime pair from PR #310.

## Implementation

- Scoped styles integrate the reviewed desktop and mobile landscape layouts into the real game entry. No portrait layout is introduced.
- Chat retains server subscriptions, sender profile links, retention, cooldowns, moderation and membership checks. It labels the active channel in full and compact views, reports connection state, preserves unsent text, supports keyboard channel navigation and keeps the unread jump while reading older messages.
- Hero and Welcome Back render authoritative receipts through `reward-ledger-ui.js`. Reward calculation, crediting and production are unchanged. Collect remains visible; long contents scroll independently. City names are escaped, loss totals preserve unnamed entries, and all named losses can be expanded.
- Existing inactivity notices use the same parchment frame. Their rules and messages are unchanged.
- Production packaging and the installed shell include the runtime modules/styles and two small native SVG emblems. New shell files are bounded at 116 KiB; existing raster artwork is reused.
- Translation infrastructure from the approved draft is preserved and tested. A live provider is not configured or authorized yet. The production control is hidden without a real adapter; the development phrase table never ships or represents machine translation.

## Verification

- Real game fixture at 1440×900, 844×390 and 568×320: single/multiple/large Hero rewards; safe, lost, long city lists, zero production with losses and inactivity receipts; Chat history, channel changes, unavailable clan, unread position and failed sends.
- Collect acknowledges already credited rewards without changing the tested balance. Welcome Back rejects repeated Collect feedback. Counts, unknown losses, escaped city names, image loading, reachable actions and horizontal overflow are checked.
- Focused translation tests cover device language, per-account preferences, original preservation, bounded batches, stale responses, failures, timeout and retry.
- Production artifact and asset budgets passed. The offline shell is 4.06 MiB, within the bounded allowance; artwork and login budgets are unchanged.
- The onboarding browser validator waits up to five seconds for its scheduled pointer render instead of relying only on a fixed 450ms delay. Its alignment, hit-testing and top-layer assertions remain required; a missing pointer saves a screenshot and fixture diagnostics.
- Screenshots and machine-readable results are generated in ignored `release-artifacts/chat-reward-ledgers/` by `node tools/validate-chat-reward-ledgers-browser.js`.

Full release gates, required GitHub checks, merge, local main synchronization and live deployment must be verified before reporting completion. This document records integration, not proof of deployment.
