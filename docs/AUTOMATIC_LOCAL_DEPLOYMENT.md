# Automatic publication to the Crownlands computer

The owner requested that merging game updates in GitHub publish them to the local
live server. The game backend became locally authoritative on October 16, 2026,
with external Google Cloud uptime monitoring retained. This publisher does not perform backend migration
and never deploys Firebase functions, rules, indexes, accounts or player data.

## Publication flow

1. Follow the existing feature branch, validation-plan and pull-request workflow.
   Keep the branch current with main and pass all three required checks before
   merging. GitHub Free does not enforce private-repository branch rules; the
   local workflow and publisher enforce the release requirements below.
2. A merge to main starts **Publish local game** on a GitHub-hosted runner. It
   verifies that the commit belongs to a merged PR and that the PR's required
   checks and latest release-gate run succeeded.
3. The exact merged commit is built and artifact-validated. Development dependencies
   are installed with `pnpm install --frozen-lockfile --ignore-scripts`, matching
   the validation workflow. Sharp uses the locked platform binary packages; the
   publisher does not approve or execute dependency install scripts. A dedicated Crownlands
   Ed25519 key signs the package digest, repository ID, commit, main ref, workflow,
   runner environment, run/attempt and merged-PR authorization receipt. The package
   and `provenance.json` signature are uploaded to a private per-commit prerelease
   named local-game-COMMIT. The normal latest-release designation is preserved.
4. The root-owned local systemd timer checks main every five minutes (plus up to
   15 seconds jitter). A GitHub App creates a short-lived installation token scoped
   to this repository, with read-only Actions, Checks, Contents, Pull requests and
   Metadata permissions. Tokens stay in memory. Downloads use authenticated GitHub
   asset APIs; credentials never follow redirects to the release CDN. No incoming
   webhook port or self-hosted Actions runner is needed.
5. The server verifies the signature with its root-owned pinned public key and
   independently asks GitHub for the merged PR, exact PR head, latest successful
   release-gate run and all three successful checks from that run's check suite.
   It verifies that the reviewed PR head contains main's immediately preceding
   commit, rejecting a PR merged after its base became stale.
   It also requires the signed publishing run/attempt to finish successfully for
   the exact main commit and workflow. It checks every file hash, size and path;
   links and special files are rejected. PR authorization and main are rechecked
   immediately before activation. Missing packages or unfinished publication wait
   for the next timer; invalid signatures or authorization cannot deploy.
6. A fresh version directory preserves the existing public website. After a final
   latest-main check, one atomic symlink switch activates the game. HTTPS checks
   on both game entry points verify the exact game files, service worker and build
   identity. A failed check restores the previous version and blocks retries of
   that commit. Interrupted activation is rolled back on the next run.

An uploaded GitHub package is not proof that it is live. Read the commit at
https://playcrownlands.com/local-deployment.json and local status before claiming
publication. A build normally takes several minutes; activation follows on the
next timer run. An offline computer catches up after it comes back online.

The owner confirmed the primary game address on October 18, 2026. Alternate-host
entry navigations redirect to `https://playcrownlands.com/play/`; see
[canonical game routing](CANONICAL_GAME_ADDRESS.md) for the separate Caddy change.
The publisher follows this entry redirect and still checks exact bytes. The
alternate host retains static assets and worker-cache requests, so publisher
code, backend identity and monitoring endpoints do not need to change.

The dedicated signature replaces GitHub artifact attestations, which require
Enterprise for private repositories. It is a Crownlands-managed signing trust,
not a GitHub/Sigstore attestation. Protect the repository owner's account, Actions
secret, workflow changes and the server's root access. The server's independent
PR/check policy prevents deploying direct pushes; it cannot stop an owner from
changing GitHub itself. Keep the repository private and continue the reviewed PR
workflow. GitHub Free includes a monthly private Actions allowance; exhausted
minutes can delay updates without stopping the already-running game. Do not
enable paid usage or reduce validation to work around a quota without review.

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
point. For an initial installation, prepare a private bundle with publisher.py,
github_access.py, local_runtime.py, install.sh, both systemd unit files, config.json,
github-app.pem, publish-signing-public.pem, a validated Caddyfile and a
SHA256SUMS inventory. The configuration records the expected current release and
original Caddyfile hash. The installer refuses changed preconditions or an
existing installation. Local Ubuntu administrator authentication is required.

For the existing public-to-private publisher upgrade, prepare a separate private
bundle with `upgrade_private.py` and exactly these five inputs: `publisher.py`,
`github_access.py`, `config.json`, `github-app.pem`, `publish-signing-public.pem`.
`upgrade.json` records SHA-256 `before` and `after` maps for all five filenames
(null means an installed file did not exist). Review the bundle and its checksums
before running it as root. The upgrade pauses only the publication timer, acquires
its lock, refuses pending activation or maintenance, and preserves every backend
and authority setting. It saves the previous files in a private backup directory,
installs atomically per file, checks authenticated access and candidate validation
without activation, and restores the old files if that check fails. The previously
active timer state is restored. A power loss during an operator upgrade requires
inspection of this backup before resuming publication. Game services, Caddy routes,
player data and the active static symlink are not changed by this installer.

The config adds only `githubApp` with positive integer `appId`, `installationId`
and `privateKeyFile: /etc/crownlands-deploy/github-app.pem`. Install the App only on
`explocion200/CrownLands` (repository ID `1269252620`), disable webhooks, and request
only the five read permissions above. The App RSA key must be root-owned mode 0600.
The Ed25519 private signing key belongs in the repository Actions secret
`CROWNLANDS_PUBLISH_SIGNING_KEY`; never commit it or install it in the public web
directory. Only the public half is pinned on the server. The publisher reads
credentials from protected files and never uses the operator's broad CLI token.

To rotate signing keys, pause publication, generate a new Ed25519 pair privately,
update the Actions secret and installed public key together, and verify a new
signed main release before resuming. Existing packages signed with the old key
will be rejected. For App key rotation, generate a replacement in GitHub, install
its private file with mode 0600, verify read-only access, then revoke the old key.
Deleting the App installation revokes private publishing access without stopping
the live game. `/etc/crownlands-deploy` is included in the existing encrypted
backups; treat its recovery access as sensitive.

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
activation, failed activation rollback and interrupted activation recovery. Private
transport tests exercise real Node-to-OpenSSL Ed25519 signatures, RSA App JWTs,
least-privilege token scopes, redirect credential stripping, bounded responses,
sanitized errors, exact workflow/check-suite authorization and installer rollback.
No fixture changes production files or contacts players.

The first private rollout must additionally verify a real Actions-signed package and
the systemd sandbox on this host. Neither unit fixtures nor a passing PR prove
that root installation or live activation happened.
