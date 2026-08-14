# NPC city count and capacity rules

Every generated player region has exactly 40 total city positions. All 40 begin neutral/NPC in a newly generated definition, and the region cannot enter STANDBY with fewer than 40 individually valid positions.

Fifteen is the runtime minimum number of NPC/unowned cities that must remain before a new or returning player can be placed. It is not the generated city count. At 25 player-owned and 15 NPC cities, one more placement is allowed. At 28 player-owned and 12 NPC cities, placement is blocked while the region remains active and otherwise unchanged.

The capacity estimate samples authoritative usable area and relates it to minimum separation. It is a planning signal only; exact 40-position validation remains authoritative. The valid fixtures all placed 40 while preserving their terrain and corridor constraints. The invalid constrained map remained below capacity and rolled back.

Future tuning should consider:

- `totalCityCapacity`: fixed at 40;
- `minimumNpcCitiesForSpawn`: runtime floor of 15 unowned cities;
- starting-candidate count and expected players per map;
- neutral cities remaining after all starting positions are assigned;
- local contest radius and shared expansion interests;
- blocker/road density and readable interaction spacing;
- a practical density ceiling proven by full validation and visual QA.

No player-per-map number is finalized in Phase 4. Spacing and terrain density may be tuned in a future generator version, but total city capacity remains 40.
