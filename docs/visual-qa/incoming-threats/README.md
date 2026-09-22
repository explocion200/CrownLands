# Incoming Threats approval draft

Status: approved for integration, merge and deployment September 22, 2026. Created on `codex/incoming-threats-draft`, based on main `eb6c5acf488268daedaa5f23500ffccb5f8e8e26`. Deployment must be verified separately.

Open `index.html?viewport=desktop&sample=standard` through the local repository server. The review toolbar also offers 844×390 and 568×320 mobile landscape. Portrait gameplay is outside this review.

## Presentation

- Matching parchment window with existing report Attack, Scout, red Defense and Realm emblems.
- Fixed heading, incoming summary, and All / Attacks / Scouts filters above one scrolling list.
- Soonest arrival first; each row carries its own countdown and written threat type. A subtle burgundy treatment identifies arrivals within one minute without adding a game effect.
- Origin and attacking ruler are grouped together. Target map, city name, available level, troops and defense form the next group.
- Incoming troop estimates retain their disclosure labels; scouts display one scout. An unavailable estimate says Unknown.
- Citadel Legion retains a distinct ochre Realm emblem and Legion label, and appears under Attacks.
- Locate City is reachable on every row. At small landscape sizes, incoming force moves beneath the attacker so target defenses and the location control retain usable space.
- Profile and location actions report their intended destination in the draft status area. They do not call game services or navigate the real map.
- Fictional data and paused clocks keep screenshots comparable. The long-name, unavailable-details, scouts-only, empty, and 18-threat examples are review fixtures.

## Existing implementation reviewed

The current game entry points are `getIncomingAttacks`, `renderIncomingAttacksModalContent`, `renderIncomingAttackCard`, `getArmyTroopDisplayText` and `focusIncomingAttackCity` in `game.js`. The draft reorganizes their existing information; it does not add enemy power, hidden skills, exact enemy troops, combat predictions or new actions.

On later integration, keep authoritative visibility, source fallbacks, exact region/target identity, existing target eligibility and accepted arrival deadlines. A missing off-map city snapshot must stay explicitly unavailable rather than displaying zero. Navigation must use the real target map; this preview's background is illustrative. Verify applicable non-city targets separately before adapting city-only labels.

The approved design is integrated by `incoming-threats-ui.js/css`, mounted from the real game entry. The existing army feed, estimate helper, player-profile route and report-location navigator provide actual data/actions. The production bundle contains these runtime modules, not preview scripts. Own troop/defense totals display in full; enemy estimate formatting stays authoritative. The Master Specification records approval. No backend function, data, subscription or combat rule is changed.

## Verification

Run:

```powershell
node --check docs/visual-qa/incoming-threats/preview.js
node --check docs/visual-qa/incoming-threats/review.js
node tools/validate-incoming-threats-draft.js
```

Passed at 1440×900, 844×390 and 568×320 across all six examples (18 combinations). Verified dialog bounds, no horizontal overflow, location controls at least 44×44, scrolling to and clicking the last of 18 threats, filters including Legion, unknown-state display, profile feedback, close/reopen, and wrapper size/sample controls. No browser exceptions or failed resource responses.

Screenshots were visually inspected for the standard desktop and both landscape sizes, long names at 568×320, and unavailable city details at 844×390. Local captures and machine-readable evidence are in ignored `release-artifacts/incoming-threats/`.

The separate `tools/validate-incoming-threats-browser.js` checks the actual game at all three sizes: filters, Legion, 18 rows, full own stats/estimated enemy stats, unavailable snapshots, camp labels, stable DOM/scroll/focus on countdowns, live row changes, one pending location request, failure/retry, and existing automatic close on expiry. Existing estimate, report navigation, universal profile, activity and modal lifecycle validators cover shared dependencies. Local evidence is in ignored `release-artifacts/incoming-threats-runtime/`. The benchmark server's unsupported `/play/?updateCheck=...` probe is excluded from asset failures; production `/play/` is verified separately. Production accounts and live combat are not exercised by the local fixture.
