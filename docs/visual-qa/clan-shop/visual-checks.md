# Clan Shop draft verification

The focused Chromium check runs `tools/validate-clan-shop-draft-browser.js` on a disposable loopback server, using synthetic preview data only.

- Desktop: 1440×900. Mobile landscape: 844×390 and 568×320.
- The dialog fits at all three sizes. Catalogue and item details scroll independently, with the price, remaining allowance and purchase control visible.
- All seven current item illustrations load, including the shared Common Gear Box and Gold icon.
- All ten Shop levels are accessible. Build/upgrade cost and time come from the shared building module; member-only and paused states disable construction correctly.
- Preview purchases charge once, update Bag/allowance counts and block duplicates. Failed purchases spend no Gold; retry succeeds. The Peace Shield starts a 72-hour purchase wait only after success.
- New-member, exhausted, insufficient-Gold, unbuilt, loading and unavailable-stock cases retain reachable controls. Close and reopen work.
- Desktop and landscape screenshots were visually inspected. No JavaScript exceptions or horizontal panel overflow were found.

Screenshots and machine-readable results are generated locally under ignored `release-artifacts/clan-shop-draft/`. These checks validate a design draft, not authenticated game integration or production deployment.

Runtime integration: the actual game Store/building entry passed `tools/validate-clan-shop-browser.js` at 1440×900, 844×390 and 568×320. Checked server-price payloads, real client economy/Bag updates, duplicate submission prevention, operation ID reuse on retry, depleted stock, the 72-hour Shield allowance, failed stock reads, membership wait, insufficient Gold, all ten upgrade rows, manager/incoming-attack restrictions and ownership loss. `validate-clan-tower-buildings-browser.js` also passed map entry, all four building views, live Treasury donations, purchase/construction actions and paused construction. Runtime screenshots are in `release-artifacts/clan-shop-game/`; desktop and landscape captures were inspected. User approval is received; publication remains pending.
