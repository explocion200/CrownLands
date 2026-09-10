# Compact City List and City Info — design draft

Status: design approved, with merge and production deployment authorized. The approved arrangement is integrated through `city-list-ui.css` and `city-details-ui.css`; the Master Specification records the confirmed layout. Deployment must be verified separately. This folder remains an isolated visual reference and is excluded from the production build.

## Review

Run the repository's local preview server:

```powershell
node tools/map-benchmark/start-server.js 61703
```

Open <http://127.0.0.1:61703/docs/visual-qa/compact-city-layout/index.html>.

Switch between **City List / City Info**, **Compact draft / Current layout**, and **Phone / Landscape / Desktop**. City names on the first roster page open their corresponding detail sample. Overview / Defences, amount selection, and pagination work in the preview. Spending, sorting, locating, profile navigation, Inner Castle, and management actions are inert; buttons explain the limitation when applicable. Off-map cities on page two have no detail sample.

## Proposed arrangement

- Both draft dialogs use the City List envelope: up to **1040 × 790 CSS pixels**, bounded by 12-pixel viewport margins. On a 390 × 844 phone, each dialog is **366 × 790**; on 844 × 390 landscape, each is **820 × 366**. Current layout retains each original dialog's size for comparison.
- Phone City List: city name and location above one band containing city art, level, stationed troops, Gold/hour, and troops/hour. The +1 / +5 / MAX prices and Locate control follow immediately below. Desktop and landscape retain compact columns.
- City Info: information on the left and the complete development section on the right, including on phones. Each column scrolls independently when necessary. On narrow phones, amount selection uses +1 / +5 above a full-width MAX button, keeping 44-pixel controls.
- Existing parchment colors, medieval icons, art, and information remain. Text wraps instead of being truncated. Small-phone management sections and wall status stack within the left column.

## Preserved information

City List retains the treasury, city/Stronghold/map counts, sort controls and labels, city names, location, Main City seal, art, levels, stationed troops, both production rates, all three upgrade prices, Locate, page count, and pagination. Responsive column headings retain the shipped visibility rules.

City Info retains the city title, ownership, level, art, owner link, kingdom, owned-city Inner Castle entry, Overview and Defences tabs, garrison, Gold/troop production and bonus figures, walls, invested Gold and capture note, reinforcement details/help, regular-city management actions and explanations, live defense, soldier defense, wall integrity, repair/help text, and the full development amount/level/price/affordability section.

## Source and isolation

`panels.json` contains markup captured from the isolated local benchmark at commit `82c3165ae08e02c9370545c3000e360c14c48f09`: two roster pages and five owned city detail samples. Values and player identity are synthetic benchmark data. Amount states use the actual game rendering and cost helpers at that revision. The snapshot includes the original local stylesheet references and icon sprite.

`preview.js` loads this static snapshot and local styles/assets. The two panel stylesheets in `baseline/` preserve the original comparison at the captured revision; the remaining shared styles/assets come from the repository. It does not load the game runtime, Firebase, or any production data. `compact.css` is loaded only by this reference. The live integration uses the existing game markup and state, with CSS placing the original city name/location/Main City seal in the compact band; it does not ship the snapshot renderer or change game JavaScript.

## Local visual verification

Chrome checks cover current and draft panels at 390 × 844, 844 × 390, 1440 × 900, 320 × 740, and 568 × 320. The draft preserves the complete text-node inventory, matches dialog dimensions, and has no horizontal overflow in these samples. The first phone roster row changes from approximately **226 to 167 pixels** (26% shorter); desktop changes from approximately **104 to 78 pixels** (25% shorter).

Additional interaction checks cover all five city detail samples, both tabs, and all three amount states at four viewports, including narrow-phone management and wall text. Screenshots and measurement evidence are kept locally under the ignored `release-artifacts/compact-city-layout/` directory. These checks validate the draft's layout and preview interactions; real multiplayer actions are outside this static preview.

The existing City List and City Details browser validators also verify the integration against isolated game fixtures, including pending and rejected upgrades, affordability, focus/scroll preservation, incomplete rosters, retry, empty and Stronghold states, off-map navigation, ownership-only Inner Castle entry, foreign-city privacy, and unrelated dialog isolation. City Details viewport assertions now require matching dimensions and development beside information, with phone and narrow-phone coverage added. Production verification checks the deployed commit, stylesheet contents, cache stamps, and unauthenticated entry; it does not spend player resources.
