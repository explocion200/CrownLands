# Master of Coin — candidate sprite v1

Status: artwork draft for review, created September 10, 2026. These files are used only by the local Treasury design review. The game runtime still uses its existing portrait. No equipment illustrations, equipment rules, or other officers changed.

## Creation provenance

The source was generated through the user's signed-in **ChatGPT Images 2.5** web page, using their plan route rather than a direct paid API request. The originating page explicitly identified itself as ChatGPT Images 2.5. [Generation conversation](https://chatgpt.com/c/6aa3500d-1604-83ea-ad1f-ba6c9b148c14).

The downloaded PNG's embedded software metadata labels `gpt-image` as version `2.0`. That label is inconsistent with the originating page's product name; the serving backend model is not independently verified. Neither a specific backend model nor a Sunburst API invocation is claimed.

References uploaded for this request:

- Existing character: `assets/gear/master-of-coin.png`.
- User's illustrated countryside map: `codex-clipboard-cfa65c16-15c8-4d83-a1de-62ae6516d087.png` from the attachment.
- Approved Treasury interior: `docs/visual-qa/inner-castle-overview/art/treasury-ink-wash-v1.png`.

## Files and animation

| File | Purpose |
| --- | --- |
| `master-of-coin-source-v1.png` | Unmodified downloaded 1254×1254 RGBA source, arranged as three columns by two rows. |
| `master-of-coin-sheet-v1.webp` | Aligned 960×1280 atlas; six 320×640 cells in reading order. |
| `master-of-coin-still-v1.webp` | First frame for comparison, reduced motion, and paused presentation. |
| `master-of-coin-idle-v1.webp` | Transparent animated WebP with a repeating 6.16-second idle loop. |
| `master-of-coin-v1.json` | Provenance, source bounds, offsets, frame order, and durations. |

Packaging divides the source into six equal 418×627 cells. Each cell is translated onto a 320×640 transparent canvas so its visible silhouette is centered and its foot baseline is at y=624. Bounds are measured with alpha greater than 64 for alignment only; the generated pixels are not repainted. WebP outputs use quality 90 and method 6.

Playback uses zero-based frames `0, 1, 2, 3, 4, 2, 1, 5, 0` for `1600, 650, 750, 100, 110, 600, 550, 900, 900` milliseconds respectively. The closed-eye frame is brief. Small generated differences in the face, cloth, and stance remain part of this candidate and need visual approval.

Checks confirmed genuine PNG alpha, six aligned poses, valid transparent animated WebP frames, decoding in the browser, and containment between the equipment slots at all three supported review sizes. Browser checks also confirmed portrait switching, reduced-motion selection, and pause/resume during the upgrade confirmation. This is not a physical-phone performance certification or a runtime release.

## Exact submitted prompt

```text
Create an image using ChatGPT Images 2.5: a six-frame animated character SPRITE SHEET for Crown Lands' Treasury equipment screen.

REFERENCE ROLES: master-of-coin.png is the character reference: preserve this older male treasurer's receding gray hair, short beard, burgundy long robes, fur collar, antique gold chain, belt with keys, brown boots, and closed brown ledger held against his body. The attached illustrated countryside map is the PRIMARY ART STYLE reference. The illustrated Treasury interior supports the same ink-and-wash materials and colors. Do not copy any backgrounds or additional people.

ART DIRECTION: Redraw the treasurer in the map's illustrated medieval style: crisp thin umber outlines, restrained hatching, flat muted watercolor washes, warm light skin, faded burgundy cloth, olive-brown fur, ochre leather and antique brass. Natural anatomy, dignified face, clear silhouette at small screen sizes. Avoid photorealism, glossy 3D, anime, or pixel art.

SPRITE SHEET: Exactly SIX equal-size cells, three columns by two rows. Square canvas, preferably 1536 x 1536, so each cell is 512 x 768. No gutters, grid lines, labels, numbers, captions, or watermark. Each cell contains the SAME full-body treasurer at exactly the same scale, facing the same direction, at precisely the same centered position, with both boots anchored on the same baseline. Allow a little transparent padding around every silhouette. Keep every head and boot fully inside its own cell. Identical camera, face, outfit details, ledger, chain and feet across all six cells.

FRAME SEQUENCE, left to right, top to bottom: 1 relaxed, eyes open; 2 tiny inhalation with chest and shoulders rising just slightly; 3 inhalation peak, eyes open; 4 same peak pose with eyes closed for a blink; 5 eyes reopening, beginning to exhale; 6 relaxed exhalation returning toward frame 1. Only very small breathing and eyelid changes. Feet, ledger and clothing design remain stable. No walking, waving, head turns or changing camera. This must look like six frames of the same character, not six redesigns.

BACKGROUND: A real transparent PNG alpha channel outside the character, including between his boots and around each silhouette. Do NOT draw a checkerboard or a white/colored background. No background scene, floor, detached props or cast shadow. Generate the sprite-sheet image directly.
```
