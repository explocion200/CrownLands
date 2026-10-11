# Guild Master implementation and review

All three balance groups are approved for implementation. The branch now connects the production Guild UI to the estate transaction service, saved champions, private mission outcomes, reports, room improvements and reward collection. Release validation is in progress; nothing in this document claims deployment.

Run `node tools/guild-production-preview.js`, then open the printed loopback address with `/docs/visual-qa/guild-master/production.html`. This exercises the production UI and rule modules with disposable sample state. It never uses Firebase or spends player funds. The browser validator covers desktop and landscape layouts, mission-first planning, recruitment, saved parties, departure, recovery, reports, safe retries and collection.

The earlier art/interaction prototype remains available for reference:

Start the existing loopback server from the repository root:

```powershell
node tools/estate-building-ui-preview.js
```

Use the port printed by the server and open
`/docs/visual-qa/guild-master/game.html?entry=guild&revision=guild-hall-r3`.
The `tab` parameter can open `contracts`, `infirmary`, `training` or `improvements`.
The adjacent `index.html` is a simpler artwork gallery; room buttons change the
illustration. No real purchases, missions or production mutations are possible.

## Choose a contract before planning

The preview starts without a selected mission. Choose a contract, then use its
mission plan to select members, a leader, route and supplies and review the
forecast. The Mission plan tab appears only after that choice. The Planning
table and roster direct players to contracts when no mission has been chosen;
a direct `tab=planning` URL does the same.

Change contract returns to the board. Returning from the roster, reopening the
Guild or reloading the preview retains the explicitly chosen contract and
preparation in this tab's sample session. Archive reports have their own mission
context and never select a contract or overwrite the current plan.

## Additive party forecast

Each member adds their relevant stats against a fixed contract target. Adding a
member cannot lower success while the leader and preparation stay unchanged;
removing a non-leader cannot improve it. The forecast shows total readiness,
the fixed target and an expandable contribution breakdown including Leadership.
Caps can leave displayed odds unchanged, and choosing a different leader can
change the Leadership bonus.

The Local sample target is 24, calibrated to two required members so existing
two-member odds stay unchanged. This is proposed numerical calibration, not a
newly approved production rule. With fixed center rolls, a Level 3 Guard and
Scout have 88% escort success; adding a Level 1 Scholar raises it to 92.5%.
The mission target and Leadership weight never scale with selected headcount.

## Artwork revision 3

The user's uploaded `inspiration art.png` was inspected and supplied to the
built-in image generation tool for each of 14 separate scene generations:
one Guild Hall, eight mission-specific contract images, and five
individual rooms. Infirmary, Training, Archive, planning and room-improvement
details use their matching images. Contracts and rooms retain full compositions.
Short landscape screens put the illustrations beside their text. Cards defer
image loading until needed. The seven earlier type portraits remain available
for other rarity samples.

The subsequent Hall refinement replaces the modest meeting room with a grand
timber hall, oak galleries, burgundy guild standards, a great stone hearth and
champions preparing expeditions. It was generated independently with the same
reference image; all contract and room illustrations are retained.

[Originals, exact prompts and hashes](../../art-sources/guild-master/manifest.json)
record both the active illustrations and the retired cutaway/panorama sources.
Optimized derivatives are in `assets/guild-master/`. Including the Common set,
all 42 active WebP files total 3,385,022 bytes, with individual and aggregate
budgets checked. Nothing is
added to the installation preload. The encoder only resizes and compresses;
it does not repaint, composite or synthesize artwork.

## Common champion set

The new Common set contains 21 individually generated portraits, three per
specialty: Guard, Scout, Scholar, Artisan, Envoy, Quartermaster and Medic.
Revision 2 follows the owner's refined direction: poor medieval Europeans,
18 men and 3 women, with lean or wiry builds and serious, stern expressions.
They wear repaired linen/wool and carry simple peasant weapons, farm tools and
small hints of their specialty, taking dangerous paid work to survive.
The reference's ink contours, painted shading and earth colors guide every portrait.
This set is for review;
the earlier Hall/room/contract approval does not imply approval of these new faces.

`index.html#common-champions` shows the entire set grouped by specialty.
`game.html?entry=guild&tab=members&revision=common-champions-r2` shows the portraits
on the actual sample roster. Common offers keep their portrait through hiring,
refreshes and party changes. Existing local samples receive a stable portrait
without changing their stats, names, rarity, resources or progression. Other
rarities retain the previous artwork. The catalog does not add 21 recruit offers
or alter recruitment availability.

All selected versioned PNG originals and exact built-in generation prompts are in
the art manifest. First-round originals remain as retired provenance; runtime
portraits retain their IDs and use a revision query to avoid stale browser images.
The replacement batch uses only the supplied landscape as its style reference.
Each new derivative is 512×512 WebP, under 80 KiB; together the Common
portraits are 1,148,442 bytes. Generate only these derivatives with the bundled
Python/Pillow runtime: `python tools/prepare-guild-art.py --only-prefix common-`.
The encoder preserves all existing derivatives when using that option.

## Validation

With Node 22 and the repository's locked dependencies installed:

```powershell
node tools/validate-guild-art.js
node tools/test-guild-common-portraits.js
node tools/test-guild-party-contributions.js
node tools/validate-guild-game-preview.js
node tools/test-guild-facilities.js
node tools/test-guild-missions.js
node tools/validate-guild-production-ui.js
```

The browser validation checks desktop 1440×900 and landscape 844×390 / 568×320,
independent and uncropped images, all room improvement illustrations, 44px
controls, distinct/stable Common offer and recruit portraits, all 21 gallery
images, stable sample recruits, mission-first planning, keyboard/touch contract
selection, retained preparation and archive isolation, harmless report replay,
adding/removing members without diluting the forecast, one sample improvement
at a time, and estate camera restoration. The model test covers all eight
contracts and all member types across preparation choices and progression,
including caps, fixed difficulty and explicit leader changes. Browser checks
also cover the artwork gallery and recorded balance approvals. Screenshots and results go
to ignored `release-artifacts/guild-master-missions/game-preview/`.

These checks do not validate production server authority, migration, live
mission balance or physical-device behavior. Merge, deployment and final
champion/mission balance are separate from this local visual review.
