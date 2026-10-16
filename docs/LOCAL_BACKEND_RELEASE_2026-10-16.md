# Local production transfer — October 16, 2026

This records the initial morning transfer. The migration PR and subsequent repairs
have since merged; see the [20:00 UTC release record](LOCAL_RELEASE_2026-10-16_PRESETS_HUD.md)
for current publication and backend verification. Historical observations below
retain their original timing.

The owner authorized migration of the complete game to the Crownlands computer.
Production local authority became active at **07:09:30 UTC**; protected activation
completed at **07:09:37 UTC**. This is a verified web/backend deployment, not a
claim that the migration pull request has merged.

## Deployed scope and authority

- Public game: `https://playcrownlands.com/play/`.
- Client: `72c325f0be954b7053e685d15e70b80606a23e51`, `postgres-local`.
- Active epoch: `eb42105515725a411c24e48612d9d789`.
- Realm: `main-realm-2026-10 / realm-2026-10 / shard_0001`.
- Local PostgreSQL accounts/data, Node account/game services, durable workers,
  account email and browser-push dispatch, and Stripe fulfillment.
- Google sign-in, Google Translation, Resend delivery, Stripe processing,
  Google Cloud uptime monitoring and encrypted GCS backups remain external.

The final copy preserved **918,090 documents and 318 accounts**, including all
28 original password hashes. Independent comparison covered typed documents,
versions, account identities and provider records. Source controls and settled
Stripe orders were checked again after the pre-activation backup/restore.
Firebase game access and writers remain fenced; no historical source data was
deleted. Local production now contains new changes. Never reopen Firebase or
rerun an initial import without a separately reviewed reconciliation procedure.

## Acceptance and recovery evidence

- Real Google sign-in loaded the owner's 43-city kingdom; Inner Castle artwork
  and a browser refresh/re-entry passed. An initial session replacement was
  observed; the subsequent session remained connected. The computer session was
  signed out before the owner's phone acceptance.
- The owner confirmed cities and Inner Castle looked right on their phone and
  a small normal gameplay change remained saved after refresh.
- Signed non-purchase requests passed both public Stripe test/live routes to
  the local authority. No new checkout, charge or wallet credit was created.
- Before activation, an encrypted cloud backup was independently restored:
  all 24 tables and 1,844,846 rows matched. The disposable restore was removed.
- A fresh backup of the active installation reached encrypted cloud storage
  at 07:23 UTC. Its archive contained 24 tables and 1,851,058 rows.
- Eleven external uptime checks and twelve enabled alert policies were retained.
  The owner previously confirmed email-alert delivery and possession of the
  off-computer backup recovery password.

Detailed exports, account material, provider secrets and recovery credentials
are private and are not part of this repository. Protected transfer receipts are
under `/var/lib/crownlands-transfer`; owner-readable audit receipts are under
`~/.local/share/crownlands/post-activation-audit-20261016`.

## Worker catch-up and validation

The initial transfer health checks passed, then the retained maintenance queue
exceeded the overdue-work threshold. Diagnostics also recorded PostgreSQL
serialization conflicts in scheduled army resolution. No dead or stalled jobs
were observed. The alert was kept active during investigation.

The catch-up repair is commit `121bca612622ac1698de96aa9d7bedf446e8f694` on
`codex/local-backend-rehearsal`. Its regression fixtures reproduce the original
two-jobs-per-poll throughput limit and exhausted short transaction retry window.
Bounded draining refills worker slots without increasing concurrency, and bounded
exponential jitter gives competing writers time to commit. Serializable isolation,
per-handler order, leases, attempt limits and shutdown guards remain in force.
All selected local checks/build validation and the three required
[GitHub checks](https://github.com/explocion200/CrownLands/actions/runs/38868611008)
passed for that exact repair commit.

The corrected installer completed at **11:43:16 UTC** (7:43 a.m. Eastern).
The complete installed runtime fingerprint is
`a32891aedc77987ef0ef838e062f891611e0959e0b11a69efd762e0a3402adf9`.
It retained byte-identical public client files, preserved the original release,
and recorded the separate runtime commit in the new operator release metadata.
All six services restarted successfully and exact public HTTPS checks passed.
At **11:44:18 UTC**, three consecutive observations showed all six components
healthy, no pending/dead/stalled jobs, no new handler errors, and no due or
overdue current-realm army orders. Prior failure diagnostics were preserved.

The first installation attempt restored its previous runtime after an operator
health request omitted the trusted proxy header. The corrected request was tested
against both actual local APIs before retrying. The failed attempt and its original
diagnostics remain retained; no data or Firebase authority was rolled back.
Protected repair receipts are under
`/var/lib/crownlands-transfer/runtime-update-121bca612622ac1698de96aa9d7bedf446e8f694-v2`;
the owner-readable copies are under
`~/.local/share/crownlands/active-worker-repair-20261016-v2`.

## Publication and remaining limits

[PR #577](https://github.com/explocion200/CrownLands/pull/577) contains the migration
and repair. It has not been merged. The installed automatic publisher uses local
authority policy and holds the older Firebase package on main. Do not bypass that
hold; compatible static changes can publish after the reviewed migration merges.
Backend changes still require their own tested service deployment.

Production password-user sign-in, a new paid purchase, post-cutover native
notification delivery and all installed-app/browser update variants were not
observed. Password compatibility, payment idempotency and push delivery have
separate fixture/private-preview evidence. These limits must not be described as
completed production tests. The owner's production account uses Google sign-in;
its private-preview password is not a production password.
