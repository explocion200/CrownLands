# Clan Shop design draft

Review branch: `codex/clan-shop-draft`, based on `b737bdd2c1b63bc4babf2c619eb152f065ba1177`.

This is an interactive design proposal for approval. It is not integrated into the game entry or deployed. All purchases, inventory, membership and construction examples exist only in the preview's memory. No Firebase scripts, account access or production writes are loaded.

## Proposed presentation

- Provisions opens first, with a scrolling catalogue, larger approved item art and a selected-item detail pane. Personal Gold, selected price, remaining allowance and the purchase button remain visible on desktop and mobile landscape.
- Shop upgrades contains building art, current/next benefits, all ten unlock levels, exact Clan Treasury balance, cost, construction time, officer permissions and paused-project explanations.
- Daily reset is distinguished from the Peace Shield's rolling 72-hour purchase cooldown. The latter is a purchase allowance, not the offensive Peace Shield cooldown.
- Review controls offer 1440×900, 844×390 and 568×320; no portrait game layout is proposed. Levels 0–10 and buying, spent allowance, insufficient Gold, member/officer, new member, construction, failure and unavailable-stock states are available.

## Sources and preserved behavior

- `docs/CROWNLANDS_MASTER_DEVELOPMENT_SPECIFICATION.md`, Section 8: confirmed Clan Shop catalogue and allowances.
- `clan-tower-buildings.js`: shared level, allowance, unlock, usage, construction cost/time and building art helpers, loaded directly in this draft.
- `game.js`: current `SHOP_ITEMS` descriptions/art; canonical `assets/icons/common-gear-chest-r1.svg` chest and `assets/icons/royal-shop-gold-r1.svg` Gold.
- `economy-config.js`: current effect percentages and durations.
- `functions/index.js`, `readClanTowerShop` and price helpers: personal production-based pricing and 24-hour membership eligibility. Sample prices mirror the current formula for 250,000 base Gold/hour and 20 owned regular cities; these are illustrative, not live prices.

The draft retains the seven existing items. It does not change ownership limits, acquisition rules, Shield mechanics, construction requirements, costs or allowances. Main-shop limits remain independent; Clan Shop usage stays personal across clan changes. All seven entries are ordinary Bag items; this UI does not change the separate Tower Veil action.

## Integration after approval

Adapt the approved presentation in `clan-tower-buildings-ui.js/css` and keep the existing `game.js` selected-building, live shop status, `data-clan-shop-buy` and construction action handlers. Use real authoritative prices, eligibility and usage instead of sample data. Preserve the other three building views and map entry points. No backend rule changes are proposed. Verify live updates, stale permission/ownership rejection, purchase pending/error states and actual desktop/landscape interaction before release.
