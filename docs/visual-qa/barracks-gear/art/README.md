# War Captain — static character v1

Created and approved September 11, 2026 for the Barracks layout. The user explicitly requested a character without motion. This is one still image, not a sprite sheet or animation. The identical 79,142-byte WebP is integrated at `assets/optimized/barracks-war-captain-still-400x800-b41f63401fb3.webp`, recorded in the optimized asset manifest. Publication requires release-channel verification.

## Creation provenance

Generated through the user's signed-in ChatGPT Images page, whose title was **ChatGPT Images 2.5 | AI Image Generator**, using the same plan route as the Master of Coin. No direct API request was used. [Generation conversation](https://chatgpt.com/c/6aa48f89-7e7c-83ea-af4d-14ae15d7a549).

The source PNG contains an embedded `gpt-image` version `2.0` label, as did the Treasury source. That differs from the page's product title, so the backend model version is not independently verified. The exact submitted prompt is preserved in `war-captain-prompt-v1.md`.

Uploaded references:

- Existing identity and outfit: `assets/optimized/gear-war-captain-768x1024-874eece78b2b.webp`.
- Approved character rendering: `docs/visual-qa/treasury-gear/art/master-of-coin-still-v1.webp`.
- User's primary map style: attached `codex-clipboard-cfa65c16-15c8-4d83-a1de-62ae6516d087.png`.

## Files and packaging

- `war-captain-source-v1.png`: unmodified downloaded 887 × 1774 RGBA source.
- `war-captain-still-v1.webp`: centered 400 × 800 transparent static export; runtime uses a byte-identical optimized asset.
- `war-captain-v1.json`: dimensions, hashes, crop, offset, and provenance.

The export trims the transparent margin using visible bounds measured at alpha greater than 64, with ten source pixels of safety padding. It preserves the original colors and alpha within that region, resizes with Lanczos to fit 376 × 752, and centers the result on a 400 × 800 transparent canvas. WebP uses quality 90 and method 6. No character painting or background removal was performed after generation.

Checks verify genuine alpha, one frame, intact silhouette, centered presentation, and containment between all eight equipment slots at desktop 1440 × 900, landscape 844 × 390, and small landscape 568 × 320. The current-layout comparison retains the previous portrait.
