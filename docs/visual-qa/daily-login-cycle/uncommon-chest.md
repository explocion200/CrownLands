# Uncommon chest and 30-day Daily Login

Confirmed September 28, 2026. Branch: `codex/uncommon-login-gear-chest`. Pending release.

- Day 10: Veil of Silence and Royal Peace Shield together.
- Day 30: one unopened Uncommon Gear Box in the Bag. Opening yields one random Level 1 Uncommon piece and two random Level 1 Common pieces.
- Four Common chests and 111 hours each of base Gold and troop production remain in every new cycle.
- Existing saved randomized/monthly cycles retain their schedule, queue, identity and claim guards. They switch to the fixed 30-day schedule after completion. No retroactive rewards are issued.
- The green chest is a native SVG color variant of the current oak chest, using the existing Uncommon gear palette. Its animated lid and opening sound reuse the current presentation.

## Implementation and release

Gear schema 4 adds a separate `uncommonGearBoxes` count and last-opening receipt. The existing `openCommonGearBox` callable accepts `boxType: "uncommon"` with `gearSchemaVersion: 4`; omitted type retains Common behavior. An interrupted green opening can replay after opening a Common chest. Capacity checks happen before either count is written. Both unopened counts persist through the reset allowlist.

Daily Login schema 5 accepts saved schema 4 schedules without changing rewards, and creates new fixed 30-day cycles. Future schemas remain protected from older handlers.

Deploy the matching backend and web client as a coordinated release. All Functions that normalize Gear need the schema 4 shared module; deploying only the opening or login handlers would leave old handlers unable to operate on updated profiles. This PR does not deploy or change production data. Verify deployment and actual web assets before describing the feature as live.

## Verification

- `validate-daily-login-rewards.js`: fixed rewards and budgets; saved-cycle migration; queue, attendance and rollover rules.
- `validate-gear-rarities.js`: both counts and receipts survive normalization; existing upgrades and bonuses remain valid.
- `validate-common-gear-box-browser.js`: Common opening regressions, green chest audio, exact mixed reveal, Bag actions, cross-type lost-response recovery, day 10/day 30 at 1440×900, 844×390 and 568×320. Screenshots are written to ignored `release-artifacts/common-gear-box/`.
- `validate-item-bag-browser.js`: existing inventory actions, quantities and controls.
- `emulator-reset-gate.js`: both counts survive reset; atomic day-30 claims, exact green contents, concurrent/replayed openings, type guards and capacity rejection.
- `emulator-economy-concurrency.js`: shared Gear authority, upgrades and economy transactions.
- Production artifact validation requires the new green SVG in the build.
