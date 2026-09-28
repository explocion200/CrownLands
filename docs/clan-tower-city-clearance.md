# Clan Tower city clearance

The September 28 layout moves 31 regular cities around the four Core Clan Towers. The old clearance proof covered the Tower sprite alone; nearby city banners could overlap the action row after all four buildings were built.

| Map | Tower | Cities moved | Cities retained |
| --- | --- | ---: | ---: |
| Stoneward / north-west | Ravenwatch | 8 | 55 |
| Lionwatch / north-east | Highguard | 8 | 55 |
| Oakwatch / south-west | Blackthorn | 8 | 55 |
| Roseguard / south-east | Stoneward | 7 | 55 |

`tools/map-art/clan-tower-clearance.json` records every before/after coordinate and a 270 × 395 map-pixel compound clearing. City centers reserve an additional 55 pixels left, right and above, and 22 below, to cover artwork and labels. Placement checks retain maximum-stage city rectangles, avoid sampled road envelopes and scenery, and check city-to-city artwork clearance. All other prepared maps and all non-coordinate city fields remain unchanged. No runtime collision solver or per-frame work is added.

The four region definitions and `functions/core-expansion-world-layout.json` contain matching positions. The general seed version stays unchanged to avoid unrelated metadata refreshes. New server routes use canonical endpoints; existing march visuals align to the current markers while retaining recorded arrival times. New launches can have different distances because their city locations changed.

## Validation

- `validate-clan-tower-city-clearance.js`: all 220 city positions, complete compound clearance, city artwork separation, relocated route endpoints and scoped migration guards.
- `validate-clan-tower-city-clearance-browser.js`: real game renderer and packaged assets, four maps, building stages 1–4, zoom 0.4/0.6/1, desktop 1440 × 900 and landscape mobile 844 × 390 / 568 × 320. Uses synthetic level-100 owned cities with long names, labels and troop counts; checks both the owner controls and the wider four-button scouted-rival row. It also exercises existing march endpoint alignment without mutating the stored path or timing.
- `validate-illustrated-map-art.js`: road, scenery and landmark clearances; original non-coordinate city state hashes; client/server parity across the prepared world.
- `validate-march-path-alignment.js`: canonical launches and in-flight display alignment.
- `emulator-illustrated-map-coordinates.js`: coordinate-only updates preserve player state; stale documents and realm rollover reject the write.

Browser measurements and screenshots are saved locally under `release-artifacts/clan-tower-clearance/`. These are synthetic Chromium checks; physical iPhone Safari remains a manual release check.

## Coordinated release

Implementation does not apply production writes. After merge/deployment authorization, deploy matching Functions and client assets, then align only these four maps. Verify the fresh `realmConfig/current` pointer and its expansion topology before using the command. At the implementation dry run, the target was `main-realm-2026-09`, generation `realm-2026-09`, shard `shard_0001`, topology `core-expansion-v1`. Four maps contained 220 cities and exactly 31 pending coordinate changes.

```powershell
node tools/admin-align-illustrated-map-cities.js --project crown-land-b15e0 --world main-realm-2026-09 --reset-generation realm-2026-09 --realm-shard shard_0001 --regions core-v2-north-west-holding-tower-m1-m1,core-v2-north-east-holding-tower-p1-m1,core-v2-south-west-holding-tower-m1-p1,core-v2-south-east-holding-tower-p1-p1
```

Review the fresh dry-run map list, coordinate count and plan hash. Apply the identical arguments with `--apply --confirm-plan-hash <fresh-plan-hash>`. The confirmation hash includes the selected maps. The tool rejects inactive/unknown maps, a changed realm, missing cities and concurrent writes; it updates only `x` and `y`. Re-run the scoped dry run afterward and require zero remaining changes. Confirm the deployed build and positions on playcrownlands.com before reporting the update live. Do not use the old dry-run hash after a realm rollover or coordinate change.
