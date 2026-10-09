# Inner Castle playtest and channel release record

QA snapshot recorded at 2026-10-09T02:30:22.910Z on runtime build `27965d48b00b1067c3e622e222753f5338c8c0a6`. Credentials, account identifiers and private account exports are excluded. The user designated the signed-in QA account and authorized normal building/recruit/quest spending. This account already has developed world income and existing Gear; it is suitable for transaction/navigation checks, not a new-account affordability measurement.

## Evidence and limits

| Check | Observed result |
|---|---|
| Forester’s Lodge first build | Reviewed 75 Gold, no materials, four minutes. Explicit consent/confirmation started one job; Build wording remained until authoritative Level 1 completion. Timber gathering then began. |
| Quarry first build | Reviewed 75 Gold, four minutes. Busy-builder state prevented another start until the Forester completed. Confirmed Quarry Level 1 began Stone production. |
| Partial Great Hall Level 2 deposit | Reviewed 6 Timber + 18 Stone and a nine-minute base timer. Deposited 3 Timber + 1 Stone. Level remained 1, no construction started and Upgrade stayed disabled. After full page reload/sign-in restoration/re-entry, the same 3/1 credit remained and the bill showed 3/17 still needed. Completing that credit while the Guild builder was occupied produced 6/6 Timber and 18/18 Stone; Upgrade remained disabled with “Materials are ready. Start when a builder becomes free.” No queue or automatic start was created. After the Guild completed, an explicit reviewed start used the full saved credit with no additional materials and the normal Gold fee. Authoritative Hall Level 2 completion then freed the builder. |
| Gear navigation | Back to Inner Castle, X and Escape from Treasury equipment each restored the estate, Treasury selection and 250% district camera while construction continued. Physical system Back remains unverified. |
| Farmstead | Explicitly confirmed the Gold-only four-minute first build. Authoritative Level 1 completion activated Grain production; the refreshed ledger showed earned Grain, 80/hour gross/net and 500 capacity. |
| Windmill and Guild follow-up | The Gold-only 90-Gold/six-minute Windmill completed. Its refreshed Food ledger and service showed earned Food, 24/hour and the 2-Grain-to-1-Food recipe. The Guild Master’s 150-Gold/eight-minute first build completed. Two normally purchased Common Level 1 champions appeared in its active roster (2/6). |
| Live expedition | Reviewed a two-hour Common Stone quest: 1 Food, 1 Stone, 4 retained XP per champion, no meal and 30-minute recovery. Normal confirmation started one expedition (1/1); both champions became Questing with selection/Bench disabled. Actual completion, XP, recovery and claims remain pending. |
| Live commission rejection | The Common Level 1 Treasury cap quote showed 81 Timber, 172 Stone and 168 hours. A normal confirmation with insufficient supplies was rejected with “Not enough timber.” Refresh retained the normal commission chooser; no order was funded and later material counters continued increasing. Funding/claim after real gathering and the accepted deadline remain pending. |
| Fresh-account first day/week | Two isolated earned-resource journeys passed using actual construction, service, production and XP rules. The [generated report](PROGRESSION_PLAYTEST.md) records assumptions and results; these are not production player outcomes. |
| Long-term pacing | Six existing shared-account cohorts passed, including all 1,980 upgrades changing a rule. All twenty Level 100 buildings take 2,110–2,351 modeled days. Individual 1/3/6/10-season budgets use developed support and 50% material production; all twenty share one stockpile. Human enjoyment remains unverified. |
| Guild training clarity follow-up | Local UI explains the existing one-next-level XP bank, zero new XP when full, retained legacy XP and the external Guild Upgrade route; the guide links Alehouse recruitment. Real server-rule zero-credit quest review and legacy excess-XP cases pass at 1440×900, 844×390 and 568×320. This small presentation patch remains IMPLEMENTED BUT NOT LIVE pending its PR merge/publication. |
| Physical phone | User check requested; no real-device result received yet. Synthetic landscape tests do not establish physical-phone behavior. |

Production checks used visible game controls and accepted deadlines. No server clock, player stock, reset or account record was manually edited. Reload/serialization evidence does not establish monthly reset behavior; existing reset emulator coverage remains the separate authority for that path.

## Matching itch.io release

The user authorized catching itch.io up to the already verified web release. Publication retained web deployment `6ac836f5ea6c2e00084a2a17`, build `27965d48b00b1067c3e622e222753f5338c8c0a6`, its release manifest, approved estate art and all gameplay scripts. No new backend/rules/web deployment was performed.

- Public page: [Crownlands](https://crownlands.itch.io/crownlands).
- Selected playable upload: `19646406`; actual Run game iframe `https://html-classic.itch.zone/html/19646406/index.html` observed after saving at `2026-10-09T01:55:33.523Z`.
- Public parity verified at `2026-10-09T01:57:28.865Z`: all 1,000 package files, 998 byte-exact and two entry HTML files matching after only known itch embed-script/newline normalization. Runtime scripts and release manifest are byte-exact.
- ZIP: `crownlands-html5-27965d48b00b.zip`, 60,089,553 bytes; SHA-256 `49767d075e825a5cc6311c1bcc4d86016cfc97e434925cfbad3ea6758018fbc1`.
- Six local package and six public cold/reload startup checks passed at 1440×900, 844×390 and 568×320. Correct release stamps, enabled Google/email sign-in, email/create-account form bounds, upload-relative service worker scope, all 81 active/prepared Core map paths, and no uncaught runtime or failed game-asset errors were checked. These checks remained signed out and created no accounts.
- Auth domain, ready October Core realm and all 144 ACTIVE Node.js 22 Functions matched the verified backend. The callable inventory/source comparison is read-only.
- File-limit packaging retained the prior approved HTML channel forwarding/audio fallback omissions. It additionally omits 40 inactive legacy topology bitmaps and two unreferenced obsolete art exports. Runtime selection was checked for all 81 active/prepared Core map, thumbnail and definition paths. No active Core or estate asset was omitted; source archives remain intact.
- Local sanitized receipts and proof image: `release-artifacts/estate-progression-playtest/itch/`. Older uploaded files were preserved. Butler labels are not used to identify the actual public player.

## Remaining real-time and device checks

The first two-hour quest is running. Claim only after its accepted deadline; check repeated/partial claims, recovery and the full XP bank. Commission an affordable existing Common item, then claim after its actual seven-day Level 1 deadline. Record first-day/week milestones from normal play rather than extrapolating the simulation into a player result.

On the physical phone, verify pan/pinch, directory selection, keyboard deposits, X/Back/system Back, background/resume, stable bottom captions and readable counters. Human feedback about the Guild training gate and seven-day first commission is still needed before approving any balance change. Approved costs, durations, caps, deposits and persistence remain unchanged.
