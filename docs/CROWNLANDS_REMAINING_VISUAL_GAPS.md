# Crownlands Remaining Visual Gaps

Pass 4B audit date: August 12, 2026. This audit compares active player and retained editor surfaces against `CROWNLANDS_ART_BIBLE.md`, the migration ledger, and Pass 3D-4A galleries. Status reflects the repository after Pass 4B.

| Screen/system | Component | File | Current problem | Crownlands treatment | Exposure | Risk | Status / class |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Public site | Shared page shell | `site-info.css` | Active navy/glass/cyan system used large rounded cards and glossy gold commands. | Timber navigation, parchment ledger sections, iron controls, burgundy commands, restrained seals. | Player-facing | Low | Complete / B |
| Public site | Home, Guides, Updates, Rules, Support, Privacy, About, Terms and guide articles | Root `*.html` using `site-info.css` | Pages inherited the old site shell and several pages displayed mojibake punctuation. | Shared public component system plus corrected visible punctuation. | Player-facing | Low | Complete / B |
| Entry | Login background | `assets/game-menu-background.jpg` and optimized derivative | Needed explicit post-4A review. | Retained: believable maintained settlement, fields, road, wagon, river, soldiers and natural light already match the finalized world. | Player-facing | None | Retained / B |
| Kingdom heraldry | Generated flag cloth | `game.js`, `styles.css` | Stored RGB colors rendered too clean/bright and editor swatches exposed raw hex without dye identity. | Preserve saved hex values; map only presentation to named faded dyes, woven texture, seams, stitched edge and restrained wear. | Player-facing | Medium | Complete / B |
| Kingdom heraldry | Flag editor | `index.html`, `styles.css`, `game.js` | Some early blue/gold editor declarations remained under broad overrides. | Parchment workbench, cloth swatches, burgundy selection, stamped timber/iron controls. | Player-facing | Low | Complete / B |
| Clan heraldry | Generated shield | `game.js`, `styles.css` | Shield was materially shallow and could still read like a clean vector badge. | Painted wood grain, plank joints, worn paint, scratched finish and forged edge depth while preserving all shield data. | Player-facing | Medium | Complete / B |
| Clan heraldry | Shield editor, roster and War Room contexts | `styles.css`, `game.js` | Editor retained shiny gold selection and dark fantasy panels in underlying rules. | Parchment workshop, dark timber preview, cloth/paint swatches and oxblood active states. | Player-facing | Low | Complete / B |
| Empty/error/help states | Reports, city list, operations, inventory, clans, rewards and connection states | `styles.css`, runtime markup in `game.js` | Some low-frequency states fell through to generic app panels. | Dispatch/ledger notes; rust warning edge for error; text remains dominant and readable. | Player-facing | Low | Complete / B |
| Tooltips/micro UI | Tooltip, compact choices, focus and mobile controls | `styles.css`, `site-info.css` | Could inherit glass-like dark surfaces and cyan focus. | Compact timber notice, parchment/iron choices, high-contrast warm focus ring. | Player-facing | Low | Complete / B |
| Developer tools | Map/HUD editor shell and footprints | `tools/map-editor/styles.css`, `hud-editor.js` | Retained navy/cyan/gloss and old glyph labels. | Restrained Crownlands admin palette; labels remain functional and compact. Bright grid, resize, selection and overlap colors remain diagnostic. | Editor-only | Low | Complete / C |
| Legacy royal maps | Five root island WebPs | `assets/center-island.webp`, `north-island.webp`, `south-island.webp`, `east-island.webp`, `west-island.webp` | Duplicate compatibility filenames could appear obsolete. | Pass 4A-R restored their exact pre-Pass-4A compatibility art because the editor fallback path still references them. | Editor compatibility | None | Retained / D |
| Optimized history | Superseded content-hashed derivatives shown as deleted/untracked in the worktree | `assets/optimized/` and versioned thumbnail folders | Old hashes are intentionally replaced during cumulative art passes. | Manifest references only current hashes; stale hashes must remain absent from production. | Build-only | Low | Complete / D |
| QA archives | Old/new comparison art | `docs/visual-qa/pass-*` | Deliberately contains previous visual direction. | Retain outside production assets for review and rollback evidence. | Documentation only | None | Retained / D |
| Gameplay diagnostic colors | Rival owner colors and editor overlap indicators | `styles.css`, `tools/map-editor/styles.css` | Some saturated owner/debug colors remain. | Keep as functional-modern exceptions where immediate distinction and editor validation require them. | Player/editor functional | Medium if changed | Retained / C |
| Promotional screenshots | Historical update and guide screenshots | `promo-screenshots/` | A few screenshots record older UI because their article discusses that version. | Retain as dated editorial evidence; replace only when the article claims to show current UI. | Player-facing editorial | Low | Retained / B/D |

## Final Classification

### A - Must Still Be Redesigned

No meaningful player-facing visual system remains in Category A after Pass 4B.

### B - Acceptable

- Active public pages and login entry.
- Flag and shield presentation/editor surfaces.
- Current game/world/PWA raster families completed in Passes 3A-4A.
- Historical screenshots when clearly presented in dated guides or updates.

### C - Functional-Modern Exception

- Map/HUD editor diagnostic colors, grid, resize handles and overlap warnings.
- Familiar browser/OS permission surfaces, native Google sign-in control and native select behavior.
- High-contrast rival ownership colors where loss of distinction would hurt gameplay.

### D - Unused/Legacy

- Development-only old/new QA archives.
- Compatibility root map copies required by the retained editor fallback.
- Superseded content-hashed optimized derivatives, excluded from active references and production.

No broad visual redesign pass is recommended. Further visual work should be targeted maintenance or new-feature art only.
