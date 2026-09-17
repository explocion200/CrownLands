# Camp details drafts

Status: **All four Camp Details designs APPROVED**, including the corrected Relic Camp chest. The user requested the next related UI draft before releasing this batch. Camp and Clan Tower Details continue together on `codex/camp-details-draft`, started from synchronized `main` at `cd021f7be253b83eea57ade726330ca5c0a9f63e`. Runtime integration now reuses the existing Camp data, private reward progress, history, and reinforcement controls. The four approved variants use the shared Camp presentation module. Merge/deployment verification is tracked separately; the draft itself is not release evidence.

Open `/docs/visual-qa/camp-details/index.html?viewport=desktop&sample=owned&camp=troops`. The Camp selector switches between `gold`, `troops` (Warband), `items` (Relic) and `deed`. Existing links without `camp` still show Gold. The toolbar switches between desktop (1440 × 900), mobile landscape (844 × 390) and small landscape (568 × 320). There is no portrait game layout. The modal follows the approved 1040 × 790 maximum envelope, shrinking to fit landscape screens. Its header, tabs and footer remain available while the content panes scroll.

## Design

All four camps share the approved Gold layout. The left column pairs the current Core camp art with its controller, required hold and unlimited garrison. The right column prioritizes the viewer's next reward, public hold timer, stationed troops and total defense. Clan reinforcement details expand below. Your Rewards specializes for the camp; Camp Rules retains its full explanation.

The parchment, ink, brass, olive actions and crimson frame follow the approved Stronghold Details treatment. The gold coin, helmet, shield and ruler mark reuse packaged art. On mobile, the camp illustration's transparent outer space is cropped by its frame; the original asset is unchanged. All buttons and disclosure controls have a minimum 44px height before review-toolbar scaling.

The review controls are outside the proposed game UI. Rulers, amounts, progress, troop counts, city histories and reports are fictional fixtures. Timers stay frozen for review. Controller links, reinforcement actions and Deed award location buttons open local explanatory dialogs; they never issue game commands or change counts. No authentication, storage, Firebase or game runtime scripts are loaded.

| Camp | Current Core example | Hold | Daily reward |
| --- | --- | --- | --- |
| Gold | Gilded Moor | 10 minutes | Four production-based gold rewards |
| Warband | Frostwolf March | 15 minutes | Four production-based troop rewards |
| Relic | Ravenscar | 30 minutes | Five usable item rewards, each with a separate 1% bonus chest chance |
| Deed | Dawncrest | 60 minutes | One random eligible neutral city award |

Warband uses a restrained olive reward accent. Relic retains the existing six item images and drop chances, with the approved oak-and-iron Common Gear Box in a separate bonus strip. Its image is `assets/icons/common-gear-chest-r1.svg`, matching `COMMON_GEAR_BOX_ITEM.icon` in the current game; the older dark WebP chest is not used. Its history lists only the viewer's item rewards for today. The bonus chest supplements the random item and does not replace it; its 1% chance is separate from the six base item odds, which total 100%.

Deed shows the existing-level/zero-troop city award, a private latest-ten history and local map-link previews. The reserved example separates a player's earned pending city from the now-neutral camp and its public timer. There is no invented Deed Token, city picker, map choice or guaranteed future city preview. Relic and Deed artwork uses adjusted mobile framing to retain the tops of the taller tents.

## Existing behavior preserved

