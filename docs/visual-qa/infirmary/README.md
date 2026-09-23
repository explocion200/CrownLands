# Infirmary design draft

Branch: `codex/infirmary-draft`. Base: `740a2d8afaec6cefe375cdd597a05ece65b7c161`.

The approved design reference for the Clan Tower Infirmary, following the Engineers’ Workshop layout. The presentation is now integrated into the actual game through `infirmary-ui.js` and `infirmary-ui.css`; deployment is verified separately. This standalone preview still keeps sample state entirely in memory. Its upgrade controls cannot spend real Gold or call the backend.

## Presentation

- Existing Infirmary illustration and completed level on the left; Overview / All levels on the right.
- Compare current and next-level additional recovery, explicitly described as percentage points. Retain the current benefit throughout a sample upgrade or pause.
- Explain that the benefit applies separately to each player defending this Tower and that recovered troops return through the recovery system to their owner's Main City.
- Clearly show the combined 90% cap for Field Medics, equipped casualty gear and the Infirmary. An expandable, explicitly illustrative example compares 30% skill/gear recovery with an 88% example near the cap, using 1,000 casualties. This is not a prediction for the player's army; the building does not store wounded troops.
- Keep Treasury balance in the header, with upgrade cost, construction time/countdown, action and reason in a fixed footer. Independent scrolling preserves access on desktop and mobile landscape.
- Use the existing four Infirmary building stages, approved Gold icon and Field Medics / Shieldwall Discipline illustrations.

## Existing rules

The Master Development Specification's Clan Tower buildings section and `clan-tower-buildings.js` provide the current rules. Each completed Infirmary level adds 1.5 percentage points of recovery, up to 15 points at Level 10, only for troops defending this Tower. Level 0 adds none. The preview reads bonuses, art stages, costs and durations from the shared module. It proposes no mechanics changes.

Only the Clan Leader and Officers start construction using Clan Treasury. One building project may run per Tower; damaged walls or incoming attacks prevent a new start and pause existing construction. Completed benefits remain active. No waiting queue, cancellation or refund is introduced.

## Review

Run `node tools/map-benchmark/start-server.js 61704`, then open:

`http://127.0.0.1:61704/docs/visual-qa/infirmary/index.html?viewport=landscape&level=4&sample=ready`

Choose desktop (1440 × 900), landscape (844 × 390), or small landscape (568 × 320). The iframe stays at native size; a smaller browser panel scrolls. The full-window link opens the same sample without review controls.

Level and state controls cover unbuilt through Level 10, construction, paused work, incoming attacks, damaged walls, another project, insufficient/unavailable Treasury, ordinary members, and a failed sample upgrade followed by retry. Reset/close cancels a pending sample request.

## Validation and game integration

`node tools/validate-infirmary-draft-browser.js` checks the three viewports, visible footer and click targets, reachable level rows, all art stages, shared bonus values, simulated upgrades/retries, blocked states, sample recovery arithmetic/cap, and outer review controls. Screenshots and results go to ignored `release-artifacts/infirmary/`.

The actual Infirmary map building and Tower Buildings tab open the approved layout, with Tower Info and navigation to the other buildings. Live Tower/Treasury snapshots drive the displayed level, balance, permissions and construction state. Upgrades reuse the existing `startClanTowerBuilding` action and operation identity. Duplicate requests are blocked, failures preserve retry identity, and account/clan changes prevent stale responses from applying to another clan. Countdown expiry requests fresh state once without granting a level locally. Switching buildings or closing clears the clock. Ownership loss returns to the public Tower view.

`node tools/validate-infirmary-browser.js` exercises the actual game at all three sizes with controlled API replies: balance/level authority, pending/failed requests and retries, current benefits during construction, paused work, permissions, attack/damage/repair blocking, another building project, unavailable/insufficient balance, example cap arithmetic and state preservation, navigation, stale clan responses and ownership loss. The shared Workshop, Shop, building entry points, construction helpers and Tower lifecycle are covered by the selected validation plan. No backend mechanics or functions change.
