# Crownlands Map Phase 1 Machine Results

Generated: 2026-08-13T18:01:45.577Z

Mode: Phase 1 nominal verification repeats. Seed: `crownlands-map-phase-0-v1`. This is a loopback, authenticated-equivalent, deterministic fixture; it contains no production player data and makes no production Firebase requests.

| Scenario | Profile | DOM | Map DOM | Initial cities | Initial marches | Heap MiB | Idle FPS | Idle p95 ms | Pan FPS | Zoom FPS | Initial load ms | Switch out/back ms | Active listeners |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A | desktop-r1 | 1707 | 1100 | 50 | 25 | 6.6 | 107.7 | 20.8 | 141.9 | 90.9 | 1343.9 | 1200.8 / 1214.7 | 17 |
| A | mobile-landscape-r1 | 1707 | 1100 | 50 | 18 | 4.7 | 113.5 | 14.1 | 142.3 | 98 | 1592.1 | 1188.9 / 1196 | 17 |
| A | desktop-r2 | 1707 | 1100 | 50 | 25 | 5.7 | 107.9 | 20.9 | 138.8 | 71.4 | 1455 | 1191 / 1256.5 | 17 |
| A | mobile-landscape-r2 | 1707 | 1100 | 50 | 18 | 4.7 | 109.8 | 14 | 142.4 | 93.1 | 1673 | 1191.5 / 1208.2 | 17 |
| B | desktop-r1 | 2774 | 2167 | 100 | 50 | 8.7 | 81.1 | 48.7 | 139.8 | 41 | 2239.8 | 1352.4 / 1531.4 | 17 |
| B | mobile-landscape-r1 | 2774 | 2167 | 100 | 42 | 8.8 | 88.9 | 34.7 | 138.2 | 54.7 | 2222.5 | 1339.6 / 1698.8 | 17 |
| B | desktop-r2 | 2774 | 2167 | 100 | 50 | 8.4 | 70.3 | 62.5 | 140.6 | 18.7 | 1955.6 | 1349.3 / 1686 | 17 |
| B | mobile-landscape-r2 | 2774 | 2167 | 100 | 42 | 6.4 | 88.7 | 34.9 | 139.7 | 54 | 2285.3 | 1323.1 / 1497.9 | 17 |
| D | desktop-r1 | 1908 | 1301 | 100 | 0 | 5 | 121.8 | 7.1 | 140.9 | 59.5 | 2202.4 | 1339.1 / 1439.1 | 17 |
| D | mobile-landscape-r1 | 1908 | 1301 | 100 | 0 | 4.5 | 113.7 | 7.2 | 134.2 | 59.3 | 2838.4 | 1523.2 / 1476 | 17 |
| D | desktop-r2 | 1908 | 1301 | 100 | 0 | 4.6 | 124.5 | 7.1 | 141.1 | 62.9 | 2206.8 | 1277.9 / 1448.7 | 17 |
| D | mobile-landscape-r2 | 1908 | 1301 | 100 | 0 | 7.8 | 125.2 | 7.2 | 140.1 | 68.9 | 2264.5 | 1262.2 / 1444.9 | 17 |

## Method and limitations

Each full run samples 10 seconds of idle animation, 5 seconds of real pointer panning, 5 seconds of real wheel zooming, five City Info open/close cycles, and a real neighboring-region switch and return through the production map runtime. Every profile runs in a fresh browser process and temporary profile. Mobile sizes and the 4x CPU profile are Chrome DevTools emulations, not measurements from physical hardware. Style, layout, script, long tasks, networking, timers, listeners, DOM/SVG, animation, and heap are present in the JSON. Stable headless CDP does not expose defensible paint/composite duration counters, so those fields are explicitly unavailable rather than estimated.
