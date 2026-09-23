# Clan Treasury design draft

Branch: `codex/clan-treasury-draft`. Base: `2836aad365412670b6bc1f766cb2000a2ed512c5`.

This is a standalone, interactive design proposal for the existing Clan Rewards > Treasury panel. It is awaiting visual approval. The actual game, gameplay rules, backend functions and Master Specification are unchanged. All balances and donation outcomes are in-memory samples; the page makes no account or gameplay requests.

## Presentation

- Parchment, brass and olive styling to match the Clan Tower building screens.
- Existing approved Gold pickup artwork, with the Treasury balance and seasonal totals on the left.
- Personal Gold and the amount currently available to donate above an exact amount input, Gold slider and Max button.
- The preview shows personal Gold retained and the Treasury's balance after the chosen donation.
- Daily cap, remaining allowance, donated today, raw Gold/hour basis and the 00:00 UTC reset remain available. The allowance is labeled as either a preview or locked.
- Independently scrolling columns keep the review action visible on desktop and landscape mobile. Treasury rules expand on the left.
- Confirmation shows the exact amount, resulting balances, allowance impact and finality warning. Cancel leaves the sample balance unchanged. Pending, successful, failed, unavailable and exhausted states are explicit.

## Preserved rules

The Master Development Specification, section 9, and `renderClanTreasuryPanel()` / `donateClanTreasuryFromPanel()` in `game.js` are the references. All members may donate their personal Gold; only Leaders and Officers spend Treasury Gold. Donations cannot be withdrawn. The daily allowance equals 12 hours of raw base Gold production, snapshotted on the first successful donation of the UTC day and fixed until the next UTC day. Balances and totals reset each season; disbanding also resets the balance. No prices, caps, roles or reset behavior are proposed to change.

Max selects the lower of personal Gold and remaining daily allowance. Confirmation is required before changing a sample balance. The example failure is a known rejected request, not a simulation of an ambiguous production timeout. Eventual runtime integration must preserve server authority, existing operation identity/retry handling, live balance updates, clan/session scope and typed amount across refreshes.

## Review

Run `node tools/map-benchmark/start-server.js 61704` and open:

`http://127.0.0.1:61704/docs/visual-qa/clan-treasury/index.html?viewport=desktop&sample=ready`

Switch between native-size desktop (1440 × 900), mobile landscape (844 × 390) and small landscape (568 × 320). The outer review page scrolls rather than scaling these views. The full-window link is useful on an actual landscape device. Examples include ready, first donation, low/no personal Gold, exhausted allowance, unavailable Treasury and one failed donation followed by a retry. Reset cancels pending sample operations.

## Validation

`node tools/validate-clan-treasury-draft-browser.js` checks all three sizes, visible controls, scroll access to allowance/rules, amount bounds, exact slider input, Max, cancel/focus return, confirmation arithmetic, duplicate-click prevention, first-donation locking, failed-donation retry, stale reset cancellation and review controls. It also checks for browser exceptions, missing assets and external network requests. Screenshots and results are saved to ignored `release-artifacts/clan-treasury/`.

No gameplay or server changes are included, so no emulator or gameplay regression suite applies. Runtime integration and deployment follow design approval.
