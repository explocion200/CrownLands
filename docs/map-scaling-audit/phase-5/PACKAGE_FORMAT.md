# Immutable player-region package

A valid development package contains:

```text
catalog.json
region.json
terrain.json
blockers.json
blocker-mask.rle.json
roads.json
cities.json
starting-candidates.json
composition.json
map.webp
thumbnail.webp
generation-manifest.json
validation-receipt.json
package.json
```

The generation manifest records world/season, region, coordinate, layer, clockwise slot, seed, generator version, terrain-plan version, asset-library version, and terrain/blocker/road/city/composition/WebP/thumbnail hashes. `package.json` contains the immutable projection and package hash.

All Phase 5 packages set:

- `developmentOnly: true`;
- `publicationAllowed: false`;
- `activationAllowed: false`;
- `spawnReady: false`;
- `spawnEligible: false`;
- `lifecycle: STANDBY` only after all validations pass.

The static capacity is exactly 40. `minimumNpcCitiesForSpawn: 15` remains separate runtime metadata; actual eligibility must continue to come from current-generation ownership documents inside the claim transaction.

Failed generation ends `FAILED -> ROLLED_BACK`, retains only diagnostics in the aggregate receipt, produces no package or image, and leaves the clockwise coordinate reusable only with an explicit approved retry salt/configuration.
