# Deploying the troop-production exceptions

This is part of the pending 25% production release. Sir Prize and Sir Render keep the previous base production and production-scaled troop rewards for 20 days from deployment. Nothing in PR preparation activates a timer.

## Authorized coordinated deployment

1. Confirm merge and production deployment authorization. Verify the current Core monthly realm pointer and the merged release contract. Publish the matching client, backend and rules as one coordinated release; retain the existing stale-client gate.
2. At the start of deployment, record one UTC timestamp in milliseconds. Resolve the current realm's exact world, generation and shard. Run the command below as a dry run with those values. It resolves the two current leaderboard names, validates their account profiles and prints only names, dates, pending count and a plan hash. It does not write data or start a timer.
3. Review both names and the exact start/end dates. Repeat the same command with `--apply --confirm-plan-hash <printed-hash>`, immediately before deploying the increased-production backend. Apply accepts a start within 15 minutes and writes both account fields atomically. The previous backend ignores this field. Keep these dates with the deployment evidence.
4. Deploy and verify the release on each named channel. Verify both accounts receive the old base (for example, level 100: 15,227/hour), while another account receives 19,034/hour. Verify their reward previews follow the same base. Do not announce the release as live until deployment checks pass.

```powershell
node tools/admin-troop-production-exclusions.js --project crown-land-b15e0 --world <current-world> --reset-generation <current-generation> --realm-shard <current-shard> --starts-at-ms <deployment-start-ms>
```

The command reads the account IDs internally and never writes them into source or console output. A changed account name, ambiguous lookup, realm mismatch or concurrent profile edit stops activation. If a concurrent edit prevents the atomic commit, rerun the dry run and apply with the same start timestamp. A successful retry is a no-op. An existing window cannot be changed or restarted by this tool, including after expiry. If deployment fails after activation, retain that window while resuming the same deployment; any decision to replace it requires explicit authorization and a reviewed repair.

Expiry requires no scheduled job or manual removal. Each calculation checks the saved timestamp; collection splits old/new production at expiry. The policy remains attached to the account through name changes and profile rebuilds. Historical rewards and existing troops are untouched.
