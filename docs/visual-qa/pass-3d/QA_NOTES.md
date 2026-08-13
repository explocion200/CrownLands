# Pass 3D Inner Castle QA Notes

## Reviewed

- Current pre-pass Inner Castle masters were copied to `old-assets/`.
- Accepted ImageGen hub candidate was saved as `generated-candidates/accepted-inner-castle-hub.png`.
- Accepted ImageGen six-building sheet was saved as `generated-candidates/accepted-inner-castle-building-sheet.png`.
- Installed source masters were reviewed in `new-inner-castle-contact.png`.
- Old/new source comparison was reviewed in `old-new-inner-castle-comparison.png`.
- Runtime-size readability was reviewed in `runtime-size-preview.png`.
- Hub hotspot placement was reviewed in `new-hub-hotspot-layout-guide.png`.
- Real app rendering was tested through a temporary local server and throwaway `newGame()` state, without Firebase writes.

## Cohesion Review

- Same civilization: Pass. All seven scenes use the same Crownlands warm gray stone, aged timber, muted roof treatment, burgundy cloth, faded banners, worn paving, and working-castle atmosphere.
- Same historical period: Pass. No visible firearms, telescopes, modern signs, modern tavern layout, glowing treasure, or magical architecture.
- Same castle: Pass. The hub and building previews read as different functional spaces inside one royal compound.
- Same masonry and timber: Pass. The new set avoids the older bright-blue roof/logo dominance and uses related fieldstone, dressed stone, oak beams, iron, rope, leather, and cloth.
- Same lighting philosophy: Pass. Hub uses soft daylight; interiors use daylight plus restrained candle/hearth light.
- Human scale: Pass. People support function without becoming hero-character posters.

## Functional Identity

- Treasury reads through a secure stone counting chamber, chests, locks, clerk desk, ledgers, scales, sacks, and a guard.
- Great Hall reads through a dais, long tables, banners, hearth, carved timber roof, and formal meeting space.
- Barracks reads through weapon racks, shields, soldiers, benches, and yard/training access.
- Alehouse reads through benches, trestle tables, barrels, hearth, mugs, and retainers.
- Gatehouse reads through the oak gate, portcullis, chains, guard space, bell, and defensive tools.
- Royal Stables reads through horses, stalls, tack, straw, troughs, handlers, and courier/cavalry cues.

## Hotspot QA

- Existing hub hotspot percentages were preserved: Treasury 19/24, Great Hall 50/20, Barracks 81/25, Alehouse 19/57, Gatehouse 50/75, Royal Stables 81/58.
- Visual overlay check passed: every label lands on or adjacent to its intended structure.
- Actual app click-through passed: all six hotspots set `aria-pressed="true"` when selected.
- Back button passed: returned from Inner Castle to the originating City Details modal.
- Close lifecycle passed: closing the dialog removed `inner-castle-modal` state.

## Desktop QA

- `actual-app-inner-castle-desktop.png` uses the real app renderer and optimized runtime assets.
- Title, close button, hub, hotspot labels, preview art, role text, unavailable text, and Back button are readable.
- No major overlap or clipping remains after the title inset adjustment.

## Mobile Landscape QA

- `actual-app-inner-castle-mobile-landscape.png` uses the real app renderer at 844x390.
- The hub remains readable, hotspot plaques fit, and the preview tray remains usable.
- Long decorative city titles are tight but no longer visibly clipped in the tested viewport.

## Remaining Issues

- The six building interiors are intentionally darker than the hub. They remain readable at runtime size, but future officer art should use enough contrast to stand apart from those rooms.
- The Common Gear/officer portraits now look more old-style next to the refreshed Inner Castle environments and should be the next visual target.
- The live authenticated production account flow was not used; the actual app QA used a local throwaway game state to avoid Firebase writes.
