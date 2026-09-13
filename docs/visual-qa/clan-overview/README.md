# Full Clan UI design draft

Status: full design approved and integrated with production Clan renderers. `clan-ledger-ui.css` provides scoped desktop and mobile-landscape styling; `game.js` retains authoritative service calls and role checks. Release verification is recorded separately. The files described below remain an isolated design reference.

Open `index.html` on the repository preview server. The wrapper offers Desktop (1440 × 900), Mobile landscape (844 × 390), and Small landscape (568 × 320). Portrait is outside this design. Use the in-game tabs or the wrapper's Screen menu. Reset example restores synthetic state.

## Screens and source mapping

| Draft screen | Existing source in game.js | Review coverage |
| --- | --- | --- |
| Overview | renderClanOverviewPanel, renderClanSectionNavigation | Shield, name/tag, role, description, power, membership, four shortcuts, permission-aware badges |
| Members | renderClanMembersPanel, renderClanRosterMember | Role/power/last activity, member selection, profile links, promotion/demotion/removal, applications, Leave/Disband |
| War Room | renderClanRallyPanel, renderClanRallyCard | Rally selector, objective/region/creator/assembly, contribution list, forming/launched/returning states, join/withdraw/launch/cancel/recall |
| Gold Gifts | renderClanGiftPanel | Send cooldown, collection, sent/received/collected totals, recent generosity |
| Weekly Conquest | renderClanQuestPanel, CLAN_QUEST_REWARDS | All ten existing milestones, progress, collected/ready/locked/joined-too-late states, expiry information |
| Treasury | renderClanTreasuryPanel | Balance, daily cap/remaining, donated/spent totals, locked allowance, donation form and confirmation, unavailable state |
| Discover/Create | renderClanView, renderClanDiscoveryAction | Name search, public links, open/approval/full states, application/cancellation, join, creation fields and cost, cooldown and Level 10 gate |
| Public Clan Profile | showPublicClanDetails | Existing shield, identity, description, admission, power, membership, complete public roster |
| Heraldry | renderClanShieldEditor and production heraldry modules | Field, Colors, Charges, Details, all catalog options, full/map preview, Inspire Me, Cancel/Save, explicit legacy conversion |
| Rename | renderClanRenameEditor | Name validation, cost, balance, seven-day cooldown, insufficient-Gold state |
| Rally order | beginCreateClanRally, beginJoinClanRallyContribution, showTroopSliderModal | Source/target, troop slider/input, remaining troops, contribution requirements, join/create outcomes |

The Rewards sub-tabs are a presentation proposal for the existing Gold Gifts, Weekly Conquest, and Treasury sections. They do not add a new reward or currency. Rally creation remains a map entry point; the review-only Screen selector exposes its order draft without inventing a new War Room target selector.

Shared Player Profile, Profile/Skills/Settings navigation, Clan Chat, map target/source selection, Holding Tower management, and battle reports retain their existing separate UIs. Their links are represented where present; this draft does not redesign those shared screens.

## Art and interaction

Parchment, olive cloth, muted brass, and burgundy continue the established UI. Existing game icons and heraldry art are reused. The original Overview composition remains the entry point. Roster flags are synthetic illustrative kingdom standards, not a replacement for the production player-flag renderer during integration.

Every name, count, timestamp, route, resource balance, and action result is synthetic. Actions change memory only and Reset restores the fixture. No Firebase, gameplay script, account access, storage write, or production mutation is loaded. Creation/name availability and troop/resource settlement are examples, not authoritative validation.

Role behavior follows the current UI: Leader manages identity and roster roles; Leader/Officer review applications; members donate and receive rewards; Rally control depends on role, creator, contribution, and phase. All ten conquest reward values match the existing table. No balance or progression change is proposed.

## Compatibility and release boundaries

- Existing production heraldry config/assets/renderer and frozen v1 renderer are reused. Viewing/cancelling an original shield preserves v1. Entering the editor makes a separate v2 draft through `createV2DraftFromV1`; unmapped charges require a deliberate choice before Save.
- The Master Specification is authoritative for Rally departure behavior. The old disband dialog says all marching clan armies continue normally, which conflicts with its confirmed automatic recall when a Rally creator departs. Draft confirmation copy reflects the confirmed creator-departure rule. No backend behavior is changed.
- Treasury is included because it is in the current implementation. Its Master Specification status remains pending authorized deployment; this draft does not establish live availability. Verify the active Core release contract before production integration.
- `tools/prepare-clan-ledger-preview.js` assembles the actual game with loopback-only benchmark services and `runtime-fixture.js`. This checks production markup and dispatch without a production account. Neither fixture is shipped. Required release gates and deployed-build verification follow integration.

See `visual-checks.md` for completed local review checks.
