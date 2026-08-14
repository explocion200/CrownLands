# Crownlands Map Phase 2 Machine Results

Generated: 2026-08-14T04:03:15.563Z

Mode: Phase 2 after optimization. Seed: `crownlands-map-phase-0-v1`. This is a loopback, authenticated-equivalent, deterministic fixture; it contains no production player data and makes no production Firebase requests.

| Scenario | Profile | DOM | Map DOM | Initial cities | Initial marches | Heap MiB | Idle FPS | Idle p95 ms | Pan FPS | Zoom FPS | Initial load ms | Switch out/back ms | Active listeners |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A | desktop | 1694 | 1087 | 50 | 25 | 7.6 | 124.8 | 7.2 | 140.6 | 124.6 | 905.7 | 1198.8 / 1209.4 | 17 |
| A | mobile-landscape | 1694 | 1087 | 50 | 25 | 6.4 | 126.2 | 7.3 | 140.3 | 127.6 | 1162.8 | 1205.2 / 1216.2 | 17 |
| A | mobile-landscape-4x | 1694 | 1087 | 50 | 18 | 6.5 | 23.6 | 138.9 | 48 | 47.3 | 2324 | 2302.5 / 2251.2 | 17 |
| B | desktop | 2761 | 2154 | 100 | 50 | 7.7 | 124.4 | 13.8 | 138.3 | 119.4 | 1270.7 | 1205.4 / 1224.3 | 17 |
| B | mobile-landscape | 2761 | 2154 | 100 | 42 | 5.1 | 107.7 | 20.8 | 138.1 | 123.7 | 1458.3 | 1213.8 / 1268.7 | 17 |
| B | mobile-landscape-4x | 2761 | 2154 | 100 | 42 | 9.2 | 10.5 | 159.7 | 27.6 | 2.2 | 3626 | 3007.2 / 4651.7 | 17 |
| C | desktop | 4263 | 3656 | 150 | 100 | 5.7 | 91.3 | 27.9 | 96.3 | 93.9 | 2588.7 | 1205.5 / 1700.4 | 17 |
| C | mobile-landscape | 4263 | 3656 | 150 | 85 | 5.4 | 76.8 | 34.7 | 132.4 | 101.9 | 1979 | 1209.1 / 1617.8 | 17 |
| D | desktop | 1895 | 1288 | 100 | 0 | 7.1 | 137.4 | 7.6 | 141.9 | 134 | 1450.9 | 1197.7 / 1195.5 | 17 |
| D | mobile-landscape | 1895 | 1288 | 100 | 0 | 4.7 | 134.7 | 7.6 | 139.5 | 135.9 | 1460.2 | 1203.3 / 1208.9 | 17 |
| D | mobile-landscape-4x | 1895 | 1288 | 100 | 0 | 4.4 | 114.9 | 20.8 | 46.4 | 58.1 | 3431.2 | 3331.7 / 4839.1 | 17 |
| E | desktop | 2995 | 2388 | 50 | 100 | 4.6 | 103.4 | 20.7 | 137.7 | 117.4 | 1284.1 | 1201.7 / 1214.3 | 17 |
| E | mobile-landscape | 2995 | 2388 | 50 | 84 | 5.2 | 97.5 | 20.9 | 137.4 | 118.9 | 1270.8 | 1196.5 / 1208.9 | 17 |
| E | mobile-landscape-4x | 2995 | 2388 | 50 | 84 | 8 | 3.4 | 402.9 | 44.1 | 11.6 | 1968.4 | 2795.2 / 2973.3 | 17 |

## Unavailable profiles

These profiles exceeded the isolated watchdog or failed setup. They count as performance-budget failures and are not assigned invented metric values.

| Scenario | Profile | Reason |
|---|---|---|
| C | mobile-landscape-4x | Profile exceeded the 180-second isolated run watchdog. |

## Method and limitations

Each full run samples 10 seconds of idle animation, 5 seconds of real pointer panning, 5 seconds of real wheel zooming, five City Info open/close cycles, and a real neighboring-region switch and return through the production map runtime. Every profile runs in a fresh browser process and temporary profile. Mobile sizes and the 4x CPU profile are Chrome DevTools emulations, not measurements from physical hardware. Style, layout, script, long tasks, networking, timers, listeners, DOM/SVG, animation, and heap are present in the JSON. Stable headless CDP does not expose defensible paint/composite duration counters, so those fields are explicitly unavailable rather than estimated.
