# Dynamic region and city IDs

Dynamic region IDs encode world identity, layer, clockwise slot, and coordinate:

```text
player_{world-slug}-{world-hash}_l{layer}_c{clockwise-slot}_x{signed-x}_y{signed-y}
```

Example:

```text
player_phase4-developme-2d5febf9_l01_c001_xn03_yn03
```

The world hash prevents collisions across worlds while coordinate and slot metadata make audit/debug work straightforward. Existing production region IDs are never renamed.

Generated city IDs are not array indexes:

```text
npc_{region-id}_{sha256(seed-hash|quantized-coordinate)[0:14]}
```

The region component provides global scope and the coordinate digest keeps identity stable if the finished city array is reordered. Regenerating with the same version, seed, configuration, and geometry reproduces the same IDs. An explicitly revised seed produces a new draft layout and new draft city identities; it does not mutate a previously published package.
