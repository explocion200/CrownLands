# Kingdom Activity: Reinforcements draft

Status: design approved for integration, merge and deployment on September 15, 2026. The preview remains an isolated review fixture; deployment must be verified separately.

Branch: `codex/kingdom-activity-reinforcements-draft`.
Base: `190fa25d19429c81623e02a5fdbe231d0fcf4a08` (Rallies UI plus the merged modal/performance/pickup corrections).

Open `/docs/visual-qa/kingdom-activity-reinforcements/index.html?viewport=desktop&sample=standard` on the loopback review server. Desktop (1440 × 900), mobile landscape (844 × 390), and small landscape (568 × 320) are available. Portrait is outside the game design scope.

## Scope

Only the Reinforcements tab is drafted. It reuses the approved Marches/Rallies parchment window and dimensions, with a fixed heading, activity tabs and three section shortcuts above one scrolling ledger. All three existing groups remain: Traveling, Stationed with allies, and Defending your holdings. Rows retain status, known routes, full troop counts, ruler profile links, return destinations and Main City fallback disclosures. Maps use available route/target metadata. Estimates and syncing troop values remain explicit.

Ten examples cover mixed support, traveling/arriving/estimated/unknown counts, own stationed troops, allied defenders, fallback destinations, long names and large counts, many assignments, pending returns, a failed return ready for retry, and an empty state. The many-assignment fixture is for layout stress, not a proposal to change existing assignment limits.

## Existing behavior preserved

Sources inspected: `game.js` functions `getActiveOperationsSnapshot`, `getIncomingClanReinforcementMarches`, `renderReinforcementOperationPanel`, `renderReinforcementOperationCard`, `getReinforcementReturnDestinationPreview`, `returnClanReinforcement`, and the clan reinforcement limit helpers; the Master Specification's Clans, Rallies, UI and mobile sections.

- Contributors recall their stationed troops; holding owners send allied troops home. The current native confirmation identifies the return destination and Main City fallback behavior.
- These stationed reinforcement returns call `returnClanReinforcement`. They do not consume a Recall Horn; no inventory or horn-cost controls are added here. Traveling rows retain their existing information-only behavior.
- Own recalled contributions become returning marches. Sending another ruler's troops home removes that stationed assignment from the holder's list; it does not add a private allied return march to the holder's view.
- During integration, preserve server permissions, ownership checks, fallback routing, assignment limits, idempotency, failure/reconciliation behavior and the new stable-control refresh/close handling from PR #304. No confirmed game rule or Master Specification decision is changed by this draft.

## Review boundaries and art

This is isolated HTML/CSS/JS with synthetic data, fixed arrival times and no game script, account, server or persistent storage. Recall and Send Home use an HTML confirmation with the existing game's wording, then simulate acknowledgement after 650 ms. The HTML confirmation keeps the review usable in the in-app browser; it does not replace the production native confirmation. Reset cancels open confirmations and invalidates pending callbacks. The retry example begins with a disclosed failed order; retry then simulates success. Profile links describe the existing destination. Other activity tabs are disabled review context.

Existing March Orders, Shieldwall Discipline, troop woodcut and fortress heraldry art is reused. CSS imports earlier approved draft frame styles; nothing in the production game imports this draft. Browser validation is recorded in `visual-checks.md`. Production integration, PR release gates, merge and deployment follow design approval.

## Production integration

The game renders this presentation from existing reinforcement snapshots. Scoped `reinforcements-activity-ui.css` and `reinforcements-activity-ui.js` provide the frame and view restoration, and are included in the production file inventory. The existing `returnClanReinforcement` action retains native confirmation and server handling; bounded, account-keyed inline errors clear on retry and modal close. Countdown text uses the existing stable-node patcher; structural updates restore ledger scroll and focus. Release evidence is retained under the ignored `release-artifacts/reinforcements/` directory.
