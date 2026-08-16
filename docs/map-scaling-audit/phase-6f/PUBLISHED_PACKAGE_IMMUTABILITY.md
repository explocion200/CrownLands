# Published Package Immutability

Every generated Phase 6F plan emits a versioned four-side edge contract containing:

- side and owning region
- source regional theme
- normalized socket offset and absolute socket
- road orientation and half-width
- maximum transition-band width and transition geometry
- published-region precedence and future-neighbor adaptation requirements

Regions are composed using only neighbors that existed at their allocation time. A later neighbor inherits the opposing published contract; the existing package is never recomposed. OPEN/GATED runtime catalog state may change independently without rewriting the background package.

The immutable comparison covers composition plan, city definitions, city layout, road geometry, road skin, edge-contract hash, raw pixels, WebP, thumbnail, and complete package hash. Twelve early/boundary maps—including the three Phase 6E horizon-sensitive positions—were generated once in a 1,000-map world and again in the 10,000-map world. All fields were byte/hash identical.

All 10,000 outgoing contracts and 19,788 inherited neighbor contracts validated. Every future neighbor used the earlier published contract. All 39,596 OPEN sides have explicit targets; all 404 GATED sides have no hidden target.

Production integration must persist the immutable package manifest and edge contracts transactionally before marking a region published/ACTIVE. Automatic regeneration of a published package is prohibited.
