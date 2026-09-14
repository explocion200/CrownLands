# Settings draft review

Reviewed locally on September 13, 2026, in the in-app Chromium browser. These checks cover the isolated in-memory draft, not production preference persistence or multiplayer behavior.

## Layout

| Review viewport | Settings window | Content height / visible scroll area | Result |
| --- | --- | --- | --- |
| Desktop 1440×900 | 1200×700 | 608 / 608 px | All settings fit without scrolling |
| Mobile landscape 844×390 | 820×366 | 462 / 304 px | Two columns, one vertical scrollbar |
| Small landscape 568×320 | 556×308 | 506 / 248 px | Two columns, one vertical scrollbar |

- The automatic reduced-motion explanation increased the small-landscape content to 516px and stayed fully readable.
- Inspected windows, scroll bodies, and controls had no horizontal overflow at any reviewed size.
- Every button, link, and volume-slider target was at least 44×44px at all three sizes.
- Scrolling small landscape to the bottom exposed both First steps & help and View Privacy Policy. The header and its Close control stayed visible.
- All six SVG emblems rendered; the browser reported no warnings or errors during this review.

## Interactions

- Keyboard Home/ArrowRight changed Music from 70% to 1%; muting retained 1% and left Effects at 80%.
- Effects could be muted, changed to 100% with End, and unmuted while retaining 100%.
- Selecting Reduced updated its pressed state and status. Selecting Notifications On updated the example state without requesting permission.
- Blocked disabled only On. Connecting, Offline, Unavailable, HTTPS required, and Missing key disabled both notification choices. Retry needed kept the choices enabled.
- The automatic example displayed the existing motion/preference explanation; muted examples preserved the independent volume settings.
- First steps & help reported the preserved navigation in the review status. Privacy points to the existing `privacy.html` page.
- Escape closed Settings and focused Open Settings. Reopening preserved the draft selections. Reset/example selection restored its initial values.
- JavaScript syntax, SVG XML parsing, and whitespace checks passed.

Production files, accounts, saved settings, notification permissions, and audio playback were not changed. Integration, real persistence/permission checks, PR gates, and deployment follow approval. No physical-device test was performed.
# Production integration checks

- Actual game inspected at desktop 1280×720, landscape 844×390, and small landscape 568×320. Both columns and fixed navigation remain visible; the shared content area scrolls without horizontal overflow. Small landscape window: 556×308; content: 249px client height / 506px scroll height. Visible controls retain at least 44×44px targets; sliders are 44px tall.
- Music changed to 1%, then muted; Effects stayed 80%. Reload retained 1%, muted Music, 80% Effects, and explicitly selected Reduced motion. Effects changed to 100% while muted and retained that value when unmuted.
- First steps & help opens the existing help modal; Close returns to Settings. Profile and Skills navigation still works, the Settings key stays hidden on Profile, and returning to Settings retains preferences. Privacy retains the existing policy URL and new-tab security attributes.
- Missing-key notification state disables both choices and displays its status. The remaining permission/connection behavior uses unchanged game handlers; draft state review covers long/error text. No real notification permission, token registration, or production account mutation was performed.
- No browser warning/error entries during the actual-game review. Audio contract, persistent audio/lifecycle suite, asset budgets, manuscript contract, and production artifact checks passed before the required PR pipeline. Physical-device verification remains manual.
