# Main City login and cleanup reliability

Investigated September 19, 2026 against main build `f038046128d3f0f684f93fecfce9b4e31863cd92`, also served by the canonical game host. The production realm pointer was verified read-only as `main-realm-2026-09`, generation `realm-2026-09`, shared shard `shard_0001`; the live topology is `core-expansion-v1`.

## Login failure

The reported player's profile pointed to an eligible Core support map. The referenced city existed, belonged to that player, and had its Main City flag set. No production player data was changed.

Core city IDs are opaque. During a cold login, setup loads the home map's JSON, but that does not populate the separate playable-city index. Main City verification then rejects the valid server response because it cannot recognize the city or resolve its region. Moving from a New Lands city to a Core city exposes this dependency on cached map data. Recovery to another unloaded Core map has the same problem.

The shared recovery request now loads and materializes the returned map before validating exact city membership. It checks the response status, active region, Main City eligibility, and current-realm island before loading; existing city/region checks remain intact. Map loading has a bounded timeout. Failed, incomplete, forged, or mismatched responses still fail closed and cannot trigger a fresh starting-city claim.

Regression coverage uses all eligible Core support maps with empty city indexes, JSON loaded without city materialization, warm retries, recovery to a different map, wrong-map and forged city IDs, invalid responses, fetch failures, and timeouts. The real browser runtime also exercises cold and warm recovery at 1440×900, 844×390, and 568×320.

## Performance and scheduled cleanup

`getCityRegionId` previously scanned and sorted the active map list even after finding the city in its index. It now returns immediately for an indexed city, and returns after a valid New Lands identity before the remaining fallback scan. A 1,000-lookup regression verifies zero active-world scans for indexed cities. This removes unnecessary work; it is not a measured production FPS improvement.

A complete bounded error-log query for the preceding 24 hours identified missing collection-group ascending indexes on `expiresAtMs` for `dailyMissions`, `bulkOrderRequests`, and `cityUpgradeRequests`. Those indexes are added while retaining the default collection indexes. This restores the existing scheduled cleanup queries without changing retention rules or invoking a data cleanup manually. Firestore requires explicit indexes for filtered collection-group queries ([Firebase documentation](https://firebase.google.com/docs/firestore/query-data/index-overview)). A static gate checks these indexes because the emulator does not enforce their production availability.

The same window contained five HTTP 500 responses from the daily-mission event trigger and one daily-mission claim timeout, without a diagnostic application error identifying their cause. These observations do not establish a separate reproducible defect or prove that the missing cleanup indexes caused player-visible lag. The Main City recovery sample contained successful responses and no errors, consistent with rejection in the client after server verification.

## Release verification

Run `prepare-pr` and require Static validation, Multiplayer emulator validation, and Validate before merge. Deploy the added Firestore indexes without deleting unrelated production indexes, wait for them to become ready, and verify the expiry queries read-only. Publish the merged client and verify its build ID and recovery code on each published channel. No Functions source, gameplay rules, economy, cooldowns, archived-world data, or player migration is changed. A successful player sign-in after updating remains the final user-level confirmation; isolated browser tests do not impersonate the affected account.
