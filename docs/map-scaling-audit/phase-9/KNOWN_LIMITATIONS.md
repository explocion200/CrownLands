# Known limitations and blockers

1. Required physical Android and iPhone QA is not performed because no devices were available.
2. Moderate/slow network figures are controlled client-side throttling over real Storage responses, not real carrier runs.
3. Cloud Monitoring policies are active and test signals were emitted/reset, but no external paging channel was authorized.
4. Same-day actual staging cost is unavailable without a billing-export dataset; the USD 25 budget and thresholds are verified.
5. The real Firebase control plane, transactions, functions, Storage, and uploads were exercised, but raster composition itself ran in the two-worker local adapter. Cloud raster-worker cold starts, CPU, queue delay, and Firestore contention remain unproven.
6. Studio desktop workflow passed; authenticated mobile/PWA and offline workflows remain part of physical-device QA.
7. Phase 9 intentionally leaves three generated player regions ACTIVE in isolated synthetic staging and two STANDBY. No generated production region exists.
8. The current functions are staging-specific. Production integration must be a later reviewed phase and must preserve package immutability and earlier-published edge contracts.

Because items 1, 2, 3, and 5 are required by the Phase 9 success criteria, the result is a completed staging engineering checkpoint with external blockers—not approval for Stage 0 production deployment.
