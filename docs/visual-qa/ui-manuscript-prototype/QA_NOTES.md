# Crownlands manuscript prototype — visual QA notes

## Scope

This prototype deliberately stops after five screens:

1. Profile
2. Shop
3. Daily Missions
4. Attack Preparation
5. Battle Report

No gameplay rules, server contracts, account data, map interaction, economy settlement, mission progress, attack resolution, or report data flow changed. Existing Crownlands SVG symbols and approved item artwork are reused.

## Comparison method

`capture.html` renders representative markup with the real Crownlands stylesheet stack. `mode=before` omits only `manuscript-prototype.css`; `mode=after` loads it after `readability.css`. This makes the comparison repeatable without requiring an authenticated account or mutating live data.

The screenshots in `screenshots/` were captured in a real Chromium browser at:

- Desktop: 1440 × 900
- Android landscape: 844 × 390

The full measurements are recorded in `metrics.json`. Every after-state capture reports no horizontal overflow. Profile and Daily Missions fit the compact viewport. Shop, Attack Preparation, and Battle Report retain controlled vertical scrolling because their content is longer than 390 pixels; Attack Preparation keeps its primary actions visible in a sticky footer.

The in-app capture service normalizes the 1440 × 900 browser viewport to a 1248 × 900 JPEG raster. `metrics.json` records the inspected CSS viewport and page dimensions at the requested 1440 × 900 size; the Android capture remains 844 × 390 pixel-for-pixel.

## Preserved constraints

- Font imports were not changed. Computed QA fonts remain `Cinzel` for body/UI copy and `Cinzel Decorative` for major headings; existing IM Fell English usage remains available.
- `manuscript-prototype.css` contains no `font-family`, `@font-face`, or `@import` declarations.
- The login background and its optimized derivative were not edited.
- The login card's unintended red decorative orb remains removed.
- No replacement icon library, image generator, or new remote asset dependency was introduced.

## Design system decisions

- Warm parchment surfaces with ink-brown primary copy.
- Burgundy chapter ribbons for major titles.
- Rust for attacker/active emphasis, ochre for progress and rewards, indigo for defender contrast, and moss for completion states.
- Thin ruled dividers, square ledger rows, restrained ornament, and compact controls.
- Primary, secondary, hover, pressed, pending, and disabled button states are centralized in the prototype stylesheet.

## Screen observations

- **Profile:** information density improves through a two-column royal-record layout and ruled statistic cells. The shared Profile header remains recognizable; Clan, Skills, and Settings content was not redesigned.
- **Shop:** preserved item images use `object-fit: contain`; price, ownership, description, and action are readable as a single ledger row.
- **Daily Missions:** all three assignments appear together at 844 × 390 with readable progress, reward, and state labels.
- **Attack Preparation:** route, troop slider, optional item, forecast, and actions form one coherent parchment. Compact landscape keeps Attack and Cancel accessible.
- **Battle Report:** attacker/defender identity, resolved power, losses, wall result, and rewards form a compact campaign chronicle. Compact landscape scrolls vertically without clipping or horizontal drift.

## Remaining rollout checks

- Review the five screens with a signed-in production-like account containing unusually long player, clan, city, and item names.
- Confirm touch targets on representative physical Android devices, especially inside the dense Battle Report.
- Get visual approval on this five-screen gallery before extending the manuscript system to additional screens.
