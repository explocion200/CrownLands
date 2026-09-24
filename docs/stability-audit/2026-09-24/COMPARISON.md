# Repeated map comparison — September 24, 2026

Three repetitions of 15 profiles on each implementation: 90 completed profiles total. Both runs use the same harness executable input digest, `385733ec2cb558dd754d4770d6240e8d39798a0f9cad131f5b4312065e46f789`, and report unchanged inputs. Baseline checkout is `d7e4182c1394a934591dfde7a723278b026015b4`, whose game runtime equals `a01303edf61d350cdd3a9363d308edf2945acbdc`; candidate is style commit `1758abe9fbced3f844f8828fde9a9cc9c5fa577f` plus exactly the animation file from `5ae539b1cfda9d6f706fb2fe0fcd1f6d7071ce97`. See [findings and environment limitations](FINDINGS.md) before interpreting these values.

These are headless browser measurements on a shared Windows machine, not physical-phone FPS. Browser timings vary; no statistical significance or universal speed gain is claimed. A/E contain 50 cities, B/D 100 and C 150; current prepared maps contain 40–70 cities. Budgets are unchanged and remain failing.

## Frame rates

Idle cells show median (minimum–maximum). Pan and zoom cells show baseline → candidate medians. All values are FPS.

| Scenario / profile | Baseline idle | Candidate idle | Pan | Zoom |
|---|---:|---:|---:|---:|
| A/desktop | 72.6 (69.3–75.2) | 68.3 (64.7–69.3) | 140.8 → 140.7 | 116.1 → 115.2 |
| A/mobile-landscape | 79.6 (69.5–81.6) | 71.7 (69.6–75.8) | 137 → 137 | 113.2 → 122.9 |
| A/mobile-landscape-4x | 54.4 (44.7–55.6) | 56.5 (49.3–62.1) | 89 → 91.9 | 2.5 → 2.8 |
| B/desktop | 30.3 (26.9–32.6) | 39.7 (36.5–43.6) | 136.2 → 137.2 | 100.3 → 91.1 |
| B/mobile-landscape | 45.3 (34–52.5) | 43.8 (42.2–45.4) | 133.7 → 134.9 | 119.2 → 117.9 |
| B/mobile-landscape-4x | 9.7 (9–12.5) | 12.3 (12.2–13.5) | 48.1 → 59.4 | 1.8 → 1.8 |
| C/desktop | 16.6 (4.3–34.2) | 4.7 (4.6–5) | 131.9 → 129.7 | 14.1 → 52.5 |
| C/mobile-landscape | 15.5 (15.1–47.4) | 20.8 (17.9–32.6) | 132.3 → 128.2 | 114.4 → 54.4 |
| C/mobile-landscape-4x | 3.7 (2.5–3.7) | 4.8 (3.6–5.6) | 9.5 → 28.4 | 1.1 → 1.3 |
| D/desktop | 103.5 (101.1–110) | 105.4 (102.6–110.8) | 139.5 → 139.3 | 120.6 → 126.9 |
| D/mobile-landscape | 107.6 (96.4–108.5) | 98.5 (95.5–106.2) | 134.9 → 136.8 | 123.1 → 123.9 |
| D/mobile-landscape-4x | 76.3 (72.9–78.7) | 89.3 (82.9–92.2) | 49 → 61.7 | 2 → 2 |
| E/desktop | 47.4 (45–55.1) | 53.4 (40.7–60.1) | 138.3 → 138.4 | 93.8 → 99.4 |
| E/mobile-landscape | 40.7 (38.7–46.7) | 56.6 (55.6–76.6) | 133.9 → 138 | 117.6 → 122.1 |
| E/mobile-landscape-4x | 4.8 (4.1–5.8) | 5.5 (4.8–14.9) | 72.5 → 79.2 | 1.6 → 2 |

## Footprint and zoom style work

Cells show baseline → candidate medians across three repetitions. Encoded bytes measure downloaded responses across the full profile, not the service-worker installation cache. Style time is accumulated browser style recalculation during the nominal five-second zoom action; an action can overrun under pressure. DOM is sampled after the profile's interactions.

