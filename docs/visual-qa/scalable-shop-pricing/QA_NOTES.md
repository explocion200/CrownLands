# Scalable Shop pricing UI QA

Fixture: `docs/visual-qa/scalable-shop-pricing/index.html`

Validated with the production stylesheet cascade on 2026-08-22.

## Desktop — 1200×800

- Paid item cards scroll horizontally (`scrollWidth > clientWidth`).
- Exactly one item has the selected state.
- Selecting Royal Tax Decree centers its card and updates price and owned count.
- The shared purchase bar stays at the bottom of the Shop panel.
- Rewarded-ad controls remain separate and unchanged.
- No document-level horizontal overflow.

Screenshot: `screenshots/desktop-1200x800.png`

## Mobile landscape — 844×390

- Paid item cards scroll horizontally.
- The selected card is fully visible after selection.
- The Buy control remains visible in the bottom purchase bar.
- Price and owned count remain visible.
- No document-level horizontal overflow or vertical clipping.
- Optional rewarded-ad cards retain the existing compact-landscape behavior and are hidden.

Screenshot: `screenshots/mobile-landscape-844x390.png`

## Narrow landscape — 540×320

- Paid item cards scroll horizontally.
- The selected Royal Tax Decree card is fully visible.
- The bottom bar remains 52.8px high and fully inside the 312px modal card.
- Selected item, price, owned count, and Buy control are all visible.
- No document-level horizontal overflow.

Screenshot: `screenshots/narrow-landscape-540x320.png`

Portrait layouts were not tested or changed.
