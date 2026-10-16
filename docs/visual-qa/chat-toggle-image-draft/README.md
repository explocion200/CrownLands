# Chat toggle image draft — awaiting approval

The owner requested a draft matching the approved labeled HUD images and asked
for approval before implementation. **Do not merge or publish this draft until
that approval is given.** The confirmed Master Specification and production
entry, styles, chat logic and runtime image manifest remain unchanged.

Revision 2 follows the owner's request to make only the arrows slightly smaller
while preserving the parchment ribbon and Chat text size. The image-edit prompts
request an approximately 15% reduction in arrow dimensions; the full button is
not scaled down. Revision 1 source images remain available for comparison.

The proposal keeps the 56 × 56 chat target, its position and behavior, with a
cream-and-gold chevron above a parchment **Chat** ribbon. The left chevron shows
chat; the right chevron collapses it. Separate images keep the label upright.
The actual existing toggle handler, accessible labels and expanded state run
inside the synthetic game fixture. The unread example remains a separate dot.

## Review

Run `node tools/map-benchmark/start-server.js 4189`, then open
`http://127.0.0.1:4189/docs/visual-qa/chat-toggle-image-draft/index.html?open=true`.

- Review both illustrated states at 2× detail and the actual size in the map.
- Click the map's Chat arrow to show or hide sample messages.
- Compare with the current arrow, select desktop or landscape widths, and toggle
  the sample unread dot.
- The preview uses a synthetic account/backend, runs only on loopback and does
  not contact live accounts or send game/chat writes.

## Artwork

The built-in `image_gen` tool produced the RGBA originals, saved byte-for-byte:

- [Show chat — revision 2](images/chat-left-r2.png)
- [Hide chat — revision 2](images/chat-right-r2.png)
- [Exact prompts and input references](images/prompts.json)

The left image uses a captured current arrow for direction/shape and the approved
Bag artwork for style. The right image edits only the arrow direction, retaining
an upright Chat ribbon. `images/current-closed.png` is the synthetic screenshot
reference. No CLI generation fallback was used. These draft PNGs are not runtime
delivery assets; compression/integration follows owner approval.

## Validation

`node tools/validate-chat-toggle-draft-browser.js` passed at 1440 × 900,
844 × 390 and 568 × 320. It checks identical pre/post target geometry, transparent
surfaces, both image states, upright image transforms, pointer/keyboard/touch
operation, unread visibility, review controls, no failed assets/page exceptions,
no network writes and absence of draft references in production files.
Screenshots and results are under ignored `release-artifacts/chat-toggle-draft/`.
No gameplay or authoritative backend behavior changes; no emulator tests apply.

Branch: `codex/chat-toggle-image-draft`. Local preview only, pending design
approval; no PR, merge or deployment is implied by these checks.
