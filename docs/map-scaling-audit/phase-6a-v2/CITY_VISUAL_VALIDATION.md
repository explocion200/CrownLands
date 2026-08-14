# Corrected city visual validation

The first v2 numeric layout was also rejected internally because some centers remained too close to painted perimeter ridges. The final deterministic retry retains the existing 112-pixel city separation, four road-corridor exclusions, Gate/Arrow transition clearance, and blocker clearance.

The authoritative land polygon reserves the painted perimeter. Two small interior woodland groups and the deeper northeast perimeter ridge are city blockers. Light field texture and isolated low stones remain non-blocking visual ground; they do not form impassable terrain.

Final coordinate bounds are recorded in `phase-6a-results.json`. A numbered 40-city marker map was visually inspected against the normalized source. No city center or marker overlaps the forest barrier, rocky perimeter, road opening, or transition area. Blue markers identify the four starting-city candidates.

The HTML QA view overlays the existing Crownlands city assets unchanged. Camp and Stronghold overlays are style comparisons only and are absent from the generated region definition.
