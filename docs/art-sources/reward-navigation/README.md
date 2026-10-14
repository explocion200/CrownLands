# Reward navigation artwork and frame

The owner requested these presentation changes on October 14, 2026. Implementation does not establish deployment.

Leaderboard and Daily Login headers reuse the exact illustrated HUD button images. Daily Login's tab uses that same calendar. Quests and Achievements receive original ink-and-watercolor scroll/quill and crowned-shield illustrations, guided by the owner's uploaded medieval kingdom map (`225787.jpg`). Each new illustration appears in its tab and header.

The built-in `image_gen` tool generated the two images with transparent backgrounds. [prompts.json](prompts.json) preserves both complete prompts. [assets.json](assets.json) records the final workspace paths, dimensions, source/output SHA-256 hashes, byte counts and alpha verification. Runtime WebP encoding resizes the complete canvas to 384 × 384 at quality 0.85 without cropping or modifying the artwork. The original generated PNGs remain in the local generated-images folder and ignored review artifacts. Both final assets are under `assets/optimized/` and load only when the reward UI opens.

The existing outer window already had the same declared dimensions across tabs. Daily Login alone retained a desktop scrollbar gutter, making its inner frame 15px narrower; Quests/Achievements also used 56px/52px mobile headers against Daily Login's 50px. One shared frame now owns dimensions, gutter behavior, header height and navigation/close placement. Obsolete per-tab frame and seal styling is removed. Daily Login retains its 1200 × 790 maximum and 12px viewport inset. Existing rewards, progression, claims and timers are unchanged.

`tools/validate-reward-window-layout-browser.js` exercises the actual UI with synthetic local fixtures at desktop and two landscape-mobile sizes, in and out of fullscreen. It compares tab geometry, checks matching images and control separation, verifies scroll reachability, and uses keyboard and native mouse/touch navigation and dismissal. Screenshots and measurements are saved under ignored `release-artifacts/reward-window-layout/`.
