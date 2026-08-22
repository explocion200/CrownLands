# Holding Towers visual QA and performance report

## Scope and safety

- Branch/worktree: `codex/holding-tower-visuals` in `work/crownlands-holding-tower-visuals`.
- Preview package: `core-v2-qa1-approved-25-map-final-art-v1` / candidate `reset2-candidate-2e68667049a02b05`.
- Protected Pending Core digest remained `1cc14d9af4bc4ee90a76f6c8f69b09f41ee191339baec3980cb51ce316e1bcbc` across preview reads and visual-config save tests.
- The four additions are noninteractive visual objectives. Their serialized and interaction sizes are zero. No holding-tower behavior, rewards, ownership, timers, battles, capture flow, routing clearance, or hit targets were added.
- The current live catalog contains no `core-v2-` region IDs, so the shipped renderer creates zero Holding Tower nodes for the current live world.
- No reset, merge, push, deploy, or production-world activation was performed.

## Protected placement mapping

| Source | Visual ID | Protected region | Grid | Reserved image coordinate | Reservation radius |
| --- | --- | --- | ---: | ---: | ---: |
| `1.png` | `core-v2-holding-tower-1` | `core-v2-north-west-holding-tower-m1-m1` | `(-1, -1)` | `(736, 552)` | `(142, 126)` |
| `2.png` | `core-v2-holding-tower-2` | `core-v2-north-east-holding-tower-p1-m1` | `(1, -1)` | `(734, 555)` | `(142, 126)` |
| `3.png` | `core-v2-holding-tower-3` | `core-v2-south-west-holding-tower-m1-p1` | `(-1, 1)` | `(724, 543)` | `(142, 126)` |
| `4.png` | `core-v2-holding-tower-4` | `core-v2-south-east-holding-tower-p1-p1` | `(1, 1)` | `(736, 555)` | `(142, 126)` |

All four use a `184 px` visual canvas width, `0.5` X anchor, `0.969` base/Y anchor, and `0 px` visual Y offset. These are independent, editable per-tower fields in `objective-visual-config.js`; the protected coordinates and reservation radii are locked. Measured visible-pixel bounds are also stored per tower so collision diagnostics ignore transparent canvas padding.

## Asset preparation

- Untouched supplied originals: four opaque RGB PNGs at `1254×1254`, retained under `assets/holding-towers/source/` and protected by SHA-256 validation.
- Transparent masters: four RGBA PNGs at `640×640`, with the visible height normalized to `600 px` and a `20 px` top/bottom safety margin.
- Preparation: deterministic border-connected near-black matte removal. Enclosed dark doors, windows, roof shadows, and outlines remain opaque; only the exterior matte and its anti-aliased fringe are removed.
- Alpha validation: all four masters have transparent corners, partial-alpha fringe pixels, and zero opaque near-black boundary/halo pixels.
- Runtime derivatives: fixed-layout alpha WebP at `384×384`.

| Tower | Runtime file | Encoded bytes | Decoded RGBA bytes when active |
| --- | --- | ---: | ---: |
| 1 | `holding-tower-1-384x384-4ecfb3a8b86d.webp` | 24,276 | 589,824 |
| 2 | `holding-tower-2-384x384-65f5ac41f3ac.webp` | 23,064 | 589,824 |
| 3 | `holding-tower-3-384x384-6c19186b65e2.webp` | 22,280 | 589,824 |
| 4 | `holding-tower-4-384x384-d0e38c326d09.webp` | 26,950 | 589,824 |

Total encoded tower payload is `96,570 bytes` (`94.3 KiB`). The active map renderer instantiates at most the tower belonging to the active Pending Core region, for `0.563 MiB` decoded RGBA. Images use async decoding, native lazy loading, low fetch priority, keyed node reuse, viewport culling, and existing camera/zoom/crowding effect reduction. Tower art is intentionally absent from the service-worker install precache.

## Visual and responsive QA

- Desktop overview checked and captured at `1248×1050` (with an additional `1440×1050` CSS-viewport inspection): all four reserved maps are visible in the 5×5 comparison, each tower is distinguishable, and the diagnostic reports no material city, objective, road-exit, or map-edge collision.
- Detailed map review checked for each tower after both the `1448 px` protected map and `384 px` tower derivative completed decode.
- Exact responsive viewport checked at `844×390`: no document-level horizontal overflow; the Holding Towers comparison and protected/local-only banner remain usable.
- Scale tuning result: `184 px` was retained for all four towers. Normalizing each silhouette to the same `600 px` master height keeps the set consistent without requiring per-tower scale exceptions. The base anchor lands at the protected reservation point, while the narrow transparent-canvas-aware bounds avoid false overlap warnings.

Screenshots:

- `overview-desktop-1248x1050.jpg`
- `tower-1-north-west-closeup.jpg`
- `tower-2-north-east-closeup.jpg`
- `tower-3-south-west-closeup.jpg`
- `tower-4-south-east-closeup.jpg`
- `responsive-844x390.jpg`

## Automated checks

- Crownlands Studio full check: `47/47` tests passed.
- Focused post-tuning Studio regression: `15/15` tests passed.
- Holding Tower structural/runtime validator: four towers, four protected reservations, zero live-world towers, `96,570` encoded bytes, `0.563 MiB` decoded per active tower.
- Alpha/source validator: four source hashes and masters passed; zero dark opaque halo pixels.
- Asset budgets: `2.38 MiB` optimized art total, `2.79 MiB` install cache, `0.28 MiB` login preload; all within repository budgets.
- Map image loading and map-object scale validators passed.
- Production build: `258` files, `18.47 MiB`; production-artifact validation passed and the built artifact contains the visual config plus exactly four hashed tower derivatives.
