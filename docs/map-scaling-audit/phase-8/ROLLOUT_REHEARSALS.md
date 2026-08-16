# Rollout rehearsals

## First region

The allocator selected Layer 1 slot 0 at `(-3,-3)`. The rehearsal executed allocation, deterministic generation, validation, STANDBY, publication review, atomic publication, immutable-object verification, activation review, activation preflight, atomic initialization of exactly 40 ownership records, catalog discovery, and ACTIVE state.

The first north-west corner region has no cardinal neighbor, so all four sides correctly remain GATED. Its first GATED-to-OPEN transition occurs only when Layer 1 slot 1 becomes ACTIVE; that transition is proven by the three-region rehearsal.

Twenty-six simulated claims reduced authoritative neutral ownership from 40 to 14. The claim beginning at 15 NPC cities succeeded; the next claim at 14 was rejected. Existing ownership, ACTIVE state, travel rules, and gameplay continued. Two following packages were left STANDBY.

## Three regions

Activation order was deterministic:

1. `(-3,-3)`, Layer 1 slot 0
2. `(-2,-3)`, Layer 1 slot 1
3. `(-1,-3)`, Layer 1 slot 2

All 120 city IDs were unique. Published package hashes remained unchanged. Slot 1 inherited slot 0's published west/east contract, and slot 2 inherited slot 1's contract. Runtime connections became reciprocal only after each neighbor became ACTIVE. GATED sides had empty targets; a fourth STANDBY region was absent from the runtime catalog and could not be fetched or entered.
