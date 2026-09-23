# Engineers’ Workshop design draft

Branch: `codex/engineers-workshop-draft`. Base: `1764bf3097a3921e5f8a589c7228b41014c46a12`.

This is an interactive proposal for the Clan Tower's Engineers’ Workshop. It is not integrated into the game or deployed. The preview uses sample state entirely in memory, with no authentication, storage or backend requests. Sample upgrade clicks never spend real Gold.

## Presentation

- Match the approved parchment, ink, muted olive and ochre presentation. Reuse all four existing Workshop building stages, the approved Gold symbol, Stoneworks icon and shield icon.
- Keep the building illustration and completed level on the left. Compare the current and next-level reductions on the right, explicitly stating that they apply to this Tower's wall construction and paid repairs.
- Keep Clan Treasury in the header and upgrade cost, construction time, primary action and its explanation in a fixed footer. The content scrolls independently on desktop and mobile landscape.
- Surface active construction, pauses, missing Gold, role restrictions and request failure before other detail. An upgrade preserves the completed-level benefit until construction completes.
- The All levels tab lists each level's bonus, full Treasury Gold cost and construction time, with Current/Next markers. Level 10 and unbuilt states retain clear presentation.
- Desktop is reviewed at 1440 × 900; landscape at 844 × 390 and 568 × 320. Portrait is not a game design target. The review iframe is unscaled; smaller browser panels scroll to show a fixed viewport. A full-window preview link is available.

## Sources and scope

`docs/CROWNLANDS_MASTER_DEVELOPMENT_SPECIFICATION.md`, Section 8, and the shared `clan-tower-buildings.js` provide the confirmed rules. The preview imports the current shared module for building stages, maximum level, benefits, costs and durations instead of duplicating those tables. `clan-tower-buildings-ui.js` and `game.js` provide the existing permission and construction states.

The Workshop reduces wall construction and paid repair time by 5 percentage points per completed level, up to 50%. It does not speed up building projects or alter active wall/repair timers. Leaders and Officers use Clan Treasury. One building project may run at a time; damage and incoming attacks pause it without erasing progress. No gameplay rule, source-of-funds, queue, cancellation/refund or server-authority changes are proposed. This draft does not redesign the Infirmary or Training Grounds.

## Review and checks

Run `node tools/map-benchmark/start-server.js 61704` and open:

`http://127.0.0.1:61704/docs/visual-qa/engineers-workshop/index.html?viewport=landscape&level=4&sample=ready`

Controls provide Levels 0–10 and ten examples: ready, upgrading, paused, incoming attack, damaged walls, another building underway, low Treasury, ordinary clan member, unavailable balance, and one failed upgrade followed by retry. After a sample upgrade, the paid cost and time remaining replace the prospective figures. The completed level remains active. Resetting or closing the draft cancels a pending sample response so it cannot change another example.

Focused browser validation: `node tools/validate-engineers-workshop-draft-browser.js`. It checks all three viewport sizes, header/footer fit, visible click targets, no horizontal content overflow, all ten reachable levels, existing art stages and benefit values, simulated pending/failure/retry/reset behavior, blocked states, maximum/unbuilt presentation, tab/close/reopen controls and the outer review controls. Screenshots and checks are recorded locally in ignored `release-artifacts/engineers-workshop/`. No production build or emulator suite is needed to review this isolated proposal.

## After visual approval

Integrate the approved presentation through the existing selected-building route and preserve live Tower/Clan Treasury snapshots, permission checks, construction callbacks, countdowns and modal lifecycle. Replace sample state with authoritative data and verify live refreshes and rejected/stale operations. Run the repository PR workflow when the approved integration is ready. No Master Specification design change, PR, merge or deployment is included in this draft.
