# Crownlands Visual QA - Pass 2

Date: 2026-08-12

## Screenshot Capture

Captured through a temporary local static server and headless Microsoft Edge:

- `login-desktop.png` - 1280x720
- `login-mobile-landscape.png` - 915x412

Authenticated screens were not captured in this pass. The clean headless browser profile did not have Firebase authentication, so Main map, Own city selected, Enemy city selected, Profile, Shop, Daily Rewards, and Incoming/Outgoing operation panels were not accessible without signing in. The connected browser automation surface also returned no readable control output in this session, so it could not be used to attach to an existing signed-in browser session.

## Login - Desktop

1. Clearly late-medieval: Yes. Parchment panel, wood/iron buttons, burgundy wax seal, heraldic framing, and manuscript typography now support the Art Bible.
2. Too much shiny gold: Mostly resolved in UI. The retained raster logo/background still has polished gold.
3. Modern glass UI: No obvious glass card remains on the login controls.
4. Excessive rounded cards: Mostly resolved. Corners are still softened, but the card reads as a framed physical board.
5. Physical materials: Yes. Parchment, timber, iron, wax, and stamped navigation are visible.
6. Cohesive icons: Mostly yes. Install, patch notes, music, and fullscreen use the Crownlands SVG family.
7. Fantasy mobile-game feel: Reduced. The logo/background raster still carries some old ceremonial fantasy polish.
8. Text readable: Yes at desktop size.
9. Buttons obvious: Yes.
10. Mobile landscape relevance: See mobile note below.

Remaining desktop issues:

- Login background should become a production frontier kingdom scene in the raster phase.
- The Crownlands logo art is still gold-heavy but acceptable until the logo/raster pass.

## Login - Mobile Landscape

1. Clearly late-medieval: Yes.
2. Too much shiny gold: Mostly limited to existing logo/background art.
3. Modern glass UI: No.
4. Excessive rounded cards: Acceptable.
5. Physical materials: Yes.
6. Cohesive icons: Yes for visible controls.
7. Fantasy mobile-game feel: Reduced.
8. Text readable: Yes.
9. Buttons obvious: Yes.
10. Mobile landscape size: Pass. The primary sign-in/install/patch navigation remains usable without overlap.

Remaining mobile issues:

- Public marketing copy panel is hidden at this size, which is acceptable for usability.
- Background framing is cropped tightly; final raster replacement should include safe areas for landscape phones.

## Authenticated Screens

Not visually captured this pass because Firebase auth blocked the clean headless profile. The CSS and SVG work was statically audited, but these screens still need manual screenshot QA:

- Main map
- Own city selected
- Enemy city selected
- Profile
- Shop
- Daily Rewards
- Incoming attack or operation panel

## QA Recommendation

Create a small development-only authenticated visual QA route or seedable screenshot harness for future passes. It should render the real HUD, map, profile, shop, daily rewards, and operation panels with representative state while preserving production Firebase behavior.
