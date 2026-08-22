# Crownlands Studio Visual Editor Guide

## Open and inspect a screen

1. Open a valid Crownlands project in Studio.
2. Choose **UI Studio → Screens**.
3. Pick one of the priority Crownlands screens and a viewport: Small Mobile (667×375), Phone Landscape (844×390), or Desktop (1440×900).
4. Turn on **Inspect UI**, then click a highlighted element in the preview. Hold Shift, Ctrl, or Command to select more than one element.

The inspector shows the screen, component, element ID, CSS class, implementation file, local style source, breadcrumb, and current responsive source. Hover outlines an inspectable target; selection uses a stronger outline. **Guides** and **Snap** expose parent centers, edges, and alignment feedback.

## Edit without writing files

Inspector edits are session-only preview state until **Save Changes** is pressed. Text, background, border, size, spacing, position, opacity, icon, and alignment controls appear according to the selected element. The font family is informational so the Crownlands global type system cannot be changed accidentally.

For a shared Close Button, use:

- **Global Close Button Style** for size, colors, border, icon, hover/pressed/disabled state, opacity, shadow, padding, and default offsets. The impact count and usage list explain the broad effect.
- **This Screen Position** for top/right offsets, anchor, X/Y nudges, header alignment, or restoring placement. These values do not restyle other Close Buttons.

Theme swatches use the current Crownlands palette. Recent colors remain available for the session, and the contrast indicator reports the measured foreground/background ratio without changing either color.

## Correct and validate

- Arrow keys nudge by 1 px; Shift+Arrow nudges by 8 px.
- Ctrl+Z undoes and Ctrl+Y (or Ctrl+Shift+Z) redoes.
- Reset Property, Reset Element, Restore Default Position, and Restore Shared Default affect preview state only.
- Match Style From copies presentation values but never behavior or handlers.
- Run UI QA checks contrast, text clipping, horizontal/vertical overflow, no-scroll expectations, and Close Button bounds/alignment.
- **Select Element** on a QA finding opens the affected screen and target.
- **Compare Viewports** renders all three supported sizes with their real media-query dimensions.

Review **Pending UI Changes** before saving. Save validates the UI schema, component registry, source mapping, contrast, local offset bounds, and responsive overrides, then reports either **Saved · Validation Passed** or precise warnings/errors.

## Codex remains optional

**Ask Codex** includes the selected element metadata, shared component definition, usage list, and current QA findings. Manual inspection and editing do not require a Codex task.
