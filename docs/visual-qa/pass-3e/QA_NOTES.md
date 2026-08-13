# Crownlands Pass 3E QA Notes

## Scope Reviewed

- Four old portraits against four Pass 3E portraits.
- Each new officer beside his approved Pass 3D Inner Castle building.
- All 32 Common Gear items grouped by officer.
- Common Gear equipped layout at 1440x900 desktop and 844x390 mobile landscape.
- Canonical source/runtime dimensions, alpha behavior, manifest references, and cache version.

## Portrait Review

- War Captain: passed. Clearly adult male; campaign-worn mail, brigandine, burgundy authority cloth, officer sword, and muster order connect directly to the Barracks.
- Master of Coin: passed. Clearly adult male; ledger, keys, fur-trimmed administrative wool, scale, parchment, and controlled Treasury setting communicate finance without warrior or wizard cues.
- Cavalry Master: passed. Clearly adult male; reins, riding coat, spurs, dispatch case, horse, and working stable communicate cavalry logistics rather than heroic knight imagery.
- Defensive Commander: passed. Clearly adult male; heavier practical armor, gate keys, shield, portcullis, chains, and garrison activity communicate fortress command while remaining human-scale.
- The four faces are distinct in age, structure, hair, beard, complexion, and expression.

## Common Gear Review

- All four sets use unique physical functions rather than recolored generic armor.
- Treasury weapon slot is a closed sealed royal ledger with an attached brass counting scale. It contains no conventional weapon.
- Chroma removal was validated through transparent corners, alpha-channel checks, and dark-background contact sheets.
- Disconnected spill fragments from sheet boundaries were removed before source installation.
- All 32 sources are 1254x1254 RGBA. All 32 optimized files are 192x192 RGBA in fixed-layout `gear-item` category.

## Runtime Review

- Desktop 1440x900: passed. Equipped portrait and all eight slots fit; detail and inventory panels remain readable; no horizontal overflow; no broken images.
- Mobile landscape 844x390: passed. Master of Coin selected successfully; equipment slots remain 66x36 CSS pixels; no horizontal overflow; no broken images. The full QA page naturally scrolls vertically, while the equipment composition itself remains compact.
- Static gallery: passed. Old/new portraits, four building pairings, equipped screen, and all 32 runtime items resolve.

## Performance

- Portrait sources: 9,237,351 bytes before; 10,103,433 bytes after.
- Portrait runtime WebPs: 411,414 bytes before; 476,516 bytes after.
- 32 item sources: 46,281,771 bytes before; 17,925,461 bytes after.
- 32 item runtime WebPs: 295,250 bytes before; 170,194 bytes after.
- Combined officer/Common Gear runtime payload: 706,664 bytes before; 646,710 bytes after.
- Defensive Commander was re-encoded at quality 76 after the first optimized candidate exceeded the 140 KiB portrait budget; the accepted runtime file is 118,164 bytes and passed visual review.

## Cohesion Answer

Yes. The four male officers, their equipment, and their buildings plausibly belong to one Crownlands royal compound circa the 14th-15th century. Shared masonry, oak, natural light, burgundy authority cloth, dull iron, weathered leather, and practical wear hold the family together; profession-specific props keep each role legible.

## Remaining Issues

- Common Gear Box remains old-style and should join the later consumable/supply-item raster family.
- Regional maps, consumables, pickups, loading art, peace shield field, some HUD bitmaps, and the map-transition raster remain the largest old-style families.
- Authenticated production-account Common Gear actions were not mutated during visual QA. The existing server-authoritative validator covers purchase, open, equip, unequip, and upgrade contracts.
- The known `game.js` source-size budget issue remains separate from Pass 3E.
