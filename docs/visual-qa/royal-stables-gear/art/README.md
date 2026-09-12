# Cavalry Master · static artwork draft

The current draft uses **version 2**, adding a horse behind the Cavalry Master at the user's request. The original version 1 files are retained unchanged.

## Version 2 · horse addition

Edited the existing Cavalry Master in the same signed-in ChatGPT Images conversation using the image editor's Extra High setting. No API/CLI generation was used; the exact backend model was not independently verified.

- `cavalry-master-source-v2.png`: unchanged generated 887 × 1774 RGBA PNG with genuine transparency, 2,080,412 bytes.
- `cavalry-master-still-v2.webp`: static transparent 400 × 800 export, 88,862 bytes.
- `cavalry-master-prompt-v2.md`: exact edit prompt.
- `cavalry-master-v2.json`: source/export hashes, dimensions, crop, margins, and provenance.

One bridled, saddled bay horse stands behind the officer in the same medieval ink-and-wash style. The officer, lance, and boots remain fully visible. Both figures fit the existing equipment-panel area. There is no scenery, frame, text, UI, or animation.

The export retains ten source pixels of padding around the visible alpha-greater-than-64 bounds, resizes with Lanczos to 340 × 715, and places the image at (30, 42) on a transparent 400 × 800 canvas. WebP quality is 90, method 6. Source artwork and alpha are preserved; no repainting or background extraction was performed after generation. The draft checks cover transparency, centering, containment, and visible equipment controls at desktop and both landscape sizes.

## Version 1 · officer only

Created through the user's signed-in ChatGPT Images page, using the approved War Captain image as a style reference. The page displayed **ChatGPT Images 2.5 | AI Image Generator** and **Extra High**. The exact backend model was not independently verified. No API/CLI image-generation route was used.

Conversation: https://chatgpt.com/c/6aa4ca11-8754-83ea-9f58-ed2a08c84987

- `cavalry-master-source-v1.png`: original generated 887 × 1774 RGBA PNG with genuine transparency. Preserved unchanged.
- `cavalry-master-still-v1.webp`: single-frame 400 × 800 transparent draft asset, 68,234 bytes.
- `cavalry-master-prompt-v1.md`: exact generation prompt.
- `cavalry-master-v1.json`: source/export dimensions, hashes, crop, margins, and provenance.

The image depicts one Cavalry Master in riding armor and a slate-blue cloak, carrying an upright lance, with both boots visible. It follows the approved officers' medieval ink-and-wash direction. It contains no horse, scenery, frame, UI, text, or animation.

The export trims excess transparent margin using visible bounds at alpha greater than 64 and ten source pixels of safety padding. It preserves the original colors and alpha, resizes with Lanczos to 291 × 752, and places the figure at (54, 24) on a transparent 400 × 800 canvas. WebP quality is 90, method 6. No character repainting or background extraction was performed after generation.

This original officer-only version remains available for comparison. The current Royal Stables draft uses the version 2 WebP above. The original in-game portrait remains in the Current layout comparison. Runtime integration and publication require the later approved release step.
