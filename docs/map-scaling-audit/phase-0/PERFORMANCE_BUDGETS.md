# Phase 0 performance budgets

Date: 2026-08-13

## Budget model

Two gates are necessary because the measured current runtime already fails busy/heavy load:

- **Regression floors** protect behavior Crownlands handles today (A and D) and prevent E from becoming worse unnoticed.
- **Capacity acceptance gates** define what B and C must achieve before those densities can be called supported. Their current baseline is red; 0.5 FPS is not normalized as acceptable.

Compare release decisions using the median result of at least three full runs on the same otherwise-idle reference host and Chrome major version. A single run remains useful for local diagnosis. Any unavailable profile fails its applicable gate.

## Regression floors

### Scenario A — 50 cities / 25 marches

| Metric | Desktop | Mobile landscape | Reason |
|---|---:|---:|---|
| Idle FPS, minimum | 60 | 55 | 27–31% below the 82.6/80.1 baseline; catches material regression without treating headless >60 FPS as a product requirement |
| Pan FPS, minimum | 75 | 70 | Current 111.6/112.7 with headroom for host noise |
| Zoom FPS, minimum | 45 | 35 | Current 73.8/58.9; zoom already costs more style/layout work |
| Idle p95, maximum | 40 ms | 50 ms | Current 27.6/20.9; strict enough to detect recurrent jank |
| Pan p95, maximum | 20 ms | 20 ms | Current 7.2/7.2 |
| Zoom p95, maximum | 75 ms | 90 ms | Current 41.6/62.4 |
| Initial ready, maximum | 5 s | 5 s | Current 1.1/1.5 s with room for cold-host noise |

### Scenario D — 100 cities / zero marches

| Metric | Nominal desktop/mobile | Mobile 4× | Reason |
|---|---:|---:|---|
| Idle FPS, minimum | 90 | 10 | Current about 119 nominal and 13.2 at 4× |
| Pan FPS, minimum | 90 | 9 | Current 132–141 nominal and 12.4 at 4× |
| Idle p95, maximum | 16.7 ms | 250 ms | Current 7.2–7.5 and 201.4 ms |
| Initial ready, maximum | 5 s | 15 s | Current 2.0–2.1 and 7.5 s |

### Scenario E — 50 cities / 100 marches

These are regression floors, not a statement that the current experience is good.

| Metric | Desktop | Mobile landscape | Current |
|---|---:|---:|---:|
| Idle FPS, minimum | 18 | 9 | 22.8 / 11.8 |
| Pan FPS, minimum | 28 | 16 | 35.7 / 21.5 |
| Zoom FPS, minimum | 6 | 2 | 8.0 / 2.5 |
| Idle p95, maximum | 100 ms | 900 ms | 69.4 / 791.6 |
| Zoom p95, maximum | 900 ms | 1,200 ms | 763.9 / 1,034.7 |

E should later graduate to the B acceptance thresholds; these loose floors only stop Phase 0 performance from silently worsening first.

## Capacity acceptance gates

| Scenario | Ready | Desktop idle/pan/zoom | Mobile idle/pan/zoom | Idle p95 desktop/mobile | Status now |
|---|---:|---:|---:|---:|---|
| B — 100/50 | ≤15 s | ≥30 / 30 / 20 FPS | ≥24 / 24 / 15 FPS | ≤100 / 150 ms | Fail: 0.64/0.45 idle FPS and seconds-long p95 |
| C — 150/100 | ≤20 s | ≥20 / 20 / 15 FPS | ≥15 / 15 / 10 FPS | ≤200 / 300 ms | Fail: nominal startup does not complete within 60 s |

These gates intentionally allow a lower frame target than A while rejecting multi-second frames. They are realistic minimum playability thresholds for a strategy map, not a 60 FPS aspiration. Raising supported region density should be blocked until the corresponding scenario passes.

Animated 4× profiles are diagnostic. The near-term requirement is to complete the 180-second workflow watchdog and produce metrics. A, B, and E currently fail or are unusable at this synthetic throttle. Physical Android acceptance budgets must be set only after device testing.

## Long-task budgets

| Sample | A maximum | D maximum | Notes |
|---|---:|---:|---|
| Idle, 10 s | 12 | 8 | Baseline A 10; D 5–6 |
| Pan, 5 s | 8 | 2 | Baseline A 5; D 0 |
| Zoom, 5 s | 20 | 40 | Zoom causes the current high style/layout churn |

For B/C capacity acceptance, no sample may contain a longest task above 2,000 ms and p95 must still meet the scenario table. The 2,000 ms ceiling is an initial anti-catastrophe boundary, not a good UX target; lower it after the renderer first passes.

## DOM and SVG budgets

| Scenario | Total DOM max | Map DOM max | SVG max | SVG paths max | Baseline |
|---|---:|---:|---:|---:|---|
| A | 1,800 | 1,200 | 115 | 55 | 1,707 / 1,100 / 106 / 50 |
| B | 2,900 | 2,300 | 220 | 110 | 2,774 / 2,167 / 210 / 100 |
| C | 4,500 | 3,800 | 380 | 220 | Unavailable; provisional ceiling |
| D | 2,000 | 1,400 | 110 | 0 | 1,908 / 1,301 / 102 / 0 |
| E | 3,150 | 2,550 | 280 | 210 | 3,008 / 2,401 / 269 / 200 |

Exact visible city/march counts must equal the scenario at initial measurement. A lower count fails fixture integrity; it is not a performance optimization. The C ceiling is provisional until C can load and should not be used to justify rendering all detail indefinitely.

## Latency, network, and memory budgets

| Metric | Nominal budget | 4× diagnostic budget | Baseline basis |
|---|---:|---:|---|
| Region switch, each leg | ≤3 s | ≤15 s | Nominal current 1.19–1.70 s; worst completed 4× 13.7 s |
| Runtime JS heap after workflow | ≤16 MiB | ≤24 MiB | Nominal 4.7–8.8 MiB; successful maximum 13.0 MiB |
| Decoded `<img>` estimate | ≤12 MiB | ≤12 MiB | Current about 9.9 MiB |
| Browser requests, cold full workflow | ≤80 | ≤80 | Current 69–77 |
| Encoded transfer, cold full workflow | ≤8 MiB | ≤8 MiB | Current 6.3–7.5 MiB |
| Map-asset requests | ≤5 | ≤5 | Current 4–5, including neighbor switch/warming |
| Production backend requests | Exactly 0 | Exactly 0 | Harness safety invariant |

Browser/GPU/cache memory and aggregate paint/composite time remain unavailable and have no fabricated budgets. Add them only after adopting a repeatable trace/device measurement path.

## Review policy

- Any A or D floor regression blocks the change unless a documented, reviewed budget update explains the tradeoff.
- B and C remain red capacity gates; future work should show before/after evidence without weakening them to match current failure.
- A node/listener/request count drop that also drops required fixture entities is a benchmark-integrity failure.
- Chrome major, OS, reference hardware, seed, or benchmark method changes require a new baseline annotation.
- Budgets are Phase 0 evidence, not permission to begin Phase 1 automatically.
