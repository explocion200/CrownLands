# Clan Overview design draft

Status: local draft for user approval. Production UI and backend are unchanged.

Open `index.html` through the repository preview server. Review controls provide desktop (1440 × 900), mobile landscape (844 × 390), and small landscape (568 × 320) screens. Portrait is outside this review.

## Scope and visual direction

Clan Overview only: the clan shield and identity sit beside a parchment activity ledger. Existing game artwork supplies the muted olive, burgundy, brass, and ink details. A decorative cloth behind the shield is presentation, not a new saved clan banner or replacement for player heraldry.

All displayed numbers and identities are synthetic examples. Role, empty activity, gift cooldown, long description, full membership, and original heraldry examples are available. Destination dialogs explain existing actions; they do not implement or redesign the linked screens.

## Existing implementation preserved in the draft

Source: `game.js`, `renderClanSectionNavigation`, `renderClanOverviewPanel`, `renderClanContent`, and `renderClanRenameEditor`.

| Existing content or action | Draft placement |
| --- | --- |
| Clan shield, name, tag, role, description | Left identity panel; shield and name retain public-profile actions |
| Clan Power and member total / 30 | Top of activity ledger |
| Active rallies, Gold gift status, Weekly Conquest / 2,000, roster count | Four activity shortcuts |
| War Room, Rewards, Members badges | Clan navigation; applications shown only to leaders/officers |
| Edit Heraldry and Rename Clan | Bottom of identity panel, leader only |
| Profile, Clan, Skills, Settings | Kingdom navigation |

The draft uses the production heraldry config, assets, renderer, and frozen legacy renderer. It neither converts nor saves shields. `docs/CROWNLANDS_MASTER_DEVELOPMENT_SPECIFICATION.md` remains authoritative; no gameplay or design rules are changed by this draft.

Members, applications, War Room, Rewards, the heraldry/name editors, public clan profile, and no-clan discovery/create flow remain separate scopes. Leave/Disband belong to the existing Members screen and are not added here.

## Approval boundary

No Firebase, gameplay scripts, storage writes, purchases, or persistent mutations are used. Only local display state changes. After design approval, integrate against live clan data and permissions, then run the required release checks before any authorized merge or deployment.
