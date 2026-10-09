# Inner Castle playtest and release readiness

Released October 9, 2026 from `codex/estate-release-readiness` in [PR #508](https://github.com/explocion200/CrownLands/pull/508), **LIVE — ALL PUBLISHED CHANNELS** at build `39af6d9480cd330c9bc837e4e9c5f81a0f9d1cdd`. Guild presentation clarifies existing training without changing XP, direct payment or manual production. FM-2 records the matching backend/web identity and itch.io publication; historical signed-in evidence below does not establish current-policy production gameplay.

## Current checks and release gates

| Check | Evidence or remaining step |
|---|---|
| Guild training explanation | Partial banks explain their remaining room; full banks explain zero new XP and retained existing XP. Zero-credit quest reviews retain their material reward and point to the external Guild Upgrade control. Recruitment guidance links the Alehouse and Guild. No XP rule, payment, timer or rate changes. |
| First day/week progression | [Generated journeys](PROGRESSION_PLAYTEST.md) use earned current resources, direct construction payment and explicitly chosen finite batches. Active/casual examples complete all twenty first builds in 16/112 hours. Guild growth advances training; delayed visits and shared inputs remain real constraints. These are isolated model results. |
| Long-term progression | [Current six-cohort review](REWARD_REVIEW.md) uses manual production, reaching all twenty Level 100 buildings in roughly 2,121–2,356 modeled days. No balance change is inferred or approved from that estimate. |
| Signed-in current policy | The browser is signed in, but its displayed name does not identify the dedicated QA email. Account confirmation is pending before spending. Then verify direct payment/Cancel, one paid finite batch and delivery without repeat, the earlier quest completion/recovery/claim/retry, and an affordable commission. |
| Timed commission claim | Requires a normally funded order and its actual accepted deadline. Level 1 takes seven days. Do not alter clocks, grant stock or treat a model/emulator claim as a live claim. |
| Physical phone | Landscape slider/exact amount/Max, visible time/Start, pan/pinch, directory, background/resume, Gear return, X and Android/iOS Back are awaiting user verification. Synthetic browser sizes do not prove physical-device behavior. |
| itch.io catch-up | Published upload `19662086` at the same merged build as web. Actual Run game iframe observed; all 1,000 files match and six local/six public cold/reload cases pass. Current scripts, estate art and active/prepared Core maps retained; prior uploads preserved. |

Local sanitized receipts belong under `release-artifacts/estate-release-readiness/deployment/`. Credentials, private account IDs and account exports are excluded.

## Verified current publication

- PR #508 merged at `2026-10-09T22:00:15Z`; clean local `main` was fast-forwarded to the merged build and verified equal to `origin/main`, divergence `0 0`. Required Static validation, Multiplayer emulator validation and Validate passed in [run 37993911834](https://github.com/explocion200/CrownLands/actions/runs/37993911834); seven selected local validators and production artifact/budgets passed. No new server-rule emulator suite applied.
- Exact staged estate UI passed at 1440×900, 844×390 and 568×320, including twenty-site selection, direct payment/Cancel/retry, prerequisite/source Back, timers, Gear round trips, finite production and XP-bank/recruitment guidance. Netlify deploy `6ac963f12ec4390008d70b36` published at `2026-10-09T22:14:10.851Z`; 56 staged/168 public file comparisons and primary-domain anonymous startup at all three sizes passed. Publication hold retained.
- Only `getRealmInfo` was updated for merged identity. Its archive matches all 56 runtime files and manifest; all 144 Node 22 Functions are ACTIVE and the other 143 source references/hashes/revisions are unchanged. Authentication guard and 29-callable access audit passed. Ready October realm, published rules and player records were retained; no gameplay orders or administrative stock grants were submitted.
- itch.io selected/saved `crownlands-html5-39af6d9480cd.zip` (60,093,549 bytes; SHA-256 `ce1d33f8e33bc3edeb6e7715f15ad7b6ebb1fb35dfed8840f5ddc28e296ea459`). Actual iframe: `https://html-classic.itch.zone/html/19662086/index.html?v=1791584119`. Public parity at `2026-10-09T22:16:37.319Z` verified 998 byte-exact files and two entry HTML files with only known itch script/newline normalization. Six local and six public cold/reload cases passed at the three sizes, covering sign-in bounds, full merged stamps, upload-relative worker scope and all 81 active/prepared Core paths without runtime/asset failures. Source archives and earlier uploads preserved.
- Current-policy authenticated production, physical-phone/system-Back, actual accepted commission deadlines and human pacing remain pending. Isolated models and emulator results do not prove these checks. PR #497 was closed as superseded without merging its conflicting older implementation; its branch remains preserved.

## Historical production evidence — preceding policy

The earlier owner-authorized dedicated-account session was recorded at `2026-10-09T02:30:22.910Z` on build `27965d48b00b1067c3e622e222753f5338c8c0a6`. It used ordinary game controls and accepted deadlines, without administrative edits. The account had developed world income and Gear; it was not a fresh-account affordability test.

- Forester’s Lodge and Quarry Gold-only builds completed and began raw gathering. Farmstead, Windmill and Guild first builds also completed; two purchased Common champions appeared in the active roster.
- Treasury Gear Back, X and Escape restored the selected estate building and 250% camera. Physical system Back was not tested.
- A partial Hall deposit survived reload and a busy builder; explicit fully funded construction later completed Hall Level 2. This proves the older deposit policy only. New deposits have since been removed; current direct payment still requires signed-in verification.
- Windmill Food appeared under the older automatic recipe policy. It does not prove the current chosen-batch start, payment, output reservation or delivery.
- A normally paid two-hour Common Stone expedition launched with two champions, 1 Food, quoted 1 Stone, 4 retained XP each and 30-minute recovery. Its real completion and claims were not recorded.
- An insufficient-material Common Treasury commission was rejected with no funded order. A funded order and real deadline claim were not recorded.

These checks do not establish the current release’s production gameplay or monthly reset. Existing emulator reset coverage remains separate.

## Historical itch.io publication

Upload `19646406` was saved at `2026-10-09T01:55:33.523Z`; its actual Run game iframe was `https://html-classic.itch.zone/html/19646406/index.html`. Public parity at `01:57:28.865Z` verified 1,000 files: 998 byte-exact and two entry HTML files differing only by known itch embed-script/newline normalization. Six local and six public cold/reload checks passed at 1440×900, 844×390 and 568×320, including sign-in form bounds, upload-relative worker scope, all 81 active/prepared Core paths and no uncaught runtime/failed game-asset errors. No accounts were created by these signed-out checks.

The historical ZIP was `crownlands-html5-27965d48b00b.zip`, 60,089,553 bytes, SHA-256 `49767d075e825a5cc6311c1bcc4d86016cfc97e434925cfbad3ea6758018fbc1`. Its sanitized receipts remain under `release-artifacts/estate-progression-playtest/itch/`. It retained all active Core and estate assets, with channel-only optional audio/guide omissions plus inactive topology bitmaps and unreferenced old art. Source archives and previous uploads were preserved. This publication predates direct material payment, prerequisite links and manual production; it must not be described as current with web.
