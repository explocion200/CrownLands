# Linked-account city-capture protection

This implements the owner-confirmed October 6, 2026 rules for regular cities. The coordinated release is `crownlands-2026-10-06-linked-account-capture-v1`. Merge, deployment, production account-link writes and IP activation each require explicit authorization. A merged build is not a live feature.

## Player behavior

An administrator-confirmed pair, an active existing browser-installation pair, or a shared exact IP observation prevents direct city capture in either direction. Battles still resolve normal casualties and battle rewards; survivors return and the defender retains ownership and city level. Capture rewards, ownership events, retaliation grants and conquest progress are withheld. Existing Main City, Shield, objective, King Power and Anti-Handoff rules continue to apply.

IP eligibility requires both accounts to have used the same normalized exact address within 30 days. One account cannot renew the other account's observation. IPv4-mapped IPv6 matches IPv4; IPv6 subnet similarity is not a match. IP histories and confirmed pairs survive monthly resets. The existing installation-pair expiry and objective attack restrictions remain unchanged. An installation ID identifies a browser installation, not verified physical hardware. Household, VPN and carrier sharing receive the same IP restriction.

Administrator-confirmed pairs remain active until explicitly removed. Removing one does not override independent IP or installation evidence. Pair links are explicit and symmetric; the system does not infer a third pair from two automatic links. Indirect transfers and neutral routes appear in the report for review and are not automatically blocked. There is no retroactive city reversal.

## Deployment and trusted ingress gate

1. After authorized deployment preparation, provision a random secret of at least 32 characters as `LINKED_ACCOUNT_IP_HMAC_KEY` in Secret Manager. Never commit or print its value. Keep this key stable while observations remain active; rotation requires a separately reviewed overlap migration.
2. Deploy the coordinated client, backend and indexes only after required checks pass and deployment is authorized. The new release ID rejects older gameplay clients. Confirmed/installation protection is effective with this backend; IP collection starts disabled because the verification record does not yet exist.
3. Obtain an administrator Firebase ID token and independently establish the current public source IP. Put each in a named environment variable without logging their values. The read-only probe requires an `admin` or `developer` claim; `statsAdmin` is insufficient.
4. Run the ingress verifier from each of two different public networks. `--suffix-length` identifies the source position counted from the right in the Google-added header suffix, including the source itself. Choose it from the actual ingress route, then verify it; the verifier refuses a candidate that does not match the independently known source IP. Its four requests include a normal request and forged forwarded prefixes. HMAC fingerprints must remain identical within one network and differ across networks. It never uses Express's trust-all `request.ip`, the leftmost forwarded entry, or an arbitrary address header.

Google documents that values preceding its appended client/load-balancer suffix are unverified, and backend proxies can append further addresses. The verified source position must correspond to the deployed callable route. See [Google's X-Forwarded-For documentation](https://docs.cloud.google.com/load-balancing/docs/https#x-forwarded-for_header).

```powershell
node tools/verify-linked-account-ingress.js --project crown-land-b15e0 --token-env ADMIN_ID_TOKEN --ip-env SOURCE_PUBLIC_IP --suffix-length <verified-source-position> --output <outside-repository-receipt.json>
```

5. Review the two receipts and run the security CLI in dry-run mode. Receipts must be less than 24 hours old, each contain four passing checks and use the same suffix length. The CLI requires different source fingerprints and an explicit ready current realm.

```powershell
node tools/admin-linked-accounts.js --project crown-land-b15e0 --mode enable-ip --world <current-world> --reset-generation <current-generation> --realm-shard <current-shard> --receipt-left <receipt-a.json> --receipt-right <receipt-b.json> --reason "Reviewed two-network ingress verification"
```

6. Only after explicit authorization, repeat with `--apply --confirm-plan-hash <reviewed-hash>`. The CLI commits version-checked state and an administration audit, then verifies the result. Realm or state changes invalidate the plan. Collection failures reject the affected request; security-read failures retry resolution rather than permitting ownership transfer. Reverify after any ingress/proxy change.
7. Use controlled accounts on each published channel to verify same-network and separate-network behavior, both directions, changed links during transit, non-capturing victories and report messaging. Verify backend/client build identity before calling the feature live.

The verifier is read-only. Enabling collection and recording a confirmed pair are production security-data changes; neither is included in ordinary implementation validation.

## Confirm or remove account pairs

Resolve exact current account IDs internally. Display names alone are insufficient. For the two DON accounts, match the Main Cities **Silverworth** and **Crowmoor Gate** and verify both profiles' current ownership before preparing the pair. Do not include account IDs or private network evidence in public reports.

```powershell
node tools/admin-linked-accounts.js --project crown-land-b15e0 --mode confirm --left-uid <exact-account-a> --right-uid <exact-account-b> --left-main-city "Silverworth" --right-main-city "Crowmoor Gate" --world <current-world> --reset-generation <current-generation> --realm-shard <current-shard> --reason "Owner-confirmed common control"
```

Review the sanitized names/Main Cities and plan hash. Apply only with explicit authorization and `--apply --confirm-plan-hash <reviewed-hash>`. Use `--mode remove` to revoke a confirmed pair through the same reviewed flow. The CLI verifies the realm, account profiles, Main Cities, existing pair version and atomic commit. The audit records the action, reason, server update time and a hash of the authenticated operator identity. Cloud audit logs retain the request principal. Confirmed pairs do not expire or reset with a new season.

## Five-day audit

```powershell
node tools/audit-linked-city-feeding.js --project crown-land-b15e0 --world <current-world> --reset-generation <current-generation> --realm-shard <current-shard> --output <outside-repository-report.json>
```

Defaults are five days and at least 36 regular cities, including a player's Main City in the ownership count. Optional `--days` and `--min-cities` change those report filters; they do not affect enforcement. Read-only queries paginate without silently truncating and use one server-provided snapshot timestamp. The current realm is verified again before writing the report.

The report includes current holdings and acquisition records, starting/end counts, net growth, directed transfers across all players, retained cities, possible intermediary/neutral routes and prevented captures. Names include Main Cities where available. Present-day signals are explicitly labeled `current-state`; prevented-capture audits use `recorded-at-resolution`. Neither current shared IPs nor similar names prove historical common control. Missing acquisitions, conflicting duplicate events and broken chains are disclosed; incomplete or inconsistent history withholds baseline metrics. The report writes no production data.

Intermediary and neutral routes appear even without an existing account link. Directed route candidates are ranked by transfer-chain count and retained cities; ordinary wars can produce the same patterns, so these are review leads. Current identity signals are attached separately rather than required for inclusion.

The existing daily cleanup removes expired temporary network observations and 90-day capture audits with update-version preconditions, so a concurrent refresh cannot be deleted. Confirmed pairs and their administration trail remain until explicit administrative action. Security collections remain denied to all game clients.
