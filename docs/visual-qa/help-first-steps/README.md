# Help & First Steps draft

Design-review branch: `codex/help-first-steps-draft`, from current main `b737bdd2c1b63bc4babf2c619eb152f065ba1177`. The separate Clan Shop draft stays on `codex/clan-shop-draft` / PR #336 and is not included or discarded.

## Proposal

Five illustrated chapters replace the current long text list: First steps, Cities & map, Combat & protection, Clans & Towers, Items & rewards. Each card presents a short explanation with optional detail. Search includes synonyms such as reconquer/recapture, and cross-chapter links stay inside the handbook. Each chapter remembers its scroll position while the preview is open.

The first five topics preserve the existing onboarding sequence: ruler name, flag, city upgrade, scout, attack. The fixed footer retains the first-steps guidance control and a return action. The preview changes only local memory; it does not modify saved onboarding preferences or open real game actions.

Supported review sizes: desktop 1440×900; mobile landscape 844×390 and 568×320. There is no proposed portrait game layout.

## Copy sources

| Topics | Authority / current implementation |
| --- | --- |
| Name, flag, upgrade, scout, attack | `game.js`: `ONBOARDING_TOPICS`, `getOnboardingCopy`, `showHelpModal`; the existing 18-character name and 600-second scout intelligence constants |
| City production and neutral expansion | Master Specification §3; `DAILY_NEUTRAL_CAPTURE_LIMIT`, `NEUTRAL_CITY_COUNT_LIMIT`, City Info / list renderers |
| Map guide | Actual map renderer at PR #335: foreground specialisation crests, owning-clan flags and top colour legend |
| Forecast and reports | Master Specification §5; troop-order forecast and Clan Tower participant-report implementation |
| Shield activation cooldown and retaliation | Master Specification §5, “Offensive shield cooldown and city retaliation”; `functions/combat-authorization.js`, combat timer UI. A conditional exact-city retaliation right is not promised for every city loss. |
| Rallies and one Clan Tower | Master Specification §§8–9; `getClanRallyMinimumParticipants`, Tower battle resolution at PR #335. Two-player ordinary objective Rallies and three-player Tower Rallies are distinct. A capped clan may attack without capturing. |
| Buildings and Shop | Master Specification §8; `clan-tower-buildings.js`; current building permissions and personal-Gold Shop purchases |
| Common Gear and Daily Login | Master Specification §§11–12; Common Gear / Daily Login modules. Three-piece Boxes and the personal 28-day carry-over cycle are preserved. |
| Camp progress | Master Specification §6; current shared-per-category reward allowance implementation |

Historical release labels and superseded figures elsewhere in the specification are not copied into player instructions. This draft avoids old fixed Box pricing, old calendar-month resets, old four-Tower ownership, and any assumption that a forecast freezes live defense. It does not modify mechanics or the Master Specification.

## Integration after approval

Integrate the approved view into `showHelpModal`, retaining the existing onboarding preference persistence and guidance rerender handlers. Replace the preview tips flag with `enableOnboardingGuidance` / existing preference handling and preserve account isolation. Review the guide against the exact release again before shipping. No backend changes are proposed.
