# Battle Reports draft verification

Checked the local approval draft in the in-app browser. These checks cover the isolated example UI, not production report integration or multiplayer behavior.

## Layout matrix

All eight examples were reviewed at desktop 1440×900, mobile landscape 844×390, and small landscape 568×320: standard, Realm Activity, empty, loading, reconnecting, long names/large armies, special outcomes, and unavailable Realm Activity.

- All 24 combinations fit their viewport without horizontal dialog/list overflow or broken image elements.
- Dialog sizes: 1200×700, 820×366, and 556×308 respectively.
- Filters and map, full-report, and View Location actions retain at least 44px control height.
- The list scrolls independently under fixed navigation. Small landscape has 172px of list height in the standard/long-name examples, with all five information columns retained.
- Visually inspected desktop dispatches and Realm Activity, mobile landscape, and small landscape long-name and proclamation examples.

## Interaction checks

- All / Attack / Defense / Scout display 9 / 4 / 3 / 2 example rows; Realm Activity displays three proclamations.
- The final dispatch is reachable by scrolling and its full-report action updates the review footer with the correct target.
- Escape closes the dialog, Reopen restores it, and visit highlights clear after reopening.
- Reconnecting retains nine saved rows. Retry disables during simulated loading and restores the example connection.
- Special outcome labels retain their distinct meanings, and an unavailable target has a disabled map action.
- No browser warning or error messages were reported during the review.

Detailed report screens and real navigation are deliberately pending their next design step. Physical-device and production integration checks belong to the implementation stage.
