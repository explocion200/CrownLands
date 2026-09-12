# Shop UI and item artwork approval draft

Status: user approved the design, merge and deployment on 2026-09-12. Branch: `codex/shop-ui-art-draft`. Runtime integration and release validation are in progress; LIVE status requires separate channel verification.

Open `docs/visual-qa/shop-ui/index.html?viewport=landscape` through the repository preview server. The review includes desktop (1440 × 900), mobile landscape (844 × 390) and small landscape (568 × 320). There is no portrait design.

## Review scope

- Parchment Shop with a compact provision grid and selected-item details, matching the approved Bag and city panels.
- Six new transparent illustrations: Royal Peace Shield, War Drums, Royal Tax Decree, Veil of Silence, Swift March Order and Recall Horn.
- The approved Common Gear Box chest, existing reward images and established City Details engraved Gold coin are retained.
- Full item descriptions, current sample prices, owned counts, daily limits, purchasing states and optional advertisement information.
- The purchase footer remains visible; long descriptions and supplemental information scroll independently on short screens.
- Artwork control compares new illustrations with the previous images. Example control previews insufficient Gold, daily limits, pending and failed purchases, large quantities and advertisement availability states.

This review page remains an isolated interactive draft using synthetic data. Buying, retries and advertisement completion are simulated in memory. No account, storage, backend or advertisement provider is connected to the review page. The approved production integration is implemented separately in `shop-ui.js` and `shop-ui.css`, using the game's existing purchase state, action queue and rewarded-ad pathways.

## Existing behavior and pricing

`snapshot.json` records the existing labels, descriptions, category values, limits and price examples from source commit `33d986ca0b961bab3a7cd9515260b3f7172b1c4d`. Relevant implementation sources are `game.js`, `economy-config.js`, `ads-config.js` and `common-gear.js`. Sample prices use 250,000 base Gold/hour and 20 cities; they are not fixed Shop prices. Repeated one-item purchases can queue while earlier purchases confirm, subject to available Gold and the daily limit.

The Master Development Specification's Section 4 retains older price multipliers and a fixed Common Gear Box price. Current client and server agree on different values. This draft preserves the existing implementation and proposes no balance change. The discrepancy must be reconciled separately with a confirmed design decision; this draft does not amend the specification.

The optional Gold and Troop boosts preserve their current 30-minute production reward, shared 30-minute cooldown and shared daily limit of 20. No new rarity behavior is introduced.

## Art provenance

See [exact prompts and generation route](art/prompts.md) and [asset manifest](art/asset-manifest.json). Each original PNG is retained alongside its optimized WebP. The six WebPs total 215,296 bytes. The original user-supplied map is the style reference. Images were generated individually through the requested signed-in ChatGPT Images workflow; the initial page showed Images 2.5, but its backend model identifier was not exposed. No API/CLI generation route was used.

## Focused validation — 2026-09-12

- JavaScript syntax checks for both preview scripts.
- Browser inspection of all ten example states at all three target sizes: 30 layout checks. The catalog remained within its allocated space; interactive controls were at least 44 × 44 CSS pixels and stayed inside the Shop window.
- All new item images decoded successfully. A transient image-not-yet-decoded result during a rapid viewport switch passed on the subsequent settled observation. No browser errors remained.
- Visual inspection of desktop, mobile landscape and small landscape with the new artwork.
- Repeated War Drums purchases updated projected inventory and stopped at the existing 4/day limit.
- Failed purchase restored Gold, owned quantity and daily allowance; retry succeeded and the Common Gear Box stopped at 1/day.
- Optional reward cancellation preserved availability; simulated completion added the sample Gold reward and disabled both rewards for their shared cooldown.
- Arrow-key item and section navigation, close and reopen worked.
- Source and WebP alpha channels verified; originals preserved and only proportional preview resizing performed.
- Whitespace/diff scope check; only this review directory is included.

These were draft checks. After approval, the integration adds focused actual-game validation in `tools/validate-shop-browser.js` for layout, complete descriptions, shared illustrations, purchase reservations, repeated purchases, daily limits, rejection/retry, pending Box selection, close handoff, stable countdown nodes and ad disclosure cancellation. Source and derivative hashes are recorded in `assets/optimized/manifest.json`; retired derivatives remain available for the historical draft comparison but are excluded from the production package. Release results are recorded in `release-artifacts/shop-ui/release-receipt.md` once publication is verified. Real account purchases, ad-provider completion and physical-phone touch remain manual verification steps.
