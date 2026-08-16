# Immutable generated-region package storage

## Identity

Package identity includes:

- world ID and season ID
- region ID
- world-grid coordinate, layer, and clockwise slot
- generator version
- asset-library version
- deterministic seed metadata
- explicit retry salt

The identity key and package hash use canonical JSON and SHA-256. A retry with revised configuration uses a new retry salt and therefore a new package hash while retaining the same allocated coordinate.

## Content-addressed path

`generated-worlds/v1/worlds/{world}/seasons/{season}/regions/{region}/packages/{packageHash}/{file}`

There is no mutable `latest` object in the authoritative design.

## Files

- `map.webp`
- `thumbnail.webp`
- `region-definition.json`
- `city-definitions.json`
- `starting-candidates.json`
- `topology-template.json`
- `roads.json`
- `blockers.json`
- `edge-contracts.json`
- `generator-metadata.json`
- `validation-receipt.json`
- `package-manifest.json`

Every file has a byte count, SHA-256, immutable flag, and path containing the package hash. The package hash covers component hashes, raster hashes, generator version, and asset-library version.

## Immutability

An attempt to replace bytes at an existing immutable path is rejected. Publishing a different package hash for an already published region is rejected. Published packages cannot enter the unpublished retry workflow. Existing packages are never silently regenerated when generator logic changes.

OPEN/GATED state and neighbor target IDs are runtime topology, not package-hash inputs. This permits safe connection activation without a map rebake.
