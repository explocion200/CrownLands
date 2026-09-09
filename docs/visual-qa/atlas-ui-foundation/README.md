# City Details design study

September 9, 2026. **Current scope: City Details only.** The user asked to retain the city layout, colours and information from the first review, remove the other UI experiments, and refine this panel before moving to another part of the game. This is a disconnected prototype, not a production UI change.

## Review the city panel

Open [index.html](index.html) in a browser, or run this command from the repository root:

```powershell
node tools/map-benchmark/server.js --port=8798
```

Open `http://127.0.0.1:8798/docs/visual-qa/atlas-ui-foundation/index.html`. Stop the server with Ctrl+C when finished. The existing folder and URL are retained so review links continue to work.

The toolbar switches between desktop (1440 × 900), landscape (844 × 390), short landscape (568 × 320), and five upgrade states. Use **Open at browser size** to judge text and controls at actual size. The surrounding page is a review tool; the panel is the only game UI being designed.

## Retained direction and current refinements

- Preserve the parchment surfaces, dark ink, ochre ownership mark, moss-green upgrade action and existing city illustration.
- City icons use the Art Bible's woodcut/stamped-pictogram direction: a hammered crown coin, iron helmet, stone battlements, strapped ledger, gatehouse, mason's mallet and chisel, and a small heraldic ownership shield. Shallow ink washes and restrained hatching inherit the existing text colours. Fine marks are omitted in compact contexts. The icon treatment does not change panel geometry, text, controls or gameplay.
- The typography and spacing draft keeps that icon artwork, palette, panel footprint and section order. Ledger labels use 14px on desktop / 13px in landscape, with 15px / 14px values, tabular numerals, 12px upgrade guidance and balance feedback, and more consistent row spacing. The selected level change remains visible on every supported preview size; it uses the same synthetic level and cost calculation. Available gold receives a stronger weight. This is a review draft, not a newly approved production type system.
- Preserve city identity and level, the Overview/Defences tabs, garrison and production information, wall status, invested gold, and the Inner Castle entry.
- Keep upgrade controls fixed while longer information scrolls. Short landscape keeps information and actions in separate columns.
- Show available gold within the city action feedback. Pending disables duplicate actions; retry preserves gold; success reports the new level and remaining balance.
- Upgrade feedback uses a stable two-line space below the action: a distinct text result with an existing woodcut symbol, followed by the gold balance. Developing uses the mason's tools, success the gatehouse, failure the ledger, and affordability the coin. Success emphasizes the reached level and remaining gold; a failed simulated upgrade says "Gold unchanged" and offers **Retry upgrade**. Insufficient gold shows the exact sample shortfall. The same polite, atomic live region persists until another selection or action; nothing dismisses on a timer. Landscape footer gaps are tightened to retain room for the garrison while reserving the feedback space.
- Center the panel in the isolated review surface and give desktop information more vertical room. The existing Highwinter Vale map is an unchanged, static background for judging the panel's colours.

The experimental ruler/treasury HUD, navigation bar, alerts, chat, city map markers, compass, pan/zoom controls, other-screen notes and their screenshots have been removed. Their styling and interaction code are removed as well. Only the city-related SVG icons remain. Inner Castle's entry displays a short inline scope note; no other panel is designed here.

This city design remains in refinement. Complete its visual review before starting any other UI or art family. Physical-device and screen-reader review remain necessary before production adoption.

## Source and data boundaries

Baseline: repository commit `d3a133cbe2304159dfaf2e6eb430bef67b250580`, with `core-expansion-v1` selected in both release configurations.

- [Master Development Specification](../../CROWNLANDS_MASTER_DEVELOPMENT_SPECIFICATION.md), sections 16–18: readability, landscape/PC support and medieval materials. No rules or authoritative specifications are edited.
- [Art Bible](../../CROWNLANDS_ART_BIBLE.md): existing visual guidance. The user's attachment supplies the reference for earth colours, fine outlines and illustrated settlement silhouettes. No river or new map art is introduced.
- [Highwinter Vale map](../../../assets/worlds/core-expansion-v1/maps/core-v2-north-support-p0-m2.webp) and [city illustration](../../../assets/worlds/core-expansion-v1/art/city-keep-eff443c6c279.webp): unchanged assets from the active topology.

All identities, levels, production values, balances and outcomes are invented layout samples. The constant 640-gold sample cost and level-50 stop only exercise the controls; they are not proposed economy rules. A simulated upgrade changes the displayed level and local balance, without modeling dependent production or wall changes. Resetting the preview restores all sample values.

If the synthetic balance cannot fund any Max levels, the disabled action shows the minimum one-level sample cost and its shortfall. This is a presentation clarification; it does not alter the sample affordability calculation. The Developing review state is held for inspection, and the Failed review state always simulates a rejected retry without spending gold.

Production integration must preserve the Master Specification's confirmed instant city-upgrade behavior (section 3, "Confirmed instant city-upgrade feedback"): projected gold and levels, further affordable actions while syncing, request identity, authoritative reconciliation and rollback. This study's existing temporary lock and delayed local settlement are visual fixtures, not proposed replacements for that behavior. "Gold unchanged" here describes a known synthetic rejection; an uncertain production result must be reconciled before claiming the balance is unchanged.

The frame loads only its local presentation script. Its Content Security Policy disables connections, external scripts, forms and plugins. It imports no Firebase client, authentication, service worker or game runtime and persists nothing. The production client builder excludes `docs/`. Fonts remain local Georgia for headings and Segoe UI/Arial for controls; no fonts or raster art are downloaded or generated.

## Validation

With Node.js 22 and Chrome at its standard Windows installation path:

```powershell
node docs/visual-qa/atlas-ui-foundation/verify-prototype.cjs
```

The check uses the repository's isolated headless browser and loopback server, then closes its temporary browser profile. It verifies the three city layouts, scrolling access, tabs and arrow keys, +1/+5/Max, upgrade feedback/locks, close/reopen and focus restoration, portrait orientation, and the responsive review wrapper. Typography checks cover visible level guidance and feedback, non-overlapping action text and cost, footer/ledger overflow, at least 44px touch targets, and matching level previews for +5, Max, the sample cap and an unaffordable Max. All four feedback states are checked at all three sizes for exact result/balance copy, existing state symbols, a single atomic status region and stable footer/button/feedback geometry. Rejected retries preserve the synthetic gold and level, and insufficient-gold checks cover +1, +5 and Max. It also checks that no other experimental game UI remains, and checks images, runtime errors and external requests. It does not validate gameplay or backend behavior.

Current evidence: [icon close-up and compact sizes](evidence/icons-detail.png), [desktop](evidence/desktop-city.png), [landscape](evidence/landscape-city.png), [landscape ledger](evidence/landscape-ledger.png), [short landscape](evidence/short-city.png), [short landscape ledger](evidence/short-ledger.png), [review page](evidence/review-desktop.png), and [machine-readable results](evidence/qa-results.json).
