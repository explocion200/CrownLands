# UI QA Guide

Choose **UI Studio → Screens**, select a screen/viewport, and press **Run UI QA**.

Phase 2A checks:

- foreground/background contrast, including selected text states;
- clipped or overflowing text;
- horizontal and vertical element overflow;
- controls outside their panel bounds;
- screens marked **No Scroll Expected** that now require scrolling;
- Close Buttons outside the panel, clipped, too close to an edge, or overlapping their header region;
- shared Close Button migration/source-handler integrity through **Close Button Audit**.

Warnings never silently rewrite presentation and do not automatically block Save. Each result includes severity, screen, component, message, and **Select Element**. Selecting a result switches the preview to the screen, focuses the target, and exposes the relevant text/color or placement controls.

Run QA at Small Mobile (667×375), Phone Landscape (844×390), and Desktop (1440×900), or use **Compare Viewports**. Treat contrast under 4.5:1 as a warning for normal text and under 3:1 as a warning for larger graphical controls. Re-run QA after Undo/Redo, reset, and before Save.
