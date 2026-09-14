# Settings ledger draft

Status: approved and integrated on `codex/settings-ledger-draft`; release verification is separate from approval.

Open `/docs/visual-qa/settings-ledger/index.html?viewport=desktop` on the repository preview server. Review controls select desktop (1440×900), mobile landscape (844×390), and small landscape (568×320). Start the existing preview server with `node tools/map-benchmark/start-server.js 61703` if necessary.

The window matches the approved Profile, Skills, and Clan dimensions: maximum 1200×700, 24px screen margins, and 12px margins at small landscape. Audio is grouped in the left column; motion and notifications in the right. First steps/help and Privacy remain at the bottom of their columns. Mobile retains both columns and one shared scroll area beneath the fixed header. Buttons and volume sliders have at least 44px touch height.

New repo-native SVG emblems depict a lute, drum, banner, bell, sealed parchment, and warded key. They use ink outlines, aged brass, wood, olive cloth, and burgundy wax. The existing Royal Bailey backdrop is reused. No new raster art or external media is required.

## Existing controls and states

Sources: `index.html` Settings markup, `game.js` notification UI and animation preference functions, `audio-manager.js` volume/mute behavior, and the Master Specification guidance policy, inspected from base `1b8aef5adaf32953f63b8c37341c6f60fa1a08ff`.

- Music and Effects retain independent 0–100 volume values and mute toggles. Mute preserves volume. The initial example uses the existing markup's 70% / 80% values; these are example settings, not changes to stored defaults.
- Full, Reduced, and Off animation choices retain their meanings. The automatic example displays the existing motion/performance preference explanation. Selecting a choice marks it explicit in the draft.
- Notifications retain On/Off and existing status labels: Blocked, Connecting, Retry needed, Offline, Unavailable, HTTPS required, and Missing key. Unsupported/offline/connecting states disable both choices; Blocked disables On while leaving Off available. Retry allows an in-memory retry preview.
- First steps & help remains an action to the existing guidance. The draft reports its intended navigation in the outer review status without changing guidance. Privacy links to the existing public policy. Profile/Clan/Skills navigation is represented in the outer review status.

## Approval boundary

The original `preview.html` remains isolated and uses in-memory examples. Production uses the approved markup in `index.html`, scoped `settings-ledger-ui.css`, and `assets/icons/settings-ledger.svg`, with existing game/audio handlers. Normal On/Off notification status retains the game's existing hidden behavior; exceptional statuses remain visible. Audio synchronization also updates visible mute labels and channel status without changing stored preferences or playback rules.

For an actual-game review with mock services, run `node tools/prepare-settings-ledger-preview.js` and open its printed localhost URL. `runtime-fixture.js` is restricted to the local benchmark and is excluded from production packaging.
