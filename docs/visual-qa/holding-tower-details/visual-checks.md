# Holding Tower draft verification

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
