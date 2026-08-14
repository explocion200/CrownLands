# Clockwise outer-layer allocator

The development allocator starts at the north-west corner of the first incomplete player ring. It walks east across the north edge, south down the east edge, west across the south edge, and north up the west edge. It always selects the first missing coordinate in that order. A higher layer is rejected if any lower layer is incomplete, so a failed generation cannot create a hole by silently skipping its coordinate.

Layer 1 has 24 coordinates in this exact order:

```text
(-3,-3) (-2,-3) (-1,-3) ( 0,-3) ( 1,-3) ( 2,-3) ( 3,-3)
                                                            ( 3,-2)
                                                            ( 3,-1)
                                                            ( 3, 0)
                                                            ( 3, 1)
                                                            ( 3, 2)
(-3, 3) (-2, 3) (-1, 3) ( 0, 3) ( 1, 3) ( 2, 3) ( 3, 3)
(-3, 2)
(-3, 1)
(-3, 0)
(-3,-1)
(-3,-2)
```

The final coordinate `(-3,-2)` is adjacent to the first coordinate `(-3,-3)`. Allocating it opens both sides of that closing edge. Only after all 24 Layer 1 coordinates exist does the allocator return Layer 2's north-west anchor at `(-4,-4)`.

Partial-ring validation covered 1, 2, 5, 12, 23, and 24 allocated player regions. With the development-only 25-cell Core materialized, each new entry opens to its clockwise predecessor and to any Core or ring neighbor that already exists. Every absent cardinal neighbor remains `gated` with an empty target.

An `open` side is the only state that can expose an arrow and travel destination. A `gated` side retains the temporary Phase 3 Gate treatment, exposes no arrow or click target, and cannot travel. Phase 4 does not create replacement Gate artwork.

The current production catalog is not reordered or filled by this prototype. Its existing Regions 11–15 stay unchanged; the allocator merely proves that a future controlled worker would select the earliest missing Layer 1 coordinate.
