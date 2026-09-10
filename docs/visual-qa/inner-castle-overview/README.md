# Inner Castle overview — design draft

Status: **draft for visual review**. No runtime integration, confirmed specification change, merge, or deployment is included. This standalone folder is excluded from the production client build.

## Review

Use the repository's local preview server (`node tools/map-benchmark/start-server.js 61703`) and open <http://127.0.0.1:61703/docs/visual-qa/inner-castle-overview/index.html>.

Switch between **Parchment draft / Current layout** and **Desktop / Mobile landscape / Phone**. Select any of the six buildings using the scene markers or the directory. Selection is preserved when comparing versions. Manage Gear, Back to City Details, and Close explain their game behavior without leaving the preview or changing an account. The Treasury has a synthetic new-gear marker to review its presentation.

## Proposed presentation

- Parchment, muted moss, dark ink, fine rules, and engraved symbols follow the approved City List and City Details direction. Great Hall and Barracks symbols reuse that drawing style; Treasury, Alehouse, Gatehouse, and Royal Stables have corresponding chest, tankard, portcullis, and horseshoe symbols.
- The header separates the Main City identity from the Inner Castle title. Desktop uses the familiar 1040 × 790 maximum window, with 12-pixel viewport margins.
- Desktop pairs a numbered Royal Bailey scene and six-building directory with a selected-building pane. Selected scene markers use burgundy; the matching directory control also uses an inset rule and pressed state.
- Landscape uses named scene controls and a compact detail pane. On narrower or shorter landscape screens (width at most 650 or height at most 370), the six-building directory replaces the overview image. Selection and all building information remain available; columns scroll when needed. This is a proposed responsive treatment for review.
- The supplemental portrait preview stacks the scene, directory, and selected building in one scrolling area. Back to City Details remains in a fixed footer. This draft does not change the game's landscape requirement or orientation guard.
- The draft now uses a new Royal Bailey illustration following the user's map reference: dark ink outlines, muted olive and ochre, pale stone and burgundy pennants. The six building preview illustrations remain unchanged for a later pass. Current layout retains the original hub image for comparison.

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

All labels, descriptions, availability, individual building artwork references, new-gear indication, Back to City Details, and Close are retained. The existing notice about future building functions/upgrades is retained in the footer; this draft introduces no building levels, costs, upgrades, timers, or progression promises. Gear subpanels are outside this review. Entry/ownership and return-city behavior remain owned by the current runtime.

## Royal Bailey artwork

The built-in image-generation tool produced `art/royal-bailey-ink-wash-v1.png` as an opaque 1448 × 1086 PNG (4:3). It is copied intact from the generated source: no crop, stretching, recoloring, or moved building anchors. The final prompt and reference roles are recorded in [art/royal-bailey-prompt.md](art/royal-bailey-prompt.md). The preview alone consumes this file; existing runtime art and the optimized-asset manifest are unchanged.

The fixed scene anchors remain Treasury **19% / 24%**, Great Hall **50% / 20%**, Barracks **81% / 25%**, Alehouse **19% / 57%**, Gatehouse **50% / 75%**, and Royal Stables **81% / 58%**, measured from the upper-left. Visual overlay review checks that each falls on its intended building, while browser checks verify the rendered marker centers and actual pointer selection. The full enclosure, open courtyard, and bottom entrance retain the original arrangement. Approval of this art candidate is still pending.

## Source and isolation

`snapshot.json` was captured from the isolated local benchmark at `92e45124469842e8b19974807aa13f01b4bead02`. City name and new-gear indication are synthetic. Existing building definitions come from `game.js`; previews and availability come from `common-gear-ui.js` and `common-gear.js`.

`preview.js` loads only this static snapshot and local styles/assets. It does not load the game runtime, Firebase, production data, or any account API. The Current layout uses captured original markup plus the repository's shared styles; those shared styles are not frozen here. The draft stylesheet is scoped to its own `.bailey-modal`.

## Focused review evidence

Local Chrome checks compare all six buildings in both versions at 1440 × 900, 844 × 390, 390 × 844, 320 × 740, and 568 × 320. They check original building information, action availability, synchronized selection, 44-pixel visible draft buttons, non-overlapping scene targets, horizontal overflow, inert actions, outer comparison controls, browser errors, and failed assets. The original comparison's pre-existing small-screen layout limitations are not changed.

The artwork pass additionally verifies an opaque 4:3 image, unchanged normalized anchors (rendered centers within 1.5 pixels), and 30 actual pointer selections across the same five viewports. Desktop and landscape screenshots were visually inspected to confirm the markers land on their named building. New artwork is loaded only in Parchment draft; Current layout keeps the captured original.

Screenshots and measurements are kept locally under ignored `release-artifacts/inner-castle-overview/`. These checks cover a static layout draft, not authenticated gameplay or equipment operations. The normal `prepare-pr` workflow determines the required validation tier from the complete branch difference.
