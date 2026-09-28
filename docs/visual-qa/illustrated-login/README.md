# Illustrated login

## Design

The owner requested a new login background matching the supplied illustrated medieval map, removal of the right promotional card, and a layout that fits desktop and mobile screens.

The screen now uses an original ink-and-watercolor valley, an accessible HTML Crownlands title, and one parchment account panel. The scene covers the viewport with no fixed 4:3 frame. Landscape phones use compact spacing; portrait login is supported with a crop toward the castle. The existing portrait warning resumes after entering the game. Short screens scroll without clipping the title or covering account links with the audio/community controls.

Authentication, realm selection, loading, queue, verification, install, fullscreen, music, Discord, and information links retain their existing IDs and behavior. There are no new runtime scripts, timers, dependencies, gameplay rules, or backend changes. Artwork has no animation or backdrop blur.

## Artwork and provenance

Generated with the built-in `image_gen` tool using the owner's second attachment as an art-style reference. The first attachment supplied the old login layout. No external stock art was used. The original generated PNG is preserved at [kingdom-master.png](../../art-sources/login/kingdom-master.png) (1672 × 941; 3,613,838 bytes; SHA-256 `766514976ca94bb60568f14803db7545ed560f07ec4fbd2efcd4dbf48fc88371`).

Runtime exports use Sharp WebP quality 76, effort 6, proportional resizing without enlargement:

| Runtime file | Dimensions | Bytes | Use |
| --- | --- | ---: | --- |
| `assets/optimized/login-kingdom-960-6646f1d404b1.webp` | 960 × 540 | 166,370 | Landscape screens up to 900 CSS pixels wide |
| `assets/optimized/login-kingdom-1672-05a4bd4eda17.webp` | 1672 × 941 | 440,412 | Desktop and portrait; preserves detail when cropped to a tall screen |

The preloads and `<picture>` use matching media conditions. A fresh login requests one background variant. The small variant is precached; the large variant is cached on demand. The source PNG stays out of the production package. Historical login artwork remains in the repository and is excluded from the production package. Both new images plus CSS have a combined 600 KiB limit; a bounded 400 KiB net allowance covers the new artwork after retiring the old image from delivery. The total release-package ceiling is unchanged.

### Generation prompt

> Create a new original background illustration for the Crownlands medieval strategy game's login screen. Use the attached image ONLY as an art-style reference, not as an image to reproduce. Style: the same fine dark ink outlines, engraved hatching, hand-painted muted watercolor, softly textured parchment, subdued olive and moss greens, warm ochre fields, slate-blue river, pale grey stone. Elevated three-quarter aerial map view, entirely illustrated, no photorealism or 3D render. A beautiful expansive medieval kingdom: a detailed compact stone castle and timber village in the left third, an old stone bridge and winding blue river in the right third, cultivated fields and woodland around the foreground edges, distant jagged ink-drawn mountains across the upper edge. Restrained burgundy banners. Compose a wide landscape background, approximately 16:9, ideally 2048x1152 or larger. It must fill a desktop screen edge to edge and crop gracefully to mobile landscape and portrait. Leave the middle 35 percent of the composition relatively quiet meadow and subtle paths, without a large landmark, so a centered title and parchment sign-in panel can be placed over it in HTML. Place enough landscape detail around all sides for the environment to remain beautiful under responsive cropping. No text, no lettering, no logo, no borders, no UI, no panel, no vignette baked into the image, no characters in the foreground. Crisp and polished at full-screen scale; closely match the supplied illustrated map aesthetic.

## Validation

- `validate-login-layout-browser.js` renders the real HTML/CSS with deterministic account states at 1920 × 1080, 1440 × 900, 844 × 390, 667 × 375, 568 × 320, 390 × 844, 320 × 568, and 844 × 260. It checks background selection, full coverage, horizontal overflow, title reachability, visible control hit targets, account/verification/queue/loading states, and restoration of the gameplay orientation warning. Screenshots and the report are written to ignored `release-artifacts/illustrated-login/`.
- `validate-email-auth-browser.js` separately exercises real client/UI integration with mocked Firebase, including sign-up, sign-in errors/retry, verification, recovery, password linking, and short landscape layouts. No production account operations are performed.
- `validate-login-assets.js` checks artwork hashes, download limits, static presentation, accessible title, obsolete-background removal, stylesheet packaging, and cache wiring. The older Python title validator delegates to this contract because the title is now HTML.
- Existing affected UI, public-page, audio, production-build, and asset-budget checks remain part of the validation plan. The revised legacy assertions reflect the requested removal of the promotional card and fixed artwork frame.

### Existing budget baselines

The broad asset audit initially stopped on two pre-existing limits. At base `5fa1b5e040a445147c4d3310a49de28e09748200`, chat/reward files already total 120,130 normalized bytes against 118,784, and `game.js` already totals 1,930,758 against 1,926,144. This branch does not change those runtime files. Their individual limits are brought in line with the existing release using bounded increases of 2 KiB and 5 KiB respectively. The global installation-cache ceiling and map/image limits are unchanged. The login stylesheet has an 8 KiB cap; the new background variants have independent byte limits.

The full installation cache is approximately 4.19 MiB and remains under the existing ceiling. The redesign reduces the precached background from 207,278 to 166,370 bytes; desktop uses a larger, more detailed on-demand background. These are transfer-size checks, not a measured claim about FPS.

Physical iPhone/Safari testing remains a manual check. Browser device emulation verifies layout and interaction geometry but cannot reproduce the OS keyboard, notches, or Safari behavior completely. Merge and deployment are separate from this implementation.
