# Crownlands Developer Map Editor

Run the local editor server from the repo root:

```powershell
.\tools\start-editor.ps1
```

Open:

```text
http://127.0.0.1:8791/editor/
```

The editor is developer-only and works with the JSON world files in `assets/worlds/world_01/`.

## Modes

- World Layout: place region maps on a square grid, edit IDs, names, types, image paths, and city capacity.
- Region tiles: drag a region in World Layout to move it to a different grid cell. Occupied cells are blocked so two regions do not overlap.
- Region Edit: open one region map, pan/zoom, place cities, place strongholds, and define north/south/east/west edge connection zones.
- Edge connections: use `Add Edge Connection`, click near a map edge to create one, drag an existing connection to move it, and press Delete or `Delete Selected` to remove it.

## Saving

Use `Save to Game` to write:

- `assets/worlds/world_01/world-layout.json`
- `assets/worlds/world_01/regions/*.json`
- `assets/map-editor-data.js`

The JSON files are the new source of truth. `assets/map-editor-data.js` is generated for the current game loader.

## Strongholds

The editor supports separate marker types for:

- Crown Citadel
- Gold Stronghold
- Troop Stronghold
- Defense Stronghold
- March Speed Stronghold
- Upgrade Discount Stronghold

Resource strongholds default to Level 50 with 50 million troops. The Crown Citadel defaults to Level 100 with 50 million troops.

## No Portals

Do not add portals. Use edge connection zones to define where adjacent regional maps connect.
