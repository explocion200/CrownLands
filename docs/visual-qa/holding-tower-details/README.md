# Clan Tower Details draft

Status: **Layout APPROVED; personal orders and player flags updated for review.** The user confirmed Clan Tower terminology, individual Attack/Move controls using the normal city design, and a garrison showing each player's name, flag and troops. This continues the authorized related objective-details review batch on `codex/camp-details-draft`; the existing approved Camp commits are preserved. No runtime integration, PR, push, merge or deployment has occurred for this batch.

Open `/docs/visual-qa/holding-tower-details/index.html?viewport=desktop&sample=owned&tower=ravenwatch`. Use the review toolbar to switch among Ravenwatch, Highguard, Blackthorn and Stoneward. The window matches the approved camp maximum of 1040 × 790 and shrinks for 844 × 390 and 568 × 320 landscape screens. There is no portrait layout.

## Design

- Overview pairs the current Core tower illustration and controlling clan with public wall condition, authorized defenders, personal troops, Veil status and troop actions. The clan's flag appears beside its name using the existing clan heraldry renderer, with distinct synthetic flags for the friendly and rival examples; neutral towers show no clan flag.
- Garrison displays three columns: each player's saved flag, name and stationed troops. Your row is marked You. The roster has no per-player command buttons; officers cannot move other members' troops.
- Attack and Move stay in the footer and open the approved city troop-order presentation adapted to the Clan Tower origin and wall level. Both sliders select only your personally stationed troops, with crossed swords for Attack and a marching banner for Move. Reinforce and Form Rally remain secondary Overview actions.
- Walls & Veil separates the current wall and construction queue from officer services. Clan Treasury remains visible above them. Disabled actions explain damage, attack, active repair, a full queue, insufficient funds, an active Veil or the spent daily allowance.
- Tower Rules retains the confirmed conquest, garrison, wall, repair, scouting and clan-departure rules.

The parchment, olive, muted brass and burgundy frame follows Camp Details and Stronghold Details. Tower portraits use a restrained green fortification trim. Header, tabs and footer stay available while the two Overview columns or each ledger panel scroll. Minimum control height is 44px. No image generation or live artwork modification was needed.

The toolbar, troop-order controls and explanatory action dialogs belong to the design review. Prices, player/clan names, troop counts, destinations and routes are fictional; timers remain frozen. All actions are local previews with no authentication, game commands or storage. Pure flag and Common Gear modules support the presentation; `game.js` is not loaded. Changing a fixture or tower returns to Overview. The URL preserves tower, fixture and viewport, and unknown query values fall back to Ravenwatch/Owned/Desktop.

`orders.html` reuses the approved city draft's controls, slider artwork, dynamic attack-power calculation and transfer summary through a small tower adapter. Attack targets remain unscouted rather than showing an invented battle outcome. Move updates the example destination's arrival total, while confirmation changes only the review status. The Tower order endpoint currently has no Swift March consumable selection, so its third transfer summary panel identifies the player issuing the command instead.

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
