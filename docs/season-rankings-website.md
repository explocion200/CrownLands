# Season rankings on the website

The September 29, 2026 presentation decision moves completed-season standings to `https://playcrownlands.com/season-rankings.html`. Current standings, potential rewards, personal reward receipts and reward claims remain in the game. Reward values, finalization, persistence and claim authority are unchanged.

## Repositories and contract

- `explocion200/CrownLands`: remove the in-game archive browser, retain a website link and publish the `getPublicSeasonRankings` HTTP function.
- `explocion200/crownlands-website`: add the archive page, navigation and the `/api/season-rankings` proxy in production and previews.
- Both changes use `codex/season-rankings-website` and must be released together.

The public endpoint accepts only GET. Without a season, it lists up to 24 completed-season headers; `before` continues to older pages. With `season=realm-YYYY-MM&board=players|clans|glory`, it returns finalized ranks, public names and scores. It rejects current/future seasons and unsupported parameters. Pending boards never expose entries. Private IDs, profiles, clan rosters and reward receipts are omitted; direct Firestore access and authenticated game APIs retain their existing protections.

Public responses can be cached for 60 seconds in browsers and 300 seconds at the proxy. Errors are not cached. The website cancels superseded requests, times out stalled reads and distinguishes loading, empty, pending and unavailable states. It loads archive scripts and styles only on the archive page and has no Firebase SDK or account flow.

## Validation and release order

Game checks cover the public API's field allowlist, pagination, input validation, cache policy and failures; emulator checks exercise anonymous HTTP, real Firestore queries, private records and existing season reward behavior. Browser checks retain reward claims, receipts, honors, mobile layout and stale-response protection.

Website checks cover selection, pagination, text rendering, stale requests, pending/empty/error states, retry and anonymous reads. Inspect the page at desktop, mobile landscape and portrait sizes with a full 100-row fixture and long names/scores. A local fixture is not evidence of production standings.

After merge/deployment authorization: hold game auto-publication, deploy and verify the backend endpoint first, publish the website page and proxy, then publish the game link. Verify all named builds, the public empty/ready response and the game reward view. No historical documents, reward policies or production player data need migration.

September 2026 is the first supported season. Before its closing verification, the website correctly has no finalized standings. Do not invent earlier winners or treat provisional data as final results. Publication remains unverified until the coordinated release is completed.
