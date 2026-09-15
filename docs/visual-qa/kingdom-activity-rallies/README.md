# Kingdom Activity: Rallies draft

Status: approved design and production integration, September 14, 2026. The user authorized merge and deployment; published status must be verified separately.

Branch: `codex/kingdom-activity-rallies-draft`.
Base: `4b49d05211a361c7485254dc59477c645186dfe5` (approved Marches release).

Open `/docs/visual-qa/kingdom-activity-rallies/index.html?viewport=desktop&sample=standard` on the existing loopback server. The review controls provide desktop (1440 × 900), mobile landscape (844 × 390), and small landscape (568 × 320). Portrait is outside the game's design scope.

## Scope and design

Only the Rallies tab of Kingdom Activity is drafted. It shares the Marches window dimensions, parchment, ink, typography and category navigation. A scrolling rally selector sits beside the selected rally's target and muster ledger. The selected target and action bar remain fixed; creator, assembly city, totals and all participant rows scroll between them. All existing fields are retained, and counts use full values. The selected rally displays its participant capacity and readiness separately. Rallies remain manually launched, with no formation expiry or automatic countdown.

The sample set covers mixed forming/launched/returning rallies, ready creator controls, Clan Leader controls, joining, participant withdrawal, twenty participants, five active rallies, long names/large forces, unavailable Recall Horns, a pending order and no active rallies. Ordinary Strongholds and the Crown Citadel are the sample objectives; target-specific Holding Tower rules are not expanded by this draft.

## Interaction limits

This is an isolated HTML/CSS/JS review with synthetic data. It loads no account, game script, backend or persistent storage. Timers are fixed. Launch, Cancel, Join, Withdraw and Recall simulate a response after 550 ms; Reset invalidates pending callbacks. Join contributes a fixed 10,000 sample troops from Ravenwatch to show the inbound state. The existing live join form, city/troop choices, confirmation dialogs, route calculations, failures, server authority, permissions and costs must be retained during integration. Profile buttons explain their existing navigation rather than opening a sample account. Other activity tabs are disabled review context.

## Existing implementation references

- `rallies-activity-ui.js`: selected-rally presentation, full counts, existing profile/item art, and view-state capture/restoration. `game.js` retains the shared role/readiness calculations, participant status helper, rally actions, confirmation and Kingdom Activity routing.
- `renderClanRallyCard` is shared with the approved Clan War Room. Its explicit optional activity mode uses the new renderer; ordinary calls retain the War Room's layout and handlers. Styling requires both the outgoing activity modal and the Rallies class, which is removed on close or category change.
- Existing active/assembled/inbound/returning totals and disclosure rules remain authoritative. Eligibility derives from the live helpers and server, not these sample booleans. Only the creator or Clan Leader may launch/cancel a forming ordinary Rally; only the creator may recall its launched army. The minimum is two ready participants and every contribution must have arrived. Capacity is twenty rulers and five active clan rallies.
- The Master Specification records the approved presentation. No backend, world data, balance or game rule is changed.

## Shared art

Existing `marchOrders.svg`, the full `fortress-keep.svg` and `crown.svg` from Clan Heraldry v1, and the updated shared Shop Recall Horn image are reused. Review/frame CSS is imported from earlier approved draft sources. No new raster art is needed for this layout review.

## Validation

Visual and interaction review is recorded in `visual-checks.md`. To reproduce the actual-game preview, run `node tools/prepare-rallies-preview.js` against the existing loopback benchmark server, then open the printed URL. It embeds only the draft's synthetic fixture factory into an ignored preview page and loads the real runtime through mock Firebase. The local example picker covers the same eleven states. Refresh and Remove selected exercise snapshot reconciliation. Launch/cancel use the real confirmation and dispatch through a pending mock API; Join and Recall stop at local handler boundaries. No live gameplay actions are performed.

The production builder and manifest explicitly include the scoped helper, stylesheet and two existing heraldry SVGs. Review tools and fixtures are excluded. This presentation has a bounded 60 KiB asset allowance plus 4 KiB for entry/mounting overhead; existing map, login and install-cache budgets are unchanged. Required release gates, PR checks and both published-channel verification follow the integration checks.
