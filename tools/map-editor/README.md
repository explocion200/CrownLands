# Crownlands Map Editor

Run the project from the repo root with a local static server, then open:

```text
http://127.0.0.1:5177/tools/map-editor/index.html
```

The editor seeds itself from the current game maps when `assets/map-editor-data.js` is empty. Use `Open Project` to select the Crown Lands repo folder, then `Upload to Game` writes map changes into `assets/map-editor-data.js` and saves uploaded map images under `assets/custom-maps/`.

After uploading, refresh the game page so `game.js` reads the new map data.
