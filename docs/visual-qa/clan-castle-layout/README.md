# Clan Castle settlement layout draft

Branch: `codex/clan-castle-layout-draft`. Base: `066c5b32cd0ecf450b42ce353529b87e340575f0`.

User request: use the attached September 22 map screenshot as a reference for the four building positions and interaction UI. This is a proposal for review; no live map, backend, building definitions, release assets, or rules are changed.

## Composition

- The current approved Tower sprite remains central, with an open south-facing entrance.
- Clan Shop: upper left. Engineers' Workshop: upper right. Infirmary: lower left. Training Grounds: lower right.
- Reuse `assets/clan-buildings/` for all four visual stages, the Tower and transparent connecting paths. Reuse the active Core Ravenwatch map backdrop. No replacement raster artwork or broad ground tile.
- The actual building buttons own both their sprite and their hanging name sign. Selection opens a compact bottom detail panel, leaving the compound visible. Building descriptions, benefits, costs, durations and stages come from `clan-tower-buildings.js`.
- The clan flag and name appear above the castle. The map action row sits below the compound and uses the current `CrownlandsClanTowerDetailsUi.mapActions()` permissions logic with sample snapshots.
- Owned sample: Info, Store, Send. Rival sample: Info, Scout, Rally Attack. These controls simulate entry only. They do not send troops, purchase items or create rallies. Shop details link to the existing approved Shop preview.
- Name visibility and recenter controls are interactive. The bottom map menu is visual context only.

## Review

Open `index.html?viewport=landscape&sample=owned&level=4`. The review toolbar also provides desktop, small landscape, four art stages, rival ownership, an active Workshop project, and an unbuilt layout study.

The **unbuilt** sample intentionally exposes translucent position markers so reviewers can inspect all four slots. This does not propose placing unbuilt structures on the live map: the current rule keeps unbuilt buildings in the Buildings tab. The construction overlay is draft scaffolding, not a replacement production asset.

Viewport checks: desktop 1440 × 900; mobile landscape 844 × 390 and 568 × 320. Portrait remains outside this game's supported view.

Run `node tools/validate-clan-castle-layout-draft-browser.js` for actual pointer/touch hit tests, artwork loading, arrangement, all four building entries, detail close/back, sample map actions, construction/unbuilt states, all art stages, and review controls. Captures and results are written to ignored `release-artifacts/clan-castle-layout/`.

## Integration after design approval

Apply approved positioning to the real world-space renderer and preserve camera pan/zoom, the one-tower ownership rule, existing permissions, construction state, hit areas, map action sizes, pickup exclusions and existing backend commands. This draft does not exercise those runtime systems and is not ready for production integration or deployment.
