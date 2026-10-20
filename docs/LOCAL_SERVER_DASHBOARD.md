# Private server statistics

Netdata Agent 2.12.1 was installed on the home Ubuntu server on October 20,
2026, using Netdata's signed stable Ubuntu repository. The local dashboard is
free and works without a Netdata Cloud account or subscription.

## Open the panel

- On the server: <http://127.0.0.1:19999/>
- On the home network: <http://192.168.1.145:19999/>
- Through the owner's Tailscale network: <http://100.114.92.30:19999/>

If the welcome page offers sign-in, select **Skip and use the dashboard
anonymously**. The sign-in and paid Cloud features are optional. Use Metrics
and its Charts navigator to find **System**, **PostgreSQL** and **Crownlands**.

This is an administrator panel, not a player-facing website. LAN HTTP relies
on the trusted home network; remote access must use Tailscale, whose tunnel is
encrypted. Everyone allowed onto those private networks can read the panel.
There is no router port-forward, public DNS name, public IPv6 listener, or
public Caddy route for it. Never forward port 19999 to the Internet.

## What is measured

Host CPU, RAM, swap, disk, network, process and system-service usage refresh
every five seconds. PostgreSQL refreshes every ten seconds: connections,
transactions, locks, checkpoints and database I/O. Per-table/index collection
is skipped for the game database. Top-query history is disabled. The separate
running-query browser function requires sensitive-data authorization and was
verified inaccessible on this unclaimed, anonymous dashboard (HTTP 412).

The Crownlands charts refresh every ten seconds:

- **Health:** database, workers, email, notifications, payments and game/auth
  service health; receipt freshness; seasonal backup health. One means healthy;
  zero means unhealthy or unavailable, not necessarily a player-visible outage.
- **Queues:** dead, overdue and stalled worker jobs, recorded worker errors and
  failed outcomes, pending/failed email and payment deliveries. Worker error
  totals accumulate since the worker started; they are not errors per second.
- **Worker lag:** how far the scheduled work is behind, in minutes.
- **Publisher:** current, waiting for a build, held/paused, error, and freshness.
  A waiting or held release does not mean the currently published game is down.

The custom collector reads only the existing sanitized operations and publisher
receipts. Operations older than 90 seconds and publisher receipts older than
15 minutes are marked stale; unavailable queue readings are gaps, not invented
zeroes. Backup health is read from the existing loopback `/backup-healthz`
service, so the season-before deadline and completion grace remain authoritative.
No new backups or restore drills are scheduled. Existing Google Cloud uptime
and email alerts are unchanged; Netdata alarms are visual only.

## Installed files and limits

Repository source | Installed destination
--- | ---
`tools/server-monitoring/netdata.conf` | `/etc/netdata/netdata.conf`
`tools/server-monitoring/go.d.conf` | `/etc/netdata/go.d.conf`
`tools/server-monitoring/postgres.conf` | `/etc/netdata/go.d/postgres.conf`
`tools/server-monitoring/crownlands.plugin` | `/usr/libexec/netdata/plugins.d/crownlands.plugin`
`tools/server-monitoring/private.conf` | `/etc/systemd/system/netdata.service.d/private.conf`
`tools/server-monitoring/monitor-role.sql` | Applied once to PostgreSQL roles; not an application migration

Configuration and plugin files are root-owned. The collector runs as `netdata`,
without sudo or game credentials. Its PostgreSQL role uses Unix peer
authentication, `pg_monitor`, and CONNECT on `crownlands_migration`. It has no
game-schema/table grants, defaults to read-only transactions, permits at most
three connections, and times out SQL after two seconds.

Netdata is enabled at boot. Its systemd group has a 512 MiB memory soft limit,
1 GiB hard limit, low CPU priority, and a cap of half one CPU core. Agent network
traffic is restricted to loopback, the home subnet and Tailscale IPv4 by systemd.
Only the three listed IPv4 addresses listen. UFW permits port 19999 from
`192.168.1.0/24` on `eno1`; existing private Tailscale access is reused.