- Gold Camp requires a ten-minute hold. Capturing it or changing control starts the full timer again.
- One private allowance covers the player's four daily Gold Camp rewards across all locations in the realm. It resets at 00:00 UTC. Further successful holds award zero.
- Reward values are `max(minimum, floor(raw kingdom gold production per hour × reward hours))`. Minimums are 20,000 / 40,000 / 60,000 / 80,000; hours are 0.5 / 1 / 1.5 / 2. The default fictional 92,480 gold/hour yields 46,240 / 92,480 / 138,720 / 184,960. With one reward earned, the next estimate is 92,480 gold.
- Warband uses the same production-hour ladder with 10,000 / 20,000 / 30,000 / 40,000 minimum troops. Fictional production of 46,240 troops/hour yields 23,120 / 46,240 / 69,360 / 92,480 troops. Rewards are delivered to the holder's Main City; they are not added to the camp garrison.
- Relic's existing drop table is War Drums 35%, Veil of Silence 25%, Swift March Order 18%, Royal Tax Decree 12%, Recall Horn 8%, Royal Peace Shield 2%. The 1% Common Gear Box roll is an additional bonus on a rewarded hold. Completed daily allowance gives neither another usable item nor a bonus box.
- Deed selects equally among eligible neutral regular cities across the active realm, excluding Main Cities, objectives, occupied cities, inactive maps and the former Crownlands Heart. The city retains its existing level and starts with zero troops. The normal neutral-city capture limit is separate. No available city causes the earned award to be reserved for the original holder and counted against its earning day's allowance. The camp resets and return marches are sent normally; award recovery is automatic.
- Your Rewards always describes the viewer. The current controller's identity and hold timer do not expose that controller's private reward progress. Estimates are not receipts for previously awarded amounts.
- Only the holder or a valid scout report reveals exact troops and total defense. Clan membership alone does not grant access. Scouts show an expiring snapshot; later events remain private.
- Camps have no levels, walls or defense bonuses. Every stationed troop, including reinforcements, contributes 1.00 defense. The 20,000 neutral starting rule is described in Camp Rules, never used to guess current unscouted defenses.
- The holder can inspect contributions and preview Send Home. A clanmate sees only their own contribution and Recall. Reinforcement totals are included in holder defense statistics, not counted twice.
- Pending completion waits for server confirmation. The mockup does not award gold or claim troops have returned. Resolution sends troops toward origin cities with the Main City fallback and resets the camp to neutral.

## Evidence

Inspected before drafting:

- `docs/CROWNLANDS_MASTER_DEVELOPMENT_SPECIFICATION.md`, Camps in section 6 and UI guidance in section 16.
- `docs/CROWNLANDS_ART_BIBLE.md`, approved UI materials and icons.
- `game.js`: `showRewardCampInfoModal`, `getRewardCampEstimatedRewards`, `rewardCampProgressMarkup`, `relicCampProgressMarkup`, `deedCampHistoryMarkup`, `renderHoldingReinforcementPanel`, `RELIC_CAMP_DROP_TABLE`.
- `functions/economy-config.json`: all four camp timers, daily limits and both production ladders. The effective Relic allowance is five, overriding the fallback value in the source.
- `functions/index.js`: Relic item selection and independent bonus-box roll; `functions/common-gear.js`: `RELIC_BONUS_CHANCE_PERCENT = 1`.
- Current client and Functions release configuration: `core-expansion-v1`.
- Current Core identity and art reused from the Camps ledger: `core-v2-gold-camp-north-east-p2-m2_gold_camp` in Gilded Moor; `assets/worlds/core-expansion-v1/art/camp-gold-d9ba98b26c61.webp`.
- All four example IDs/map names checked against `functions/core-expansion-world-layout.json`. Every camp illustration, map backdrop, item image and bonus chest path exists in the current packaged assets.

No gameplay rule or confirmed specification was changed. This draft does not establish production deployment parity.

## Review states

The Example selector supports `owned`, `neutral`, `enemy`, `scouted`, `ally`, `complete`, `payout`, `loading`, `error` and `long` for every camp. Deed additionally offers `reserved`, `history-empty`, `history-loading` and `history-error`; changing away from Deed resets an incompatible example to Owned. The URL preserves camp, viewport and example. Reset restores the chosen example and Overview. Loading/error states keep the public timer and authorized defense stats but do not invent reward progress or estimates. The long fixture exercises full numbers, ruler names and city names.

See `visual-checks.md` for the focused draft verification. Runtime integration and the required PR/release gates follow design approval.
