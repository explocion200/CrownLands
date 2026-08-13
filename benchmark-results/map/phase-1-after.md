# Crownlands Map Phase 1 Machine Results

Generated: 2026-08-13T17:32:54.189Z

Mode: Phase 1 after optimization. Seed: `crownlands-map-phase-0-v1`. This is a loopback, authenticated-equivalent, deterministic fixture; it contains no production player data and makes no production Firebase requests.

| Scenario | Profile | DOM | Map DOM | Initial cities | Initial marches | Heap MiB | Idle FPS | Idle p95 ms | Pan FPS | Zoom FPS | Initial load ms | Switch out/back ms | Active listeners |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A | desktop | 1707 | 1100 | 50 | 25 | 5.7 | 115 | 20.8 | 141.5 | 79.4 | 1100.7 | 1192.5 / 1213.8 | 17 |
| A | mobile-landscape | 1707 | 1100 | 50 | 18 | 4.7 | 110.9 | 20.7 | 142.6 | 92.4 | 1482.5 | 1183.4 / 1194.2 | 17 |
| A | mobile-landscape-4x | 1707 | 1100 | 50 | 18 | 5.4 | 29.5 | 90.2 | 34 | 2.7 | 3140.8 | 3350.4 / 3947.3 | 17 |
| B | desktop | 2774 | 2167 | 100 | 50 | 4.9 | 79.4 | 55.4 | 140 | 23.3 | 1825.2 | 1365.9 / 1433.6 | 17 |
| B | mobile-landscape | 2774 | 2167 | 100 | 42 | 5 | 80.7 | 41.7 | 137.2 | 48.3 | 1886.5 | 1301.1 / 1507.8 | 17 |
| C | desktop | 4276 | 3669 | 150 | 100 | 5.3 | 34.6 | 97.2 | 134.5 | 6.3 | 2664.8 | 1727.2 / 1971.4 | 17 |
| C | mobile-landscape | 4276 | 3669 | 150 | 85 | 6.9 | 30.7 | 76.3 | 124.1 | 6.2 | 2085.7 | 1509.3 / 1982.9 | 17 |
| D | desktop | 1908 | 1301 | 100 | 0 | 4.6 | 115.1 | 7.1 | 138.5 | 42 | 2509.7 | 1381.6 / 1652.1 | 17 |
| D | mobile-landscape | 1908 | 1301 | 100 | 0 | 7.3 | 117.2 | 7.2 | 137.4 | 51.7 | 2324.2 | 1454.5 / 1655.6 | 17 |
| D | mobile-landscape-4x | 1908 | 1301 | 100 | 0 | 5.3 | 18.8 | 111.2 | 12.1 | 1.8 | 7943.3 | 5664.9 / 9190.7 | 17 |
| E | desktop | 3008 | 2401 | 50 | 100 | 7.2 | 66 | 62.5 | 138.5 | 9.4 | 1609.3 | 1197.1 / 1281.5 | 17 |
| E | mobile-landscape | 3008 | 2401 | 50 | 84 | 5.7 | 45.5 | 55.6 | 136.3 | 7.6 | 1610.1 | 1276.3 / 1273.7 | 17 |
| E | mobile-landscape-4x | 3008 | 2401 | 50 | 84 | 7.7 | 3.3 | 479.4 | 19.1 | 1.6 | 3914.2 | 3647.9 / 4478.4 | 17 |

## Unavailable profiles

These profiles exceeded the isolated watchdog or failed setup. They count as performance-budget failures and are not assigned invented metric values.

| Scenario | Profile | Reason |
|---|---|---|
| B | mobile-landscape-4x | Profile exceeded the 180-second isolated run watchdog. |
| C | mobile-landscape-4x | Profile exceeded the 180-second isolated run watchdog. |

## Method and limitations

Each full run samples 10 seconds of idle animation, 5 seconds of real pointer panning, 5 seconds of real wheel zooming, five City Info open/close cycles, and a real neighboring-region switch and return through the production map runtime. Every profile runs in a fresh browser process and temporary profile. Mobile sizes and the 4x CPU profile are Chrome DevTools emulations, not measurements from physical hardware. Style, layout, script, long tasks, networking, timers, listeners, DOM/SVG, animation, and heap are present in the JSON. Stable headless CDP does not expose defensible paint/composite duration counters, so those fields are explicitly unavailable rather than estimated.
