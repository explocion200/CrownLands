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
- Empty grid squares: click an empty square to select it, then click `Add Region` to place the new region there.
- Region tiles: drag a region in World Layout to move it to a different grid cell. Occupied cells are blocked so two regions do not overlap.
- Region Edit: open one region map, pan/zoom, place cities, place strongholds, and define north/south/east/west edge connection zones.
- Region map images: in Region Edit, click `Upload Map` to copy a 4:3 JPG, PNG, or WebP into `assets/worlds/world_01/maps/` and update that region's image path. Uploading another map replaces the previous editor-uploaded map image for that region while keeping shared placeholder art safe.
- Map aspect ratio: region maps are locked to 4:3, with `2048 x 1536` as the default stage size.
- Upload troubleshooting: a successful upload changes the editor preview immediately. Click `Save to Game` after that to update the game JSON, then refresh the game page. If you see `Unknown API route`, restart the local editor with `.\tools\start-editor.ps1` and use `http://127.0.0.1:8791/editor/`; map uploads cannot work from a plain static server or the live Netlify site.
- Region zoom: use the `+` and `-` buttons or the mouse wheel over the region map to zoom from 15% to 300% for detailed placement.
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
- Aurum Keep - gold production bonus
- Greybanner Hold - troop production bonus
- Ironwatch - defense bonus
- Swiftgate - march speed bonus
- Upgrade Discount Stronghold

Resource strongholds default to Level 50 with 50 million troops. The Crown Citadel defaults to Level 100 with 50 million troops.

## No Portals

Do not add portals. Use edge connection zones to define where adjacent regional maps connect.
