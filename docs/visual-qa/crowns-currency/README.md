# Crowns currency artwork and HUD

Approved by the owner in the October 1, 2026 design review: a silver-rimmed purple Crown coin beneath Gold, a purple pouch inside the existing circular pickup marker, and Shield Cooldown / Retaliation beneath the new counter. This is implementation evidence, not a production deployment record.

## Runtime behavior

- The two currency panels share their width, icon alignment and amount alignment. Exact Crowns are exposed through accessible text and a tooltip; the visible amount uses the game's compact number formatter.
- The counter reads the existing permanent cosmetic wallet. It refreshes after wallet snapshots, confirmed pickup responses and purchases. Unknown wallets show `—`; confirmed zero shows `0`. Signing out or switching accounts clears the previous balance immediately. Existing revision and account guards reject stale results.
- The timer panel follows the complete currency group in document flow. Both timer rows retain their current rules and retaliation navigation. On landscape screens up to 360px tall, when both march alerts and combat timers are visible, the two alerts share a row above Reports to avoid overlap.
- The profile stack now reports its full height to collision checks. The return-to-city control also avoids the complete profile-button row and Chat so it stays reachable when the taller stack moves its preferred position.
- The Crown pouch uses the same hit area, ring, radial glow, pulse and motion settings as the other pickups, with purple colors. The ring is rendered by CSS, separately from the transparent artwork.
- There are no backend, wallet grant, reward, price or release-contract changes. Halloween skin artwork remains placeholder art.

## Assets

The built-in image-generation tool produced the transparent sources below from the approved currency concept sheet. Sources stay in this folder; only the small WebP delivery assets ship in the client.

| Asset | Source | Runtime | Size |
| --- | --- | --- | --- |
| Counter coin | [PNG](art/crown-coin-source-r1.png) | [WebP](../../../assets/optimized/crown-coin-96x96-34224e7d7fb4.webp) | 96 × 96; 5,212 bytes |
| Map pouch | [PNG](art/pickup-crowns-source-r1.png) | [WebP](../../../assets/optimized/pickup-crowns-192x192-d4a7a7bc335c.webp) | 192 × 192; 16,086 bytes |

Delivery encoding used Sharp: resize to the listed square size with `fit: "contain"` and a transparent background, then WebP with `quality: 90`, `alphaQuality: 100`, `effort: 6`. No semantic edits or background removal were done during encoding. Filenames contain the first 12 characters of their encoded SHA-256 hashes.

Production validation caps the two delivery assets at 24 KiB combined (21,298 bytes measured) and rejects the source-art directory. The HUD renderer and pickup styling add 833 normalized bytes to the cosmetic modules, increasing their dedicated cap from 36 to 37 KiB. Existing offline-shell, entry-point and total artifact limits remain in place.

Source SHA-256:

- Coin: `ffa23f7cb2b7e52105ac4bc10654ba838db02ad4e73eb0c892e8742d3fe579e3`
- Pouch: `2e6501db0d681f8931a14bd5dcd7ac101d826810f52f7108abfda76a76ae93e7`

### Final coin prompt

Precise asset extraction from approved Crownlands concept sheet. Produce ONLY the single silver-rimmed plum-purple Crown coin from the upper-left COUNTER ICON panel as an isolated game icon on genuine transparent alpha. No sheet, words, labels, background, ground shadow, pouch, duplicate coins, circles or glow. Preserve its hand-inked medieval style, worn antique silver edge, muted purple enamel and prominent pale silver three-point crown. Simplify very fine scratches so the crown reads clearly at 20 CSS pixels. Show the face nearly straight-on, round and visually centered, a very slight thickness at the left edge. The isolated complete coin occupies about 88 percent of a square image with clear transparent margins on every side. Crisp silhouette, high contrast crown against purple, matte watercolor shading, no neon or glossy 3D.

### Final pouch prompt

Precise asset extraction from approved Crownlands concept sheet. Produce ONLY the purple pouch with silver-rimmed plum-purple Crown coins from its lower-left MAP PICKUP panel as an isolated transparent game sprite. Preserve the approved short squat plum fabric drawstring pouch, natural tan cord, three silver/plum coins with one upright showing a pale silver three-point crown. Same sepia ink outlines, matte painted shading and restrained worn medieval materials. Subject fills about 86 percent of a square image, centered, all edges intact with clear transparent margins. GENUINE transparent alpha around the subject. NO parchment, text, border, pedestal, background scenery, purple circle, baked glow, or broad ground shadow. The game will render its existing circular purple pickup indicator behind this sprite separately. Keep the complete pouch and coins readable at 62 CSS pixels. No redesign, neon, gems or glossy 3D.

## Validation

Run the selected validators in `validation-plan.json` through `pnpm run prepare-pr`.

- `validate-crowns-hud-browser.js`: unknown/zero/large balances, stale responses, account changes, signed-out clearing, actual collection failure/pending/success, transparent delivery art, matching three-type circle sizes and colors, timer order and alignment, reachable HUD controls and retaliation dropdowns at 1440 × 900, 844 × 390 and 568 × 320.
- Existing cosmetics browser checks include confirmed spending and reconciliation updating the counter. Existing combat-timer checks cover expiration, records, scrolling and map actions. Home navigation and main-screen artwork checks cover affected shared layout and navigation.
- Screenshot and JSON evidence is generated locally in `release-artifacts/crowns-currency/`; synthetic accounts and wallet data are restricted to the loopback fixture.

Production assets use the existing runtime cache, with no new install preloads. Updated stylesheet/script versions are included in the offline shell. The small Gold coin correction from PR #419 is included here so the approved pair can be reviewed together.
