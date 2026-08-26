# Harvest pickup visibility and respawn release candidate

Date: 2026-08-25

## Player-facing patch notes

- The first map pickup still appears after three minutes.
- After a successful collection, the next pickup now appears after one minute.
- Pickups now favor safe locations toward the center of each map, improving visibility on larger islands.
- Gold and troop pickups continue to alternate, with one active pickup at a time and the existing daily limits unchanged.
- Switching maps safely relocates an active pickup while preserving its identity and reward state.

## Release scope

- Separate the three-minute initial delay from the one-minute post-collection delay on the client and authoritative server.
- Preserve exact spawn deadlines through backgrounding, refreshes, reconnects, and server responses.
- Retry failed placement after five seconds without creating duplicates.
- Search the nearest safe point in 15%, 25%, then 35% center zones while retaining terrain, city, camp, and transition clearance.
- Scale pickup hit targets with map zoom and preserve a visible glow at low, medium, and high zoom.
- Keep rejected collections non-destructive: the active pickup and its existing deadline remain intact.

## Validation evidence

- Full static release gate passed, including lint, security audit, gameplay regressions, 1,185-city route parity across 20 maps, and production artifact validation.
- Focused Firebase emulator test passed for raw reward authority, successful one-minute deadlines, stored profile state, and rejected-collection preservation.
- Local browser soak passed fresh three-minute spawning, repeated one-minute alternating collections, background/foreground recovery, refresh/reconnect recovery, active-pickup refresh, and cross-map relocation.
- All-map placement sweep passed on 20 of 20 maps.
- Desktop, tablet landscape, and mobile landscape passed at low, medium, and high zoom, with visible glow and 55–59 px clickable targets.
- QA controls are loopback-only and excluded from the production game source and packaged artifact.

Screenshots:

- `soak-ordinary-first-spawn.png`
- `soak-after-background-respawn.png`
- `soak-map-relocation.png`
- `soak-mobile-landscape-final.png`
- `desktop-center-medium.png`
- `landscape-high.png`
- `mobile-landscape-high.png`

## Staging checklist

- [ ] Confirm the staging client and Functions report the same release/build metadata.
- [ ] With a fresh QA account, verify the first pickup appears after three minutes.
- [ ] Complete at least five consecutive collections and verify each next pickup appears after one minute.
- [ ] Confirm gold and troop pickups alternate through the five-cycle run.
- [ ] Background and restore the app across a deadline; verify the deadline is preserved and one pickup appears.
- [ ] Refresh/reconnect before and after a deadline; verify pickup state, daily counts, and the exact deadline persist.
- [ ] Switch maps with an active pickup; verify the same pickup relocates to a safe center-biased position.
- [ ] Confirm only one pickup is active and the existing per-type and total daily caps still apply.
- [ ] Sweep representative large and small maps for terrain, city, camp, and transition clearance.
- [ ] Check desktop, tablet landscape, and mobile landscape at low, medium, and high zoom.
- [ ] Review callable errors, duplicate-claim rejections, profile writes, and reward totals during the run.

## Production checklist

- [ ] Integrate the latest `origin/main`; this candidate was prepared from a branch behind the current mainline.
- [ ] Resolve any integration conflicts without changing the timer, placement, authority, or cap behavior.
- [ ] Rerun the full static release gate and focused pickup emulator test on the integrated commit.
- [ ] Complete the staging checklist when an authorized non-production target is available.
- [ ] Confirm rollback ownership and the previous known-good client and Functions artifacts.
- [ ] Deploy Functions and client in one coordinated release window and verify build/contract parity before opening traffic.
- [ ] Smoke-test a fresh three-minute spawn and two one-minute collections after deployment.
- [ ] Monitor pickup callable errors, reward totals, active-pickup counts, and client error reports through the release window.

## Rollback plan

1. Stop the rollout if pickup callable errors, duplicate rewards, missing rewards, multiple active pickups, unsafe placement, or timer drift appears.
2. Restore the previous known-good Functions build and client artifact together so timer behavior remains consistent.
3. Verify that existing player profiles retain their active pickup and stored deadline; do not bulk-delete pickup state.
4. Smoke-test the previous three-minute behavior, one-active limit, alternating rewards, and daily caps.
5. Reconcile any authoritative reward ledger anomalies before attempting another rollout.

## Release decision

The implementation is a release-candidate pass based on local static, emulator, artifact, and browser soak evidence. Production remains **no-ship** until the latest main branch is integrated and the candidate completes authorized staging validation.
