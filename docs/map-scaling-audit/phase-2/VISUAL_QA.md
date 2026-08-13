# Phase 2 Visual QA

## Method

The Browser skill exercised the loopback authenticated-equivalent Scenario C fixture with 150 cities and 100 active marches. A same-origin visual shell gave the game an exact internal 1440×900 or 844×390 viewport; the desktop iframe was scaled only to fit the in-app screenshot frame. DOM/computed-style probes confirmed the internal dimensions and active detail class.

The visual fixture adds benchmark-only coverage for one Peace Shield, one existing-art Stronghold, and a real clicked foreign/neutral target. It does not modify production gameplay data.

Machine-readable state is in [visual-qa-state.json](visuals/visual-qa-state.json).

## Captures

| Viewport | Far | Medium | Close |
|---|---|---|---|
| Desktop 1440×900 | [PNG](visuals/scenario-c-desktop-far-1440x900.png) | [PNG](visuals/scenario-c-desktop-medium-1440x900.png) | [PNG](visuals/scenario-c-desktop-close-1440x900.png) |
| Mobile 844×390 | [PNG](visuals/scenario-c-mobile-far-844x390.png) | [PNG](visuals/scenario-c-mobile-medium-844x390.png) | [PNG](visuals/scenario-c-mobile-close-844x390.png) |

## Findings

| Check | Far | Medium | Close |
|---|---|---|---|
| Exact tier class | `detail-far` | `detail-medium` | `detail-close` |
| Ownership color/marker | Clear | Clear | Clear |
| Main city | Visible | Visible | Visible |
| Selected target and selection UI | Visible | Visible | Visible |
| Peace Shield | Visible, static | Visible | Visible |
| Stronghold/objective | Visible when inside viewport | Visible when inside viewport | Not hidden; may be culled outside the close mobile viewport |
| Active route ribbons | 100 in DOM and visible | 100 in DOM and visible | 100 in DOM and visible |
| Secondary route flows | Hidden | Visible | Visible |
| March tokens | Visible; 100 desktop / 69 mobile in viewport | Visible | Visible |
| March count/time | Hidden for non-selected tokens | Visible | Visible |
| Generic secondary city text | 135 desktop / 129 mobile names hidden | Restored | Restored |

Far view is materially cleaner without losing strategic ownership or movement. Medium restores identities and moving route flow. Close retains the original full text treatment. Route geometry does not pop out when flow is hidden because the relationship-colored ribbon stays present.

No broken clipping, transform offsets, z-index inversion, missing ownership art, image swapping, or selection-wheel failure was observed. The exact production hysteresis function is also validated at both sides of every threshold, preventing boundary flicker without relying on timing-sensitive screenshots alone.

The close mobile viewport contains fewer city/march nodes because the existing viewport culling renders only the visible local area at higher zoom. Scenario C source data remains 150 cities/100 marches, and the LOD implementation does not remove entities.
