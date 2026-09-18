# Shared Gold and troop artwork · atlas v1

Status: draft for user approval, refining Welcome Back on `codex/offline-earnings-draft`. The user requested the same two images with changed style and colors, then replacement everywhere those images appear once approved.

## Saved artwork

- [Gold PNG](art/gold-pickup-atlas-v1.png)
- [Troop PNG](art/troop-pickup-atlas-v1.png)
- [Before / after comparison](art-review.html)
- [Welcome Back, mobile landscape](index.html?viewport=landscape&sample=lost)

Both are 1254 × 1254 PNG files with real alpha. They retain the pouch/coins/cord/seal and helmet/banner/spears/scroll compositions, rendered in sepia ink, muted gouache shading, warm gray iron, antique gold, ochre leather, parchment, and weathered burgundy.

Generated using the built-in image generation tool. No API/CLI fallback or external paid provider was used. The tool does not expose a selectable model version in this environment; no specific model version is asserted.

The original files under `assets/` and their optimized runtime derivatives are unchanged. Only the Welcome Back draft points to the proposed versions.

## Shared reference audit and rollout after approval

| Reference | Current consumers / required update |
| --- | --- |
| `game.js:GOLD_PICKUP_ICON_SRC`, `TROOP_PICKUP_ICON_SRC` | Map pickup nodes, reward feedback animations, Hero Level-Up cards and troop destination, Daily Login rewards, rewarded-ad disclosure |
| `game.js:REWARDED_AD_ITEMS` | Shop Gold and troop boost cards; contains direct optimized paths, so update these as well |
| `daily-rewards-guide.html` | Public-facing pickup illustrations |
| `assets/gold-pickup.png`, `assets/troop-pickup.png` | Editable masters currently used by the pickup optimization pipeline |
| `tools/optimize-game-art.py` / `assets/optimized/manifest.json` | Produce and register new content-hashed 192px WebP derivatives; preserve alpha and do not regenerate unrelated artwork |
| `tools/prepare-pass-3f-art.py` | Preparation inputs refer to the same master names; ensure no old art is restored by a later pipeline run |
| Welcome Back draft | Already uses the proposed pair for approval |
| Saved Hero Level-Up draft branch | Use the shared runtime constants during integration; do not copy its old literal paths back into production |
| Other existing review fixtures | Shop snapshot and Pass 3f preview contain literal old paths; inspect/update still-active examples while retaining intentionally historical before/after evidence |

After approval, use a single shared pair of optimized assets across runtime consumers, refresh the manifest and relevant cache/version references, and search the complete repository for stale old hashes. Preserve click areas, production values, timing, and reward logic. Check the actual map pickup and reward displays, including alpha after pickup. Existing generic vector currency/resource symbols are separate assets; this request replaces usages of these two raster images.

The two generated masters are intentionally stored as versioned draft files until approval. No source image overwrite, main-branch update, PR, merge, or deployment occurred for this artwork revision.

## Verification

- Both source drafts have the original square dimensions (1254 × 1254) and 32-bit ARGB data. All four corner pixels are fully transparent.
- Before/after comparison loads all 12 images: original/proposed Gold and troops, three small-size pairs, and both map previews.
- The proposed pair was inspected at 48px, 64px and 96px on parchment and 96px on the map. No opaque rectangle appears behind either image.
- Welcome Back at 844 × 390 loads both proposed PNGs. Its earnings pane has equal client/scroll widths (434px); Collect remains 44px high and visible.
- This revision only changes draft images, review pages, and documentation. Runtime behavior tests from the preceding Welcome Back commit remain applicable; no slow emulator/release suite is needed for art approval.
- Before rollout, encode optimized WebP derivatives and recheck alpha and readability at actual runtime sizes. PNG masters are for review/editing, not the production delivery size.

## Exact prompts

### Gold

Use case: style-transfer.
Asset type: Crown Lands shared gold pickup and reward icon, square transparent PNG.
Input image 1 is the EDIT TARGET: the original gold-pickup.png, a tipped open leather coin pouch with a tied cord, spilled stamped coins, and a small red wax seal on the right. Input image 2 is STYLE REFERENCE ONLY: the user's hand-illustrated medieval map.
Primary request: Keep the original image's objects, arrangement, silhouette, viewpoint, proportions and square framing recognizably the same; change only its rendering style and colors to fit the map. Preserve the specific bag folds, open mouth facing bottom-right, cord across the bag, coins at the bottom, and right-side seal. Do not redesign or simplify into a different symbol.
Style: hand-drawn medieval atlas illustration, fine dark sepia ink outlines, delicate short hatching, flat gouache/watercolor shading in a few tonal planes, subtle restrained painted texture. Match the illustrated map's aged earthy palette and linework; completely remove the current photorealistic leather and metallic shine.
Palette: warm tawny umber and ochre-brown leather, parchment beige cord, antique yellow ochre gold coins and warm stone-gray silver coins, muted oxblood/burgundy wax seal, dark brown ink. Brighter and more readable than the original without saturated orange or glossy highlights.
Composition: one isolated object cluster, original square placement and amount of negative space, fully visible with no clipped edges; consistent readable silhouette at 48, 64 and 96px.
Background: real transparent alpha everywhere outside the objects, including spaces between coins and cord. No painted paper backdrop, no white or black rectangle, no checkerboard baked into the image, no ground, no halo, no surrounding frame. Keep any tiny contact shading confined to the objects.
No additional objects, text, lettering, watermark, glow, 3D render, glossy specular lighting, modern cartoon or thick sticker border. Output only the single edited gold icon at 1024x1024 or higher, not a comparison sheet.

### Troops

Use case: style-transfer.
Asset type: Crown Lands shared troop pickup and reward icon, square transparent PNG.
Input image 1 is the EDIT TARGET: original troop-pickup.png, a medieval metal helmet in front of a burgundy hanging banner, two outward-diagonal spears, and a rolled parchment with red wax seal in the foreground. Input image 2 is STYLE REFERENCE ONLY: the user's hand-illustrated medieval map. Input image 3 is the newly restyled GOLD ICON, a companion style/color/linework reference only; do not add its objects to the troop icon.
Primary request: Keep the original troop image's exact objects, arrangement, silhouette, viewpoint, proportions and square framing recognizably the same; change only rendering style and colors to fit the map and companion gold icon. Preserve the helmet shape, central ridge and cheek guards, the banner pole and cloth silhouette, both spears, and foreground sealed scroll. No redesign into a new icon, no additional objects.
Style: hand-drawn medieval atlas illustration, fine dark sepia ink outlines, restrained short hatching, flat gouache/watercolor shading in a few tonal planes, subtle painted texture matching the companion gold icon. Replace all photorealistic metal/leather texture and shine with clearly drawn forms.
Palette: warm slate/stone-gray iron helmet and spearheads with soft pale parchment-gray highlights, weathered muted oxblood/burgundy cloth (not vivid red), ochre-brown wooden shafts, parchment beige scroll, muted burgundy wax and dark sepia ink. Match the map's muted earthy colors. Readable midtones, not near-black glossy armor. No gold helmet.
Composition: one isolated original object cluster, square image with the same arrangement and negative space, fully visible, clear at 48, 64 and 96px.
Background: genuine transparent alpha everywhere outside the objects, including open gaps between spear shafts, helmet and banner. No black or white rectangle, no checkerboard, no painted parchment backdrop, no scene, no cast shadow on a floor, no halo, no surrounding frame.
No lettering, watermark, glow, 3D render, glossy specular lighting, modern cartoon or thick sticker outlines. Output only the single edited troop icon, not a comparison sheet, 1024x1024 or higher.
