# NPC city count and capacity rules

Fifteen NPC cities is an immutable minimum for a player-spawn region. It is not a target and not a maximum. A result below 15 is rejected even if every placed city is individually valid.

The prototype default target is 28. Fixtures intentionally use targets from 22 to 32 to prove that count is configuration, not generator structure. A reasonable early tuning band is 24–40 neutral cities for a 1448×1086 player map, subject to final terrain and player-density testing.

The capacity estimate samples authoritative usable area and relates it to minimum separation. It is a planning signal only; the exact placement validator remains authoritative. The fixture estimates ranged from 26 on the forest-heavy map to 86 on the mostly open map. The invalid constrained map estimated only 6 and placed 4.

Future tuning should consider:

- `minimumNpcCities`: hard floor of 15;
- `targetNpcCities`: desired neutral expansion supply;
- starting-candidate count and expected players per map;
- neutral cities remaining after all starting positions are assigned;
- local contest radius and shared expansion interests;
- blocker/road density and readable interaction spacing;
- a practical density ceiling proven by full validation and visual QA.

No player-per-map number is finalized in Phase 4. Changing the target or density configuration does not require changing the allocator or ID architecture.
