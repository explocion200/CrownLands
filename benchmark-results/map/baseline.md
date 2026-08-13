# Crownlands Map Phase 0 Machine Baseline

Generated: 2026-08-13T16:40:08.248Z

Mode: full baseline. Seed: `crownlands-map-phase-0-v1`. This is a loopback, authenticated-equivalent, deterministic fixture; it contains no production player data and makes no production Firebase requests.

| Scenario | Profile | DOM | Map DOM | Initial cities | Initial marches | Heap MiB | Idle FPS | Idle p95 ms | Pan FPS | Zoom FPS | Initial load ms | Switch out/back ms | Active listeners |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A | desktop | 1707 | 1100 | 50 | 25 | 7.7 | 82.6 | 27.6 | 111.6 | 73.8 | 1119.9 | 1199.7 / 1186 | 17 |
| A | mobile-landscape | 1707 | 1100 | 50 | 25 | 4.7 | 80.1 | 20.9 | 112.7 | 58.9 | 1509.9 | 1213 / 1204.6 | 17 |
| A | mobile-landscape-4x | 1707 | 1100 | 50 | 25 | 5.4 | 0.4 | 2541.5 | 0.4 | 0.5 | 2898 | 3580.3 / 4634.3 | 17 |
| B | desktop | 2774 | 2167 | 100 | 50 | 6.8 | 0.6 | 1632 | 0.6 | 0.6 | 2086.3 | 1366.4 / 1697.3 | 17 |
| B | mobile-landscape | 2774 | 2167 | 100 | 50 | 6.4 | 0.5 | 2708.4 | 0.5 | 0.5 | 2004.5 | 1452.4 / 1685.1 | 17 |
| B | mobile-landscape-4x | 1908 | 1301 | 100 | 50 | 13 | 0.1 | null | 0.1 | 0.1 | 7023.4 | 5183.1 / 10408.5 | 17 |
| D | desktop | 1908 | 1301 | 100 | 0 | 6.1 | 119.3 | 7.2 | 141.4 | 73.6 | 2025.4 | 1282.4 / 1657.9 | 17 |
| D | mobile-landscape | 1908 | 1301 | 100 | 0 | 6.4 | 119.6 | 7.5 | 132.1 | 71.4 | 2119.3 | 1293.4 / 1668 | 17 |
| D | mobile-landscape-4x | 1908 | 1301 | 100 | 0 | 5.6 | 13.2 | 201.4 | 12.4 | 1.6 | 7454.9 | 6852.8 / 13711.6 | 17 |
| E | desktop | 3008 | 2401 | 50 | 100 | 8.8 | 22.8 | 69.4 | 35.7 | 8 | 1469.7 | 1185.4 / 1197.3 | 17 |
| E | mobile-landscape | 3008 | 2401 | 50 | 100 | 7.9 | 11.8 | 791.6 | 21.5 | 2.5 | 1709.1 | 1209.4 / 1275.1 | 17 |

## Unavailable profiles

These profiles exceeded the isolated watchdog or failed setup. They count as performance-budget failures and are not assigned invented metric values.

| Scenario | Profile | Reason |
|---|---|---|
| C | desktop | Benchmark page did not become ready within 60000 ms. |
| C | mobile-landscape | Benchmark page did not become ready within 60000 ms. |
| C | mobile-landscape-4x | Profile exceeded the 180-second isolated run watchdog. |
| E | mobile-landscape-4x | Profile exceeded the 180-second isolated run watchdog. |

## Method and limitations

Each full run samples 10 seconds of idle animation, 5 seconds of real pointer panning, 5 seconds of real wheel zooming, five City Info open/close cycles, and a real neighboring-region switch and return through the production map runtime. Every profile runs in a fresh browser process and temporary profile. Mobile sizes and the 4x CPU profile are Chrome DevTools emulations, not measurements from physical hardware. Style, layout, script, long tasks, networking, timers, listeners, DOM/SVG, animation, and heap are present in the JSON. Stable headless CDP does not expose defensible paint/composite duration counters, so those fields are explicitly unavailable rather than estimated.

The initial entity columns use the deterministic scenario counts. The historical B/4x run lasted long enough for its original seven-minute marches to resolve before final DOM collection; the current fixture uses six-hour arrivals and captures an exact initial runtime snapshot.
