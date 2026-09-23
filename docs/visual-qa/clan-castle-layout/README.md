# Clan Castle building-position draft

Branch: `codex/clan-castle-layout-draft`. Base: `066c5b32cd0ecf450b42ce353529b87e340575f0`.

The approved layout places four buildings around the Tower on softly connected dirt patches. This revision brings the existing map actions together into a compact row underneath the buildings, with Info centered. Building artwork, object sizes, name/level labels, action appearance, permissions and existing screens are retained.

## Current game appearance

The preview embeds the repository's existing loopback benchmark, which loads the actual game with mock account data and a mock Firebase adapter. It does not load a signed-in production session. The preview controller wraps `renderClanTowerMapBuildings` and changes each building node's `left` and `top`, and swaps the separate decorative ground overlay. It does not restyle or resize the nodes.

| Building | Current x / y | Proposed x / y |
| --- | --- | --- |
| Clan Shop | −0.40 / +0.02 | −0.40 / −0.34 |
| Engineers' Workshop | +0.40 / +0.02 | +0.40 / −0.34 |
| Infirmary | −0.32 / +0.45 | −0.40 / +0.26 |
| Training Grounds | +0.32 / +0.45 | +0.40 / +0.26 |

Offsets use the existing Tower-width coordinate convention from `game.js`. The upper pair move beside the tower; the lower pair move outward and slightly upward. The Tower entrance remains open.

Both comparison views use the same camera scale and framing. Building art remains `visual.width * .44`; Tower width remains sourced from the active Core map definition. Existing label content, typography, background, transform and visibility rules are unchanged. The proposed view replaces the old courtyard with `art/dirt-patches-v1.png`: five irregular dirt clearings, one beneath each building and one at the tower entrance, linked by faint worn earth. Real transparent gaps and soft alpha edges expose the existing map grass. The original background map and its regional roads are untouched. Unbuilt structures continue to stay off the map.

The draft also wraps `updateClanTowerActionWheelLayout`. Owned towers show Store–Info–Send; rival towers retain Scout–Info–Rally Attack. The original permission-derived actions, handlers and 56px screen sizes are preserved. A 4px gap separates controls, and the row starts 8px below the lowest building label. The Tower name keeps its original treatment directly below the entrance so it does not intersect the action row. Keyboard order matches the visible order, and the row follows map pan/zoom.

## Review and checks

Open `index.html?viewport=desktop&layout=proposed&sample=owned&level=4` using `node tools/map-benchmark/start-server.js 61704`. This mock-game draft requires that loopback server, rather than a generic static server or Netlify preview.

The toolbar compares current/proposed layouts and provides desktop (1440×900), mobile landscape (844×390), small landscape (568×320), building levels and ownership/construction samples. The embedded game retains its normal map pan/zoom and mini-chat controls. Landscape samples start with mini-chat collapsed using its existing toggle; reviewers can reopen it normally.

`node tools/validate-clan-castle-layout-draft-browser.js` verifies before/after size and computed-style parity, unchanged artwork, changed positions, and real pointer/touch entry into all four existing building screens. It checks owned/rival action sets, constant button sizes, compact alignment/gaps, unobstructed hit targets below the labels, pan/zoom placement, Info/Store entry and Send destination selection. Ground checks confirm the old courtyard sprite is absent, the new image has real transparency and soft edges, it remains below the buildings and cannot intercept clicks, and unbuilt compounds have no ground overlay. Only negligible browser subpixel label rounding is tolerated. Captures and results are in ignored `release-artifacts/clan-castle-layout/`.

## Status

Draft only. Building positions and dirt artwork are approved; the compact action row is ready for review. No production game files, existing artwork, shared styles, backend, ownership or construction rules are changed. Actual-game integration remains pending. Integration must preserve pickup exclusion and map hit testing while applying the approved offsets; this preview does not deploy the renderer wrapper.
