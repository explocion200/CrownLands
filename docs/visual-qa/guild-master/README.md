# Guild Master local review

This is a development-only preview inside the existing Inner Castle renderer.
It uses isolated sample state, not a player's account. The full Guild expansion
is not implemented or deployed. Groups 1–2 of the balance review remain proposed;
Group 3, individual randomized starting stats and additive party contributions
are confirmed directions. Exact champion and mission numbers remain proposed.

Start the existing loopback server from the repository root:

```powershell
node tools/estate-building-ui-preview.js
```

Use the port printed by the server and open
`/docs/visual-qa/guild-master/game.html?entry=guild&revision=guild-hall-r3`.
The `tab` parameter can open `contracts`, `infirmary`, `training` or `improvements`.
The adjacent `index.html` is a simpler artwork gallery; room buttons change the
illustration. No real purchases, missions or production mutations are possible.

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
image loading until needed. The seven existing review portraits are unchanged.

The subsequent Hall refinement replaces the modest meeting room with a grand
timber hall, oak galleries, burgundy guild standards, a great stone hearth and
champions preparing expeditions. It was generated independently with the same
reference image; all contract and room illustrations are retained.

[Originals, exact prompts and hashes](../../art-sources/guild-master/manifest.json)
record both the active illustrations and the retired cutaway/panorama sources.
Optimized derivatives are in `assets/guild-master/`. All 21 active WebP files
total 2,236,580 bytes, with individual and aggregate budgets checked. Nothing is
added to the installation preload. The encoder only resizes and compresses;
it does not repaint, composite or synthesize artwork.

## Validation

With Node 22 and the repository's locked dependencies installed:

```powershell
node tools/validate-guild-art.js
node tools/test-guild-party-contributions.js
node tools/validate-guild-game-preview.js
```

The browser validation checks desktop 1440×900 and landscape 844×390 / 568×320,
independent and uncropped images, all room improvement illustrations, 44px
controls, stable sample recruits, preparation choices, harmless report replay,
adding/removing members without diluting the forecast, one sample improvement
at a time, and estate camera restoration. The model test covers all eight
contracts and all member types across preparation choices and progression,
including caps, fixed difficulty and explicit leader changes. It also checks
the artwork gallery and the pending balance status. Screenshots and results go
to ignored `release-artifacts/guild-master-missions/game-preview/`.

These checks do not validate production server authority, migration, live
mission balance or physical-device behavior. Merge, deployment and final
champion/mission balance are separate from this local visual review.
