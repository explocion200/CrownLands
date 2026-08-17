# City and objective QA

Core city coordinates are designed before decorative validation. Phase A uses a deterministic hand-directed safe-coordinate plan with the following prototype rules:

- 64px actual runtime city art
- minimum 68px center-to-center spacing (no sprite overlap)
- 142px horizontal and 132px vertical map-edge clearance
- full internal-road polyline clearance, not only edge approaches
- accent/blocker ellipse clearance
- objective influence-area clearance
- Gate/Arrow transition-zone clearance

The 68px Core floor is specific to the locked 55/60/70 Core densities. It remains more generous than the current production layouts, whose observed minima are approximately 47–64px. It does not change the outer player-region 112px rule.

All five receipts validate exact capacity with zero objective, blocker, road, or transition conflicts. The Crown Citadel uses the actual 260px Crown asset in QA, Ironwatch uses the actual 154px Defense Stronghold asset, and the Deed territory uses the actual 132px Deed Camp asset. The Tower is a reservation overlay only; no Tower artwork or gameplay was created.

Clean maps contain no city, Camp, Stronghold, Citadel, Tower, arrow, Gate state, label, or UI object.
