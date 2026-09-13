# Skills ledger draft

Status: awaiting design approval. This is an isolated, interactive review page. It is not mounted by the game and has no backend imports, player-data access, network writes, or persistent storage.

Open `/docs/visual-qa/skills-ledger/index.html?viewport=landscape` on the repository preview server. Start the server with `node tools/map-benchmark/start-server.js 61703` if needed. Review controls provide desktop (1440 × 900), mobile landscape (844 × 390), and small landscape (568 × 320). No portrait layout is proposed.

## Design

The window follows the approved Player Profile: parchment, olive, restrained brass, burgundy selection states, and a 1200 × 700 maximum desktop panel. Desktop shows Attack, Defense, and Utility together. Landscape uses category tabs with the selected group's cards side by side, keeping point controls visible without scrolling. The narrowest view retains Hero level, unspent/spent totals, the current bonus, cap, skill level, next bonus, and point cost.

Eight original SVG emblems use ink outlines, steel, leather, olive cloth, grain, parchment, and seals. These are draft-local vector assets. The existing Gold icon is reused for Apply pricing. A gallery below the preview lets reviewers inspect the complete icon set.

## Existing rules represented

Behavior sources at base commit `fe06f833c832dd31f8d540a9f62854017997a28b`: the Skills section of `docs/CROWNLANDS_MASTER_DEVELOPMENT_SPECIFICATION.md`, `game.js` skill configuration/groups, `getSkillPointCost`, `getSpentSkillPoints`, `getSkillPresetApplyCost`, `renderSkillPresetPanel`, and `renderProfileSkills`. Rates, caps, and Apply-hour pricing are read from the existing `economy-config.js`.

- All eight skills retain their current groups and effects. Earned points equal Hero level minus one.
- The last five levels of each skill cost two points; earlier levels cost one. Minus returns the exact weighted cost. Maximum and insufficient-point controls are disabled.
- Reset Skills is free, refunds all weighted points, and retains saved presets.
- Presets unlock at Hero levels 25, 50, 75, and 100. Names have the existing 24-character limit.
- Current Build is selected on initial load. Preset edits remain a draft until Save. Save preserves live allocation. Apply replaces the live allocation and displays the existing price: one hour of raw base Gold production before applying the preset.
- Apply requires a saved allocation, no unsaved changes, and sufficient Gold. An applied preset is burgundy; a selected applied preset also has a gold outline. Other selections use gold, saved/empty slots use tan, and locked slots are distinct.
- Cancel, Discard, and Save & continue demonstrate leaving an unsaved preset. Apply and Reset show confirmation previews.

Values are synthetic examples: established ruler, new ruler, maximum/final-tier skills, all points spent, and insufficient Gold. Reset example restores the selected scenario. Profile, Clan, and Settings show explanatory navigation previews. No gameplay or progression changes are proposed, and the Master Specification is unchanged pending approval.

## Approval boundary

Review layout, icons, density, category tabs, and preset actions first. Production integration, sync/pending/failure states, existing event handlers, packaging, required validation, and release work follow approval. See `visual-checks.md` for the focused checks completed on this draft.
