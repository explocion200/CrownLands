# Boss stamina cost — reconciled rollout

Owner confirmed the 20-stamina Clan Boss cost on October 21, 2026 and requested
merging/deploying pending updates on October 22. PR #681 was behind main and
contained older stamina proposals. Reconcile it with deployed PR #698: keep
flat 30-Crown refills, one per UTC day, no passive recovery and no hunt refunds.
This document replaces the uninstalled recovery-cutoff proposal; do not create
its policy record or migrate permanent stamina to version 2.

## Resulting behavior

- Solo departures cost 10 stamina; Clan Boss rallies cost 20 for every assembled
  member, with the existing eligibility, troop and reward rules preserved.
- Formation, joining and scouting remain free. Readiness requires at least 20;
  launch rechecks all members and debits everyone atomically, or debits nobody.
- New departures record the charged cost. Retry receipts preserve the original
  result without another debit. Already launched marches keep their timing,
  charge and settlement; no retroactive extra charge or stamina refund.
- NPC Info, scout reports, troop preparation, rally readiness/confirmation and
  refill details consistently distinguish solo and boss costs.
- Preserve permanent stamina state version 1 and refill offer version 3. Saved
  balances, paid-day allowance and old receipts remain valid. Refills cost 30
  at every non-full balance; time, rewards, recalls and unavailable targets do
  not replenish stamina. No data migration or additional database backup.

## Compatible backend/client rollout

The current live authority is PostgreSQL with `core-expansion-v1` monthly-shared
worlds. Verify the current realm pointer and exact installed source fingerprints.
Keep the publisher compatibility hold until the reviewed backend installation
has passed. Install the exact merged functions and generated release manifest
using the protected game/worker workflow, retaining the previous runtime for
rollback. Do not change archived worlds, player data or installed publisher code.

The owner explicitly authorized merging and deploying all pending updates in
this task. After the required exact-head checks succeed, verify the merged
package, isolated installed-dependency PostgreSQL fixtures, game/worker health
and backend identity. Publish the compatible static client through the normal
signed-package publisher and verify its identity and bytes on both game hosts.
A merge or this document alone does not establish deployment.

## Focused verification

- Keep PR #698 rules and shared transaction cases: no recovery/refunds, flat
  price, retained balances, UTC allowance, wallet races and receipt replay.
- Real PostgreSQL rally calls: both leader and ally at 19 versus 20, atomic
  rejection, one debit at launch, duplicate launch and unavailable settlement.
- Marauder combat emulator: solo 10 versus boss 20, readiness, launch/settlement
  retries, old/new encounter versions, five-member rewards and private reports.
- Desktop and landscape source/production browser checks: 10/20 cost labels,
  live HUD updates, launch confirmation at 19/20, refill review and preserved
  troop drafts; shared report/window dismissal and public guide checks.
- Review the complete diff against the latest main to retain the later Clan
  Tower, chat/shop, map and castle UI changes. Do not merge closed/superseded
  feature branches merely because their squashed commits are not ancestors.
