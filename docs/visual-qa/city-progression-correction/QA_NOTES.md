# City Progression Correction QA

## Reviewed

- Accepted five-stage candidate as one family before installation.
- Compared old and corrected art side by side.
- Inspected every corrected RGBA source on a checkerboard.
- Reviewed all five stages at their actual desktop HUD wrapper sizes.
- Verified fixed source and optimized canvases, alpha, manifest mappings, and runtime references.

## Corrections Passed

- All five stages use one elevated camera, natural lighting direction, Crownlands masonry, timber, roof, road, and heraldic language.
- Exterior bushes and detached foliage were removed. Each stage has one connected, compact visible component at the production alpha threshold.
- Visible source heights increase from 500 to 555 to 610 to 645 to 750 pixels.
- Runtime wrapper sizes remain unchanged. Combined art and wrapper scaling makes both visible width and visible height increase at every stage.
- Stage 5 gains layered walls, a denser urban core, and a dominant upper keep. Its calculated desktop visible height is more than 15 percent greater than Stage 4.
- The authoritative source files and optimized runtime derivatives use fixed transparent canvases, preventing automatic trimming from erasing the intended scale progression.

## Runtime QA

- Automated asset-path, alpha, dimension, stage-size, manifest, and game-reference validation passed.
- Desktop `1440x900`: all five stages were present in the actual Ashenfen March renderer. Art remained grounded, readable, unclipped, and compatible with city labels, flags, troop counts, owner states, and selection rings.
- Android landscape `844x390`: live map rendering passed with all city images loaded at `256x256`; body dimensions remained exactly `844x390` with no horizontal or vertical document overflow. Existing compact wrappers and 58px city hit areas were preserved.

## Remaining Review

- Tiny people, carts, and courtyard details intentionally remain inside settlement walls; these are part of the inhabited-city treatment rather than detached exterior decoration.
- Final subjective approval remains with the user after inspecting the in-game screenshots or local game.

## Payload Record

| Stage | Previous source | Corrected source | Previous runtime | Corrected runtime |
| --- | ---: | ---: | ---: | ---: |
| 1 | 257,477 B | 387,645 B | 23,622 B / 256x185 | 16,858 B / 256x256 |
| 2 | 294,094 B | 485,686 B | 27,036 B / 256x204 | 20,544 B / 256x256 |
| 3 | 373,107 B | 591,842 B | 28,364 B / 256x214 | 22,982 B / 256x256 |
| 4 | 472,506 B | 668,018 B | 33,876 B / 249x256 | 25,282 B / 256x256 |
| 5 | 478,045 B | 825,668 B | 31,044 B / 237x256 | 30,194 B / 256x256 |

The source masters are larger because they now use higher-resolution fixed canvases. Every optimized gameplay file is smaller than its prior derivative despite retaining the intentional square canvas.

## Validation Record

- Passed: JavaScript syntax for `game.js` and `service-worker.js`.
- Passed: city progression art validator, map image loading, runtime, production artifact, public site, animation, daily login rewards, login resilience, patch notes, instant economy actions, and `git diff --check`.
- Passed: production build, 237 files / 21.30 MiB; post-build artifact validator, 238 files / 21.32 MiB.
- Known unrelated guardrail: `game.js` is 1606.4 KiB against its 1600 KiB source budget. All `city-object` files pass their new 64 KiB per-file budget.
- Known unrelated validator failure: audio delivery's synthetic HTTP 206 passthrough assertion reports status `0` instead of `206`; this pass did not alter audio or service-worker fetch behavior.
