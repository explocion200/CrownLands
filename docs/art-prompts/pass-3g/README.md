# Pass 3G Shared Production Standard

These specifications govern Crownlands global HUD, loading, navigation, and installed-app identity. They extend the approved Inner Castle, officer, gear, and item material culture without changing runtime behavior.

## Shared Visual Language

- Historical target: grounded 14th-15th-century Western/Central European frontier administration and warfare.
- Materials: aged oak, dull iron, muted brass, parchment, oxblood wax, burgundy wool, faded indigo, moss, ochre, leather, linen, rope, and soot-darkened charcoal.
- Rendering: painterly physical objects with woodcut-like silhouette clarity, soft natural daylight from upper left, restrained ambient shadow, and maintained wear.
- Camera: shallow three-quarter tabletop/object view for pictograms; near-front view only where function requires it.
- Edge treatment: complete isolated object, clean alpha, no painted square, frame, halo, glow, text, watermark, or clipped extremities.
- Small-scale rule: the role must remain readable at 30-56 CSS pixels. Broad shapes and one or two identifying details outrank miniature decoration.
- Crown rule: one simple late-medieval hammered crown silhouette with five restrained points, a low circlet, slight irregularity, muted gilt, and no large gemstones.
- Heraldry: burgundy is primary; faded blue, parchment, ochre, moss, charcoal, and muted brass are supporting accents.

## Canvas Classes

| Class | Source master | Optimized runtime | Safe occupancy |
| --- | ---: | ---: | ---: |
| HUD pictogram | 1254x1254 RGBA PNG | 192x192 RGBA WebP | 68-78% |
| Daily reward | 1254x1254 RGBA WebP | 160x160 RGBA WebP | 72-82% |
| Profile plaque | 1419x1108 RGBA PNG | 256x200 RGBA WebP | frame within outer 94%; central opening 58-64% |
| Map arrow | 654x720 RGBA PNG | 192x212 RGBA WebP | 70-82% |
| Loading component | 1254x1254 RGBA PNG | 256x256 RGBA WebP | ring 88-94%; crown 48-58% |
| App identity master | 1254x1254 opaque PNG | 192/512 normal and maskable PNG | emblem inside central mask-safe 60% |

Transparent padding is intentional for all transparent classes and must survive optimization. Normal PWA icons use the same master as maskable icons; only padding/background derivation differs.

## Universal Negative Instructions

No text, numbers, UI labels, border-card backdrop, modern map pin, modern trophy, neon, blue or purple magic, radial glow, floating particles, glossy mobile-game finish, esports logo, giant gemstone, pristine polished gold, anachronistic telescope, firearm, modern medal, modern compass housing, or unrelated fantasy ornament.
