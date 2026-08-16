# Published edge contracts

Each immutable package has four cardinal edge contracts. A contract records the road socket coordinate, orientation, tangent offset, corridor width, transition geometry, source theme, and contract hash.

## Existing package wins

When a new region has an already-published neighbor, the new region must inherit the neighbor's opposing source contract. Publication fails if the inherited reference is absent or stale. The existing published package is never regenerated to accommodate the later neighbor.

This rule is asymmetric by design:

- earlier published edge: authoritative immutable constraint
- later package: adapts to that constraint

## Runtime state

Every package starts with a four-sided GATED topology template. GATED means no arrow, travel, or hidden destination. When both neighboring regions become ACTIVE, the topology transaction changes both reciprocal sides to OPEN and supplies the target IDs.

The two-region integration scenario opened east/west travel while the earlier package hash remained exactly `14d2e636475ff22eade714aa9038f72910d4da83d9c4a386f719b1f868e34dbd` before and after activation. No map, thumbnail, blocker, road, city, or edge-contract file changed.

The 128-region simulation validated 220 undirected cardinal neighbor pairs and all 440 directed connections as reciprocal.
