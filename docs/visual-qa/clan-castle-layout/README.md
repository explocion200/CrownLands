# Approved Clan Castle map layout

Branch: `codex/clan-castle-layout-draft`. Base: `066c5b32cd0ecf450b42ce353529b87e340575f0`.

The four buildings surround the Tower on softly connected dirt clearings. Existing structure sizes, building name/level labels, art and interactions are preserved. Shop/Workshop use x ±0.40, y −0.34; Infirmary/Training Grounds use x ±0.40, y +0.26 in the existing Tower-width coordinate convention.

Owned towers show Store–Info–Send; rivals show Scout–Info–Rally Attack. The row starts 8px below the lowest building label, with 4px gaps and fixed 56px controls at every map zoom on desktop and mobile. The Tower name remains directly beneath its entrance. Permissions and handlers are unchanged.

## Production integration

`game.js` and `clan-tower-buildings-ui.css` implement the approved positions, dirt overlay and action row. `assets/clan-buildings/courtyard.webp` is the approved PNG encoded at 640×475, WebP quality 78, 79,658 bytes, retaining transparency. The versioned request avoids the old cached road texture. It stays below structures and cannot intercept input. Existing pickup exclusion covers every relocated building across all four Core Towers. Backend rules and data are unchanged.

The loopback review loads the actual game with mock account/API data. `map-preview.js` supplies fixtures and camera framing only; it no longer overrides either production layout function. No separate presentation implementation remains in the preview. Landscape samples start with mini-chat collapsed through its existing toggle.

Open `index.html?viewport=desktop&layout=proposed&sample=owned&level=4` using `node tools/map-benchmark/start-server.js 61704`. Choose desktop (1440×900), landscape (844×390), small landscape (568×320), ownership, construction and level samples. This review requires the loopback benchmark server.

## Validation and release

The focused layout browser validator checks production positions/dimensions, labels, transparent ground composition, pickup exclusion, action row order and spacing, mouse/touch building entry, Info/Store entry and Send destination selection. Existing Tower map/building browser checks cover all four Towers, permissions, selection, orders, building stages, construction and zoom-invariant 56px controls.

The user approved the layout and authorized merge/deployment. Integration is complete; required validation, PR merge and production verification must succeed before it is described as live. Evidence is recorded in ignored `release-artifacts/clan-castle-layout/`.
