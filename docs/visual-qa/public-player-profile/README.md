# Public Player Profile

Approved September 23, 2026, with authorization to merge and deploy after required checks. Implemented in the actual client on `codex/public-player-profile`. Deployment is established by release verification, not design approval.

Open `index.html?viewport=desktop` using the repository benchmark server. Mobile landscape is 844 × 390, small landscape is 568 × 320. No portrait design. The preview embeds the production client and uses loopback-only synthetic identities and mock services. No production data is loaded or changed.

The parchment dossier groups ruler identity and King Power, public kingdom information, and clan affiliation. It retains the ruler flag, cities, estimated troop range, stronghold count and names, clan heraldry and link, and Main City map/action. King Power already arrives in the public identity response. No private troop totals, city intelligence, or new backend calls are introduced. Compact landscape columns scroll as needed while the Main City action stays accessible. Existing artwork is reused.

## Main City defect

`normalizePlayerIdentity` previously called `getKnownCityId` without the saved region. Uncached Core IDs are opaque (`core_<hash>`), so the catalog could not recognize them and the profile disabled its location button. The normalizer now passes the recorded map, with the existing island-ID fallback. The actual browser regression reproduced an empty ID without the region and a valid destination with it.

The location action now waits for a successful map switch, confirms the target belongs to that map, closes the overlaid own-profile screen and uses ordinary city selection. The map switch has an opt-in `preserveModal` option; other callers keep their existing closure behavior. Failure keeps the profile available with feedback and a retryable button. Duplicate requests are suppressed, stale/account-changed completions cannot select a target, and dirty flag/skill edits use their existing exit confirmation.

## Verification

`tools/validate-public-player-profile-browser.js` checks all 1,480 Core city IDs, island-only identity fallback, four profile samples at three viewport sizes, existing estimates and unavailable states, clan navigation, actual unvisited-map navigation from the own-profile overlay, duplicate clicks, failure/retry and stale completion. Screenshots and the synthetic results are written to ignored `release-artifacts/public-player-profile/`.

Related profile privacy, public identity links, report navigation and modal lifecycle remain in the focused validation plan. Production packaging verifies the reused assets and the combined own/public profile presentation stays within 52 KiB (the dossier adds less than 9 KiB of CSS). No backend deployment is required. Live multiplayer verification has not been claimed; production release verification is recorded separately.

Additional diagnostic: the broad asset-budget validator already exceeds its installation-cache limit on current main: 4,437,524 bytes against 4,348,928. This update adds 11,116 bytes to that cache before final small edits. The pre-existing total-cache budget failure is not suppressed or enlarged here; it remains a separate packaging-budget reconciliation. The focused build still validates the actual production artifact and individual Profile presentation bound.
