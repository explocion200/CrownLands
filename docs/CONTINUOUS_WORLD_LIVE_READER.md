# Private current-game reader

Owner-approved next step, October 20, 2026. This is an owner-only, read-only preview; it does not enable the continuous map for players. The earlier fixture and phone previews remain available separately.

## Connection and scope

`tools/map-benchmark/seamless/live-server.js` listens on `127.0.0.1:8802`. It reads the authoritative current-realm pointer and active expansion list rather than assuming the 81 prepared art sections are the whole world. The inspected October realm contained **112 active sections**: 25 Core and 87 New Lands, including 31 generated sections. Archived realms are excluded.

A separate two-hour local operator grant selects the owner's viewer identity. It neither signs into nor modifies a game account, and does not replace any live game session. The login key stays in a mode-0600 local file and is submitted only to the loopback preview. The server uses a port-specific HttpOnly, SameSite=Strict cookie, exact Host/Origin checks, allowlisted assets, no-store responses, and a restricted CSP. There is no LAN exposure, public reverse-proxy route, game command or game-login proxy. Query strings cannot select another viewer.

The `crownlands-world-reader` PostgreSQL role is NOLOGIN, has SELECT on the current game's document table, and no game-write/schema-creation or authentication-table access. Noninheriting membership requires the preview to explicitly select that role. Reads use `REPEATABLE READ READ ONLY` transactions and existing `Access` checks. The helper's one-time administrator lookup identifies the explicitly supplied verified account; no account or game records are updated. A separate expiry timer removes the grant and role after the preview ends. Merge/publishing does not install this helper or start the reader automatically.

The preview stops serving on grant expiry/removal or a change to the live activation controls. It clears client data when membership is revoked or the realm/active-section contract changes; the latter requires restarting the private reader. It does not automatically follow a season reset into a new realm.

## Data and coordinates

The inspector receives a strict projection: object identity, name, section, public ownership, level-appropriate artwork, position, and permitted troop disclosure. It shows the viewer's own exact city/camp and active-march counts only after fresh ownership and permission checks. Other forces remain hidden or use an existing explicit public estimate/exact marker. Canonical enemy order details, inventories, email, scout payloads, forming rallies and clan-only garrison details are not included. Player-specific cosmetic/flag parity is not part of this milestone.

The source documents use compatibility world coordinates, not artwork pixels. `live-catalog.js` inverts the existing authoritative route planner's bounds and places the result within the continuous section grid. Generated New Lands retain their server template's compatibility bounds while receiving their actual grid placement. Original game coordinates remain separate. This preserves saved city positions; the fictional prototype's redistributed display positions are not applied to live cities.

Public movement copies supply routes and launch/arrival times. The preview interpolates along those recorded paths, clamps at arrival, and allows following. It cannot send, recall or resolve a march. Source geometry failures are counted; oversize areas/routes fail explicitly rather than silently truncating them.

A bounded production audit on October 20 read all 112 sections in seven requests: **5,740 selectable objects, one current movement and 57 own-count projections**, with **zero omitted objects/routes**. Those counts describe that instant, not a permanent population. Reads took **55–307 ms per 16-section batch**, with decoded JSON payloads approximately 0.87–0.97 MB including scenery. Only aggregate results were retained in `release-artifacts/continuous-live-reader/production-read.json`; no raw account/game export was created.

## Resource limits and consistency

- At most 16 requested sections, 2 database connections, 16 admitted reads including waiting requests, and one outstanding read per viewer. Connection waits stop after 250 ms; SQL statements after 1.5 seconds. Excess work receives HTTP 429 and a retry delay.
- One visible-area poll per second; overview stops detailed area reads. A query reads at most 2,400 source rows, 256 movements, and 8,192 route points per movement. A snapshot is capped at 4 MiB. These are prototype limits, not silent pagination.
- Public area projections are shared for up to 750 ms, with single-flight loading and at most eight cached windows. Exact own counts never enter that cache and always use fresh ownership reads. Public and private data therefore need not represent the same instant; the private projection is independently permission checked.
- At most 128 viewer cursors, evicted after two idle minutes on subsequent reads. Deltas use per-viewer identity/realm epochs and content hashes. Lost/obsolete cursors resnapshot; client area generations reject obsolete responses.
- Existing rendering limits remain: four full terrain images, sixteen thumbnail images, two concurrent asset requests, viewport culling, shared sprites and frame-synchronous transforms. Private selection is cleared when its authoritative area is unloaded, avoiding retained private details without fresh permission checks.

