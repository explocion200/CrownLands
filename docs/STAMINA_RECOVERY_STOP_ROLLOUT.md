# Stamina recovery stop and boss cost rollout

Status: prepared, not deployed. Owner confirmed October 21, 2026: stop automatic
stamina recovery, keep Crown refills, charge 20 stamina per boss participant.
Solo hunts still cost 10. Crown pricing and one refill per UTC day are unchanged.

## Coordinated local release

This change requires the local backend and matching client. A merged PR alone
must not release the new client over the old backend. Follow the existing local
runtime approval and publisher checks in `AUTOMATIC_LOCAL_DEPLOYMENT.md`.
Do not deploy Firebase functions or modify archived realm data.

After all required PR checks pass and the backend installation is authorized:

1. Verify the authoritative `realmConfig/current` pointer and current release
   topology `core-expansion-v1`; confirm the local database is the active authority.
2. Hold static publishing and enter maintenance. Stop/drain game and worker
   processes that can write stamina or launch/resolve hunts. Preserve queues,
   current armies, receipt IDs and player data. Do not create an update backup.
3. Using the protected local operator connection and the existing Store adapter,
   **create**, never overwrite, `staminaPolicy/recovery-stop-v2` in the live game
   store with `{version: 2, stoppedAtMs: <integer Unix milliseconds at cutover>}`.
   This server-only document records the single permanent stop time. There is no
   player endpoint or client read permission for it. If it already exists, verify
   and retain its original timestamp; repeated installations must not move it.
   Never choose a development/merge timestamp, login time or a future time.
4. Install the reviewed backend with the matching static client through the
   normal protected runtime workflow, then validate before reopening gameplay.
   Existing v1 stamina is converted on first authorized load, departure, refill
   or refund. Whole points earned before the fixed cutoff are retained (cap 100).
   Conversion increments the private revision once, preserves `paidDay`, and
   persists v2 on a successful load or state-changing transaction. Offline
   accounts receive no recovery after that cutoff, however late they return.
   Missing/invalid policy fails closed for legacy accounts instead of silently
   losing accrued stamina. New accounts initialize v2 at 100.
5. Confirm the deployed backend/client build identities and publisher health.
   Ensure old clients reload; they do not understand stamina state v2.
   Check a non-full account remains unchanged after 12 minutes, correct 10/20
   preparation costs, readiness at 19/20, and the proportional Crown quote.
   Purchase only with an explicitly authorized test account/transaction.
6. Check queued old marches retain original 10-point refunds and newly launched
   boss rallies snapshot/refund 20 per member. Invalid targets refund exactly
   once; defeats and voluntary recalls still do not refund. Reports show the
   actual refunded amount. No army rewrite or rescheduling is needed.

## Recovery constraints

Keep the cutoff policy permanently with the account data. Never delete/reset it
on a season reset, repeat install, failed purchase or partial rollback. Do not
blindly roll back to a backend/client that only understands stamina v1 after v2
states have been written: it would reject those accounts. If validation fails,
keep maintenance/publishing held and repair the release or prepare a separately
reviewed compatible rollback. Do not convert v2 accounts back to v1 or restart
automatic recovery as an incidental rollback.

## Validation scope

Focused rules and transaction tests cover offline/cap/cutoff boundaries,
idempotent migration, same-day stable prices, daily rollover, Crown wallet races,
receipt replay, solo versus boss costs, and old/new departure refunds. Browser
checks cover desktop and landscape refill/preparation screens and subscription
reconnection. Required CI still gates merge; real deployment checks remain a
separate step.
