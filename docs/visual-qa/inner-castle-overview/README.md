# Inner Castle overview — design draft

Status: **draft for visual review**. No runtime integration, confirmed specification change, merge, or deployment is included. This standalone folder is excluded from the production client build.

## Review

Use the repository's local preview server (`node tools/map-benchmark/start-server.js 61703`) and open <http://127.0.0.1:61703/docs/visual-qa/inner-castle-overview/index.html>.

For the latest Treasury candidate, open <http://127.0.0.1:61703/docs/visual-qa/inner-castle-overview/index.html?viewport=landscape&building=treasury&review=treasury-v1>. The optional `building` parameter selects an existing building in either comparison; unrecognized values fall back to Great Hall.

Switch between **Parchment draft / Current layout** and **Desktop / Mobile landscape**. These are the only supported design targets; portrait previews and portrait-specific layout rules have been removed, following the user's correction and Master Specification Section 17. Select any of the six buildings using the scene signs or desktop directory. Selection is preserved when comparing versions. Manage Gear, Back to City Details, and Close explain their game behavior without leaving the preview or changing an account. The Treasury has a synthetic new-gear marker to review its presentation.

## Proposed presentation

- Parchment, muted moss, dark ink, fine rules, and engraved symbols follow the approved City List and City Details direction. Great Hall and Barracks symbols reuse that drawing style; Treasury, Alehouse, Gatehouse, and Royal Stables have corresponding chest, tankard, portcullis, and horseshoe symbols.
- The header separates the Main City identity from the Inner Castle title. Desktop uses the familiar 1040 × 790 maximum window, with 12-pixel viewport margins.
- Desktop pairs the Royal Bailey scene and six-building directory with a selected-building pane. Full building names appear on decorative hanging wooden signs with metal hangers, a shaped board, brass trim/rivets, and small-cap serif lettering. The selected sign uses burgundy; the matching directory control also uses an inset rule and pressed state. Signs are SVG/CSS with real HTML text, so labels remain accessible and independent of the artwork.
- Mobile landscape moves the existing Back to City Details button into the top bar beside Close, freeing the footer's height for the Royal Bailey. The full 4:3 image stays visible even on short landscape screens; all six building signs retain their fixed positions and at least 44-pixel-high touch targets.
- The mobile detail pane stacks the building name, a centered preview image, the existing information and new-gear indicator, then Manage Gear where available. It reserves space for the text and 44-pixel action first; the image fits the remaining height, up to 160 pixels wide, without cropping. Tighter text spacing and a 225-pixel detail column keep all information and the action visible without scrolling at the reviewed landscape sizes. The artwork therefore scales down on shorter screens instead of pushing Manage Gear below the visible panel.
- The same Back button moves back to the desktop footer when the viewport changes, preserving selection and avoiding duplicate controls. This draft does not change the game's orientation guard or create a portrait game layout.
- The draft uses new Royal Bailey, Great Hall and Treasury illustrations following the user's map reference: dark ink outlines, muted olive and ochre, pale stone and burgundy pennants. The user liked Great Hall and requested the next candidate; Treasury is now ready for review. The other four interiors remain original for individual review later. Current layout retains the original hub and all original interior images for comparison.

## Preserved behavior and information

The source has **six** buildings, with gear management available at **four**:

| Building | Existing role text | Existing availability |
| --- | --- | --- |
| Treasury | Gold storage / gold production | Master of Coin gear and bonuses; Manage Gear |
| Great Hall | Ruler power / kingdom upgrades | Not yet available |
| Barracks | Troop production / military strength | War Captain gear and bonuses; Manage Gear |
| Alehouse | Morale / recovery / small boosts | Not yet available |
| Gatehouse | City defense / wall strength | Defensive Commander gear and bonuses; Manage Gear |
| Royal Stables | Movement / march speed | Cavalry Master gear and bonuses; Manage Gear |

All building labels, descriptions, availability, new-gear indication, Back to City Details, and Close are retained. Only Great Hall and Treasury's individual artwork references change in the draft. At the user's request, the general announcement about exploring the Royal Bailey and future building functions/upgrades has been removed from every draft building on desktop and mobile. The captured Current layout retains its original announcement for comparison. This draft introduces no building levels, costs, upgrades, timers, or progression promises. Gear subpanels are outside this review. Entry/ownership and return-city behavior remain owned by the current runtime.

## Royal Bailey artwork

