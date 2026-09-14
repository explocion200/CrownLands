# Marches draft checks

Date: September 14, 2026. Browser: Codex in-app browser, local review page. Node: 22.23.2.

## Layout

All eight examples were checked at 1440 x 900, 844 x 390, and 568 x 320 (24 combinations):

- Dialog stayed within its viewport.
- March list and row cells had no horizontal overflow.
- Every enabled dialog button measured at least 44 x 44 CSS pixels.
- Every image loaded successfully.
- March counts matched the selected fixture; long lists and short screens scrolled.

Desktop, mobile landscape, small landscape, and the long-name sample were also inspected visually. This caught large troop counts wrapping mid-number. The force column was widened for those rows; the long-name/large-force sample was then rechecked at all three sizes. Full values including 999,999,999, 12,500,000, and 8,900,100 fit on one line without clipping or horizontal overflow.

On small landscape, keyboard scrolling reached the eighteenth march while the header and tabs remained in place. The empty-state action remains reachable by scrolling on short screens.

## Preview interactions

- Swift Order: sample inventory changed from 3 to 2 once; 5m 12s became 2m 36s; applied status replaced the Swift command. Item controls were disabled while the sample request was pending.
- Recall: sample inventory changed from 2 to 1 once; the row became Returning to Briarford, retained Ravenwatch as the recalled target, and showed the fixture return time of 1m 34s. Item commands were removed.
- Reset restored inventory and timer values. Reset during a pending action stayed restored after the old callback's deadline.
- Sending, Checking, Resolving, applying Swift, and recalling fixtures had no enabled item commands. Sending displayed Syncing for the unknown troop count and disabled its Map command.
- The no-items fixture displayed no Swift or Recall commands.
- Profile and current-position Map controls produced the intended preview feedback without navigation or game actions.
- Close, Reopen, Escape, and the empty-state Return to map action worked.
- Browser console inspection returned no errors or warnings.

## Scope of validation

Both draft JavaScript files passed `node --check`; the draft was served successfully by the existing local HTTP server. These checks validate an isolated UI prototype with synthetic data. They do not validate live march synchronization, production eligibility, inventory transactions, routing, server arrival times, or release readiness. Runtime integration and its required checks follow design approval.
