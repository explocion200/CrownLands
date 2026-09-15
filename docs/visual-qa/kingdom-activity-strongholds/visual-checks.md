# Strongholds draft visual checks

Checked September 15, 2026 against base `81a35aed85301606fc4147294bef57ef0f297d9c`.

This is isolated browser design QA using synthetic data. No production game, backend or player account was loaded.

## Results

| Review screen | Window | Seven samples | Controls and overflow |
| --- | --- | --- | --- |
| Desktop 1440 × 900 | 1200 × 700 | Passed | Enabled dialog controls at least 44 × 44; no horizontal overflow |
| Landscape 844 × 390 | 820 × 366 | Passed | Enabled dialog controls at least 44 × 44; no horizontal overflow |
| Small landscape 568 × 320 | 556 × 308 | Passed | Enabled dialog controls at least 44 × 44; no horizontal overflow |

- All 21 combinations retained the selected sample and expected row count: 4 standard, 5 citadel/long, 1 crown/single, 2 zero, 0 empty. The five Crown bonus labels appeared in every applicable sample.
- No missing displayed images or horizontal overflow in identity, specialization, garrison or defense cells. Full garrisons up to 4,294,967,295 fit; long names and map labels wrap.
- Four normal desktop rows fit inside the 431px ledger without scrolling. All five objectives use the same fixed window with a scrolling list. Landscape and small landscape ledgers are 186px and 132px tall respectively.
- On small landscape, the Crown row uses additional vertical space for all five bonuses. Keyboard End brought the final Upgrade cost label fully inside the ledger; Map stays available near the top of the row.
- Scrolled the small-landscape long-name sample to the final Ironwatch row. Map showed Ironwatch of the Southern Borderlands and The Southern Borderlands of Ironwatch in the disclosed preview. Back to Strongholds restored the originating Map button's focus and remained at the end of the list (528px after wheel scrolling, 524px after browser click/focus positioning).
- Close and Open Kingdom Activity successfully closed and reopened the dialog. The empty Return to map action returned to the backdrop and focused Open Kingdom Activity.
- Return to map was fully inside the visible empty ledger at all three sizes, with a 44px button height and no empty-state scrolling.
- Visual inspection covered desktop standard and Citadel, mobile landscape Citadel, and small landscape long names and the final Crown bonus. Browser warning/error log was empty.
- JavaScript syntax checks passed for `preview.js`, `review.js`, and `fixtures.js`. Local preview returned HTTP 200. Whitespace checks passed.

## Review boundary

This draft does not prove production ownership, clan bonus calculations, map loading or reconciliation behavior. Physical-device checks and the required PR/release gates remain part of the final combined Camps/Strongholds implementation after design approval. No production deployment was performed.
