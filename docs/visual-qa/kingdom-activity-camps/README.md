# Kingdom Activity: Camps draft

Status: **APPROVED — integrated for the combined release**. Camps, Strongholds, Attack and Transfer (olive marching banner) were approved September 15, 2026. Merge/deployment were explicitly authorized. Release verification is recorded separately; design approval alone does not establish deployment.

Branch: `codex/kingdom-activity-camps-strongholds`.
Base: `81a35aed85301606fc4147294bef57ef0f297d9c` (Reinforcements release, PR #305).

## Combined update

The user confirmed one combined release for Camps and Strongholds, reviewing one panel at a time. Camps is approved; [Strongholds is the next draft](../kingdom-activity-strongholds/README.md) on this same branch. Integrate both approved panels and run `prepare-pr` on the final combined change. This draft is not a completed release candidate; the full release gate is deferred until that combined update is ready.

## Preview

Open `/docs/visual-qa/kingdom-activity-camps/index.html?viewport=desktop&sample=standard` on the loopback review server. The review controls provide desktop 1440 × 900, mobile landscape 844 × 390, and small landscape 568 × 320. Portrait is outside the supported game design target.

The Camps tab uses the approved Kingdom Activity parchment frame (maximum 1200 × 700). A fixed heading, activity tabs and camp summary sit above one scrolling ledger. Rows pair the current camp illustration with the camp name/map, hold reward, exact garrison, control state, reward countdown and Map action. Small landscape places the reward and garrison below the camp name and countdown. Other activity tabs are disabled review context.

Eight examples: four camp families, contested control, resolving payout, syncing timers, long names/large garrisons, all twelve current camp locations, a single camp, and no held camps. Garrison/timing/control values are synthetic; the long-name fixture intentionally replaces names to stress the layout. Timers count down, then remain Resolving until the example is reset. No reward is awarded by the preview.

Map simulates the existing close-and-locate action in a disclosed preview card, with Back to Camps restoring scroll and focus. Close/Reopen and Escape are also supported. No game script, server, account, inventory, local storage or private data is connected.

## Sources and preserved behavior

- Master Specification sections 6 (Camps), 16 (UI), and 17 (desktop/mobile landscape).
- Current `game.js`: `getHeldCampsForActiveOperations`, `formatHeldCampReward`, `renderHeldCampsOperationPanel`, `renderHeldCampOperationCard`, and `focusActiveOperationLocation`.
- Current release contract remains the monthly shared-realm release, Core/New Lands topology. No world data is edited. Fixtures copy the current identities and artwork from `functions/core-expansion-world-layout.json`, with map labels from the matching `assets/worlds/core-expansion-v1/region-catalog.json`.
- Current map illustrations are reused, including the Warband, Gold, Brightmere/Relic and Brambleford/Deed art. No new image generation is needed for this draft.
- The existing Activity renderer reads configured base Gold/troop rewards, not a private next-payout calculation. The draft labels those values **Base hold reward**, preserving the values without promising an exact production-scaled payout. Random city/item rewards remain explicitly random. Integration must preserve daily allowances, production scaling, server resolution and reward privacy.
- Preserve held-camp discovery across unvisited maps, deduplication, loss/removal handling, known Map targets, contested states, and independent public hold timers. No Claim, Recall, abandon, new reward, daily allowance or camp-balance rule is introduced.
- The confirmed Camps presentation is now recorded in the Master Specification. Approval does not establish integration or deployment status.

Focused visual evidence is recorded in `visual-checks.md`. Production behavior and full release checks belong to the final combined integration.

## Production integration

The combined batch is connected to the existing game renderers, data and authoritative handlers. Runtime code and styles are isolated in `objectives-activity-ui.*` and `troop-orders-ui.*`; production never imports this draft. See [combined validation evidence](../troop-orders/integration-checks.md).
