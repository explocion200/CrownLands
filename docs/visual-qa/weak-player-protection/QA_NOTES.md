# Weak Player Protection Visual QA

## Scope

The controlled page uses the production Crownlands stylesheet cascade, the real ordinary-city marker DOM and classes, the Crownlands Heart map, current city art, the Royal Peace Shield overlay, and current attack-panel/action classes. All rulers and cities are generic test identities.

The public guide uses the five desktop captures from `promo-screenshots/`. The matching landscape-mobile captures remain in this folder as review evidence.

## Verified states

| State | King Power comparison | Production marker class | Computed marker color | Attack result shown |
| --- | ---: | --- | --- | --- |
| Protected Breach Assault | 220,000 vs 100,000 (`2.20×`) | `enemy-power-protected` | `#c9786f` | First victory may breach but cannot capture |
| Protected Raid | 300,000 vs 100,000 (`3.00×`) | `enemy-power-protected` | `#c9786f` | No capture, 10% defender-loss cap, all raiders lost, 0 attacker XP |
| Normal Attack | 150,000 vs 100,000 (`1.50×`) | `enemy-power-in-range` | `#b3261e` | Normal capture and XP rules |
| Stronger Opponent | 100,000 vs 160,000 (`0.63×`) | `enemy-power-overpowering` | `#4b1418` | Normal attack remains available with a stronger-kingdom warning |
| Royal Peace Shield | Red normal-range band | `enemy-power-in-range peace-shielded` | `#b3261e` | Real shield overlay and disabled `Shielded` attack action |

## Viewport results

- Desktop: each guide asset was captured at `1440×900`. All five states matched their expected computed color, had no capture-card horizontal overflow, and produced no browser errors or warnings.
- Landscape mobile: each state was captured at `844×390`. The controlled frame, state title, evidence footer, and disabled shield action remained visible with a body size exactly matching the viewport.
- Public guide: verified at `1440×900` and `844×390`. All five images loaded at their natural `1440×900` size, captions and alt descriptions were present, swatches computed to the three production colors, and the page had no horizontal overflow.

## Limitations

The images are deterministic development fixtures rather than captures from private production accounts. They exercise the production presentation classes and exact thresholds without changing gameplay state. Server-authoritative protection mechanics remain covered by `tools/validate-weaker-kingdom-protection.js`; the fixture does not substitute for server validation or prove deployment parity.
