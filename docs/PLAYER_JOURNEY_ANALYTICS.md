# Optional player journey measurement

The website and game use the existing public GA4 measurement ID `G-K5W0M2NPFN` from `firebase-config.js`. This is a client presentation change; no player records, server behavior, combat rules, or database permissions change.

`player-journey.js` and `player-journey.css` are mirrored in the website repository under `src/scripts` and `src/styles`. Keep their consent behavior aligned when updating either deployment.

## Consent and data boundaries

- Analytics loads only on the production Crownlands domains after an explicit Allow analytics choice. Preview, localhost, support, and policy pages never load it.
- A necessary preference cookie, `cl_analytics_v1`, shares the choice between the website and game for 180 days. The configured GA cookies also expire after 180 days without extending on each visit.
- Advertising storage, advertising user data, personalization, and Google signals remain denied/disabled. This control is not an advertising CMP and does not enable rewarded or display ads.
- Event names and action categories are allowlisted. No account identity, names, emails, chat, city IDs, troop counts, resources, request payloads, or support messages are passed. Query strings, fragments, and referrers are excluded.
- Declining does not affect game access. Revocation disables this integration and removes accessible `_ga` cookies. Events before opt-in are not buffered or replayed. Other tabs reconcile on focus and check the shared choice before each event.
- Failures in the optional script or blocked storage cannot reject entry, an accepted order, or a confirmed upgrade.

## Funnel definitions

| Event | Trigger |
| --- | --- |
| `homepage_view` | Homepage viewed with analytics allowed; once per page load. |
| `play_click` | A website link to the dedicated game is clicked. |
| `game_entry` | Realm admission and world setup succeeded and the kingdom rendered; once per game page load. |
| `first_action` | First server-confirmed city upgrade or accepted attack, scout, or transfer after the measured entry; once per game page load. Only `action_type` categorizes it. |

The GA browser identifier spans the parent domain. This measures consenting browser journeys, not unique accounts. Refreshes and separate tabs can create another measured entry. Consent granted after entry does not retroactively create that entry or its first action. Failed entry, waiting-list responses, replayed city upgrades, and already-resolved orders do not create those success events.

In GA4, use an ordered funnel with the four event names above. Configure report retention and review stream settings in the account; never enable user-provided data collection for game inputs. Account-level report configuration requires authenticated Analytics access and is not established by deploying the tag.

## Validation

`node tools/test-player-journey.js` checks opt-in and revocation, event/parameter boundaries, sequencing, production-only behavior, utility exclusions, and blocked storage. It runs in `gate:static`, including PR validation. Production artifact checks require both new client assets. The normal full multiplayer gate remains required because the hooks touch shared game entry and accepted-action presentation.