## Concurrent-reader measurements

Measured on the home server with Node 22, isolated fictional accounts, 112 sections and 12 fixture marches per section. Each viewer requested a crowded 16-section window once per second for eight cycles. HTTP timings include JSON processing, local transport and the client in the same test process. These short tests are not a multiplayer capacity guarantee or a long soak.

| Viewers | Area pattern | Successful reads | Deferred (429) | Median / p95 successful read |
|---|---|---:|---:|---:|
| 10 | Same window | 80 / 80 | 0 | 4.9 / 60.3 ms |
| 25 | Same window | 200 / 200 | 0 | 4.6 / 507.0 ms |
| 50 | Same window | 389 / 400 | 11 | 6.0 / 268.7 ms |
| 100 | Same window | 644 / 800 | 156 | 11.3 / 532.9 ms |
| 50 | Eight dispersed windows | 302 / 400 | 98 | 35.9 / 684.9 ms |

A synchronized 100-viewer burst accepted 18 reads and deferred 82; no unexpected status or growing database queue occurred. Peak admitted work stayed at 16, database work at two, cache at 100 viewer entries, and source rows at 1,147. Peak sampled Node heap was about 234 MiB and process CPU about 73% of one core in the dispersed test. The load generator and server share that process; PostgreSQL and browsers are not included in its CPU/heap figures. Gzip is enabled for JSON; unchanged polls transfer small deltas.

Two separate browser profiles passed the visibility and ownership-change checks. Six-second moving-camera samples measured **60.0 FPS / 16.7 ms p95** at 1440×900, **59.2 FPS / 16.8 ms** at 844×390, and **59.3 FPS / 16.8 ms** at 568×320. Both landscape runs used Chrome's 4× CPU slowdown. There were no browser exceptions, outside requests or image failures; image residency remained within its limits and listener count stayed at 19. Emulation is not a new physical-phone result. The earlier user-reported 88 FPS Android check used the fictional Stage 3 preview, not this live reader. Machine-readable local results and screenshots are under `release-artifacts/continuous-live-reader/` and are not published game assets.

These results support private/small-cohort testing. Larger cohorts still require reducing repeated projection/serialization work, testing moving viewers across more distinct windows and a longer stability run. Do not increase the database pool to hide the bottleneck on the live game server. Do not call 50–100 simultaneous viewers fully smooth based on these results.

## Validation and operation

Focused tests cover coordinate round trips across all 112 sections; generated-template bounds; exact/estimated/hidden disclosure; two independent browser identities; ownership loss/deletion; source immutability; wrong realm/shard; invalid and expired grants; in-flight revocation; bounded routes including cross-section and long paths; timestamp-based following; overview/unload; local-only HTTP routes; no outside network requests; and load admission limits. Existing access, stream, mobile-input, terrain/camera and production-artifact validators remain selected as affected dependencies. The production build must exclude all preview tools, terrain and grants.

Install development tooling with `pnpm install --frozen-lockfile --ignore-scripts`. Sharp is pinned only as a development dependency for the private in-memory overview; its packaged native binaries work without running installation scripts. The CI static gate now installs the root development tools as well as the existing function/backend dependencies.

To start a separately authorized local session, an administrator runs the reviewed `prepare-live-reader.py --user <desktop-user> --email <owner-email>`. Start `live-server.js --grant=<private-grant-file> --port=8802` as the desktop user with a two-hour service limit, and arrange administrator cleanup using `prepare-live-reader.py --user <desktop-user> --remove` just after expiry. Do not paste the key into a URL, report or Git. Stop only the private preview service before early cleanup. No game restart or database backup is required.

The owner preview created for this work uses the transient user service `crownlands-world-live-preview.service` and the administrator cleanup timer `crownlands-world-reader-expiry.timer`. The grant is at `~/.local/share/crownlands-world-reader/grant.json`. The visible entry is `http://127.0.0.1:8802/__benchmark__/seamless/?catalog=full` on this computer only.

Before public rollout: integrate normal player authentication deliberately, validate the full required visibility/cosmetics contract, reduce large/dispersed-cohort delays, perform a longer moving-viewer soak, inspect generated-section artwork joins and obtain rollout authorization. Generated sections currently reuse their existing server-assigned art templates; the 81 prepared sections' seam work does not prove every new template adjacency is seamless. All gameplay and travel rules remain on the current live map.
