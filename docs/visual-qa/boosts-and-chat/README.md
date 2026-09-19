# Active Boosts & Protection / individual chat translation draft

Status: approved and integrated into the actual game on `codex/approved-ui-completion`. The original review fixture remains here as design evidence. Required release checks and production verification are tracked in [the completion audit](../../APPROVED_UI_COMPLETION_AUDIT.md); preview presence alone does not establish deployment.

Open `index.html?viewport=desktop&view=boosts`. Review controls switch between Boosts & protection, Map & mini chat, and Full chat, at 1440×900, 844×390 and 568×320. Portrait is outside the agreed game scope.

## Requested presentation

- Reuses the approved shared Shield, War Drums, Royal Tax Decree and Veil illustrations.
- Active-effect list and a selected detail card show the effect, scope, remaining time and expiry warning. Empty and expiring examples are available.
- Sample production bonuses match the current repository: War Drums +30% of base troop production; Royal Tax Decree +50% of base Gold production. No combat bonus is implied.
- The map preview restores the `cl-icon-back` arrow from pre-ledger commit `1fccf9bcb`, reversed when expanded, and its brown translucent treatment. The mini chat's 72%-opacity background follows the same earlier source styling. The arrow toggles the mini preview; Open chat opens the ledger.
- Translation is an individual action beneath each known foreign-language message. One request only changes that message. Same-language and language-neutral coordinate/time fixtures have no Translate button.
- Loading retains the original. Failure keeps the original and a row-local Retry. Success provides Show original and Google attribution next to the result. Full and mini views share each message's selected result.
- New messages start untranslated. Changing the language or channel cancels pending sample responses. The review locale override is outside the player interface.
- Keyboard focus, channel tabs, Escape, editable composer, three-second local send cooldown, and a New messages jump are available for review.

## Boundary and integration notes

This draft contains synthetic, language-labelled messages and prepared translations. It does **not** detect arbitrary text, call Google, read real chats, consume the monthly allowance, mutate production data or connect the proposed controls to Firebase. Arbitrary local composer text retains its original and has no guessed language.

The user's September 19 request intentionally changes the previously confirmed channel-wide automatic translation interaction in Master Specification §14. The production integration must replace the global on/off preference with per-message actions and reliable message-level language detection, suppress controls for same-language/uncertain/neutral messages, and preserve authorization, original text, 500,000-character monthly reservations and Google attribution. Detection must not be inferred solely from the sender's device language. That integration and the corresponding specification update follow draft approval.

Boost copy reflects the existing personal Bag effects only. The deferred officer/leader Clan Tower Veil mechanics are not implemented or redefined by this draft. Swift March and Recall remain per-order consumables, not global timed effects.

The original draft changed only this folder. Its approved design is now implemented in the runtime boost module, Chat controller/styles, and the existing Google callable. Production packaging includes those runtime files and excludes this synthetic fixture. The original branch is retained as history, not as an outstanding implementation.

## Review actions

1. Select each boost; check its scope and countdown. Inspect No active effects and the 12-second expiry example.
2. Switch to Map & mini chat; collapse and reopen with the arrow.
3. Translate the Spanish message; the adjacent English message stays unchanged. Open full chat and restore that same original.
4. Switch preview language to Spanish or French: eligibility changes per message.
5. Try Translation retry and Slow translation. Change the target language during loading to confirm stale results are discarded.
6. Scroll upward, add an incoming message, and use New messages to return to the bottom.

Focused browser evidence is recorded in `visual-checks.md`. Full PR/emulator gates are deferred because this is an isolated visual draft for approval.
