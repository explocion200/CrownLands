# Inner Castle playtest and release readiness

Prepared October 9, 2026 on `codex/estate-release-readiness`. This presentation and documentation follow-up is **IN DEVELOPMENT**, not deployed. It carries the useful Guild guidance from unmerged PR #497 onto current main, preserving direct material payment and manual production. The currently verified web build remains `101d435ef095abcb392631dca1d28f908839337f` from PR #506; FM-2 records its deployed backend and client identity.

## Current checks and release gates

| Check | Evidence or remaining step |
|---|---|
| Guild training explanation | Partial banks explain their remaining room; full banks explain zero new XP and retained existing XP. Zero-credit quest reviews retain their material reward and point to the external Guild Upgrade control. Recruitment guidance links the Alehouse and Guild. No XP rule, payment, timer or rate changes. |
| First day/week progression | [Generated journeys](PROGRESSION_PLAYTEST.md) use earned current resources, direct construction payment and explicitly chosen finite batches. Active/casual examples complete all twenty first builds in 16/112 hours. Guild growth advances training; delayed visits and shared inputs remain real constraints. These are isolated model results. |
| Long-term progression | [Current six-cohort review](REWARD_REVIEW.md) uses manual production, reaching all twenty Level 100 buildings in roughly 2,121–2,356 modeled days. No balance change is inferred or approved from that estimate. |
| Signed-in current policy | The browser is signed in, but its displayed name does not identify the dedicated QA email. Account confirmation is pending before spending. Then verify direct payment/Cancel, one paid finite batch and delivery without repeat, the earlier quest completion/recovery/claim/retry, and an affordable commission. |
| Timed commission claim | Requires a normally funded order and its actual accepted deadline. Level 1 takes seven days. Do not alter clocks, grant stock or treat a model/emulator claim as a live claim. |
| Physical phone | Landscape slider/exact amount/Max, visible time/Start, pan/pinch, directory, background/resume, Gear return, X and Android/iOS Back are awaiting user verification. Synthetic browser sizes do not prove physical-device behavior. |
| itch.io catch-up | Prepare the validated candidate artifact and a 1,000-file HTML5 ZIP, retaining current scripts, estate art and active/prepared Core maps. Upload only after the candidate is merged and matching web/backend identity is verified. Check the actual public iframe and asset parity after publication. Current upload remains `19646406`, build `27965d48b00b1067c3e622e222753f5338c8c0a6`. |

Local sanitized preparation receipts and candidate package belong under `release-artifacts/estate-release-readiness/`. Commit identity, CI and artifact checks establish readiness separately. Production spending, physical-device results and release publication must be recorded only when actually performed. Credentials, private account IDs and account exports are excluded.

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
