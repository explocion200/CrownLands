# Gatehouse · Defensive Commander equipment draft

Status: **draft for user approval** on `codex/gatehouse-gear-draft`. This folder is an isolated local design preview. No runtime integration, pull request, merge, or deployment has been performed for this update.

Open `index.html` through the local preview server. The review provides Parchment draft and Current layout, with Desktop (1440 × 900), Mobile landscape (844 × 390), and Small landscape (568 × 320). Portrait orientation is not a design target.

## Presentation

- Uses the approved Treasury/Barracks arrangement and matching dimensions: up to 1200 × 790 pixels on desktop, fitting landscape viewports. The Commander sits between eight equipped slots; the equipment bag is in the middle; complete item details are on the right. Equip/Unequip and Upgrade remain visible while the bag and details scroll independently.
- Includes a new static, transparent Defensive Commander in worn steel and a moss-green cloak with fortress keys and a shield. No animation. Existing equipment illustrations are retained. The Current layout comparison retains the original Commander portrait.
- Common items keep light gray backgrounds (`#d9dad6`) and burgundy selected borders; empty slots stay parchment. The Gold icon is the approved crown-stamped coin. The Gatehouse seal reuses the existing engraved building symbol.
- Examples include an upgrade-ready helm, missing matching material, a maximum-level Masonry Seal, the Fortress Shield, an empty slot, and insufficient Gold. Bag filters, selections, and upgrade confirmation are interactive previews; actions do not alter inventory or Gold.

## Source and preserved information

`snapshot.json` was captured from the real `createCommonGearViewModel('gatehouse')` and `renderCommonGearBuilding('gatehouse')` at commit `5d4e3641a28f86c36f8b9415ba073c0522b00e2d`, using a disposable local benchmark inventory. It contains 16 items in 13 stacks, seven equipped slots, 128,400 Gold, and 48,000 raw Gold production per hour. The low-Gold example uses 12,000. No account or production data is included.

Armor retains wall strength in all owned cities. The Fortress Shield retains defending soldier strength in all owned cities. The Masonry Seal retains reduction to repair time added by new wall damage. Exact bonuses, levels, costs, matching-copy counts, full progression paths, descriptions, category, binding, equipped/new indicators, and stack counts come from the current game model. No gameplay or balance change is proposed.

The upgrade confirmation preserves the two-to-one consumption and irreversible-action wording. Cancel and Escape return keyboard focus to Upgrade. Confirmation and equipment actions are clearly identified as previews in the surrounding review page.

## Artwork and validation

[Artwork provenance](art/README.md) records the source, exact prompt, generation route, transparent export, dimensions, and hashes.

Focused draft validation passed 15 states across desktop and both mobile landscape sizes: image decoding, transparent static character containment, eight reachable 44-pixel slots, visible 44-pixel actions, viewport containment, empty/disabled/low-Gold states, selection/filtering, confirmation/Escape/focus restoration, and current-layout comparison. No browser exceptions were reported. A visual review checked the standard landscape and small-landscape layouts. Physical-device touch remains untested.

Capture/check scripts, screenshots, and results remain under ignored `release-artifacts/gatehouse-gear/`. Production release gates belong to a later approved integration; this preview only changes files in this directory.
