# Clan Tower Details draft

Status: **Main layout APPROVED; clearer Walls & Veil redesign ready for review.** The user confirmed that all attacking and troop movement happen at the tower on the map, like cities, outside this details UI. The garrison shows each player's name, flag and troops, and the clan flag stays beside the tower title. This continues the authorized related objective-details review batch on `codex/camp-details-draft`; the existing approved Camp commits are preserved. No runtime integration, PR, push, merge or deployment has occurred for this batch.

Open `/docs/visual-qa/holding-tower-details/index.html?viewport=desktop&sample=owned&tower=ravenwatch`. Use the review toolbar to switch among Ravenwatch, Highguard, Blackthorn and Stoneward. The window matches the approved camp maximum of 1040 × 790 and shrinks for 844 × 390 and 568 × 320 landscape screens. There is no portrait layout.

## Design

- The controlling clan's flag appears beside the Clan Tower name in the persistent header on every tab. Overview also shows it beside the controlling clan's name. Both use the existing clan heraldry renderer with distinct synthetic flags for friendly and rival examples. Neutral and unavailable towers retain the generic header icon without a clan flag.
- Overview pairs the current Core tower illustration and controlling clan with public wall condition, authorized defenders, personal troops and Veil status.
- Garrison displays three columns: each player's saved flag, name and stationed troops. Your row is marked You. The roster has no per-player command buttons; officers cannot move other members' troops.
- The footer contains the current troop/status summary and Back to Map. Attack, Move, Reinforce and Rally are map actions, with no buttons or troop-order composer inside this details draft. Individual troop ownership and eligibility rules remain unchanged.
- Walls & Veil has two labelled panels: Walls groups integrity, repair, the ten-slot queue and adding levels; Veil groups its scouting effect, duration, remaining uses, reset time and activation cost. Clan Treasury and management permissions sit above both. Fully repaired walls show a short status instead of a disabled zero-cost repair button. Paid queue entries and detailed rules expand on demand. Each unavailable action gives a nearby reason, including the exact shortfall when gold is insufficient. Single-level upgrade prices remain distinct from the full quote required before spending.
- Tower Rules retains the confirmed conquest, garrison, wall, repair, scouting and clan-departure rules.

The parchment, olive, muted brass and burgundy frame follows Camp Details and Stronghold Details. Tower portraits use a restrained green fortification trim. Header, tabs and footer stay available while content scrolls. Walls & Veil uses independent service-panel scrolling on desktop and one shared vertical scroll on mobile landscape, with service headings kept visible. Minimum control height is 44px. No image generation or live artwork modification was needed.

The toolbar and explanatory action dialogs belong to the design review. Prices, player/clan names and troop counts are fictional; timers remain frozen. All actions are local previews with no authentication, game commands or storage. Pure player-flag and clan-heraldry modules support the presentation; `game.js` is not loaded. Changing a fixture or tower keeps the selected tab. The URL preserves tower, fixture, viewport and `section`; use `section=walls` to open Walls & Veil directly. Unknown query values fall back to Ravenwatch/Owned/Desktop/Overview. The removed embedded order preview remains available only in Git history; map integration is separate work.

## Source checks

Read before drafting:

- `docs/CROWNLANDS_MASTER_DEVELOPMENT_SPECIFICATION.md`, section 8 and the Clan/Treasury rules. The document marks Tower gameplay as **IMPLEMENTED — PENDING MERGE AND AUTHORIZED DEPLOYMENT**; this draft does not change that release status.
- `holding-tower-ui.js`: `renderPanel`, `renderQueue`, `renderActions`, and synthetic `createQaSnapshot` prices/state.
- `game.js`: `renderHoldingTowerModal`, `getHoldingTowerComposerTargets`, `showHoldingTowerOrderComposer`. Manual withdrawal selects an owned destination city; automatic return on clan departure goes to the Main City. There is no separate Scout From Tower action.
- `functions/index.js`: `sendHoldingTowerArmyOrder` uses the caller's garrison contribution as the available troop count; its route calculation does not accept a Swift March consumable selection.
- `functions/playerFlagConfig.js` and `functions/flagRenderer.js` render saved personal flag values with the existing runtime symbol sprite. The review uses three synthetic flags and no real player data.
- `functions/index.js`: `getHoldingTowerState` permissions and information projection. Controlling clan members see the full attributed roster, while outsiders only get exact total defenders through a valid ownership-matching scout report. Leader/officer roles control spending, and eligible members require personally stationed troops for withdrawal and outgoing orders.
- `functions/holding-towers.js`: fixed identities; 24-hour probation; five-member conquest; ten-level queue; ten-minute build and Veil durations; three Veils per UTC day; wall, repair and Veil cost relationships.
- Both current release contracts select `core-expansion-v1`. No production pointer or world state is accessed by this isolated visual draft.
- Current region JSON files and `region-catalog.json` supply map names and illustrated assets. Tower names come from the confirmed Tower definitions, not the region's map caption.

| Tower | Core map name | Current packaged illustration |
| --- | --- | --- |
| Ravenwatch | Stoneward | `tower-ravenwatch-3966d0772018.webp` |
| Highguard | Lionwatch | `tower-highguard-4ca346633579.webp` |
| Blackthorn | Oakwatch | `tower-blackthorn-a85bdbe2d2b4.webp` |
| Stoneward | Roseguard | `tower-stoneward-57c29f4d6846.webp` |

## State coverage and limits

Nineteen selectable fixtures cover officer/member roles, empty garrison, probation, neutral/rival privacy, a scout snapshot, Veil-blocked scouting, damaged walls, paid repair, construction, a full queue, incoming rally, active/spent Veil, insufficient funds, long names, loading and failure. Rival examples assume the viewer belongs to an eligible attacking clan; they do not imply that clanless or probationary players can form a Tower rally. Neutral starting rules do not substitute for a current scout report.

The default garrison totals 4,782,350 troops, including your 685,200. No double-counting. An outsider's scout report reveals the total, not the contribution roster. The Tower grants no passive realm bonus. Ordinary Rally rules are unchanged.

Prices intentionally follow synthetic presentation examples, not a copied production economy curve. The upgrade picker previews selection of up to the remaining ten slots. “Next level” is explicitly a single-level price, not a bulk quote. Its action explains that the eventual game integration must obtain the complete selected-level quote before confirmation. No estimate is used to spend gold here.

See `visual-checks.md` for focused verification. Runtime integration and release validation remain after design approval; this draft is not ready to merge or deploy as a game update.
