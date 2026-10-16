# Automatic publication to the Crownlands computer

The owner requested that merging game updates in GitHub publish them to the local
live server. The game backend became locally authoritative on October 16, 2026,
with external Google Cloud uptime monitoring retained. This publisher does not perform backend migration
and never deploys Firebase functions, rules, indexes, accounts or player data.

## Publication flow

1. Follow the existing feature branch, validation-plan and pull-request workflow.
   Main's ruleset requires a PR, an up-to-date branch and all three required checks.
2. A merge to main starts **Publish local game** on a GitHub-hosted runner. It
   verifies that the commit belongs to a merged PR and that the PR's required
   checks and latest release-gate run succeeded.
3. The exact merged commit is built and artifact-validated. GitHub signs its
   provenance and publishes the package and signature in a per-commit prerelease
   named local-game-COMMIT. These are public static game assets, with no secrets
   or server source. The normal latest-release designation is preserved.
4. The root-owned local systemd timer checks main every five minutes (plus up to
   15 seconds jitter). It downloads the package using public HTTPS; no GitHub
   token, incoming webhook port or self-hosted Actions runner is needed.
5. GitHub CLI verifies the package digest, repository, workflow, main ref, exact
   source SHA and GitHub-hosted signing runner. The publisher independently checks
   all file hashes, sizes and paths; links and special files are rejected.
6. A fresh version directory preserves the existing public website. After a final
   latest-main check, one atomic symlink switch activates the game. HTTPS checks
   on both game entry points verify the exact game files, service worker and build
   identity. A failed check restores the previous version and blocks retries of
   that commit. Interrupted activation is rolled back on the next run.

An uploaded GitHub package is not proof that it is live. Read the commit at
https://playcrownlands.com/local-deployment.json and local status before claiming
publication. A build normally takes several minutes; activation follows on the
next timer run. An offline computer catches up after it comes back online.

## Current backend boundary

The live game uses local accounts, PostgreSQL and local game services. The installed
publisher records their reviewed runtime fingerprint and active authority epoch,
in addition to the server source, release contract and retained Firebase build
configuration fingerprints. A package that changes these is held before activation;
the current game stays live. Runtime changes require a separately tested service
installation and explicit compatibility review before updating the publisher policy.
Do not bypass a hold by copying an uninstalled fingerprint into its configuration.
The older Firebase main-branch package is held until a compatible local migration
package has passed review, merged and been built. See [the transfer record](LOCAL_BACKEND_RELEASE_2026-10-16.md).

This phase automatically publishes the CrownLands game repository's static
client. It preserves the separately managed crownlands-website publication and
the contact inbox. It does not publish the website repository, database
migrations, native/itch.io packages, server processes, or changes to the
root-owned publisher itself.

The prepared local-backend mode additionally binds all local adapter source and
dependency locks to the installed runtime. It requires an active matching epoch,
the reviewed root-owned Node binary and the reviewed static transformation
helper. The helper reads verified package files as data and creates the local
client variant; it never executes downloaded JavaScript. Both the original signed
inventory and the transformed inventory are retained. Public deployment identity
records `postgres-local`, the epoch and transformed build ID. HTTPS smoke checks
also require the account and game APIs to report the same epoch. Missing or changed
local adapters are held for a separately tested service update.

This mode refuses Firebase publication once the authority control leaves standby.
Both normal rollback and recovery after interruption require a compatible local
previous release, preventing an old Firebase client from being restored after
the data transfer. A pause also prevents automatic recovery from switching files
during maintenance. This local mode and the first local release were installed
by the protected October 16 transfer; a successful GitHub merge alone does not
install a different backend.

## Install and operate

The repository contains reviewed source, not an unattended root installer entry
point. Prepare a private bundle with publisher.py, install.sh, both systemd unit
files, the official verified gh binary, config.json, a validated Caddyfile and a
SHA256SUMS inventory. The configuration records the expected current release and
original Caddyfile hash. The installer refuses changed preconditions or an
existing installation. Local Ubuntu administrator authentication is required.

Caddy continues using /srv/crownlands/current. Its historical fixed release
headers are removed during setup; local-deployment.json gives the current game
identity. The existing web routes and TLS configuration are preserved. The
installer adds publisher configuration/state to the existing encrypted backups.

Useful local commands:

    systemctl status crownlands-deploy.timer
    cat /var/lib/crownlands-deploy/status.json
    journalctl -u crownlands-deploy.service -n 60 --no-pager
    sudo systemctl start crownlands-deploy.service
    sudo python3 /usr/local/lib/crownlands-deploy/publisher.py --check

Pause publication by creating /etc/crownlands-deploy/paused as root, or stopping
and disabling crownlands-deploy.timer. Wait for any active service to finish
before manual operations. To resume, remove the pause file and start the timer.
Do not alter the source checkout to deploy; the service does not read it.

Manual static-client rollback requires a previous local release whose epoch,
backend contract and runtime fingerprint match the installed services. Never
restore a Firebase client or change database authority through a symlink rollback.
Pause the timer, stop the service, inspect
/var/lib/crownlands-deploy/last-success.json, and atomically repoint current to
that receipt's previous directory. Verify HTTPS, homepage, /play/ and the worker.
Keep publication paused until the offending change is reverted through a tested
PR or the issue is fixed. The publisher always targets latest main, so a manual
rollback alone is not a permanent deployment hold.

Previous releases are preserved, not automatically deleted. Publication is held
when less than 1 GiB remains free. Monitor disk usage and periodically review old
auto-COMMIT release directories; never remove the active version, the previous
version in the last-success receipt, or a pending transaction's targets. A failed
candidate remains for inspection. A retry of the same failed SHA requires
deliberate cleanup of its inactive candidate and blocked receipt after diagnosis.

If activation fails, the game remains on or returns to the previous release.
Read status.json for the reason. This change adds deployment logs, not a new
email alert channel; existing external game-availability alerts remain active.

## Validation

tools/test-local-deployment.js runs authorization and workflow checks plus
isolated Python fixtures for packaging, unsafe paths/links, tampering, backend
holds, stale commits, failed signatures, exact live-file checks, atomic
activation, failed activation rollback and interrupted activation recovery.
No fixture changes production files or contacts players.

The first live rollout must additionally verify a real GitHub-signed package and
the systemd sandbox on this host. Neither unit fixtures nor a passing PR prove
that root installation or live activation happened.
