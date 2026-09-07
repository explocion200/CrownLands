# Illustrated map release

This update brings the approved atlas prototype into the playable map and map picker. It covers the active `core-expansion-v1` topology, with 81 prepared maps, 3,720 city locations, 2,967 scenery placements, all five city stages and 21 landmarks: four Strongholds, four Clan Towers, twelve Camps and the Citadel.

The first 49 road networks and city layouts come from the approved `personalized-roads-v1` review. The other 32 use reviewed countryside terrain and 40-city clearances, with independently seeded road networks. Prepared and future generated regions retain their existing activation rules. Future regions reuse the selected prepared template, including its road network; this release does not generate an unlimited collection of unique raster backgrounds.

## Asset and layout integrity

The source review package is external to the game repository. `tools/import-illustrated-map-art.js <release-map-art-v1-directory>` packages its reviewed layers using Sharp (resolve through `CROWNLANDS_SHARP_MODULE` if not installed locally). The deployed game needs neither the authoring package nor Sharp. Content-hashed sprites remain separate from playable terrain. Thumbnail terrain includes scenery for efficient loading, with landmark images rendered separately at their registered coordinates.

`illustrated-art-receipt.json` records individual road hashes and background hashes. `tools/map-art/clearance.json` stores maximum-stage city rectangles, road samples and hashes of original non-coordinate city fields. `node tools/validate-illustrated-map-art.js` checks every prepared map, city identity and state, road clearance, scenery and landmark clearance, client/server layout parity and map-picker registration. The existing route-alignment validation checks new launches and existing march endpoints without changing accepted arrival times.

The general gameplay seed version is deliberately unchanged: its older maintenance path refreshes more metadata than this art update requires. The explicit migration below updates only `x` and `y` on existing regular city documents. It neither creates cities nor touches objective state, armies or player records.

## Release procedure

Run the full `prepare-pr` workflow and require all three GitHub checks to pass. Deploy matching Functions and the client as a coordinated release. Do not claim an update is live from a merge alone.

Before applying city locations, obtain a fresh dry run using the verified current realm identity:

```powershell
node tools/admin-align-illustrated-map-cities.js --project crown-land-b15e0 --world main-realm-2026-09 --reset-generation realm-2026-09 --realm-shard shard_0001
```

Review aggregate map/city counts and the plan hash. Apply with the same arguments plus `--apply --confirm-plan-hash <fresh-plan-hash>`. The tool rejects realm changes, unknown active layouts, missing city records and stale document writes. A concurrent gameplay update can stop a batch safely; take a new dry run for any remaining positions and retry. Never restore an old full city document.

The pre-release dry run found 53 active maps, 2,600 cities and 1,755 coordinate changes. These are observations, not fixed constants or permission to touch another generation. Re-read the realm pointer and expansion state during deployment. Verify zero remaining coordinate changes, the published build and asset version, and landmark placement in the game UI after release.

Local screenshots use actual game code and packaged assets with synthetic owners and armies. They are not production account screenshots or physical-device tests. Preserve desktop and mobile results, exact release hashes and deployment IDs with the release evidence. itch.io is a separate published channel and must be verified independently of Netlify.

## Pre-release verification

All 81 maps passed desktop, mobile landscape and maximum-stage city checks: zero city/road, city/scenery, city/landmark or city/city overlaps; no missing visible assets or browser errors. The map picker rendered 81 prepared tiles and 21 separate landmark images. The compact result inventory is `tools/map-art/runtime-validation.json`.

The coordinate migration passed a Firestore emulator test covering preservation of ownership, Main City state, player naming, level and troops; stale city writes and a realm rollover both abort safely. New launches and existing march display alignment passed the existing route validation. The production artifact remains within the existing 60 MiB total and 35 MiB prepared-world limits; the map presentation code uses one bounded 8 KiB increase in the shell allowance.
