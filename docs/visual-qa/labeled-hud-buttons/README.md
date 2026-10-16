# Labeled HUD buttons — appearance draft

Owner request: draft the four existing top HUD actions with their existing images
and visible names: **Leaderboard**, **Clan**, **Daily**, **Inner Castle**. The Clan
action must continue to display the player's own saved clan shield.

This is a review artifact, not an approved production design. No production entry,
stylesheet, gameplay code, data or Master Specification has been changed. Keep
the pull request in draft and do not merge or deploy until the owner accepts it.

## Review

With Node.js 22, run `node tools/map-benchmark/start-server.js 4187`, then open
`http://127.0.0.1:4187/docs/visual-qa/labeled-hud-buttons/index.html`.

- Compare labeled burgundy buttons with the current icon treatment.
- Review desktop (1440 × 900), landscape (844 × 390) and small landscape (568 × 320).
- Switch Amber Wardens, Raven Guard and no-clan examples. These are synthetic
  examples, not the owner's live clan. The actual `renderClanHudAccess` and full
  heraldry renderer provide the shield; the label sits outside the replaceable
  shield container.
- Toggle sample Clan/Daily notification badges. The fixture keeps the selected
  Daily badge visible across normal synthetic HUD ticks.
- The four actions are appearance-only in this preview; they do not open game
  actions. The benchmark uses a mock account/backend and accepts only GET/HEAD.

The draft reuses all three existing optimized HUD images, retains the fourth
action's generated heraldry, and places labels within touch targets of at least
44 pixels. The stylesheet loads only inside the isolated loopback preview.

## Validation

Run `node tools/validate-labeled-hud-draft-browser.js`. The focused browser check
uses the existing synthetic map server and verifies all three sizes, label and
artwork bounds, non-overlapping/hittable controls, unchanged image sources,
current/draft switching, different saved clan shields, no-clan discovery,
notification visibility and no network writes. It saves screenshots and results
under `release-artifacts/labeled-hud-draft/` (ignored review output).

Emulator tests are unnecessary: server rules, database access and authoritative
gameplay are unchanged. Human appearance approval is still pending.
