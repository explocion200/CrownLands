# Kingdom Activity: Rallies draft

Status: local design draft awaiting approval, September 14, 2026.

Branch: `codex/kingdom-activity-rallies-draft`.
Base: `4b49d05211a361c7485254dc59477c645186dfe5` (approved Marches release).

Open `/docs/visual-qa/kingdom-activity-rallies/index.html?viewport=desktop&sample=standard` on the existing loopback server. The review controls provide desktop (1440 × 900), mobile landscape (844 × 390), and small landscape (568 × 320). Portrait is outside the game's design scope.

## Scope and design

Only the Rallies tab of Kingdom Activity is drafted. It shares the Marches window dimensions, parchment, ink, typography and category navigation. A scrolling rally selector sits beside the selected rally's target and muster ledger. The selected target and action bar remain fixed; creator, assembly city, totals and all participant rows scroll between them. All existing fields are retained, and counts use full values. The selected rally displays its participant capacity and readiness separately. Rallies remain manually launched, with no formation expiry or automatic countdown.

The sample set covers mixed forming/launched/returning rallies, ready creator controls, Clan Leader controls, joining, participant withdrawal, twenty participants, five active rallies, long names/large forces, unavailable Recall Horns, a pending order and no active rallies. Ordinary Strongholds and the Crown Citadel are the sample objectives; target-specific Holding Tower rules are not expanded by this draft.

## Interaction limits

This is an isolated HTML/CSS/JS review with synthetic data. It loads no account, game script, backend or persistent storage. Timers are fixed. Launch, Cancel, Join, Withdraw and Recall simulate a response after 550 ms; Reset invalidates pending callbacks. Join contributes a fixed 10,000 sample troops from Ravenwatch to show the inbound state. The existing live join form, city/troop choices, confirmation dialogs, route calculations, failures, server authority, permissions and costs must be retained during integration. Profile buttons explain their existing navigation rather than opening a sample account. Other activity tabs are disabled review context.

## Existing implementation references

- `game.js`: `renderClanRallyOperationPanel`, `renderClanRallyCard`, `getClanRallyParticipantStatusLabel`, `getRallyParticipantForCurrentPlayer`, `renderOutgoingAttacksModalContent`.
- `renderClanRallyCard` is shared with the approved Clan War Room. Later integration must keep the Kingdom Activity presentation scoped and preserve the War Room's layout and handlers.
- Existing active/assembled/inbound/returning totals and disclosure rules remain authoritative. Eligibility derives from the live helpers and server, not these sample booleans. Only the creator or Clan Leader may launch/cancel a forming ordinary Rally; only the creator may recall its launched army. The minimum is two ready participants and every contribution must have arrived. Capacity is twenty rulers and five active clan rallies.
- The Master Specification's Rallies and UI/UX Standards sections informed the draft. No confirmed specification, runtime file, game rule or release artifact was changed.

## Shared art

Existing `marchOrders.svg`, the full `fortress-keep.svg` and `crown.svg` from Clan Heraldry v1, and the updated shared Shop Recall Horn image are reused. Review/frame CSS is imported from earlier approved draft sources. No new raster art is needed for this layout review.

## Validation

Visual and interaction review is recorded in `visual-checks.md` after completion. This draft is not a production integration, pull request or deployment.
