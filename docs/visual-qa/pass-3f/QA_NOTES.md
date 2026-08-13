# Crownlands Visual QA - Pass 3F

Reviewed 2026-08-12 against `docs/CROWNLANDS_ART_BIBLE.md`, the Pass 3D Inner Castle, and the Pass 3E officer/Common Gear family.

## Accepted Production Art

- Common Gear Box: scratched oak quartermaster chest with hand-forged iron hardware and a restrained Crownlands mark.
- Common Gear Box open state: matching chest, weighted lid, burgundy packing cloth, and visible gear parcels.
- Royal Peace Shield: painted shield, protected charter, royal wax seal, and restrained brass.
- War Drums: hide-covered field drum, rope tensioning, sticks, and worn campaign paint.
- Royal Tax Decree: folded parchment, treasury notation, wax seal, and a few hammered coins.
- Veil of Silence: dark folded cloth, sealed confidential packet, cord, and leather case.
- Swift March Order: travel-worn courier dispatch, leather message case, cord, seal, and small iron key.
- Recall Horn: practical animal horn with leather strap and muted brass fittings.
- Gold Pickup: tied purse, irregular hammered coins, and a small tax seal.
- Troop Pickup: iron helmet, burgundy muster banner, spear points, and rolled order.
- Peace Shield field: thin seal perimeter with four wax markers and a fully readable transparent center.

One first Peace Shield field candidate was rejected because its ornate gilt filigree read as fantasy UI rather than royal authority. The accepted revision is thinner, quieter, and map-readable.

## Dimensions And Source Payload

| Asset | Old source | New source | Old bytes | New bytes |
| --- | --- | --- | ---: | ---: |
| Common Gear Box | 1254x1254 RGB | 1254x1254 RGBA | 1,841,244 | 1,276,242 |
| Royal Peace Shield | 512x512 RGB | 1254x1254 RGBA | 58,906 | 879,530 |
| War Drums | 512x512 RGB | 1254x1254 RGBA | 47,546 | 841,214 |
| Royal Tax Decree | 512x512 RGB | 1254x1254 RGBA | 54,722 | 904,370 |
| Veil of Silence | 512x512 RGB | 1254x1254 RGBA | 34,782 | 792,332 |
| Swift March Order | 512x512 RGB | 1254x1254 RGBA | 50,534 | 767,376 |
| Recall Horn | 512x512 RGB | 1254x1254 RGBA | 33,044 | 523,530 |
| Gold Pickup | 1254x1254 RGBA | 1254x1254 RGBA | 1,082,086 | 1,100,803 |
| Troop Pickup | 1254x1254 RGBA | 1254x1254 RGBA | 989,241 | 964,425 |
| Peace Shield field | 512x512 RGBA | 1254x1254 RGBA | 294,874 | 392,514 |
| Common Gear Box open | New support state | 1254x1254 RGBA | 0 | 1,767,761 |

The ten replaced source masters changed from 4,486,979 to 8,442,336 bytes. The new open-box source brings the complete source family to 10,210,097 bytes; only optimized derivatives ship to runtime.

## Runtime Payload

| Runtime asset | Dimensions | Old bytes | New bytes |
| --- | --- | ---: | ---: |
| Common Gear Box | 192x192 | 4,432 | 6,598 |
| Royal Peace Shield | 160x160 | 6,362 | 5,204 |
| War Drums | 160x160 | 5,560 | 5,500 |
| Royal Tax Decree | 160x160 | 7,194 | 8,434 |
| Veil of Silence | 160x160 | 4,142 | 5,060 |
| Swift March Order | 160x160 | 5,654 | 5,948 |
| Recall Horn | 160x160 | 3,940 | 6,328 |
| Gold Pickup | 192x192 | 9,252 | 8,248 |
| Troop Pickup | 192x192 | 10,874 | 8,920 |
| Peace Shield field | 192x192 | 12,902 | 12,044 |
| Common Gear Box open | 256x256 | 0 | 14,446 |

The ten replaced runtime assets changed from 70,312 to 72,284 bytes (+1,972). Including the new physical open-box state, the family is 86,730 bytes (+16,418 over the previous family). Fixed transparent canvases are preserved by the optimizer.

## Context QA

`index.html` contains old/new comparisons and live Shop, Bag, active-effect HUD, reward, map, and Gear Box reveal contexts. Twelve PNG captures record all six contexts at 1440x900 desktop and 844x390 Android landscape.

- All 12 captures loaded with zero broken images and zero horizontal page overflow.
- Shop and Bag keep clear object silhouettes, prices, counts, descriptions, and action buttons.
- Active timers remain readable over a live regional-map background without luminous tiles.
- Daily Login, Mission, Achievement, and level-up reward reuse resolves to the new optimized art.
- Gold and Troop pickups remain distinct at map size; motion uses fewer physical tokens and restrained ink/seal arrival marks.
- Protected cities remain unmistakable while the new royal-seal field leaves city art, labels, and selection states visible.
- Closed, opening, and revealed Gear Box states read as a physical latch/lid/card sequence without loot beams.

## Functional And Build QA

Passed: Pass 3F asset validator; Common Gear; timed-item stacking; pickup authority; Peace Shield march returns; level-up, daily, mission, seasonal, welcome-back, and foreground-resume rewards; runtime; animation; map loading; login resilience; public site; patch notes; audio unlock/delivery/contract; JavaScript syntax; Python helper compilation; `git diff --check`; production artifact (236 files, 21.35 MiB).

The full `pnpm test` suite passes through the asset-performance gate. All validators after that gate were run separately and passed, including King Power, reports, realm activity, Peace Shield returns, Swift March, clans/objectives, and reset release.

Known unrelated failures:

- `tools/validate-asset-performance-budgets.js`: `game.js` is 1604.6 KiB against the 1600 KiB source budget.
- `pnpm run lint`: two unused route helpers predate Pass 3F (`imageSizeToWorld` and `serverImageSizeToWorld`). Syntax checks pass.

Source PWA cache: `20260812-items-pass-3f-r3`. Verified production artifact stamp: `f4604e98824d`.

## Remaining Visual Mismatches

No major old mobile-fantasy art remains in the consumable, pickup, Peace Shield, or Gear Box family. The most visible remaining small-raster mismatches are the loading crown/ring and HUD bitmap icons. Regional maps and map-transition clouds remain separate future families.

Recommended Pass 3G: loading crown/ring, remaining HUD bitmap icons, and PWA/app identity art as one stamped Crownlands navigation and loading family. Do not begin the regional-map repaint in the same pass.
