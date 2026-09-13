# Full Clan draft checks

## Production integration review

The approved design was integrated on `codex/clan-overview-draft`. The actual client was reviewed with the loopback-only benchmark adapter and `runtime-fixture.js`; production accounts and data were not changed.

- Overview, Members, War Room, and Rewards passed horizontal-overflow checks at 1440×900, 844×390, and 568×320. The common window measured 1200×700, 820×366, and 556×308 respectively.
- Visually checked discovery, creation, public roster, rename, heraldry, Treasury, gifts, conquest milestones, and Rally contribution surfaces. Each long body scrolls within its window; heraldry action buttons remain 44px tall and visible at 568×320.
- Treasury donation confirmation dispatched the existing handler and updated balance, remaining allowance, and totals. Leader promotion updated the selected member to Officer with Demote available. Rally numeric entry changed 40,000 to 1,000 and the remaining force from 40,000 to 79,000.
- The coordinated browser gate verifies Rally travel details can scroll above the pinned action buttons at all three viewports. Rally forms use the existing modal body as their sole scroller; the landscape layout was visually rechecked after this correction. The Clan Power crown uses the shipped runtime sprite and was visually confirmed.
- The focused production-function validator covers reward selection, Leader/Officer/Member permissions, inbound launch blocking, member joining, escaped target names, disabled actions, confirmation cancellation, changed-clan safety, and unresolved legacy-heraldry save blocking. Existing clan, War Room, identity-link, heraldry, Rally, and weekly-quest validators also pass.
- Asset budgets pass: 3.89 MiB installation cache. The complete Clan stylesheet has an 84 KiB limit; client markup/navigation has a bounded 16 KiB addition. No new raster assets or backend rule changes.
- Shared Profile and Skills remain separately scoped. Required PR gates and public-channel build verification follow this local review. Physical-device and production-account mutation tests were not performed.

## Original design review

Reviewed locally on 2026-09-13 in the in-app Chromium browser. These are design and in-memory interaction checks, not multiplayer or production validation.

## Layout and assets

- All ten Screen-menu destinations were traversed at 1440 × 900, 844 × 390, and 568 × 320. Inspected panel, paper, and scroll-region widths had no unintended horizontal overflow.
- Overview retains the existing desktop composition and fits all four shortcuts at standard mobile landscape size.
- Members and applications scroll separately; management/footer controls remain available. Public profiles preserve the full roster.
- War Room uses a rally selector and an independently scrollable detail body, with action controls outside that scroll area. This avoids squeezing participant content into a zero-height region on short screens.
- Rewards retain all information in scrollable panels. All ten milestones fit on desktop; compact landscape layouts scroll to the later milestones.
- Heraldry controls and the preview/notes can scroll. Save/Cancel remain outside the scrolling controls. The legacy replacement notice remains visible in the editor heading.
- Current and original heraldry render through production modules. Existing icons and illustrative kingdom standards loaded; no warnings or errors appeared in the browser log during traversal and interaction checks.

## Local interactions checked

- Gifts: sending disables Send for the five-hour cooldown; collecting 3.5h changes the collection button to disabled 0h.
- Conquest: collecting the 850 milestone marks it Collected and disables another claim. Joined-after-unlock example disables the eight previously unlocked milestones; the remaining two stay Locked.
- Treasury: a confirmed 100,000 Gold donation increased balance to 6,500,000, total donated to 12,900,000, and today's donated amount to 340,000; remaining allowance became 620,000 and personal Gold became 1,980,000 after the tested gift/reward collection sequence. Unavailable Treasury disables donation.
- Roster: promotion changed the selected member's role; accepting/rejecting applications updated roster and application counts. Full 30-member example disables Accept.
- Permissions: Officer has application controls and Leave, without roster role-management selectors. Member has neither application nor role-management controls. The editor rejects a Member review entry.
- Rallies: launch is disabled while a contribution is inbound; the Ready example launches after confirmation, then recalls to Returning using the creator's Horn action. A Member joined another creator's rally with 40,000 troops; the readout showed 20,000 remaining and the new contribution was Inbound with Withdraw available.
- Heraldry: cancelling a legacy editor retained the original `.clan-shield` renderer. Save remained disabled until an unmapped original charge was replaced. Choosing Wolf Head enabled saving and produced a v2 shield. Oxblood and Battle-worn selections also saved successfully.
- Rename: submitting a new valid name updated Overview. Low Gold and seven-day cooldown examples disable the submit button.
- Discovery: Apply enabled Cancel application and blocked another application; cancellation restored Join. Joining an open clan showed Member permissions. Create accepted valid name/tag/description and opened a one-member Leader overview.
- Departure: local Disband confirmation moved the example into discovery with a 24-hour clan cooldown. Reset restores the original fixture.
- Errors: application retry, clan connection error/retry, and Hero Level 7 locked states were displayed.

JavaScript syntax checks and `git diff --check` pass. Production scripts and backend are untouched; release/emulator gates have not been run for this local draft.
