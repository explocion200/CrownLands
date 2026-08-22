# Holding Tower artwork

`source/1.png` through `source/4.png` are the untouched opaque originals supplied for the Pending Core 5x5 Holding Towers. They are retained as editable source material and are not copied by the production client build.

Run `tools/prepare-holding-tower-art.py` with the bundled Crownlands Python/Pillow runtime to remove only the connected exterior near-black background and produce the transparent 640x640 `tower-1.png` through `tower-4.png` masters. Then run `tools/optimize-game-art.py` to create the content-hashed 384x384 WebP runtime derivatives under `assets/optimized/`.

The fixed square source/runtime canvases match existing Crownlands map-objective conventions. The visible tower silhouette is fitted with a transparent safety margin, and its base is anchored by rendering configuration rather than by altering the reserved logical coordinate.
