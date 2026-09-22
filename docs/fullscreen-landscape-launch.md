# Fullscreen and landscape launch

The game manifest requests `fullscreen` with `landscape` orientation. Browsers that do not support that display mode use the standard standalone/browser fallback. The manifest identity, start route and scope remain `/play/`, `/play/` and `/`; fullscreen-installed homepage shortcuts receive the same game-entry recovery as standalone shortcuts.

On mobile, or in an installed desktop app, pressing an entry control requests fullscreen synchronously before login awaits. Automatic entry uses the first non-control gameplay pointer release instead. The attempt happens once per page load and never repeats after the player exits fullscreen. The existing fullscreen button remains an explicit retry. Installed mobile launches also request a landscape lock at startup; entering fullscreen retries the lock for platforms that require it. Failed or unsupported APIs do not block login.

Portrait fallback retains the existing landscape-only game policy. It now offers a reachable Start landscape button, manual-rotation guidance and the canonical install link. `viewport-fit=cover` lets the existing safe-area padding account for notches when fullscreen uses the full display.

## The white address strip

The screenshot shows browser-owned navigation chrome. The existing legacy-host redirect moves an older installation from `game.playcrownlands.com` or `crownland.netlify.app` to the canonical `playcrownlands.com` origin. Browsers can show an out-of-scope toolbar for this navigation; CSS cannot hide it or expand an installed app across origins.

For an old installation, open `https://playcrownlands.com/play/` in the normal browser and install Crownlands there. Remove the old shortcut without choosing any option to clear website data. Browser-managed installation migration may require signing in again. This change does not uninstall apps, clear storage or modify player data.

## Verification and limits

Focused tests cover canonical and legacy launch routing in browser/standalone/fullscreen/iOS modes, fullscreen activation before asynchronous entry, rejected/missing APIs, desktop behavior, duplicate lock requests, explicit exit and desktop/mobile/portrait controls. Automated browser testing verifies page behavior, not OS chrome or physical rotation.

Release QA must check a fresh Android installation, an existing installation update, iPhone/iPad Home Screen launch, browser-tab entry, fullscreen exit/retry and notched-device safe areas. iPhone/iPad and ordinary browser tabs may require manual rotation or Home Screen installation; automatic landscape and permanently hidden browser/system UI cannot be guaranteed by a web page.

References: [manifest display fallback](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/display), [fullscreen activation](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen), [orientation locking](https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock), [multi-origin installed apps](https://web.dev/articles/multi-origin-pwas).
