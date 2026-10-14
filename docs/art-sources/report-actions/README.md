# Report and action artwork

Five original illustrations created with the built-in image_gen tool from the owner's October 14, 2026 request and medieval kingdom-map style reference (`225787.jpg`). The screenshot `230339.jpg` identifies the report surfaces being updated. No gameplay rules change.

| Role | Final transparent asset |
| --- | --- |
| Reports | [Sealed dispatch](../../../assets/optimized/report-reports-ink-384x384-05cfed23ee0e.webp) |
| Attack | [Crossed swords](../../../assets/optimized/report-attack-ink-384x384-1e1a12b255a7.webp) |
| Defense | [Shield](../../../assets/optimized/report-defense-ink-384x384-08a43d2877bf.webp) |
| Scout | [Hooded scout](../../../assets/optimized/report-scout-ink-384x384-449c386d3b06.webp) |
| Realm Activity | [Castle](../../../assets/optimized/report-realm-ink-384x384-53b8cbd44f70.webp) |

The complete prompts are in [prompts.json](prompts.json). [assets.json](assets.json) records output and original PNG hashes. Original PNGs remain in the creator's Codex generated-images folder; the five final assets are committed here. Each complete composition was scaled to 384 × 384 and encoded with browser Canvas WebP quality 0.85, preserving transparency without cropping. Combined size: 177,970 bytes, outside installation precache.

Shared action rendering, Reports HUD, report tabs/rows/empty states/details, Scout details and disclosures, incoming threats, troop-order headings, Help, the public report-guide card and report notifications consume the new artwork. Realm announcements retain specific captured-objective artwork when available and use the castle as fallback. Named skill and equipment illustrations, saved heraldry and map units retain their identities. SVG containers retain existing layout and accessibility; their inline image content uses the same WebP files, avoiding external SVG image-loading restrictions. Unused former report symbols are removed; map, forward and flag utilities remain.

Validation: the report-artwork browser check covers 36 views at 1440 × 900, 844 × 390 and 568 × 320, windowed/fullscreen, including image decoding, alpha, shared/HUD identity, filtering and mouse/touch dismissal. Existing report-system, Incoming Threats, Help and distant-city troop-order checks cover their dependent behavior. Asset validation verifies hashes, dimensions, alpha, individual/combined limits and cache exclusion. Physical devices, OS notifications and authenticated production play remain manual; local screenshots use synthetic benchmark data. Implementation and preview do not establish deployment.
