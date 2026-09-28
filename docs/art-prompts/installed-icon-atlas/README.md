# Installed-game icon: atlas v1

The September 28, 2026 user-approved atlas artwork supersedes the older Pass 3G installed-icon direction for the game launcher. It preserves the floating gold crown, three slate roofs, burgundy pennants and olive painted landscape.

## Sources and exports

- master.png: approved installed-icon atlas v4, copied without pixel changes.
- maskable-master.png: built-in imagegen framing adaptation; crown and castle fit within the central Android safe circle. Scenery may be cropped by launchers.
- Runtime PNGs: assets/icons/atlas-v1/, normal 192/512, maskable 192/512, Apple 180 and favicon 32.
- Technical exports: Lanczos3 downsampling with Sharp 0.35.4, opaque RGB, adaptive PNG palette (quality target 55, effort 10), dithering 0.2, compression level 9. No runtime dependency was added.
- Both source masters stay under docs and are excluded from the production artifact. The six derivatives are requested only as needed, outside the gameplay service-worker precache.
- Existing unversioned icons remain available for public-page branding and older clients. No public-page redesign or notification badge change is included.

## Integration and update behavior

The installed app still has id /play/, start_url /play/, scope /, standalone display and landscape orientation. Its manifest remains at manifest.webmanifest. New atlas-v1 icon URLs bypass previous immutable image caches and allow browsers to detect the identity change. Keep these URLs immutable; a later revision needs a new path.

After deployment, fresh installations use the new artwork. Existing installs are controlled by their browser and operating system:
- Chrome 144+ supports optional name/icon updates through its Review app update menu; a visibly different icon can require user acceptance. Icon URL changes are necessary for detection.
- Android WebAPK installations can receive the update after the browser checks the manifest, with timing and approval dependent on browser/version.
- Existing iOS/iPadOS Home Screen apps may need to be added again to obtain updated icon metadata.
- Other browsers and manually created shortcuts are not guaranteed to refresh automatically.

References checked September 28, 2026:
- [Chrome 144 update behavior](https://developer.chrome.com/blog/improvements-to-web-app-updates)
- [Platform-specific PWA metadata updates](https://web.dev/learn/pwa/update)
- [Apple touch-icon configuration](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)

No merge, deployment, production icon update or physical-device upgrade has been performed as part of preparing this artwork. Actual OS launcher update behavior requires post-deployment verification.

## Validation evidence

- Production artifact validation passed: 58.11 MiB base plus 16.59 MiB lazy world, within unchanged budgets.
- All six runtime PNGs total 309,370 bytes, with no transparent pixels when decoded in Chromium.
- Existing PWA routing/offline checks passed with the new manifest URLs.
- Browser checks passed at desktop 1200x820 and landscape mobile 844x390. The built /play/ HTML resolves its manifest and icon links correctly; the served icon bytes match the source exports. Square, rounded, circular and 40%-radius safe-circle previews preserve the crown and castle. Small-size previews were checked at 64/48/32/16 CSS pixels.
- Physical installed-device update/review behavior remains a post-deployment check.
- An extra full asset-budget audit exposed an existing main-branch failure: unchanged game.js is 1,931,708 normalized bytes, 444 bytes above its 1,886 KiB limit. Its bytes match the base commit exactly. This icon update does not change that file or loosen budgets.

## Maskable framing prompt

Use case: precise-object-edit. Create the Android maskable launcher version of the supplied approved Crownlands installed icon. One framing change only: shrink the entire original artwork uniformly to approximately 88% of its current size around the center, then seamlessly extend the existing olive painted terrain into the outer margins to fill the original square. Preserve the exact crown design, floating crown, three slate-roofed stone towers, burgundy flags, banners, trees, river, path, palette, ink lines and painting style. Do not redesign any objects or crop the original crown/castle. Crown tip must be at least 14% of image height from top, and all castle walls and crown must lie within the imaginary centered circle of radius 39% of square width. Retain opaque full-bleed square edges without drawn borders, circles, transparent corners, lettering, frames, or mockups. This is a companion app-mask version of the approved art, not a new design.

## Approved installed master prompt

Use case: precise-object-edit / logo-brand.
Asset: ONE finished square installed-game icon for Crownlands, adapted faithfully from the supplied preferred social-media artwork.

The attached image is the edit target and the definitive style reference. Keep its identity: the antique GOLD CROWN FLOATING ABOVE a pale limestone castle with THREE SLATE-BLUE CONICAL ROOFS, small BURGUNDY FLAGS and two burgundy fleur-de-lis banners. Keep the warm, finely inked, hand-painted medieval atlas illustration, olive parchment land, a few dark conifers, and muted blue river. Do NOT redesign it into a crown attached to a roofless keep. Do NOT introduce a red background.

Adapt the composition for an installed app icon:
- Compact and center the crown-and-castle grouping. Give the castle a clear, broad silhouette and a prominent dark arched gate. The three slate roofs remain distinct. Bring the floating crown a little closer to the central flag without touching it.
- The complete essential subject, including the gold crown, all castle towers and banners, occupies about 60% of the square's width and 68% of its height. Crown tip about 15% from top; castle bottom about 81% from top. Keep all essential subject detail inside an imaginary centered circle of radius 39% of canvas width. Do not draw that circle.
- Simplify the fine masonry, roof-tile lines, crown engraving and tiny foliage just enough to remain legible as a small phone/desktop icon. Strong dark umber outlines, broad warm light stone surfaces, clear slate roofs and an unmistakable bright gold crown. Preserve the distinctive architecture and painted, aged character of the source.
- Let the surroundings recede: a few grouped dark conifers frame the castle base, a short ochre approach path, quiet rolling olive land and one subtle muted blue river behind the castle. Remove the crowded tiny forests, abundant rocks and busy contour lines. Background contrast stays lower than the castle and crown.
- Fill the entire SQUARE canvas with olive parchment landscape and softly darkened olive outer edges. No hard circular vignette boundary, oval rim, drawn frame, pre-rounded corners, white border, or transparent corners. The device will supply its own app mask.

Faithfully use the reference's moss/olive, parchment, antique gold, slate blue, dark umber and muted burgundy palette. Painted medieval strategy game character, restrained natural colors, readable at small size. No lettering, initials, wordmark, watermark, UI, mockup, extra panels, photorealism, modern glossy 3D, plastic, neon or flat vector redesign. Full-bleed opaque square PNG artwork.
