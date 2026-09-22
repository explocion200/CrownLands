# Player identity save protection

The September 21 investigation reproduced an entry-state save overwriting a returning player's name and flag before their saved profile finished loading. This is contrary to the existing identity persistence rules in the Master Specification.

## Protection

- Entry requires a server profile read. A read failure stops entry; a confirmed missing profile still follows the normal server-owned first-city claim.
- Saves require the loaded state, account, session, world and generation to match. Authentication events, reloads and retry timers cannot save temporary entry state.
- The player profile is the identity source. Newer save-slot timestamps cannot replace its name, flag or edit revision. Autosaves omit identity, and save-slot writes remove old identity copies.
- Name and flag buttons perform a dedicated transaction with an expected `identityRevision`. Concurrent stale edits fail visibly; retrying an already committed edit is harmless. Flag editing preserves the name and renaming preserves the flag.
- Firestore rules reject identity changes in ordinary/older-client autosaves and stale revisions. Old-client save slots cannot contain identity that conflicts with the player profile.
- `syncPlayerIdentity` only copies canonical identity to public projections. It ignores caller-supplied names/flags, guards concurrent edits and marks completion after all projections succeed. Statistics rebuilds do not rewrite profile identity.
- Season transitions preserve the edit revision alongside the existing name and flag.

## Release and recovery

This change requires coordinated Functions, Firestore rules and client deployment. Deploy the backend and rules before publishing the new client. Older clients with matching identity can continue autosaving; an older client attempting an identity change will receive a rules rejection and must refresh to edit. Do not deploy only the client: its dedicated transaction requires the new rules.

Merge alone does not protect production. Verify the deployed backend/rules and each published client channel, then smoke-test a returning login, a new account, a rename, a flag edit and re-entry with a test account. Historical account repairs are separate production mutations requiring explicit authorization; this change contains no player-data migration or restoration.

## Validation

`validation-plan.json` selects the save-boundary tests, existing login/flag/main-city checks, desktop and landscape-mobile browser scenarios, and the affected emulator rules, identity propagation, ownership and reset suites. Browser fixtures and emulator users are synthetic; no production player data is committed.
