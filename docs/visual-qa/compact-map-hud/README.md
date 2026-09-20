# Compact map HUD — approval draft

Status: draft only, September 20, 2026. Branch `codex/compact-original-map-hud-draft`.

Open `index.html?viewport=desktop&view=map` and switch between Desktop, Mobile landscape and Small landscape. The game does not support portrait.

- Restore the original quick-chat height of 64 px and width cap of 360 px, from `1fccf9bcb:chat.css` and `2fb3c4165:chat-ui.js`. Recent messages scroll within that fixed size so per-message Translate remains usable without expanding the window. Open chat provides the full conversation.
- Restore the arrow button's actual pre-ledger burgundy gradient `#72363a` → `#542728`, brass `#997643` border and ivory `#f2e2bf` text. These come from the final HUD palette rule in `crownlands-palette.css`, which overrides the earlier brown/navy styles. The exact 72% translucent chat background remains.
- Restore the right-centered vertical item-timer stack, 12 px from the right, from `2fb3c4165:ui-layout-config.js`. Restore the same original burgundy tile backgrounds and dark timer labels. Retain the approved newer shared item artwork.
- Remove the Active Boosts overview dialog and all links to it. Inactive effects disappear; the empty example leaves the map unobstructed. Timers are passive indicators.
- Preserve individual translation, full chat, Google integration, Peace Shield cooldowns and retaliation mechanics. This fixture uses fictional messages, timers and prepared translations; it makes no provider calls or gameplay changes.

The small-landscape fixture keeps the existing 64 px navigation icons and lets the preview contract horizontally to 178 px at 568 px viewport width. It does not return to a portrait layout.

This request supersedes the Active Boosts overview presentation recorded in Master Specification § “Approved Active Boosts and mini Chat completion.” The specification and runtime implementation should be updated together after this draft is approved. No gameplay rule change is proposed.

No production files are changed. Focused visual/interaction checks apply to this draft; PR preparation, full release gates, merge and deployment follow approval.
