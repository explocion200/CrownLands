# Chat visual QA

This fixture loads the production CSS cascade, `chat-ui.js`, and the HUD layout runtime against deterministic local-only message data. Use `?mode=closed`, `?mode=quick`, or `?mode=full`; `alerts=none|incoming|outgoing|both` controls the collision scenarios, and `controls=1` exposes the interactive QA controls.

## Result — 2026-08-19

Quick Peek keeps its right edge 9 pixels left of the fixed Chat toggle. On every layout/occupancy event it measures the currently visible `.bottom-nav` and explicit `[data-chat-quick-blocker]` rectangles that vertically intersect the Quick Peek row. Its safe left edge is 9 pixels beyond the furthest intersecting right edge (or the 12-pixel viewport inset), and its width is capped at 360 pixels. The body renders only when at least 160 pixels remain, using three messages at 280+ pixels, two at 210–279 pixels, and one at 160–209 pixels.

At 844×390, the fixed controls remained Chat 475–531 × 318–374 (56×56) and Bag 540–604 × 314–378 (64×64) throughout. Results:

- No movement controls: Quick Peek 119–466 (347 pixels), three messages.
- Incoming only: blocker ends at 214; Quick Peek 223–466 (243 pixels), two messages.
- Outgoing only: blocker ends at 214; Quick Peek 223–466 (243 pixels), two messages.
- Incoming + Outgoing: blockers end at 318; only 139 pixels remain, so the preview body is suppressed while logical mode stays `quick`.

At 568×320, the available width is below 160 pixels in all four required alert conditions. The preview body is suppressed, logical Quick Peek state is retained, and it automatically returns when a later layout provides sufficient room. Chat remained 207–263 × 248–304, Bag remained fixed at its existing layout coordinates, Incoming/Outgoing action centers and the Chat center remained clickable, and document/body width stayed exactly 568 pixels. The repository does not define an additional minimum supported landscape width.

Six consecutive cycles of Incoming → Outgoing → both → HUD reconstruction → controls clear → Full Chat → minimize → close → reopen produced identical starting and ending Chat/Bag rectangles. Each `both` state suppressed the preview and every `none` state restored it to 347 pixels/three messages without closing chat. Counts remained one Global subscription, one Clan subscription, three collision event hooks, zero observers, and zero active cooldown timers. There was no animation loop, horizontal overflow, duplicated subscription, or browser console warning/error.

The accepted-send cooldown captures show `Send (3)`, `Send (1)`, then enabled `Send`, while the next draft remains editable and intact. Switching Global → Clan retained `Send (3)` and the draft; minimizing, closing, reopening, and returning to Full Chat retained `Send (2)`, the draft, and one subscription per channel. A forced authoritative rejection added no message, preserved the draft, displayed `Wait 3s`, and re-enabled Send when the server-provided remaining duration expired.

Fresh captures:

- `landscape-quick-none.jpg` — 844×390, no movement controls.
- `landscape-quick-incoming.jpg` — 844×390, Incoming only.
- `landscape-quick-outgoing.jpg` — 844×390, Outgoing only.
- `landscape-quick-both.jpg` — 844×390, Incoming + Outgoing; Quick Peek body suppressed.
- `narrow-quick-both.jpg` — 568×320, Incoming + Outgoing; Quick Peek body suppressed.
- `full-cooldown-start.jpg` — immediately after an accepted send (`Send (3)`).
- `full-cooldown-final-second.jpg` — final cooldown second (`Send (1)`).
- `full-cooldown-ready.jpg` — cooldown complete and Send enabled.

## Actual-game integration — 2026-08-19

The production client artifact was connected only to local Auth, Firestore, and Functions emulators. Three isolated, authenticated browser origins entered real Crownlands kingdoms. Player A and Player B shared Clan 1; Player C began outside Clan 1. No production service, deployment, or data was used.

Real gameplay movement produced all four HUD conditions. At 844×390, Incoming-only occupied 116–214 and Quick Peek moved to 223–466 (243 pixels, two messages). When a live Outgoing indicator appeared beside Incoming, the controls occupied through x=318 and Quick Peek suppressed without changing its logical mode. After Outgoing resolved, Quick Peek returned automatically at 223–466. A real Recall Horn workflow later removed Incoming and Quick Peek expanded again. Chat stayed 56×56, Bag stayed at its existing size and location, the gap remained 9 pixels, both movement controls and Bag opened normally, and document width never exceeded viewport width. Six Full ↔ Quick cycles and six narrow Quick ↔ Closed cycles finished with identical Chat, Bag, and Quick Peek rectangles.

At 568×320, Quick Peek correctly suppressed below the 160-pixel readable-width threshold. Chat remained 207–263, Bag began at x=272, all visible controls were clickable, and horizontal overflow was zero. Freeze/foreground and offline/online recovery each delivered the next Global message exactly once. A real map-change lifecycle kept the selected channel and draft, while Global DOM rows stayed 6→6 and Clan rows stayed 4→4 across reopen.

Authenticated chat results:

- Player A sent Global; Player B received the authoritative sender name in Quick Peek and Full Chat, showed unread while not viewing Global, cleared unread in Full Chat, and retained one message copy.
- Player A sent Clan 1; Player B received it and Player C saw the disabled “not currently in a clan” composer with no Clan 1 history.
- Player B left Clan 1 through the real `leaveClan` callable while Clan Chat was open. The old history disappeared, the composer disabled, and a direct old-Clan send returned `FAILED_PRECONDITION`.
- Player B joined valid Clan 2 through the real open-clan workflow after local test setup cleared the normal leave cooldown. Clan 2 attached only after authoritative membership existed. Player C’s Clan 2 message appeared once for B and C while Player A retained only Clan 1 history.
- Global → Global, Global → Clan, Clan → Global, and Clan → Clan all exercised the same player-level cooldown. The UI showed `Send (3)`, `Send (2)`, `Send (1)`, then `Send`; drafts remained editable through channel changes, minimize, close, reopen, and a real map change. A second authenticated client call 96 ms after an accepted send returned HTTP 429 / `RESOURCE_EXHAUSTED` with 2,904 ms remaining.

Focused diagnostics after six collision/HUD reconstruction cycles remained one Global subscription, one Clan subscription, three collision hooks, zero observers, and zero active cooldown timers. The clean lifecycle browser recorded zero console errors. Real attack setup separately exposed the pre-existing `acceptedProtection.label` null-toast error in `game.js`; the expression is unchanged on `origin/main`, did not affect chat delivery/listeners, and was left untouched because movement behavior is outside this pass.

Actual-game captures:

- `integration-landscape-closed.png` — 844×390 closed HUD.
- `integration-landscape-quick.png` — 844×390 Quick Peek with a real Incoming control.
- `integration-landscape-full-global.png` — 844×390 Full Global with emulator-delivered messages.
- `integration-desktop-quick.png` — 1280×720 desktop Quick Peek.
- `integration-landscape-quick-both.png` — 844×390 logical Quick Peek suppressed by real Incoming + Outgoing controls.
- `integration-narrow-quick-suppressed.png` — 568×320 approved narrow suppression.
