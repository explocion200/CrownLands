# Staging reset rehearsal

The complete RESET-1 sequence ran on 2026-08-19 in Firebase staging project `crownlands-map-staging-2026`. Production project `crown-land-b15e0` was independently identified and was never a mutation target.

Final staging run ID: `reset1-pre-september-2026-v8`. Superseded `v1`–`v7` receipts remain retained for audit because staging data is not destructively rewritten. The final run includes the field-level Common Gear allowlist, concrete post-reset gameplay proof, explicit old-season freeze/new-season entry gating and an isolated active-pointer compare-and-set using a Firestore update-time precondition.

The rehearsal created an isolated synthetic old season and replacement season, wrote before/after snapshots for four players, initialized 25 Core regions and 1,480 Core cities, referenced the locked 118-asset manifest for four 40-city outer packages, validated the new season, set it READY, switched the RESET-1 staging pointer and archived the synthetic old season.

Remote result:

- 29 region documents: 25 Core, two ACTIVE player regions after threshold expansion, two STANDBY packages;
- 1,640 city documents: 1,480 Core plus four 40-city outer packages;
- four before-player and four after-player documents;
- 1,696 deterministic data-document writes plus eight fresh control transitions; the identical replay used six control writes and skipped the already-committed pointer transition;
- final fresh run duration: 14.419 seconds;
- identical idempotent replay duration: 6.814 seconds;
- final replay receipt hash: `28071b5d7a745d79a7b4e0fe9cbd5b369da86ef78c8e13af6649529056e2de82`;
- reset input/local receipt hash: `427ae5b9db8c8b9b1d443632597bc5518c10bb4b2df4ef1884c273bf7ca2f04c`;
- production mutation performed: false.

The first `v1` verification pass read only Firestore's first 300 city documents, asserted before pointer switch and stopped. The data initialization had succeeded, but the synthetic old season remained active. The verifier was changed to paginate all documents and the identical run ID replayed successfully. This is recorded as a useful idempotent-resume test, not hidden as a clean first attempt. Later run IDs preserve reviewed receipt-schema and cutover improvements rather than overwriting earlier evidence. Final `v8` was run fresh and then replayed with identical input; the second run detected the committed revision and skipped a redundant pointer cutover.

The pre-September target remains Tuesday, 2026-08-25. Repeat this same guarded rehearsal then using current release artifacts and expected reset population; do not change the procedure on reset day.
