# Profile Skins theme correction

The Skins tab used the earlier 860px panel, burgundy header and generic cards. The other profile tabs use a parchment ledger capped at 1200 × 700. This update matches that existing frame, heading type, ink colors, selected tabs and inset card borders. Equip actions use the existing olive treatment; the wallet reuses the approved Crown coin.

Styles are scoped to `#profileScreen.skins-active`. Shop, map pickups, flag artwork and wallet/equip rules keep their existing behavior. The catalog's temporary skin artwork remains labeled. No backend or release-contract changes are included.

At short landscape heights, the wallet fits into one row and collection entries show their names beside compact icons. The header, categories and footer remain fixed while the collection and details scroll. This also clears the inherited full-width tab rule that could push the close button outside a narrow frame.

## Verification

Run the tests selected in `validation-plan.json` through `pnpm run prepare-pr`.

- The cosmetics browser validator compares the Skins frame, title font and active-tab styling with Profile at 1440 × 900, 844 × 390, 568 × 320 and 568 × 280.
- It uses pointer input to check categories, Equip/default, Flag Editor access, Profile/Skills/Settings navigation and close. It checks flag colors, fixed-control reachability, content overflow and the existing purchase/reconciliation and Shop flows.
- The Crown HUD validator checks the shared stylesheet's map counter, pickup and timer behavior.
- Existing production packaging and asset validators check the versioned stylesheet and delivery limits. The theme adds 9,459 normalized CSS bytes, with a bounded 10 KiB module allowance and no new image downloads. The existing installation-cache limit is unchanged.

Browser screenshots are generated under `release-artifacts/halloween-skins/profile-*.png`. Comparison captures are stored locally under `release-artifacts/profile-skins-theme/`. These are local fixture results; production deployment requires separate verification.
