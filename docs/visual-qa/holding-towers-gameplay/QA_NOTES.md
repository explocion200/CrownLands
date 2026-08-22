# Holding Tower visual QA

Captured in the in-app browser against the local benchmark fixture on 2026-08-22.

## Coverage

- Neutral Tower
- Clan-owned Tower
- Owner/member controls
- Enemy Tower before scouting
- Successful scout report
- Veil-blocked scout report
- Damaged walls
- Active repair
- Active wall upgrade
- Multiple queued wall upgrades
- Clan Treasury donation
- Incoming Rally
- Desktop owner view
- Landscape mobile owner view at 844 × 390

## Results

- All 13 desktop scenarios were exercised at a 1440 × 900 test viewport. The in-app browser exported 1248 × 900 captures because its chrome reserves horizontal space.
- The 844 × 390 landscape-mobile capture fits the Tower panel without horizontal or vertical overflow.
- Every desktop modal and the document reported no horizontal overflow. The densest incoming-Rally state also reported no modal vertical overflow.
- Desktop action controls measured 34 px high; the Treasury Donate control measured 38 px high. The compact landscape layout's smallest action control measured 27 px high.
- The Clan Treasury heading contrast was corrected and recaptured after the final stylesheet loaded.
- Portrait-mobile QA was intentionally not performed.

Machine-readable measurements are in `metrics.json`; the fourteen captures are in `screenshots/`.
