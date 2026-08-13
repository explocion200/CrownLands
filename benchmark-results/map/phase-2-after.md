# Crownlands Map Phase 2 Machine Results

Generated: 2026-08-13T19:34:58.392Z

Mode: Phase 2 after optimization. Seed: `crownlands-map-phase-0-v1`. This is a loopback, authenticated-equivalent, deterministic fixture; it contains no production player data and makes no production Firebase requests.

| Scenario | Profile | DOM | Map DOM | Initial cities | Initial marches | Heap MiB | Idle FPS | Idle p95 ms | Pan FPS | Zoom FPS | Initial load ms | Switch out/back ms | Active listeners |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A | desktop | 1707 | 1100 | 50 | 25 | 6.1 | 124.5 | 13.8 | 142.7 | 128.7 | 1031.4 | 1207.9 / 1197.2 | 17 |
| A | mobile-landscape | 1707 | 1100 | 50 | 18 | 8.2 | 124.4 | 13.9 | 140.3 | 126.6 | 1409.6 | 1198.4 / 1198.8 | 17 |
| A | mobile-landscape-4x | 1707 | 1100 | 50 | 18 | 5.7 | 12.5 | 166.7 | 17.8 | 13.4 | 4569.8 | 4721.7 / 4499.8 | 17 |
| B | desktop | 2774 | 2167 | 100 | 50 | 7.2 | 115.9 | 27.7 | 142.3 | 117.6 | 1699.3 | 1196.8 / 1320.5 | 17 |
| B | mobile-landscape | 2774 | 2167 | 100 | 42 | 7.8 | 113.8 | 20.8 | 137.1 | 119.6 | 1911.2 | 1196.3 / 1338.5 | 17 |
| C | desktop | 4276 | 3669 | 150 | 100 | 8.5 | 82.4 | 48.6 | 125.5 | 111.2 | 2597.3 | 1500.8 / 1847.1 | 17 |
| C | mobile-landscape | 4276 | 3669 | 150 | 85 | 10 | 83.9 | 34.7 | 131 | 106.9 | 2659.5 | 1464.3 / 1775.3 | 17 |
| D | desktop | 1908 | 1301 | 100 | 0 | 6.3 | 131.6 | 7.7 | 140.1 | 129.8 | 1813.5 | 1215.2 / 1288.7 | 17 |
| D | mobile-landscape | 1908 | 1301 | 100 | 0 | 4.6 | 131.5 | 7.8 | 140.4 | 135.5 | 1232.2 | 1225.1 / 1270.7 | 17 |
| D | mobile-landscape-4x | 1908 | 1301 | 100 | 0 | 4.9 | 41.3 | 62.5 | 31.2 | 30.5 | 6358.4 | 4327.7 / 6217.4 | 17 |
| E | desktop | 3008 | 2401 | 50 | 100 | 5.5 | 122.5 | 20.7 | 141.7 | 124.4 | 1070.5 | 1204.7 / 1199.6 | 17 |
| E | mobile-landscape | 3008 | 2401 | 50 | 84 | 6.2 | 120 | 14.5 | 141 | 129.7 | 1274.4 | 1212.3 / 1207.2 | 17 |
| E | mobile-landscape-4x | 3008 | 2401 | 50 | 84 | 5.9 | 9.3 | 194.4 | 50.5 | 31.7 | 2520.7 | 2751.1 / 3026.2 | 17 |

## Unavailable profiles

These profiles exceeded the isolated watchdog or failed setup. They count as performance-budget failures and are not assigned invented metric values.

| Scenario | Profile | Reason |
|---|---|---|
| B | mobile-landscape-4x | Profile exceeded the 180-second isolated run watchdog. |
| C | mobile-landscape-4x | Profile exceeded the 180-second isolated run watchdog. |

## Method and limitations

Each full run samples 10 seconds of idle animation, 5 seconds of real pointer panning, 5 seconds of real wheel zooming, five City Info open/close cycles, and a real neighboring-region switch and return through the production map runtime. Every profile runs in a fresh browser process and temporary profile. Mobile sizes and the 4x CPU profile are Chrome DevTools emulations, not measurements from physical hardware. Style, layout, script, long tasks, networking, timers, listeners, DOM/SVG, animation, and heap are present in the JSON. Stable headless CDP does not expose defensible paint/composite duration counters, so those fields are explicitly unavailable rather than estimated.