| Scenario / profile | Requests | Encoded bytes | DOM nodes | Zoom style ms |
|---|---:|---:|---:|---:|
| A/desktop | 200 → 191 | 10,046,627 → 9,735,059 | 2,115 → 2,116 | 284.4 → 316.8 |
| A/mobile-landscape | 201 → 193 | 10,156,600 → 9,845,947 | 2,115 → 2,116 | 488.5 → 256.2 |
| A/mobile-landscape-4x | 206 → 198 | 10,659,002 → 10,343,316 | 2,115 → 2,116 | 4,212.7 → 4,835.7 |
| B/desktop | 199 → 191 | 10,082,693 → 9,771,146 | 3,182 → 3,183 | 580.4 → 770.1 |
| B/mobile-landscape | 202 → 194 | 10,193,521 → 9,882,887 | 3,182 → 3,183 | 323.5 → 327.2 |
| B/mobile-landscape-4x | 206 → 198 | 10,824,618 → 10,476,767 | 3,182 → 3,183 | 5,800.4 → 5,188.4 |
| C/desktop | 201 → 191 | 10,228,730 → 9,808,145 | 4,684 → 4,685 | 2,404.7 → 1,583.5 |
| C/mobile-landscape | 201 → 194 | 10,285,180 → 9,974,527 | 4,684 → 4,685 | 429.7 → 1,668.8 |
| C/mobile-landscape-4x | 207 → 199 | 10,716,193 → 10,476,947 | 4,687 → 4,685 | 6,718.3 → 5,191.4 |
| D/desktop | 198 → 190 | 9,640,567 → 9,329,917 | 2,316 → 2,317 | 261.2 → 193.9 |
| D/mobile-landscape | 197 → 189 | 9,697,035 → 9,386,383 | 2,316 → 2,317 | 312.6 → 284.8 |
| D/mobile-landscape-4x | 203 → 199 | 10,020,221 → 9,810,418 | 2,316 → 2,317 | 5,318.9 → 4,911 |
| E/desktop | 199 → 195 | 10,046,648 → 9,956,054 | 3,416 → 3,417 | 621.1 → 405.1 |
| E/mobile-landscape | 200 → 194 | 10,129,820 → 9,846,825 | 3,416 → 3,417 | 353.3 → 263.3 |
| E/mobile-landscape-4x | 208 → 201 | 10,875,980 → 10,492,201 | 3,416 → 3,417 | 5,252.5 → 4,884.8 |

Stylesheet request counts: baseline **58**, candidate **49**. Decoded-image estimates remain **17,347,840–17,495,296** baseline and **17,347,840–17,495,296** candidate bytes. These are estimates from image dimensions, not measured GPU allocation.

## Existing budget failures

| Run / repetition | Regression assertions failed | Capacity assertions failed |
|---|---:|---:|
| Baseline / 1 | 58 | 3 |
| Baseline / 2 | 58 | 2 |
| Baseline / 3 | 57 | 2 |
| Candidate / 1 | 58 | 2 |
| Candidate / 2 | 58 | 2 |
| Candidate / 3 | 58 | 1 |

Each run also completed all eight startup/recovery cases. Raw reports preserve every failed assertion; none were dropped to obtain these tables. Sources in the audit checkout: `release-artifacts/stability-audit-baseline/final-matrix/` and `release-artifacts/stability-audit-candidate/final-matrix/`, each containing `audit.json`, `summary.json`, and `matrix/matrix-r1.json` through `matrix-r3.json`.

All 180 neighbor/return results across these 90 profiles returned success. Their external host lists contained only data URLs and Google Fonts hosts, with no Firebase/Cloud Run endpoints.

## Follow-up to the C/desktop idle difference

Six alternating diagnostic runs used the original sample durations/actions, filtered to C/desktop, and captured animation state immediately before/after idle. Order: baseline, candidate, candidate, baseline, baseline, candidate. Baseline idle results were 26.6 / 56.6 / 56.0 FPS; candidate 26.9 / 59.8 / 56.3. Both first runs entered Reduced automatically; all remaining runs stayed Full. Inputs remained unchanged and no runtime errors appeared. See `release-artifacts/stability-audit-candidate/c-desktop-control/control.json` for source identities, runner hash and measurements.

The probe did not reproduce a consistent regression. It also changes repeated-scene/starting conditions and adds motion-state observation, so it cannot replace the full matrix or prove a speed gain. The original capacity failures and poor throttled zoom remain open.
