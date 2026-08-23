# Scalable Shop pricing UI QA — image-only revision

Fixture: `docs/visual-qa/scalable-shop-pricing/index.html`

Validated with the production stylesheet cascade on 2026-08-22.

## Desktop — 1200×800

- Paid item cards scroll horizontally (`scrollWidth > clientWidth`).
- Every paid card contains only one item image; no visible card text or card-level price remains.
- Exactly one item has the selected state.
- Selecting Royal Tax Decree centers its card and updates the concise description, price, and owned count.
- The shared purchase bar stays at the bottom of the Shop panel.
- Rewarded-ad controls remain separate and unchanged.
- The selected price appears once in the visible Shop UI.
- No document-level horizontal overflow.

Screenshot: `screenshots/desktop-image-only-1200x800.png`

## Mobile landscape — 844×390

- Paid item cards scroll horizontally.
- The layout retains the desktop section order and two-column optional rewards area at a smaller scale.
- Every paid card remains an image-only square tile.
- The selected card is fully visible after selection.
- The Buy control remains visible in the bottom purchase bar.
- Name, concise description, price, and owned count remain visible.
- No document-level horizontal overflow or vertical clipping.

Screenshot: `screenshots/mobile-image-only-844x390.png`

## Narrow landscape — 540×320

- Paid item cards scroll horizontally.
- The same desktop section order remains visible, including optional rewards.
- The selected Royal Tax Decree image tile is fully visible.
- Selected name, concise description, price, owned count, and Buy control remain visible.
- No card clipping or document-level horizontal/vertical overflow.

Screenshot: `screenshots/narrow-image-only-540x320.png`

## Interaction checks

- Click selection updates exactly one selected tile and refreshes the shared detail area.
- Left/right keyboard selection retains the same behavior and updates the concise description.
- Selecting an unaffordable Royal Peace Shield disables the shared button and shows `Not Enough Gold`.
- Browser console: no errors or warnings.

Portrait layouts were not tested or changed.
