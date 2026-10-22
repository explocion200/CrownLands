# Clan Stables and Scout Lodge rollout

Implementation branch: `codex/clan-stables-scout-lodge`, based on `cda910c636504bbe2eca09dfb30713db5e552c71`.

Status: implemented and under targeted validation; **not installed or live**. The owner authorized implementation and validated merging, not this backend deployment. Do not release the client by bypassing the publisher compatibility hold.

## Storage and compatibility

The supported runtime is `postgres-local`, with shared game logic in `functions/`, current Core topology `core-expansion-v1`, world `main-realm-2026-10`, generation `realm-2026-10`, shared shard `shard_0001` at inspection. Runtime realm resolution remains authoritative at installation. No Firebase deployment, SQL schema migration or production player-data rewrite is required. `stables` and `scout_lodge` are additive normalized building keys. Existing paid projects and queues retain their recorded state. Existing marches lacking launch metadata retain their timing.

Private intelligence uses the established document store and transactions: a bounded index under `clans/{clan}/scoutIntelligence/{ownershipScope}`, private target snapshots and operation receipts beneath that scope. Scope hashes include realm, generation, shard, clan, Tower and ownership revision. API access rechecks current membership, probation and owned Lodge on every operation. The only readable subscription is an opaque current signal, reauthorized by local `Access` on every watch poll. Snapshot/index/receipt documents have no direct client read or write permission. The client clears private state on membership/auth changes or authorization errors, and never persists the board to browser storage.

Original `players/{uid}/serverReports` are authoritative. The older client-writable profile scout cache is never accepted as evidence. Copied fields are whitelisted and size bounded. Each board holds at most 50 active entries, with one metadata index and one document per target. Deadline checks happen before list, detail, capacity and retry handling; a minute-maintenance pass removes at most 100 expired documents per private collection group in the current realm. Physical cleanup may lag without extending access. Old ownership scopes cannot be accessed, even if their documents await expiry.

`getHoldingTowerState` advertises `clanTowerSupportVersion: 1`. Unsupported server responses hide new building navigation and leave share controls disabled; the War Room route explains unavailability. Public Tower responses contain completed building levels and capability, never intelligence. Old clients can continue normal gameplay against the upgraded additive server. The feature targets the current local adapter; retained Firebase rules do not expose the new private board.

## Separately approved installation sequence

1. Confirm the merged commit and all three required checks, current realm pointer and installed runtime fingerprint. Keep the configured publisher hold intact. No automatic extra database backup is requested.
2. With explicit backend-install authorization, use the established reviewed local service installation workflow for the exact merged server and adapter files, retaining the previous runtime for rollback. Do not rewrite Tower or player documents.
3. Restart the game/worker services as required by that workflow; validate health, realm identity, worker errors and the installed source fingerprint. Confirm capability version 1. Run disposable-schema integration/permission tests, never invent production test reports or move player troops for a smoke test.
4. Only after the backend matches and passes checks may the approved installer record compatibility and allow the configured publisher to activate its matching signed static package.
5. Verify `local-deployment.json`, backend identity and protected publisher status before marking live. Inspect the six-building interface using ordinary authorized gameplay. Do not charge the real Treasury merely to validate deployment.

Rollback keeps the publisher held and restores a compatible client/runtime pair through the existing workflow. New private intel may expire in storage; do not delete player data as a rollback step. Accepted movement snapshots must be preserved. Prefer forward repair if construction has already been purchased on the new server.

## Targeted validation and evidence

- Building validator: six normalized keys, all 60 level transitions/art mappings, exact new costs/durations/benefits, retired mechanics, shared slot, wall queue, pause/resume, repairs and capture/reset.
- Shared service cases on disposable PostgreSQL and emulator: membership/realm/probation, legitimate snapshots, original expiry, forged and foreign reports, capacity races, idempotency, replacements/removal, NPC spawn identities, capture/reacquisition, bounded cleanup, speed eligibility and cap.
- Actual local command integration: atomic Treasury construction and retry, server completion, real reinforcement/Tower/rally preview-dispatch parity, launch immutability, unboosted recall and successful scout resolution/sharing. No production service or player data is used.
- Local adapter watch test: same reauthorizing read used by `/data/watch`, including removal and wrong-shard denial; private collections and others' originals remain inaccessible.
- Shared movement, rally, scout/report lifecycle and Tower emulator suites are selected in `validation-plan.json`, with existing return and equipment validation.
- Actual game browser fixture: 1440×900, 1024×600, 1000×700, 844×390 and 568×320. Six-building navigation, fixed frame/footer, scroll preservation, tables, Intelligence list/detail/access clearing and courtyard mouse/touch navigation. Screenshots use fictional identities under `release-artifacts/clan-building-layout/` and `tmp/clan-buildings/qa/`.
- Eight generated sprites are transparent, aligned 512×512 PNG/WebP, with bottom anchor 496 and no repainted old art. WebP payload totals 402,478 bytes. The bounded client budget addition includes these eight sprites and the new interface; both interface modules and art load on demand. Existing shell integration adds a measured 9,484-byte cap overage, bounded at 10 KiB; no precache entry or image is added and the overall package ceiling is unchanged.

Final local/CI results and PR identity are reported with delivery. A successful merge alone does not change this deployment status.
