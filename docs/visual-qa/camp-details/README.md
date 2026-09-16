# Gold Camp details draft

Status: **DRAFT — awaiting design approval.** Branch: `codex/camp-details-draft`, started from synchronized `main` at `cd021f7be253b83eea57ade726330ca5c0a9f63e`. This is an isolated design review, with no runtime integration, PR, push or deployment.

Open `/docs/visual-qa/camp-details/index.html?viewport=desktop&sample=owned`. The toolbar switches between desktop (1440 × 900), mobile landscape (844 × 390) and small landscape (568 × 320). There is no portrait game layout. The modal follows the approved 1040 × 790 maximum envelope, shrinking to fit landscape screens. Its header, tabs and footer remain available while the content panes scroll.

## Design

Gold Camp is the first Camp Details panel in this pass. The left column pairs the current Gilded Moor camp art with its controller, required hold and unlimited garrison. The right column prioritizes the viewer's next estimated reward, public hold timer, stationed troops and total defense. Clan reinforcement details expand below. Your Rewards presents the four-step daily ladder; Camp Rules retains the full explanation.

The parchment, ink, brass, olive actions and crimson frame follow the approved Stronghold Details treatment. The gold coin, helmet, shield and ruler mark reuse packaged art. On mobile, the camp illustration's transparent outer space is cropped by its frame; the original asset is unchanged. All buttons and disclosure controls have a minimum 44px height before review-toolbar scaling.

The review controls are outside the proposed game UI. Rulers, amounts, progress, troop counts and reports are fictional fixtures. Timers stay frozen for review. Controller links and reinforcement actions open local explanatory dialogs; they never issue game commands or change counts. No authentication, storage, Firebase or game runtime scripts are loaded. Warband, Relic and Deed variants are deferred until the shared Gold Camp direction is approved.

## Existing behavior preserved

- Gold Camp requires a ten-minute hold. Capturing it or changing control starts the full timer again.
- One private allowance covers the player's four daily Gold Camp rewards across all locations in the realm. It resets at 00:00 UTC. Further successful holds award zero.
- Reward values are `max(minimum, floor(raw kingdom gold production per hour × reward hours))`. Minimums are 20,000 / 40,000 / 60,000 / 80,000; hours are 0.5 / 1 / 1.5 / 2. The default fictional 92,480 gold/hour yields 46,240 / 92,480 / 138,720 / 184,960. With one reward earned, the next estimate is 92,480 gold.
- Your Rewards always describes the viewer. The current controller's identity and hold timer do not expose that controller's private reward progress. Estimates are not receipts for previously awarded amounts.
- Only the holder or a valid scout report reveals exact troops and total defense. Clan membership alone does not grant access. Scouts show an expiring snapshot; later events remain private.
- Camps have no levels, walls or defense bonuses. Every stationed troop, including reinforcements, contributes 1.00 defense. The 20,000 neutral starting rule is described in Camp Rules, never used to guess current unscouted defenses.
- The holder can inspect contributions and preview Send Home. A clanmate sees only their own contribution and Recall. Reinforcement totals are included in holder defense statistics, not counted twice.
- Pending completion waits for server confirmation. The mockup does not award gold or claim troops have returned. Resolution sends troops toward origin cities with the Main City fallback and resets the camp to neutral.

## Evidence

Inspected before drafting:

- `docs/CROWNLANDS_MASTER_DEVELOPMENT_SPECIFICATION.md`, Camps in section 6 and UI guidance in section 16.
- `docs/CROWNLANDS_ART_BIBLE.md`, approved UI materials and icons.
- `game.js`: `showRewardCampInfoModal`, `getRewardCampEstimatedRewards`, `rewardCampProgressMarkup`, `renderHoldingReinforcementPanel`.
- `functions/economy-config.json`: existing Gold Camp timer, daily ladder and reward formula inputs.
- Current client and Functions release configuration: `core-expansion-v1`.
- Current Core identity and art reused from the Camps ledger: `core-v2-gold-camp-north-east-p2-m2_gold_camp` in Gilded Moor; `assets/worlds/core-expansion-v1/art/camp-gold-d9ba98b26c61.webp`.

No gameplay rule or confirmed specification was changed. This draft does not establish production deployment parity.

## Review states

The Example selector supports `owned`, `neutral`, `enemy`, `scouted`, `ally`, `complete`, `payout`, `loading`, `error` and `long`. The URL preserves the viewport and example. Reset restores the chosen example and Overview. Loading/error states keep the public timer and authorized defense stats but do not invent reward progress or estimates. The long fixture exercises full numbers and long names.

See `visual-checks.md` for the focused draft verification. Runtime integration and the required PR/release gates follow design approval.
