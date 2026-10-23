"use strict";
// Existing approved shell limit, shared by both validators to prevent drift.
// The allowance history is documented in validate-asset-performance-budgets.js.
// Knight catalog/painter integration adds at most 24 KiB; city art stays lazy.
// Inner Castle HUD entry adds 1,442 normalized bytes across both HTML entries,
// game.js and HUD CSS. Bound that shell growth at 2 KiB; its art stays lazy.
// Guild entry declarations and its report API add less than 2 KiB to the shell.
// The four Guild modules and all 42 paintings load only with the estate UI.
// Marauder targets and the permanent stamina HUD add five compact shell files
// plus order/report wiring. Measured shell: 4,512,281 bytes (19,993 above
// the previous cap). Bound this feature at one 24 KiB step; NPC art stays lazy.
// Reusing city target controls adds scout-state and spawn-selection wiring.
// Bound the offline-shell refinement at 4 KiB; no new assets or requests.
// Defeated markers, server-clock countdowns and the bounded deadline wake-up
// add at most 4 KiB. The two defeated sprites remain outside installation cache.
// The shared Guild palette, framed X and header clearance add under 3 KiB,
// offset by removing obsolete paint. No new assets, requests or runtimes.
// Production-local backend selection adds 161 bytes to the shared client,
// bringing the measured source shell to 4,528,276 bytes. Bound this at 512
// bytes; local transport/bootstrap modules remain outside the default shell.
// Approved named HUD buttons add 1,771 source bytes across both HTML entries,
// HUD CSS and the worker cache URL. Bound this at 2 KiB; image assets stay lazy.
// Shared parchment resource/display controls add 287 CSS bytes and no assets.
// Bound the required shell growth at 512 bytes; all other limits remain fixed.
// Once-per-season login reminder adds 966 source bytes; bound growth at 1 KiB.
// Scoped clan-shield previews and stale subscription guards add 2,890 source
// bytes. Bound growth at 3 KiB; no new assets, dependencies or requests.
// Friends/private messaging adds two compact shell modules, minified in production.
// Bound the complete UI, bridge and markup addition at 24 KiB; no new art.
// Indexed card selectors preserve specificity; bounded route pruning adds no
// assets or requests. Combined raw shell growth is 7,974 bytes (about 1.7 KiB
// deflated). Bound that CPU-saving tradeoff at 8 KiB.
// Ownership-triggered roster refresh and stale-read protection add 1,633 bytes.
// Bound this at 2 KiB; no new assets or dependencies enter the offline shell.
// Shared square location controls bring the source shell to 4,573,780 bytes,
// 3,668 over the prior cap. Bound this at 4 KiB; the 14.4 KiB art stays lazy.
// Compact inline friend actions add 767 shell bytes; the prior cap covers 428.
// Allow the remaining 339 bytes within a 512-byte step, with no new assets.
// Scoping zoom hit sizes to actual targets saves map-wide style work and adds
// 550 source bytes. The previous cap had 3 bytes free; bound the 547-byte
// overage within 1 KiB. No new requests, assets or runtime dependencies.
// Full-size stamina finder and fresh all-map reads add 7,741 delivered shell
// bytes; bound the 7,264-byte cap overage at 8 KiB. Reuse existing art and
// backend read batches; no new subscriptions or installed dependencies.
// Approved balance v2 adds 10,801 shell bytes for the fixed table, versioned
// loot/contribution helpers and disclosures (measured 4,593,808 bytes total).
// Bound its 9,872-byte cap overage within 12 KiB; no new assets or requests.
// Shared numbered notifications add at most 4,465 shell bytes (4,599,259 total).
// Bound the at-most 3,035-byte cap overage at 3 KiB. The shared stylesheet is 2 KiB;
// no image assets, dependencies or background polling are introduced.
// Clan action notices add 5,095 shell bytes (4,604,354 total), bounded by 5 KiB.
// Reuse existing styles, subscriptions and the one-second clan tick; no new assets.
// Full personal boss rewards and departure-policy compatibility add 1,412 delivered
// shell bytes (4,605,742 total). Bound the 1,326-byte overage at 2 KiB;
// no new art, network requests, dependencies or background work.
// Location sharing adds 19,174 delivered shell bytes (4,625,078 total), bounded
// by 20 KiB. Reuse existing lazy artwork; resolve only on click, with no polling.
// Readable links and an inline recipient list add 2,622 bytes (4,627,700 total).
// Existing headroom covers 1,866 bytes; bound the remainder at 1 KiB.
// Camp map banners add 400 net shell bytes (4,628,100 total). The 2,284-byte
// four-flag sprite loads on demand; add only 512 bytes of shell headroom.
// Continuous-world NPC countdowns and one-shot deadline wake-up add 1,043
// delivered bytes (4,629,522 total), 1,042 above the previous cap. Bound this
// repair at 1.5 KiB; reuse the combat tick with no new polling, art or libraries.
// Approved readable castle controls add 1,818 scoped CSS bytes (4,631,340 total).
// Existing headroom covers 494; bound the 1,324-byte overage at 1.5 KiB.
// No new precache entries or artwork; silhouette logic stays in lazy world code.
// Stables preview/share navigation and local private signal adapters add bounded shell
// integration (4,641,036 measured bytes; 9,484 above the prior cap). Allow 10 KiB.
// Both new building UI modules and all eight sprites load on demand.
// Free daily stamina/reset countdown adds 2,125 delivered shell bytes (4,643,831
// total). Existing headroom covers 86 bytes; bound the 2,039-byte overage at 2 KiB.
// No assets, libraries or normal-day polling are added.
// Responsive War Room markup and refresh identity add 2,890 delivered bytes
// (4,646,721 total). Bound the 2,881-byte overage at 3 KiB. Styles remain lazy;
// no new assets, dependencies, requests or subscriptions.
// War Cities adds under 8 KiB for its private on-demand board, confirmation and
// scope-safe refresh. No artwork or dependencies; polling runs only in the open tab.
// Lost Holdings availability reuses its private paged read and shared badge.
// The open-window refresh adds about 3 KiB of source; existing headroom covers
// part of it. Bound the remaining shell growth at 2 KiB, with no new assets.
// Lost Holdings text history adds 1,834 client bytes; bound residual cache growth at 1.5 KiB.
// Clan loading recovery adds 1,272 bytes; bound the 851-byte cache overage at 1 KiB.
// It reuses existing subscriptions and adds no assets, dependencies or polling.
const MAX_INSTALL_PRECACHE_BYTES = 1024 + 1536 + 2 * 1024 + 8 * 1024 + (3784 + 36 + 44 + 32 + 100 + 40 + 16 + 128 + 4 + 4 + 3 + 52 + 4 + 64 + 48 + 24 + 2 + 2 + 24 + 4 + 4 + 3 + 2 + 3) * 1024 + 2048 + 24 * 1024 + 8 * 1024 + 2 * 1024 + 4 * 1024 + 512 + 1024 + 8 * 1024 + 12 * 1024 + 3 * 1024 + 5 * 1024 + 2 * 1024 + 20 * 1024 + 1024 + 512 + 1536 + 1536 + 10 * 1024 + 2 * 1024 + 3 * 1024;
module.exports = { MAX_INSTALL_PRECACHE_BYTES };
