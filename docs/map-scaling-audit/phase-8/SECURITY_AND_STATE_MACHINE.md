# Security and state-machine enforcement

Administrative operations require an authenticated `crownlands_map_admin`, the map-admin audience, staging-bound environment, current control revision, request schema, and idempotency key. Production-target requests are forbidden in Phase 8.

Privilege-escalation tests rejected a normal player across every generation, review, publication, activation, rejection, retry/regeneration, edge-contract, package-hash, and lifecycle action. They also rejected an unauthenticated forged admin, malformed requests, stale admin revisions, and player attempts to write privileged state. Concurrent duplicate publication produced one commit and one idempotent response.

Allowed forward lifecycle:

`ALLOCATED → GENERATING → VALIDATING → STANDBY → PUBLISHING → PUBLISHED → ACTIVE`

Explicit recovery edges are limited to pre-publication rollback/retry. Tests rejected `ALLOCATED → ACTIVE`, `FAILED → ACTIVE`, `PUBLISHED → GENERATING`, and `ACTIVE → STANDBY`. PUBLISHED has one forward transition: ACTIVE. ACTIVE is terminal for this controller.

The production feature flag remains OFF. Staging rehearsal permission is separate and cannot be converted into a production target by request fields.
