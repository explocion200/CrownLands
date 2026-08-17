# Controls, monitoring, and cost

Firestore document `phase9Controls/staging` is the authoritative staging control source. Updates are revision-checked transactions. Turning the master `generatedWorldEnabled` switch OFF cascades generation, publication, activation, and expansion OFF. The final captured values are all OFF.

Fourteen enabled Cloud Monitoring policies cover generation failure, retry rate, queue age, low STANDBY buffer, publication failure, activation failure, package hash mismatch, edge-contract failure, duplicate coordinate, Storage failure, controller heartbeat, city-placement failure, Functions errors, and Firestore transaction aborts. A safe staging-only signal test raised and reset all 14 metric series. No production metric was emitted.

No external notification channel was authorized. The policies can create Cloud Monitoring incidents, but email/PagerDuty/Slack paging was not configured and remains a rollout blocker.

Billing is enabled only on the staging project. The budget is USD 25/month, filtered to the staging project, with current-spend thresholds at 50%, 80%, and 100%, plus a 100% forecast threshold. Default billing-account/project recipients remain enabled.

Same-day incurred cost is not available from the Budget API, and a billing-export dataset was not authorized. Phase 9 therefore reports the configured guardrail and measured resource/storage use, not a fabricated actual-cost total. Future planning should enable a staging-only BigQuery billing export before a longer soak test.
