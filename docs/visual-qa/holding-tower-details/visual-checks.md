# Clan Tower draft verification

## Personal orders and player flags follow-up

Checked locally on 2026-09-16 after the user confirmed individual Attack/Move actions and a flag/name/troops roster.

- Preview, fixture and new order-adapter scripts passed `node --check`; `git diff --check` passed.
- The three fixture flags render with the game flag modules and existing symbol sprite. Desktop and scrolled small-landscape rosters visually show the flags beside player names and counts, without per-player command buttons.
- Nine focused geometry checks covered Garrison, Attack and Move at 1440 × 900, 844 × 390 and 568 × 320 with twelve long player names and large troop counts. The roster and order body had no horizontal overflow; footer buttons remained within the viewport, at least 44px high. The long roster remains scrollable.
- Attack and Move reuse the approved city sliders. Keyboard Home selects one troop; End selects only the player's contribution (685,200 in the standard example; 12,345,678 in the long example), never the combined clan garrison. Both slider icons were visually confirmed after loading.
- Changing attack/move destinations preserves the troop selection. The source remains the Clan Tower with Wall 12; destination cities show their levels. Attack exposes the own-army power breakdown and an unknown enemy forecast. Move with 685,200 selected updates the two destination examples to 870,200 and 779,200 troops respectively.
- Preview confirmations and Back/Escape navigation leave all garrison contributions unchanged. Reopening switches cleanly between Attack and Move. No Swift March consumable control is presented for the Tower order.
- Empty and probation examples disable personal Attack/Move. The eligible ordinary-member example enables both. Rival examples hide Move and keep their contribution rosters private; scouting reveals only total defenders.
- Final browser error log was empty. Image probes found all order images loaded; one immediate screenshot caught the prior header icon while a replacement loaded, and a subsequent inspection confirmed the correct crossed swords.

These are local draft checks, not authenticated multiplayer or release validation. The original layout verification below is retained as historical coverage; its explanatory-only withdrawal dialog has been replaced by the interactive personal order preview.

## Original layout and terminology checks

Terminology follow-up: the user confirmed **Clan Towers**. Updated the review title, category header, accessibility labels and design notes, and clarified **Military orders** as **Troop Actions**. The preview script passed its syntax check, the diff passed whitespace checks, and a browser reload confirmed the new category and action heading. No layout or gameplay logic changed.

Checked locally on 2026-09-16 using Node.js 22.23.2 and the Codex in-app browser at `127.0.0.1:61703`.

- All three scripts passed `node --check`.
- Fixture inspection matched four Tower IDs, names and regions against `functions/holding-towers.js`; map names matched the current Core region JSON. All four illustration paths matched the Core catalog, map backdrops exist and all six icons exist. Nineteen fixtures passed garrison sums, private roster/count boundaries and the ten-level queue bound.
- Twelve browser geometry checks covered four tabs at 1440 × 900, 844 × 390 and 568 × 320 with long names and large numbers. Dialog and footer stayed within their viewport, content panes/cards had no horizontal overflow and visible controls retained at least 44px height. Referenced images loaded.
- Checked the other seventeen examples through the Overview and Walls & Veil panels. Neutral, enemy and Veil-blocked views withheld defender totals and private Treasury/queue controls. Scouted revealed the total without Treasury. Member/probation views withheld spending controls; probation disabled military access. Damage, active repair, incoming attack, full queue, low funds, active Veil and spent Veil disabled the corresponding actions.
- Checked upgrade selection with three wall levels: the local dialog retained the selection and clearly distinguished the next-level price from a complete quote. Personal withdrawal described choosing an owned destination city. No troops or funds changed.
- Verified local dialog Escape/return, keyboard Home/End tab navigation, Back to Map closing the window, and reopening. Tab reset and Tower selection work without changing game state.
- Visually inspected desktop Overview, landscape Overview, landscape wall services and the Highguard/Stoneward illustrations. Initial image probes during selection caught two images still loading; both subsequently loaded at their expected 384 × 384 size and were visually confirmed. Blackthorn and Ravenwatch also loaded correctly.
- One browser automation log reported a MutationObserver argument error after an exact-label selector failed. None of this draft's three scripts uses MutationObserver. Selecting the observed input by its ID succeeded, and subsequent checks completed; no draft script file was identified by that log.

These checks cover the local prototype only. Full multiplayer/emulator/PR release checks were not run for this presentation draft. Authenticated permissions, real quotes, spending, combat, backend integration and deployment remain outside this review.