Metrics rotate automatically: up to 1 GiB / three days at five-second resolution,
plus 256 MiB / thirty days at five-minute resolution, whichever limit is reached
first. These are metrics, not game backups. Netdata machine learning, eBPF and
unneeded external collectors are disabled. Go autodiscovery is disabled; only
the explicit PostgreSQL job runs. No dashboard Cloud claim or export is set up.
Agent telemetry is disabled through the opt-out file and systemd environment.

## Installation and recovery procedure

Inspect the live configuration and privileges before applying this host-specific
profile; it contains the server's reserved LAN/Tailscale addresses. Do not
overwrite an unrelated Netdata installation or reuse an unknown existing role.

1. Follow the [official native package instructions](https://learn.netdata.cloud/docs/netdata-agent/installation/linux/native-linux-distribution-packages).
   This host uses the flat stable repository
   `https://repository.netdata.cloud/repos/stable/ubuntu/`, suite `resolute/`,
   in `/etc/apt/sources.list.d/netdata.sources`. Its scoped keyring is
   `/usr/share/keyrings/netdata-archive-keyring.gpg`, with verified fingerprint
   `6E155DC153906B73765A74A99DD4A74CECFA8F4F`.
2. Mask `netdata.service` and install the private `netdata.conf` and empty
   `/etc/netdata/.opt-out-from-anonymous-statistics` **before** package installation.
   Simulate apt first. The verified install was
   `apt-get install --no-install-recommends -o Dpkg::Options::=--force-confold netdata`.
   It added 14 packages and upgraded/removed none. Set `NEEDRESTART_MODE=l`
   to prevent installation from restarting unrelated game services.
3. Install the files in the table as root, config mode 0644 and plugin 0755.
   Create destination directories if needed. Apply `monitor-role.sql` once as
   postgres after confirming no role named `netdata` exists. Do not rerun CREATE
   ROLE over an existing account or grant access to application tables.
4. Write `[global]` / `enabled = no` to
   `/var/lib/netdata/cloud.d/cloud.conf`, owned by netdata, mode 0640.
   The build still reports Cloud support as available; verify **Claimed: No**
   and **Online: No** with `sudo netdatacli aclk-state`. The systemd network
   restriction also prevents the agent from reaching public Cloud endpoints.
5. Add the narrow firewall allowance:
   `sudo ufw allow in on eno1 from 192.168.1.0/24 to 192.168.1.145 port 19999 proto tcp`.
   Keep public port-forwards unchanged. Unmask the unit, reload systemd, then
   `sudo systemctl enable --now netdata`.
6. Verify `/api/v1/info` on all three addresses; confirm only those listeners
   with `ss -ltn`. `/api/v1/charts` must contain `system.cpu`, `system.ram`,
   `postgres_crownlands.*` and all four `crownlands.*` charts with recent samples.
   Check service memory, restart count and the game's existing health endpoints.
   Browse the actual charts without signing in. A phone/remote Tailscale client
   is a separate network-path check; a host-local request does not prove it.

Configuration changes require only `sudo systemctl restart netdata`; never
restart the game or database for this dashboard. Review stable package updates
with apt normally; no separate Netdata updater schedule was installed.

To stop collecting, use `sudo systemctl disable --now netdata` and remove only
the dedicated UFW dashboard rule. Do not remove the existing Tailscale rules or
game services. Keep stored metrics until their removal is explicitly requested.

## Verification record

The local, LAN-address and Tailscale-address HTTP checks passed on the host;
configuration download was denied on all three. Netdata was unclaimed/offline
from Cloud, the private IP restrictions were active, and no public/IPv6
dashboard listener existed. Host, PostgreSQL and all four custom charts were
updating. The local dashboard loaded anonymously with visible live charts.
Initial memory use was about 125 MiB. Game page, auth and game health returned
HTTP 200; no game process or database restart was required.

At installation the existing worker receipt reported nine cumulative handler
errors and nine failed outcomes since its 11:29 EDT start, while dead/overdue/
stalled queues and schedule lag were zero. The panel preserves that unhealthy
worker flag; this dashboard installation does not claim those errors are fixed.

Offline validation: `node tools/validate-server-monitoring.js` checks health
freshness, missing/invalid receipts, numeric-only output, publisher states,
backup-policy delegation, private bindings and the database access profile.
No gameplay code or world data changes, so game/emulator suites do not apply.
