# Phase 0 baseline results

Date: 2026-08-13

## Executive result

The authenticated benchmark overturns the signed-out audit's provisional assumption that 100–150 cities would probably remain comfortable. Static city rendering is healthy, but animated city-plus-march rendering has a severe nonlinear cliff.

- A (50 cities / 25 marches) is smooth on nominal desktop and mobile emulation: 82.6 and 80.1 idle FPS.
- B (100 / 50) collapses to 0.64 and 0.45 idle FPS, with p95 frames of 1.63 and 2.71 seconds.
- D (100 / 0) reaches about 119 FPS on both nominal profiles. City count alone is not the cause.
- E (50 / 100) reaches 22.8 desktop and 11.8 mobile idle FPS. March pressure hurts, but B shows a stronger city-surface × march interaction.
- C (150 / 100) cannot reach benchmark-ready state within 60 seconds on either nominal profile and does not complete the 4× watchdog.

The highest-impact finding is therefore the per-march update/render path interacting with the larger rendered city/label/SVG surface. No production optimization was made in Phase 0.

## Environment

| Item | Value |
|---|---|
| OS | Windows x64, release `10.0.26200` |
| CPU | Intel Core i7-9750H at 2.60 GHz, 12 logical CPUs |
| System memory | 15.9 GiB |
| Browser | Headless Chrome 151.0.7922.109, GPU enabled |
| Node | v24.19.0 |
| Isolation | Fresh browser process and temporary profile per scenario/profile |
| Fixture | Loopback authenticated-equivalent mock; fixed seed `crownlands-map-phase-0-v1` |

This was a loaded developer workstation, not a controlled hardware lab. Values are suitable as this repository's first regression baseline; absolute user-device claims require physical-device testing and repeated runs.

## FPS and frame pacing

The values are idle / pan / zoom. FPS may exceed 60 because the headless environment is not capped to a 60 Hz display.

| Scenario | Profile | FPS | p95 frame time (ms) | Long tasks |
|---|---|---:|---:|---:|
| A | Desktop | 82.6 / 111.6 / 73.8 | 27.6 / 7.2 / 41.6 | 10 / 5 / 10 |
| A | Mobile | 80.1 / 112.7 / 58.9 | 20.9 / 7.2 / 62.4 | 10 / 5 / 18 |
| A | Mobile 4× | 0.42 / 0.40 / 0.47 | 2,541.5 / 2,840.3 / 2,451.5 | 5 / 9 / 6 |
| B | Desktop | 0.64 / 0.61 / 0.58 | 1,632.0 / 1,673.6 / 1,916.6 | 6 / 8 / 6 |
| B | Mobile | 0.45 / 0.47 / 0.46 | 2,708.4 / 2,236.0 / 2,278.0 | 4 / 7 / 6 |
| B | Mobile 4× | 0.07 / 0.07 / 0.07 | unavailable / 14,507.4 / 15,305.9 | 2 / 8 / 6 |
| D | Desktop | 119.3 / 141.4 / 73.6 | 7.2 / 7.6 / 61.9 | 6 / 0 / 31 |
| D | Mobile | 119.6 / 132.1 / 71.4 | 7.5 / 7.8 / 62.7 | 5 / 0 / 33 |
| D | Mobile 4× | 13.2 / 12.4 / 1.6 | 201.4 / 194.3 / 1,951.4 | 59 / 44 / 12 |
| E | Desktop | 22.8 / 35.7 / 8.0 | 69.4 / 7.8 / 763.9 | 10 / 5 / 15 |
| E | Mobile | 11.8 / 21.5 / 2.5 | 791.6 / 62.5 / 1,034.7 | 9 / 5 / 13 |

The p95 calculation is over sampled frame intervals in the named window. When an extreme run produces fewer than two sampled frames, p95 is unavailable rather than fabricated.

## Unavailable profiles

| Scenario | Profile | Outcome |
|---|---|---|
| C | Desktop | Did not reach ready within 60 seconds |
| C | Mobile | Did not reach ready within 60 seconds |
| C | Mobile 4× | Exceeded the 180-second isolated-run watchdog |
| E | Mobile 4× | Exceeded the 180-second isolated-run watchdog after completing idle and pan |

These are failed capacity results, not missing-at-random data.

## Runtime surface

Counts below are the stable final surface on the nominal runs. SVG path counts include march route elements as rendered by the real runtime.

