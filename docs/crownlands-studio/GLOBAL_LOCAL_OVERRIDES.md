# Global and Local Overrides

## Global scope

A global property changes the shared component everywhere. For Close Button, this includes dimensions, colors, border, radius, icon, hover/pressed/disabled states, opacity, shadow, padding, and default offsets. Studio marks these controls **GLOBAL** and shows the affected usage count.

Global data lives under `globalComponents` in `ui-studio-config.json`. Responsive component values can be stored for Desktop, Phone Landscape, and Small Mobile without replacing the base definition.

## This-screen scope

A local Close Button record may contain only placement: anchor, top/right/bottom/left, and X/Y translation. It lives under `screenOverrides`. For example, moving the Clan Members Close Button upward does not move Reports or Shop.

Generic selected elements use `elementOverrides` with a screen ID, stable element ID, and base or breakpoint-specific visual properties. The sanitizer drops unknown behavior fields, unsafe colors, invalid selectors, and out-of-range numbers. Gameplay values are not part of the schema.

Prefer global edits for a component's identity and local overrides only for real layout differences. A local color, icon, or button-size fork is treated as a legacy style candidate and should be reviewed for shared-component conversion.
