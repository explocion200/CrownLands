# Pass 3F Shared Item Visual Specification

## Purpose

Pass 3F extends the approved Crownlands Inner Castle and officer equipment family into high-frequency consumables, pickups, city protection, and the Common Gear Box. Every object must plausibly sit on a table, rack, or floor inside the Pass 3D royal compound.

## Canonical Canvas And Framing

- Source master: 1254x1254 RGBA.
- Consumable runtime: fixed-layout 160x160 RGBA WebP.
- Pickup, shield-field, and Gear Box runtime: fixed-layout 192x192 RGBA WebP.
- Transparent pixels are intentional and must not be tightly trimmed.
- Opaque object bounds should remain inside the central 80% safe area except for narrow straps, cords, and horn tips.
- Primary objects should fill about 68-78% of source width or height, whichever is limiting.
- Use a centered, slightly elevated three-quarter product view with a stable visual center.

## Rendering Language

- Painterly grounded game-asset illustration with believable late-medieval construction.
- Soft natural daylight from upper left, neutral fill, modest contact shading contained within the object.
- Materials: rough oak, hammered iron, dull steel, leather, rope, linen, wool, parchment, dark wax, muted brass, restrained gilt, burgundy cloth, faded indigo, ochre, rust, charcoal.
- Evidence of prosperous use: scratches, dents, stitching, folds, hammer marks, oxidation, uneven parchment edges, faded dye, and repaired wear.
- Clear silhouette and limited small detail for 34-192px display sizes.

## Transparency Workflow

Candidates use a perfectly flat #ff00ff chroma-key background with no floor, cast shadow, reflection, gradient, haze, or magenta in the subject. The installed master uses local chroma removal on the canonical transparent canvas.

## Shared Negative Instructions

No text, letters, labels, numbers, watermark, UI frame, icon tile, floor plane, scenic background, neon, blue or purple magic, glowing outline, loot ray, particles, floating object, fantasy crystal, oversized gemstone, polished gold plating, modern hardware, anachronistic weapons, or glossy mobile-game rendering.
