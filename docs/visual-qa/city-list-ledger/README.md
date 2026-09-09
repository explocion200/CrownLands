# City List ledger draft

Status: local design review, not integrated into the production City List. Sample data and upgrade arithmetic are illustrative, not a replacement for game balance or authoritative requests. The draft does not load Firebase, sign in, or mutate player data. It is outside the production build allowlist.

Run `node tools/map-benchmark/start-server.js 61703` from the repository and open `http://127.0.0.1:61703/docs/visual-qa/city-list-ledger/index.html`.

## First pass

- Parchment, ink, moss and ochre from the approved City Details panel. Native woodcut symbols are reused from `city-details-ui.js`; city stages and Stronghold art come from the active `core-expansion-v1` assets.
- A wide desktop ledger with city name and illustration, map, Main City status, level, garrison, hourly production and direct upgrade controls. Strongholds show their existing bonus and locate action instead of regular-city upgrades.
- Compact layouts stack each holding's information and retain accessible controls. The roster scrolls between the summary and pagination.
- Preserve the current five-row page size, level/troop sort controls, map location and city-info entry. Draft controls demonstrate full, syncing, incomplete and empty rosters.
- Upgrade costs are visible below +1, +5 and MAX. In this isolated mock, clicking them simulates local projected Gold, level changes and completion feedback without automatically re-sorting rows.

## Required in the final game update

The user confirmed that Enter Inner Castle must appear **only on the player's owned regular cities**. This supersedes the previous decision to show the shortcut in every regular city panel. It still opens the player's Main City Inner Castle and returns to the inspected owned city. Do not show it for neutral, allied or rival cities. The draft's info preview demonstrates the owned-only condition.

During integration, change the shared `renderCityDetailsPanel` entry condition to require ownership, revise the City Details navigation/privacy browser cases, and update the confirmed presentation paragraph in the Master Specification in the same PR. This correction is queued for the end of this City List update, as requested; the current production rule has not yet changed.

## Integration constraints

Use the existing `getSortedCityList`, `renderCityListModal`, `renderCityListRow`, `getCityUpgradeOptionState`, canonical map/city keys and instant-economy queue. Preserve current-realm owner-scoped roster reads, incomplete-roster disclosure/retry, precise upgrade affordability, exact +5 behavior, MAX semantics, incoming-attack blockers and Stronghold eligibility. Never infer a complete roster from a saved subset.

Use confirmed city stats for production; projected values must remain consistent with City Details. Preserve row identity/order, page, scroll and focus through projection, confirmation, recovery and external roster refresh. Sort only on explicit sorting or reopening. Main City and Stronghold labels, off-map location/info navigation, existing accessibility and privacy remain intact.

After design review, integrate this single panel and the owned-only shortcut correction, run the required validation/PR workflow, and verify the named production deployment after release authorization. This draft does not authorize or establish deployment.
