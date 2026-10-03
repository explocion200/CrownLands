# Halloween map decorations

Draft prepared on `codex/halloween-map-decorations`, in PR #430. Not merged or deployed to production.

## Artwork

Seven transparent illustrations follow the user's medieval atlas reference: pumpkins, a harvest scarecrow, a rustic lantern post, a witch's cauldron, weathered graves, a raven perch and a cloth ghost. The four added props have distinct silhouettes and no pumpkins, addressing the repetition in the original set. Generated with the built-in `image_gen` tool. [prompts.json](prompts.json) contains the exact prompts; [assets.json](assets.json) records source paths, production paths, hashes, dimensions, map sizes and byte counts. The original PNGs are preserved here.

Production uses WebP derivatives with alpha, at most 160px per side, totaling 37,502 bytes for all seven. Sharp resized each source to fit within 160×160 without enlargement, then encoded at quality 68, alpha quality 90 and effort 6. The original images remain intact; this is output sizing and compression. Replaced 256px derivatives are excluded from the build. Browser checks bound the combined decoded textures below the original three-sprite 256px allocation of 768 KiB.

## Placement and timing

- The draft displays decorations during October, using UTC. This is an implementation default pending the user's timing preference.
- The active `core-expansion-v1` topology has 1,536 placements across its 81 prepared maps, with 7–24 per map. Every map includes all seven types in its first seven placements. A deterministic shuffled palette varies their distribution between maps. Some repeated placements were removed to spread matching props farther apart. Future generated regions inherit their prepared template's placements. Authoritative map activation is unchanged.
- `node tools/build-halloween-map-decorations.js` creates the small layout file from the current client catalog, canonical city definitions, reviewed road samples and Clan Tower compound clearances. It never changes those inputs.
- Full sprite rectangles clear city art and flags, separate trees/bushes/rocks, objective art, Tower compounds and roads. Placements remain in the interior, away from baked edge forests, mountains, camp props and navigation arrows. Nearby decorations are at least 90 map pixels apart; matching prop types are at least 250 pixels apart to avoid repetitive clusters.
- Runtime also checks live city positions and current scenery bounds. Overlapping resource pickups hide the decoration until the pickup leaves; pickup rewards, timing and spawn rules are unchanged.
- Decorations are free environmental scenery. They add no shop item, troop skin, flag border, hit target or pathfinding obstacle.

## Loading and performance

- No animation, particles, filters, per-frame placement searches or extra game timers.
- At most 24 static images are attached to the active map. During pan/zoom, the existing camera state hides props after the first nine, keeping the original painting limit. All props return after movement settles. Map swaps replace the old layer. Optional layout loading has an eight-second timeout and a stale-map guard; it never blocks map readiness.
- Images use async decoding and low request priority. Missing images disappear; failed layouts can retry on a later map load.
- The versioned v3 layout retains schema 2's compact `[assetIndex, x, y]` tuples. The layout plus all seven sprites total 59,111 bytes, still bounded by the original 64 KiB validation gate. They are excluded from installation precaching and requested only during October.
- Pickup visibility uses the existing refresh path. An unchanged refresh writes no DOM attributes. Desktop and mobile synthetic checks ran 1,000 refreshes without mutations.

## Validation and review

- Static validation checks all 81 maps against 3,720 canonical city positions, existing scenery, roads, objectives and compounds. Rebuilding the layout must reproduce the committed output.
- Browser validation uses loopback fixtures at 1440×900 and 844×390. Seven representative maps include the Citadel, Stronghold, camps, Clan Tower and both New Lands layers. Maximum-stage city art, decoded images, click-through behavior, pickup suppression/recovery, seasonal removal, generated-template fallback, stale loads and optional-load failure/retry are covered.
- A separate performance comparison uses 40 maximum-level cities and 25 marching armies, at desktop and landscape-phone dimensions (phone device pixel ratio 2). It compares nine props with 24 at normal and 4× CPU throttling, while idle and continuously panning/zooming. Each configuration receives four three-second samples in repeated ABBA order; comparisons use the median. Relative gates allow host scheduling noise and measure added cost, not an absolute frame-rate guarantee. This sampling was extended after shorter runs gave inconsistent throttled results.
- The movement safeguard was added after the first rapid pan/zoom stress test exposed a hitch. The updated comparison passed all eight configurations. Functional checks verify that nine props remain during movement and 24 return afterward. Thirty repeated layer replacements leave one layer; 1,000 unchanged visibility refreshes produce no DOM writes.
- [Desktop preview](../../visual-qa/halloween-map-decorations/map-1440.png), [landscape phone preview](../../visual-qa/halloween-map-decorations/map-844.png), [browser results](../../visual-qa/halloween-map-decorations/validation.json).
- [Performance samples and comparisons](../../visual-qa/halloween-map-decorations/performance.json).
- These are synthetic browser checks. Physical phone frame rates and production deployment have not been verified.
