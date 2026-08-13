# PWA Entry Routing QA

## Route Contract

- Normal website root: `/` rewrites to `home.html` and remains the public Crownlands site.
- Game entry: `/play/` rewrites to the existing `index.html` login/realm flow.
- Installed app identity and launch: manifest `id` and `start_url` are `/play/`; `scope` remains `/`; display mode is `standalone`; orientation remains `landscape`.
- The public homepage intentionally does not link the manifest. The game entry does, so Android/desktop installation and iOS Add to Home Screen are initiated from the correct route.
- Google authentication, redirect completion, Firebase session state, and Enter Kingdom behavior are unchanged.

## Navigation Fallback

The service worker now chooses fallback by route. Offline `/play/` or `/index.html` navigation may use cached `index.html`. Public `/`, `/about.html`, and other public navigations use only their exact cached response and cannot fall back to the game shell.

## Browser QA

- Rewrite-aware local production server: `/` returned `Crownlands | Free Medieval Multiplayer Strategy Game`; `/play/` returned `Crownlands - Medieval Island Conquest`.
- Live production before deployment: the same root/game split was confirmed on `https://playcrownlands.com/` and `https://playcrownlands.com/play/`.
- Signed-out `/play/`: Google sign-in was visible; no forced sign-out or bypass was introduced.
- Google handoff: popup fallback appeared and the existing same-tab redirect path was invoked without an application error. Account selection was not completed because QA must not choose the user's Google account.
- Public `/`: no Google-login control and no manifest link were present; Play buttons link to `/play/`.
- Desktop `1440x900` and Android landscape `844x390` screenshots are stored in this folder.

## Device Boundary

An OS-level installed app could not be installed and relaunched automatically from this environment. Android, iOS, Windows, and macOS launch behavior is covered by the same standards contract (`start_url`, `id`, `scope`, display, service-worker scope, and route rewrite), but final physical-device launch remains a deployment smoke test.
