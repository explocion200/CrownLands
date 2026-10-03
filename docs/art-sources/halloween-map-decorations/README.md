# Halloween map decorations

Draft prepared on `codex/halloween-map-decorations`, in PR #430. Not merged or deployed to production.

## Artwork

Three transparent illustrations follow the user's medieval atlas reference: pumpkins, a harvest scarecrow and a rustic lantern post. Generated with the built-in `image_gen` tool. [prompts.json](prompts.json) contains the exact prompts; [assets.json](assets.json) records source paths, production paths, hashes, dimensions and byte counts. The original PNGs are preserved here. Production uses 256px WebP derivatives with alpha, totaling 34,588 bytes. Resizing and WebP encoding used Sharp; the artwork was not redrawn in code.

## Placement and timing

- The draft displays decorations during October, using UTC. This is an implementation default pending the user's timing preference.
- The active `core-expansion-v1` topology has 1,604 placements across its 81 prepared maps, with 7–24 per map, increased from 650. The original placements are retained. Future generated regions inherit their prepared template's placements. Authoritative map activation is unchanged.
- `node tools/build-halloween-map-decorations.js` creates the small layout file from the current client catalog, canonical city definitions, reviewed road samples and Clan Tower compound clearances. It never changes those inputs.
- Full sprite rectangles clear city art and flags, separate trees/bushes/rocks, objective art, Tower compounds and roads. Placements remain in the interior, away from baked edge forests, mountains, camp props and navigation arrows. Nearby decorations are at least 90 map pixels apart. The crowded Ironwatch map retains seven props because no more safe space was found.
- Runtime also checks live city positions and current scenery bounds. Overlapping resource pickups hide the decoration until the pickup leaves; pickup rewards, timing and spawn rules are unchanged.
- Decorations are free environmental scenery. They add no shop item, troop skin, flag border, hit target or pathfinding obstacle.

## Loading and performance

- No animation, particles, filters, per-frame placement searches or extra game timers.
- At most 24 static images are attached to the active map. During pan/zoom, the existing camera state hides props after the first nine, keeping the original painting limit. All props return after movement settles. Map swaps replace the old layer. Optional layout loading has an eight-second timeout and a stale-map guard; it never blocks map readiness.
- Images use async decoding and low request priority. Missing images disappear; failed layouts can retry on a later map load.
- The compact v2 layout stores `[assetIndex, x, y]` tuples. The layout plus the same three sprites total 56,692 bytes, only 1,219 bytes more than the first draft and still bounded by the original 64 KiB validation gate. They are excluded from installation precaching and requested only during October.
- Pickup visibility uses the existing refresh path. An unchanged refresh writes no DOM attributes. Desktop and mobile synthetic checks ran 1,000 refreshes without mutations.

## Validation and review

- Static validation checks all 81 maps against 3,720 canonical city positions, existing scenery, roads, objectives and compounds. Rebuilding the layout must reproduce the committed output.
- Browser validation uses loopback fixtures at 1440×900 and 844×390. Seven representative maps include the Citadel, Stronghold, camps, Clan Tower and both New Lands layers. Maximum-stage city art, decoded images, click-through behavior, pickup suppression/recovery, seasonal removal, generated-template fallback, stale loads and optional-load failure/retry are covered.
- A separate performance comparison uses 40 maximum-level cities and 25 marching armies, at desktop and landscape-phone dimensions (phone device pixel ratio 2). It compares nine props with 24 at normal and 4× CPU throttling, while idle and continuously panning/zooming. Each configuration receives four three-second samples in repeated ABBA order; comparisons use the median. Relative gates allow host scheduling noise and measure added cost, not an absolute frame-rate guarantee. This sampling was extended after shorter runs gave inconsistent throttled results.
- The movement safeguard was added after the first rapid pan/zoom stress test exposed a hitch. The updated comparison passed all eight configurations. Functional checks verify that nine props remain during movement and 24 return afterward. Thirty repeated layer replacements leave one layer; 1,000 unchanged visibility refreshes produce no DOM writes.
- [Desktop preview](../../visual-qa/halloween-map-decorations/map-1440.png), [landscape phone preview](../../visual-qa/halloween-map-decorations/map-844.png), [browser results](../../visual-qa/halloween-map-decorations/validation.json).
- [Performance samples and comparisons](../../visual-qa/halloween-map-decorations/performance.json).
- These are synthetic browser checks. Physical phone frame rates and production deployment have not been verified.
