# Crownlands Game Editor

Run the local editor server from the repo root:

```powershell
.\tools\start-editor.ps1
```

Open:

```text
http://127.0.0.1:8791/editor/
```

The Game Editor is developer-only. It manages the world files in `assets/worlds/world_01/` and the shared economy configuration used by both the browser game and Firebase Functions.

## Modes

- World Layout: place region maps on a square grid, edit IDs, names, types, image paths, and city capacity.
- Empty grid squares: click an empty square to select it, then click `Add Region` to place the new region there.
- Region tiles: drag a region in World Layout to move it to a different grid cell. Occupied cells are blocked so two regions do not overlap.
- Region Edit: open one region map, pan/zoom, place cities, place strongholds, place camps, and define north/south/east/west edge connection zones.
- Economy: edit shop prices and daily purchase caps, percentage item bonuses, pickup spawn timing and rewards, pickup daily caps, action costs, city production, upgrade pacing, universal wall growth, level-based wall repair, skills, level-up rewards, and default camp rewards.
- Region map images: in Region Edit, click `Upload Map` to copy a 4:3 JPG, PNG, or WebP into `assets/worlds/world_01/maps/` and update that region's image path. Uploading another map replaces the previous editor-uploaded map image for that region while keeping shared placeholder art safe.
- Map aspect ratio: region maps are locked to 4:3, with `2048 x 1536` as the default stage size.
- Upload troubleshooting: a successful upload changes the editor preview immediately. Click `Save to Game` after that to update the game JSON, then refresh the game page. If you see `Unknown API route`, restart the local editor with `.\tools\start-editor.ps1` and use `http://127.0.0.1:8791/editor/`; map uploads cannot work from a plain static server or the live Netlify site.
- Region zoom: use the `+` and `-` buttons or the mouse wheel over the region map to zoom from 15% to 300% for detailed placement.
- City placement: selecting, placing, or dragging a city shows its actual scaled name/level label footprint. Any neighboring labels that overlap are shown in red, keeping crowded maps readable.
- UI bounds: use `Toggle UI Bounds` or press `U` in Region Edit to show the in-game footprint for each normal city label/marker, plus larger stronghold, crown citadel, and camp marker areas. These borders are editor-only and help you manually space placements so labels and marker UI do not overlap.
- Edge connections: use `Add Edge Connection`, click near a map edge to create one, drag an existing connection to move it, and press Delete or `Delete Selected` to remove it. The game uses these zones as invisible troop crossings.
- Map switch arrows: every edge connection shows a blue arrow handle inside the map. Drag that arrow to choose where players tap to switch to the connected map.
- Camps: use `Add Camp` and the Camp dropdown to place gold, troop, item, and Deed camps. Select a Gold or Warband Camp to add/remove its daily reward rows and edit each reward's minimum payout and production hours. Select a Relic Camp to set its item rewards per UTC day.

## Saving

Use `Save to Game` to write:

- `assets/worlds/world_01/world-layout.json`
- `assets/worlds/world_01/regions/*.json`
- `assets/map-editor-data.js`
- `economy-config.js`
- `functions/economy-config.json`

The JSON world files are the map source of truth. `assets/map-editor-data.js` is generated for the current game loader. The two economy files intentionally mirror each other: the browser loads `economy-config.js`, while Firebase Functions loads `functions/economy-config.json`.

Economy changes do not alter the live game until the commit is pushed and Firebase Functions are deployed. Pushing updates Netlify automatically; deploying Functions makes server-authoritative costs and rewards match the client.

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

## Camp Rewards

The editor supports placement-only camp markers for:

- Gold Camp
- Warband Camp
- Relic Camp
- Deed Camp

Camp positions save into each region JSON under `camps`. Each camp stores its ID, name, type, normalized position, art path, visual size, notes, and any reward override. Camps without an override inherit the defaults from the Economy mode.

## No Portals

Do not add portals. Use edge connection zones to define where adjacent regional maps connect.
