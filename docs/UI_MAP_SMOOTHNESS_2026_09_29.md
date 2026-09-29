# UI and map smoothness — September 29, 2026

Branch: `codex/ui-map-smoothness`. Base: `b2ef97b90db1add398cf70bc6c34e6a7f28e9782`.

## Findings and fixes

- Broad readability selectors were repeatedly evaluated against map elements. Chromium selector statistics showed one grouped surface selector attempted 3,315 matches while only 14 elements matched. Split 23 groups into equivalent single-argument `:where()` entries. Their targets, zero specificity, declarations and cascade position are preserved.
- City redraws reset and then restored every city's classes, even when its presentation had not changed. Three forced refreshes of 100 unchanged cities caused 1,719 attribute mutations. Compose the final class list once and only write changed classes, identity attributes, accessible labels and titles. The same check now records zero city-attribute mutations, retains images and focus, and takes 20.2 ms instead of 40.2 ms on this machine.
- Selection, attack/support highlights, clan membership, main-city identity, level, name, ownership and shield updates still use the existing rules. No game balance, server authority, realm data or API contract changes.

## Measurements

Controlled local Chromium fixtures use the current Core/New Lands runtime and synthetic cities and marches. No production player data or authenticated production actions were used.

For the CSS comparison, the original and revised stylesheet were installed at the same cascade position in before/after/after/before order. Each sample opened and closed three City Info panels and then measured 2.5 seconds of idle animation. Scenario B has 100 cities and 50 marches. These measurements isolate the stylesheet change, before the additional city reconciliation fix.

| Measurement (mean of two samples) | Before | After |
| --- | ---: | ---: |
| Desktop, three City Info cycles | 1,880 ms | 1,585 ms |
| Desktop, style work across cycles and idle sample | 2,613 ms | 2,235 ms |
| Landscape with 4× CPU slowdown, three City Info cycles | 14,117 ms | 11,723 ms |
| Landscape with 4× CPU slowdown, style work | 12,275 ms | 10,272 ms |
| Landscape with 4× CPU slowdown, idle frame p95 | 111 ms | 94 ms |

The stylesheet reduces measured City Info cycle time by approximately 16–17%. The busy-map stress case still drops frames at 4× CPU slowdown; this is not evidence of a universal 60 FPS guarantee. Device emulation and synthetic fixture timings are not physical-phone or production gameplay measurements. Short headless idle samples also show startup frame starvation, so their aggregate FPS is not used as a release claim.

## Validation

- Computed-style comparison: Map, City Info, Cities, Bag and Shop at 1440×900, 844×390 and 568×320. All 711,840 comparisons across 16 presentation properties matched. All 1,023,270 checks of the changed selectors' matching targets agreed. Rule counts, declarations and unchanged media rules matched too.
- New city reconciliation browser regression: three viewports, unchanged-refresh mutation count, image/focus retention, selection cleanup, clan transitions, ownership transitions, main-city marker, level and accessible labels.
- Existing browser checks: City Info layouts and actions; own/rival shield state and wall repair; map picker mouse, keyboard, wheel, tap, drag and pinch; responsive gameplay including interrupted touch, first-frame pinch application, pickups, pending scouts, Shop countdowns, Chat row retention, reconnect and neighboring-map switching.
- Existing static checks: readability and contrast, map interactions, map object scale, main-city behavior and clans. Two assertions were adjusted to recognize the composed class list; browser checks verify the resulting behavior.

Local evidence is in ignored `release-artifacts/ui-map-smoothness/`, plus the existing validators' artifact directories. `validation-plan.json` lists the selected automated checks. Required GitHub checks and deployment verification are recorded in the pull request and release receipt; this source note alone does not establish a live deployment.

## Remaining verification

Physical Android/iOS play and authenticated production gameplay still require a player smoke test. The heavy 4× CPU fixture retains measurable frame pressure. The intended deployment is the primary web game; itch.io publication is a separate channel and must be verified separately.
