# Dirt roads blended into the meadow

The owner requested this refinement on October 20, 2026 after reviewing the
initial clean-ground release (PR #653). The supplied `game theme.webp` remains
the style reference: worn earth should appear to belong to the landscape.

Built-in imagegen produced `dirt-material.png`; `prompt.txt` and
`refinement-prompt.txt` preserve the prompt sequence. The second pass removes the
orange cast and matches the subdued dusty tan of the reference's village roads.
The original tool outputs remain in Codex's generated-image directory.

`tools/build-clean-map-ground.js` applies the painted material through the
existing code-native road geometry. The surface has fine grit and short broken
wear marks. Uneven translucent shoulders expose the underlying meadow without
adding a continuous dark border. All wear remains inside the original envelopes;
centerlines, widths, exits, objective approaches, NPC placement, cities and
separate scenery are unchanged. No new baked decorations are introduced.

The pipeline rebuilds all 81 prepared backgrounds and their atlas thumbnails,
then refreshes the browser asset version and hashes. It does not edit the four
current camp sprites, server catalogs or player data. Full-resolution backgrounds
remain 1448 × 1086 WebP at quality 64, with no new runtime layer or drawing cost.

Rebuild with Sharp available:

```sh
CROWNLANDS_SHARP_MODULE=/absolute/path/to/sharp node tools/build-clean-map-ground.js
```

Validation covers connected roads and objective entrances, preserved gameplay
inputs, encoded road pixels, unchanged city/scenery clearance, browser views at
1440 × 900 / 844 × 390 / 568 × 320, and existing production/cache/download limits.
The pixel check accepts the painted soil's darker grit while rejecting meadow
color in road centers. Publication requires the exact merged commit and public
artwork hashes to match the home-server deployment receipt.

Verified before PR preparation: all 81 backgrounds, 264 connected road segments,
14,303 encoded road-center samples and 12 desktop/landscape camp views passed.
The same color predicate rejected bare meadow at all 14,303 reference points.
No browser exceptions occurred. Production build, artifact verification and
asset budgets passed: 10.36 MiB map art and 0.49 MiB thumbnails.

Current isolated game previews: [desktop](desktop.png) and
[landscape phone](landscape.png). They use fixture players without production writes.
