# Modal, fullscreen, and runtime performance audit

Date: September 15, 2026. Starting revision: `90ec6a486` (main through PR #303).
Branch: `codex/modal-fullscreen-performance-audit`.

## Findings and corrections

### 1. Reports leaves other windows without a close button — confirmed

Reproduction: open Battle Reports, use its Close button, then open City Details,
City List, Shop, or Help. The shared dialog retained `battle-reports-ledger` after
closing. That stylesheet hides the shared title and Close button because Reports
provides its own header. The next screen could inherit the hidden controls and
Reports dimensions. The class was introduced by PR #298 on September 14.

The shared close handler now removes the Reports presentation class. Public
player/clan profile entry also resets the dialog class list: links inside Reports,
Scout Reports, Marches, or Rallies replace the content without a close event.

The missing Close button reproduced at 1440×900, 844×390, and 568×320, both with
and without native document fullscreen. Fullscreen was not required to trigger it.
The corrected navigation paths pass at all six combinations.

### 2. A delayed close event corrupts a reopened window — confirmed

Reproduction: open City List, close it, and reopen it within the same JavaScript
turn. Native dialog `close` events are queued. The previous event removed the new
window's class, cleared its request state, and could stop its timers. In the test,
the reopened City List shrank from its 1040×790 layout to the generic 560×720 card.

The shared cleanup handler now ignores an old close event when the dialog is
already open again. This protects the current presentation, timers, and request
IDs. The actual final close still performs cleanup.

### 3. Routine HUD updates recalculate the whole page — confirmed

The onboarding rule `body:has(dialog[open], .profile-screen.open, .toast.visible,
.setup-screen.visible) .onboarding-map-tip` was introduced on September 5 in
`f6778dd72`. Chromium invalidation traces show report-badge and camp-timer text
updates invalidating the BODY subtree through this relational selector. Around
1,860 elements were recalculated repeatedly, even with guidance disabled and no
window open. Disabling individual recent UI styles did not remove the root cause.

The broad selector is removed. The onboarding tip's `hidden` state now updates
from the actual dialog, Profile, toast, and setup visibility. Mutation observation
is restricted to those elements' `open`/`class` attributes. HUD text changes no
longer invalidate a page-wide relational CSS selector. Guidance preferences,
topic selection, arrows, and gameplay rules retain their existing behavior.

Same local Chromium trace procedure, 844×390, synthetic scenario A, approximately
2.5 seconds per sample:

| Measurement | Before | After |
| --- | ---: | ---: |
| Time recalculating styles | 1.781 s | 0.103 s |
| Largest style-update element count | 1,860 | 58 |
| Slowest style-update duration | 134.8 ms | 4.7 ms |
| Frame interval, 95th percentile | 132.0 ms | 13.9 ms |
| Observed long tasks | 21 | 0 |

These are controlled browser measurements, not production FPS guarantees. Trace
instrumentation adds overhead. The raw local traces are in
`release-artifacts/modal-audit/trace.json` and `trace-after.json` (ignored artifacts).

### 4. Activity countdowns replace interactive controls — confirmed

Kingdom Activity and Incoming Threats recreated their complete contents during
the one-second HUD refresh. In a 3.2-second sample, Marches replaced its root three
times. This can discard focus or remove a pressed button before pointer release.

Countdown and quantity updates now patch existing text nodes when the complete
element structure and attributes match. Changes to identity, available commands,
disabled/busy state, or row structure use the existing rebuild-and-bind path.
Thirty controlled Marches countdown updates preserved the controls and focus with
zero structural mutations. A real pointer press spanning a refresh still clicks
Close. Incoming countdowns and rally arrival/launch eligibility are covered too.

## Broader checks and remaining limits

- Inspected the shared frame/simulation loop, map/army rendering cadence,
  fullscreen target, modal transitions, recent ledger integrations, onboarding,
  Profile/Skills refreshes, and listener/reconnect/foreground lifecycle paths.
- Focused validators passed for world/runtime contracts, authority-sensitive
  operation timing, multiplayer synchronization, connection recovery, foreground
  resume, subscription scope, report lifecycle, active operations, rally rules,
  animation preferences, and mobile viewport access.
- After the CSS correction, five-second scenario A samples of Map, Marches, and
  Skills had no long tasks and approximately 14 ms 95th-percentile frame spacing.
- Synthetic heavy scenario C (150 cities/100 marches) still showed 42–49 ms
  95th-percentile frame spacing and occasional 50–82 ms long tasks. Army display,
  troop-estimate formatting, and identity/owned-city calculations remain capacity
  optimization candidates. This patch does not establish a crowded-map capacity
  guarantee or change simulation/authoritative march timing.
- Each scenario completed four map switches, three foreground recoveries, and two
  reconnects. Active listeners stayed at 18, with no duplicate keys or interval/
  animation-frame growth. The existing audit's exact **17-listener** budget still
  fails because global chat adds the eighteenth subscription. This pre-existing
  budget exception is documented in the stability audit; the measurements do not
  show an accumulating listener leak. Changing chat subscription policy needs a
  separate behavior decision.
- No production account, database contents, or live request latency was used.
  Actual mobile hardware, browser-specific iframe fullscreen, long-session memory,
  web/itch build parity, and production backend latency remain release checks.

## Regression entry points

- `node tools/validate-modal-lifecycle-browser.js`: viewport/fullscreen navigation,
  overlay visibility, rapid reopening, text updates, actual Close pointer input,
  Incoming Threats, and rally eligibility. Included in `gate:static`.
- `node tools/validate-onboarding-browser.js`: first-step controls, visibility,
  arrows, focus, account isolation, dismissal, and replay.
- `pnpm run prepare-pr`: the full configured static and multiplayer emulator
  gates, safe push, and PR creation. Its final results and required GitHub checks
  are reported with the PR.

No balance, combat, progression, authority, release contract, or Master
Specification decision was changed. Nothing was merged or deployed by this audit.
