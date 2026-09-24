# Top HUD alignment draft

Status: approved and integrated on the feature branch; merge and deployment pending. Branch: `codex/top-hud-gold-alignment-draft`. Base: `692ed3e6439c18f75840c9c935abae01e33c0c38`.

The approved alignment keeps Gold in its current position and moves the player frame plus the three top icons left together, preserving their sizes, artwork, backgrounds, vertical placement and gaps. Gold already has a `margin-left: -7px`; `main-screen-art-ui.css` now applies the same -7px margin to `.profile-action-row` in the actual game. No additional production asset, JavaScript or backend change is required.

Run `node tools/map-benchmark/start-server.js 61704` and open `/docs/visual-qa/top-hud-alignment/index.html?viewport=landscape`. The preview uses the current real game with the existing loopback benchmark's synthetic account and map. It changes only a draft CSS class. No production files load this draft, and no real account is used.

Desktop (1440×900), mobile landscape (844×390) and small landscape (568×320) are displayed at native CSS size. Switch between Current game and Aligned draft; use the optional guide at Gold's left edge and map zoom controls. The guide is a review overlay, not a proposed game element. Navigation is intercepted to keep this appearance review on the map.

The user approved pushing and deployment. The comparison stylesheet explicitly restores the original row margin for Current game, so the approved before/after reference remains reviewable after integration. Production never loads the preview files or alignment guide. Live status still requires verification of the merged deployment.

Focused browser review passed at all three viewports: the top row moves from x=24px to x=17px, matching Gold at x=17px. Gold itself does not move. All four top controls retain their dimensions, vertical position, colors and working hit targets. The same geometry holds at 220% map zoom; no page exceptions or failed image/script/style requests were observed. Screenshots and measurements are saved under ignored `release-artifacts/top-hud-alignment/`. The broader game suites were not repeated for this isolated draft.