The built-in image-generation tool produced `art/royal-bailey-ink-wash-v1.png` as an opaque 1448 × 1086 PNG (4:3). It is copied intact from the generated source: no crop, stretching, recoloring, or moved building anchors. The final prompt and reference roles are recorded in [art/royal-bailey-prompt.md](art/royal-bailey-prompt.md). The preview alone consumes this file; existing runtime art and the optimized-asset manifest are unchanged.

The fixed scene anchors remain Treasury **19% / 24%**, Great Hall **50% / 20%**, Barracks **81% / 25%**, Alehouse **19% / 57%**, Gatehouse **50% / 75%**, and Royal Stables **81% / 58%**, measured from the upper-left. Visual overlay review checks that each falls on its intended building, while browser checks verify the rendered marker centers and actual pointer selection. The full enclosure, open courtyard, and bottom entrance retain the original arrangement. Approval of this art candidate is still pending.

## Great Hall artwork

The first interior candidate is `art/great-hall-ink-wash-v1.png`, an opaque 1254 × 1254 PNG created with the built-in image-generation tool. It keeps the original hall's raised throne area, long tables, arched windows, timber roof and right-hand hearth, redrawn with lighter stone and crisp ink outlines matching the Bailey. The exact prompt and reference roles are saved in [art/great-hall-prompt.md](art/great-hall-prompt.md).

The generated file is copied intact. It fits the existing square preview without any layout changes. Great Hall still shows its existing role and **Not yet available**, with no Manage Gear action. The user liked this candidate and requested continuation on 10 September 2026; that confirms the visual direction, without authorizing runtime integration, merge or production deployment.

## Treasury artwork

The second interior candidate is `art/treasury-ink-wash-v1.png`, an opaque 1254 × 1254 PNG created with the built-in image-generation tool. The treasurer's counting desk, scales, ledger, guarded iron-bound door, shelves and chests retain their original arrangement, now rendered with pale warm stone, ochre timber, restrained gold and crisp ink outlines. The approved Great Hall is the primary style reference, with Royal Bailey as a supporting reference. The exact prompt is saved in [art/treasury-prompt.md](art/treasury-prompt.md).

The file is copied intact and uses the existing square image slot. Treasury keeps its original gold role, Master of Coin information, synthetic new-gear marker and Manage Gear action. All information and the action remain visible without scrolling at the reviewed sizes. The four remaining interiors, scene image and six clickable anchors are unchanged. Treasury's visual approval is pending.

## Source and isolation

`snapshot.json` was captured from the isolated local benchmark at `92e45124469842e8b19974807aa13f01b4bead02`. City name and new-gear indication are synthetic. Existing building definitions come from `game.js`; previews and availability come from `common-gear-ui.js` and `common-gear.js`.

`preview.js` loads only this static snapshot and local styles/assets. It does not load the game runtime, Firebase, production data, or any account API. The Current layout uses captured original markup plus the repository's shared styles; those shared styles are not frozen here. The draft stylesheet is scoped to its own `.bailey-modal`.

## Focused review evidence

Local Chrome checks compare all six buildings in both versions at desktop sizes 1440 × 900 and 1280 × 720, and mobile landscape sizes 844 × 390, 667 × 375, 568 × 320, and 932 × 430. They check original building information, action availability, synchronized selection, 44-pixel visible draft buttons, non-overlapping scene targets, horizontal overflow, inert actions, outer comparison controls, browser errors, and failed assets. The original comparison's pre-existing small-screen layout limitations are not changed.

The artwork pass additionally verifies an opaque 4:3 image, unchanged normalized anchors (rendered centers within 1.5 pixels), and 36 actual pointer selections across the same six desktop/landscape viewports. Screenshots were visually inspected to confirm the signs land on their named building. Focused resize checks verify that one Back control moves to its intended location, while keyboard activation and Back feedback remain functional. New artwork is loaded only in Parchment draft; Current layout keeps the captured original.

At 844 × 390, the visible artwork width grows from about 241 to 365 CSS pixels (51%) compared with the previous draft, while keeping the same modal dimensions and 4:3 framing. No portrait layouts are part of this review.

The latest detail refinement checks all six buildings at two desktop and four landscape sizes: no general announcement, centered square artwork, title/image/information/action order, all information within the visible pane, no detail scrolling, and 24 immediately visible Manage Gear controls clicked without any scrolling. These checks were repeated with the new Treasury interior, alongside asset loading, original comparison and direct-building review-link checks. The enlarged Royal Bailey scene remains intact.

Screenshots and measurements are kept locally under ignored `release-artifacts/inner-castle-overview/`. These checks cover a static layout draft, not authenticated gameplay or equipment operations. The normal `prepare-pr` workflow determines the required validation tier from the complete branch difference.