| Scenario | Total DOM | Map DOM | Cities | Marches | SVG / paths | Running animations | Timeout / interval / pending rAF |
|---|---:|---:|---:|---:|---:|---:|---:|
| A | 1,707 | 1,100 | 50 | 25 | 106 / 50 | 4 | 0 / 1 / 1 |
| B | 2,774 | 2,167 | 100 | 50 | 210 / 100 | 4 | 0 / 1 / 1 |
| D | 1,908 | 1,301 | 100 | 0 | 102 / 0 | 1 | 1 / 1 / 1 |
| E | 3,008 | 2,401 | 50 | 100 | 269 / 200 | 4 | 0 / 1 / 1 |

The first B/4× baseline was slow enough for the original seven-minute march arrivals to resolve before final DOM collection, although its idle sample began with all 50 marches. The fixture now uses six-hour arrivals and captures/verifies an initial exact-count snapshot, preventing that final-count artifact in future runs. The B/4× final DOM field in the raw 2026-08-13 JSON remains historical evidence of that lifecycle, not a claim that the scenario started empty.

There is one application persistent `requestAnimationFrame` loop. The instrumentation sampler uses a separate native frame loop that is explicitly excluded from the application count.

## Load and switch latency

| Scenario | Profile | Initial region ready (ms) | Switch neighbor / return (ms) |
|---|---|---:|---:|
| A | Desktop | 1,120 | 1,200 / 1,186 |
| A | Mobile | 1,510 | 1,213 / 1,205 |
| B | Desktop | 2,086 | 1,366 / 1,697 |
| B | Mobile | 2,005 | 1,452 / 1,685 |
| D | Desktop | 2,025 | 1,282 / 1,658 |
| D | Mobile | 2,119 | 1,293 / 1,668 |
| E | Desktop | 1,470 | 1,185 / 1,197 |
| E | Mobile | 1,709 | 1,209 / 1,275 |

Nominal switch latency stays below 1.7 seconds per leg even where animation FPS is poor. At 4×, observed legs span 3.6–13.7 seconds.

## Memory and images

Runtime heap after the workflow ranges from 4.7 to 13.0 MiB across successful profiles. Nominal runs are 4.7–8.8 MiB. The loaded unique `<img>` decoded-memory estimate is consistently about 9.9 MiB, including the active map and UI imagery.

The estimate is width × height × four bytes and does not include GPU textures, compositing surfaces, duplicate process storage, compressed browser cache, or non-`<img>` CSS imagery. Chrome cache/GPU memory is unavailable from the stable measurement path and is not invented.

## Network

Successful full workflows issue 69–77 browser requests and transfer approximately 6.3–7.5 MiB in the cold temporary profile. Four or five requests are map assets, covering initial/neighbor warming and the actual switch. The only external hosts are Google Fonts and an in-page `data:` resource.

Production Firebase/Auth backend request count is zero in every run. That is a safety assertion, not a production-network measurement. The mock adapter's logical realtime events are covered below and in `REALTIME_BUDGETS.md`.

## Realtime behavior

All successful runs settle at 17 active logical listeners:

| Category | Count |
|---|---:|
| Player/session | 4 |
| Player | 7 |
| Global | 2 |
| Active region | 4 |
| Clan/social | 0 |

There are zero duplicate listener keys. Switching out and back unsubscribes eight region listeners and subscribes eight replacements; active count returns to 17, with no prior-region listener retained. The full workflow produces 23 logical snapshot deliveries and four local presence writes.

Desktop logical document-delivery totals are A 208, B 358, D 258, and E 358. These are deterministic mock records, not billed Firestore reads.

## Style, layout, paint, and composite

Per-sample `TaskDuration`, `ScriptDuration`, `RecalcStyleDuration`, `LayoutDuration`, style counts, and layout counts are in the JSON. The strongest pathological samples are dominated by long main-thread tasks; B's seconds-long p95 frames align with that evidence.

Paint/composite duration is unavailable from stable headless CDP Performance metrics. A DevTools trace or platform compositor tooling is required for defensible layer-level attribution.

## Evidence files

- Machine-readable baseline: `benchmark-results/map/baseline.json`
- Generated compact summary: `benchmark-results/map/baseline.md`
- Method: `BENCHMARK_PLAN.md`
- Rerun instructions: `BENCHMARK_USAGE.md`
