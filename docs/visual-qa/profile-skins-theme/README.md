# Profile Skins theme correction

The Skins tab used the earlier 860px panel, burgundy header and generic cards. The other profile tabs use a parchment ledger capped at 1200 × 700. This update matches that existing frame, heading type, ink colors, selected tabs and inset card borders. Equip actions use the existing olive treatment; the wallet reuses the approved Crown coin.

Styles are scoped to `#profileScreen.skins-active`. The catalog's temporary skin artwork remains labeled. No backend or release-contract changes are included.

Following the owner's clarification, My Skins contains Cities, Troops and Flag Borders. Owned Flag Icons join the existing free symbols in Edit Flag → Symbol. The Shop still sells them, and its owned-icon action opens that editor without changing the saved flag. Save Flag applies the choice, preserving colors and pattern; the existing unsaved-change dialog protects drafts. An ownership update refreshes an open editor without replacing the draft.

Clicks in the flag-discard dialog no longer reach the Profile outside-click handler. Previously that handler replaced the pending tab navigation with Close Profile, so Discard closed the profile instead of opening the requested tab.

At short landscape heights, the wallet fits into one row and collection entries show their names beside compact icons. The header, categories and footer remain fixed while the collection and details scroll. This also clears the inherited full-width tab rule that could push the close button outside a narrow frame.

Loading and connection-error states allow the panel body to scroll, keeping Retry, the collection and footer reachable while the main profile tabs and close button remain fixed.

## Verification

Run the tests selected in `validation-plan.json` through `pnpm run prepare-pr`.

- The cosmetics browser validator compares the Skins frame, title font and active-tab styling with Profile at 1440 × 900, 844 × 390, 568 × 320 and 568 × 280.
- It uses pointer input to check categories, Equip/default, Profile/Skills/Settings navigation and close. It checks fixed-control reachability, content overflow and the existing purchase/reconciliation and Shop flows.
- It verifies that unowned flag icons are absent from the editor, purchases do not equip icons, owned icons open the Symbol tab, premium and free choices save, colors and pattern are preserved, unsaved changes can be kept or discarded, and late ownership updates preserve a draft. The existing identity browser validator covers authoritative name/flag saves on desktop and landscape mobile.
- The Crown HUD validator checks the shared stylesheet's map counter, pickup and timer behavior.
- Existing production packaging and asset validators check the versioned stylesheet and delivery limits. The theme adds 9,717 normalized CSS bytes, with a bounded 10 KiB module allowance and no new image downloads. The existing installation-cache limit is unchanged.

Browser screenshots are generated under `release-artifacts/halloween-skins/profile-*.png` and `flag-editor-*.png`. Comparison captures are stored locally under `release-artifacts/profile-skins-theme/`. These are local fixture results; production deployment requires separate verification.
