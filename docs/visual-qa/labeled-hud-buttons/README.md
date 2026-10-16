# Labeled HUD buttons — approved artwork

Owner request: draft the four existing top HUD actions with their existing images
and visible names: **Leaderboard**, **Clan**, **Daily**, **Inner Castle**. The Clan
action must continue to display the player's own saved clan shield.

Revision 2 follows the owner's correction: retain the original button dimensions
and spacing, and make the names part of the images. The current runtime uses
56 × 56 buttons on desktop and the 844-wide landscape view, and 46 × 46 on the
568-wide view. No larger tiles or additional text labels are introduced.

The owner approved revision 2 on October 16, 2026 and requested merging the pending
work. Production `index.html` and `main-screen-art-ui.css` now use this design;
the existing actions, badges and saved clan renderer remain in place. The Master
Specification records the approved exception to burgundy rectangular backgrounds
for these four controls. Approval and merge are not deployment evidence.

## Review

With Node.js 22, run `node tools/map-benchmark/start-server.js 4187`, then open
`http://127.0.0.1:4187/docs/visual-qa/labeled-hud-buttons/index.html`.

- Compare transparent illustrated image buttons with the current icon treatment.
- Review desktop (1440 × 900), landscape (844 × 390) and small landscape (568 × 320).
- Switch Amber Wardens, Raven Guard and no-clan examples. These are synthetic
  examples, not the owner's live clan. The actual `renderClanHudAccess` and full
  heraldry renderer provide the shield; the illustrated Clan ribbon is a separate
  transparent image outside the replaceable shield container.
- Toggle sample Clan/Daily notification badges. The fixture keeps the selected
  Daily badge visible across normal synthetic HUD ticks.
- The four actions are appearance-only in this preview; they do not open game
  actions. The benchmark uses a mock account/backend and accepts only GET/HEAD.

The built-in `image_gen` tool edited the three existing HUD images to incorporate
their names on parchment ribbons. It generated the Clan ribbon separately, with
empty transparent space above for dynamic heraldry. Four RGBA PNGs are saved in
[`images/`](images/); the exact prompts and input references are in
[`images/prompts.json`](images/prompts.json). Generated originals are retained;
the repository copies are byte-identical. These review masters are not included
in the production build. Four 192 × 192 RGBA WebP delivery copies were prepared
with the existing `tools/optimize-game-art.py` `build_asset` function at quality 92,
retaining the full square canvases. Their combined size is 67,824 bytes; hashes,
source references and dimensions are in [`images/runtime-assets.json`](images/runtime-assets.json)
and the optimized-art manifest. They use the existing runtime image cache rather
than adding images to installation preload. The preview restores the historical
images before comparison; its stylesheet and sample state stay loopback-only.

## Validation

Run `node tools/validate-labeled-hud-draft-browser.js`. The focused browser check
uses the existing synthetic map server and verifies all three sizes, artwork
bounds, transparent surfaces, decoded RGBA images, non-overlapping/hittable
controls, exact original button positions/dimensions/spacing,
current/draft switching, different saved clan shields, no-clan discovery,
notification visibility and no network writes. It saves screenshots and results
under `release-artifacts/labeled-hud-draft/` (ignored review output).

`node tools/validate-main-screen-art-browser.js` checks production rendering,
navigation, keyboard/touch, unsaved Profile guards, dynamic shields and label
clearance at the same three sizes. Build/artifact and asset-budget checks verify
the runtime images are packaged and the source masters remain excluded.
Emulator tests are unnecessary: server rules, database access and authoritative
gameplay are unchanged. Physical-device review and live publication remain separate.
