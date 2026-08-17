# Project, IAM, and security

## Identity guard

- Staging project: `crownlands-map-staging-2026` (`292945299558`)
- Production project: `crown-land-b15e0` (`542378516435`)
- Mutating confirmation: exact project-bound `PHASE9_STAGING_MUTATION:<staging-project>` value
- Destructive confirmation: separate exact project-bound `PHASE9_DESTRUCTIVE_STAGING_CLEANUP:<staging-project>` value
- No staging tool defaults to a Firebase project.
- The environment guard rejects missing, unknown, or production targets before mutation.

## Service accounts

| Role | Service account | Project roles |
|---|---|---|
| Generation | `phase9-generation@…` | Datastore User, Firebase Auth Viewer, Storage Object Creator, Logs Writer |
| Publication | `phase9-publication@…` | Datastore User, Firebase Auth Viewer, Storage Object Viewer, Logs Writer |
| Activation/claim | `phase9-activation@…` | Datastore User, Firebase Auth Viewer, Logs Writer |
| Backup | `phase9-backup@…` | Datastore Import/Export Admin, Storage Object Admin, Logs Writer |
| Monitoring | `phase9-monitoring@…` | Datastore Viewer, Monitoring Metric Writer, Logs Writer |
| Operator | `phase9-operator@…` | Datastore User, Firebase Auth Viewer, Logs Writer |

No Phase 9 service account has Owner or Editor. The human operator receives only short-lived token-creator access to the backup identity; no service-account key file is created.

## Authority model

Cloud Run transport is reachable for Firebase callable protocol, but every privileged callable verifies the Firebase ID token server-side with revocation checks. It then requires the server-issued `crownlandsMapAdmin` claim, `crownlandsEnvironment=staging`, a session age under one hour, and a matching active/revisioned/non-expired Firestore authority record. A client-supplied claim alone is insufficient.

The real staging suite rejected unauthenticated writes, normal-player privileged calls, malformed tokens, forged claims, stale authority revisions, revoked authority, wrong-environment claims, direct lifecycle writes, and STANDBY package reads. Concurrent same-city claims produced exactly one success and one rejection.

Firestore and Storage rules grant clients no privileged generated-world writes. Signed-in players may read ACTIVE catalog/region/city state; STANDBY data, package metadata, edge contracts, controls, authority records, and audit data remain restricted. Server SDK operations remain controlled by IAM and application checks.
