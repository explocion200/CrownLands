# Crownlands Map Phase 1 Machine Results

Generated: 2026-08-13T18:06:42.523Z

Mode: Phase 1 A desktop verification repeats. Seed: `crownlands-map-phase-0-v1`. This is a loopback, authenticated-equivalent, deterministic fixture; it contains no production player data and makes no production Firebase requests.

| Scenario | Profile | DOM | Map DOM | Initial cities | Initial marches | Heap MiB | Idle FPS | Idle p95 ms | Pan FPS | Zoom FPS | Initial load ms | Switch out/back ms | Active listeners |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A | desktop-r3 | 1707 | 1100 | 50 | 25 | 5.9 | 115.1 | 20.7 | 141.7 | 90.1 | 1337.2 | 1201 / 1197.6 | 17 |
| A | desktop-r4 | 1707 | 1100 | 50 | 25 | 7.2 | 116.5 | 20.7 | 141.9 | 90.2 | 1596.2 | 1195.9 / 1183.2 | 17 |

## Method and limitations

Each full run samples 10 seconds of idle animation, 5 seconds of real pointer panning, 5 seconds of real wheel zooming, five City Info open/close cycles, and a real neighboring-region switch and return through the production map runtime. Every profile runs in a fresh browser process and temporary profile. Mobile sizes and the 4x CPU profile are Chrome DevTools emulations, not measurements from physical hardware. Style, layout, script, long tasks, networking, timers, listeners, DOM/SVG, animation, and heap are present in the JSON. Stable headless CDP does not expose defensible paint/composite duration counters, so those fields are explicitly unavailable rather than estimated.
