# Fixed-world assumption audit

Repository search covered exact-15 language and counts, explicit region IDs/names, fixed starter lists, world dimensions, asset manifests, service-worker enumeration, objective placement, and historical performance validators.

Removed from active behavior:

- the production page's synchronous full `map-editor-data.js` import;
- fixed client navigation enumeration;
- handwritten starter-region selection;
- exact-15 map/thumbnail performance assertions;
- fixed map media precaching;
- fixed asset counts in production artifact and image-loading validators;
- manual connection dependence for catalog topology.

Retained intentionally:

- `assets/worlds/world_01/world-layout.json` and per-region source files describe the current 15 production maps; that is current data, not a maximum.
- Region/city IDs and objective-specific Citadel/Stronghold configuration remain explicit for compatibility.
- `WORLD_WIDTH`/`WORLD_HEIGHT` still describe coordinates inside one map and route geometry. Catalog grid bounds are derived dynamically; replacing local-map geometry is not required for outer-region growth.
- historical Pass 4A/map-revert validators retain exact current-world assertions as regression history, not runtime discovery.
- public copy saying the currently live world has 15 maps remains factually current and does not drive behavior.
- unrelated values such as 15 minutes and 15 days were not changed.

Future regions require catalog data and a definition/art asset, but no client source enumeration change. Large-world picker pagination is a future UI concern; the present picker already derives its entries and bounds from the catalog.
