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
- Region Edit: open one region map, pan/zoom, place cities, place strongholds, place camps, and define north/south/east/west edge connection zones.
- Region map images: in Region Edit, click `Upload Map` to copy a 4:3 JPG, PNG, or WebP into `assets/worlds/world_01/maps/` and update that region's image path. Uploading another map replaces the previous editor-uploaded map image for that region while keeping shared placeholder art safe.
- Map aspect ratio: region maps are locked to 4:3, with `2048 x 1536` as the default stage size.
- Upload troubleshooting: a successful upload changes the editor preview immediately. Click `Save to Game` after that to update the game JSON, then refresh the game page. If you see `Unknown API route`, restart the local editor with `.\tools\start-editor.ps1` and use `http://127.0.0.1:8791/editor/`; map uploads cannot work from a plain static server or the live Netlify site.
- Region zoom: use the `+` and `-` buttons or the mouse wheel over the region map to zoom from 15% to 300% for detailed placement.
- City placement: selecting, placing, or dragging a city shows its actual scaled name/level label footprint. Any neighboring labels that overlap are shown in red, keeping crowded maps readable.
- Edge connections: use `Add Edge Connection`, click near a map edge to create one, drag an existing connection to move it, and press Delete or `Delete Selected` to remove it. The game uses these zones as invisible troop crossings.
- Map switch arrows: every edge connection shows a blue arrow handle inside the map. Drag that arrow to choose where players tap to switch to the connected map.
- Camps: use `Add Camp` and the Camp dropdown to place gold, troop, item, and city deed camps. Camps are placement-only for now; no gameplay mechanics are attached yet.

## Saving

Use `Save to Game` to write:

- `assets/worlds/world_01/world-layout.json`
- `assets/worlds/world_01/regions/*.json`
- `assets/map-editor-data.js`

The JSON files are the new source of truth. `assets/map-editor-data.js` is generated for the current game loader.

After changing region connections, run this from the repo root to verify every map can route troops through the edge network:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\validate-world-routes.ps1
```

## Strongholds

The editor supports separate marker types for:

- Crown Citadel
- Aurum Keep - gold production bonus
- Greybanner Hold - troop production bonus
- Ironwatch - defense bonus
- Swiftgate - march speed bonus
- Upgrade Discount Stronghold

Resource strongholds default to Level 50 with 50 million troops. The Crown Citadel defaults to Level 100 with 50 million troops.

## Camps

The editor supports placement-only camp markers for:

- Gold Camp
- Warband Camp
- Item Camp
- City Deed Camp

Camp positions save into each region JSON under `camps`. Each camp stores its ID, name, type, normalized position, art path, visual size, and notes.

## No Portals

Do not add portals. Use edge connection zones to define where adjacent regional maps connect.
