# Skills ledger draft

Status: design approved September 13, 2026; production integration prepared on `codex/skills-ledger-draft`. This is an isolated, interactive review page. It is not mounted by the game and has no backend imports, player-data access, network writes, or persistent storage.

Open `/docs/visual-qa/skills-ledger/index.html?viewport=landscape` on the repository preview server. Start the server with `node tools/map-benchmark/start-server.js 61703` if needed. Review controls provide desktop (1440 × 900), mobile landscape (844 × 390), and small landscape (568 × 320). No portrait layout is proposed.

## Design

Category headings show only Attack, Defense, and Utility, following the latest review. Header emblems, discipline counts, group point subtotals, and Roman numerals have been removed; individual skill details and overall point totals remain visible.

The window follows the approved Player Profile: parchment, olive, restrained brass, burgundy selection states, and a 1200 × 700 maximum desktop panel. Desktop and mobile landscape both show Attack, Defense, and Utility in three side-by-side columns. Mobile uses compact stacked cards and one shared vertical scrollbar; all three category headings remain visible while scrolling. Cards are 110 px tall at 844 × 390 and 122 px at 568 × 320, with the narrow layout placing the bonus above the point controls. The window header, preset tabs, points, and build actions remain above the scrolling area. Every skill retains its description, current bonus, cap, level, next bonus, and point cost. Point controls keep 44 px button columns. Editing a skill preserves the scroll position; Reset example returns to the top.

Eight original SVG emblems use ink outlines, steel, leather, olive cloth, grain, parchment, and seals. Swordmastery's blade, guard, grip, and pommel now join along one centerline. March Orders shows a campaign standard and route map; the revised Stoneworks emblem shows cut stone blocks and an iron masonry hammer. The approved vectors also ship under `assets/icons/skills/`. The existing Gold icon is reused for Apply pricing. A gallery below the preview lets reviewers inspect the complete icon set.

## Existing rules represented

Behavior sources at base commit `fe06f833c832dd31f8d540a9f62854017997a28b`: the Skills section of `docs/CROWNLANDS_MASTER_DEVELOPMENT_SPECIFICATION.md`, `game.js` skill configuration/groups, `getSkillPointCost`, `getSpentSkillPoints`, `getSkillPresetApplyCost`, `renderSkillPresetPanel`, and `renderProfileSkills`. Rates, caps, and Apply-hour pricing are read from the existing `economy-config.js`.

- All eight skills retain their current groups and effects. Earned points equal Hero level minus one.
- The last five levels of each skill cost two points; earlier levels cost one. Minus returns the exact weighted cost. Maximum and insufficient-point controls are disabled.
- Reset Skills is free, refunds all weighted points, and retains saved presets.
- Presets unlock at Hero levels 25, 50, 75, and 100. Names have the existing 24-character limit.
- Current Build is selected on initial load. Preset edits remain a draft until Save. Save preserves live allocation. Apply replaces the live allocation and displays the existing price: one hour of raw base Gold production before applying the preset.
- Apply requires a saved allocation, no unsaved changes, and sufficient Gold. An applied preset is burgundy; a selected applied preset also has a gold outline. Other selections use gold, saved/empty slots use tan, and locked slots are distinct.
- Cancel, Discard, and Save & continue demonstrate leaving an unsaved preset. Apply and Reset show confirmation previews.

Values are synthetic examples: established ruler, new ruler, maximum/final-tier skills, all points spent, and insufficient Gold. Reset example restores the selected scenario. Profile, Clan, and Settings show explanatory navigation previews. No gameplay or progression changes are proposed. The confirmed presentation is recorded in the Master Specification.

## Approval boundary

Review layout, icons, density, mobile scrolling, and preset actions first. Production integration, sync/pending/failure states, existing event handlers, packaging, required validation, and release work follow approval. See `visual-checks.md` for the focused checks completed on this draft.

## Production integration

`skills-ledger-ui.css` scopes the approved presentation to the existing Skills tab. `game.js` retains the original event handlers, persistence, signed adjustments, pricing, and preset validation while rendering the new cards and compact controls. Existing Apply confirmation and immediate free Reset behavior are retained.

Run `node tools/prepare-skills-ledger-preview.js` against the local preview server, then open `/release-artifacts/skills-ledger/runtime-preview.html`. This actual-game fixture requires the benchmark mock services and localhost; it is excluded from production artifacts. Optional `sample` values are `new`, `veteran`, `spent`, and `poor`. Deployment status is verified separately after merge.
