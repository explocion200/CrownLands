# Road and edge system

Every generated player map contains exactly one potential road reaching North, East, South, and West. Edge sockets are fixed at the side midpoint so neighboring maps align. Each road bends through a deterministic interior point toward a jittered central junction; two optional internal branches create variation without adding edge exits.

Validators reject missing exits, duplicate exits, a road declared for the wrong edge, or visual road geometry that differs from the authoritative path by more than one pixel. Cities clear both the Phase 4 central transition reservation and every generated road segment.

Connection state is not baked:

- **OPEN:** neighboring catalog entry exists, reciprocal topology is valid, runtime arrow is visible, and travel is enabled.
- **GATED:** no neighbor exists, target ID is empty, provisional Gate overlay is visible, and travel is disabled.

The baked road already reaches the edge in both cases. When a later clockwise region appears, the Gate overlay disappears and the arrow activates; the WebP does not change. Player movement remains region -> arrow/Map UI -> transition -> neighboring rectangular region. There is no seamless canvas, diagonal edge, or client-generated world.
