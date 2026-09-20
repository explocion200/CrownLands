# Compact map HUD — approval draft

Status: approved September 20, 2026; integrated into runtime on branch `codex/compact-original-map-hud-draft`, pending required release checks and deployment verification.

Open `index.html?viewport=desktop&view=map` and switch between Desktop, Mobile landscape and Small landscape. The game does not support portrait.

- Restore the original quick-chat height of 64 px and width cap of 360 px, from `1fccf9bcb:chat.css` and `2fb3c4165:chat-ui.js`. Recent messages scroll within that fixed size so per-message Translate remains usable without expanding the window. Open chat provides the full conversation.
- Restore the arrow button's actual pre-ledger burgundy gradient `#72363a` → `#542728`, brass `#997643` border and ivory `#f2e2bf` text. These come from the final HUD palette rule in `crownlands-palette.css`, which overrides the earlier brown/navy styles. The exact 72% translucent chat background remains.
- Restore the right-centered vertical item-timer stack, 12 px from the right, from `2fb3c4165:ui-layout-config.js`. Restore the same original burgundy tile backgrounds and dark timer labels. Retain the approved newer shared item artwork.
- Remove the Active Boosts overview dialog and all links to it. Inactive effects disappear; the empty example leaves the map unobstructed. Timers are passive indicators.
- Preserve individual translation, full chat, Google integration, Peace Shield cooldowns and retaliation mechanics. This fixture uses fictional messages, timers and prepared translations; it makes no provider calls or gameplay changes.
- Compact combat timers: Shield Cooldown and Retaliation share one narrow card immediately below Gold. It is 156 px wide on desktop and 148 px in landscape, with a 28 px Retaliation tap target. The city list is 224 px wide (220 px in landscape), retains each name, map/ID and independent countdown, and scrolls. On short landscape screens the list opens beside the card to avoid covering chat. The existing `combat-timers-ui.js` renderer supplies all countdowns and visibility rules; `timers.css` contains draft-only presentation overrides.

The Combat timers review selector offers several cities, one city, shield only, none active and a 12-second expiry example. These deadlines are synthetic and do not change any live player timer.

Each retaliation city has a 34 px Map button with a location-pin symbol. This fixture highlights a sample location; the integrated game navigates using the saved city and region identities through the existing report-location loader. Successful navigation closes the list without consuming the permission; failure preserves the list and provides recovery feedback. The runtime renderer is shared with this fixture. Combat backend rules are unchanged.

The integrated game provides Open chat inside the mini preview and a Realm Chat shortcut beside Reports, opening the same full conversation. Its position clears existing march controls.

The small-landscape fixture keeps the existing 64 px navigation icons and lets the preview contract horizontally to 178 px at 568 px viewport width. It does not return to a portrait layout.

This request supersedes the Active Boosts overview presentation recorded in Master Specification § “Approved Active Boosts and mini Chat completion.” The specification and runtime implementation should be updated together after this draft is approved. No gameplay rule change is proposed.

Runtime validation covers desktop and both landscape sizes, fixed mini-chat dimensions, per-message translation, full-chat access, passive effect expiry, controls staying clear, all 12 retaliation entries, scrolling, exact map identities, unavailable locations, duplicate clicks, account changes and unchanged permissions. Deployment status is established separately by the verified production build.
