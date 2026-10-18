# Canonical home-server game address

The owner confirmed that players should use `https://playcrownlands.com/play/`.
The alternate host's root, home/index pages, `/play` variants and historical
game-entry aliases redirect there with HTTP 308. Caddy preserves the query;
browsers preserve the fragment. The main domain's public website stays at `/`.

`tools/local-deploy/canonical_game_routes.js` prepares one insertion into the
existing `game.playcrownlands.com` block. It refuses duplicates or an unexpected
layout and never writes the installed configuration. Keep the original Caddyfile
and its hash, validate and test the candidate, then install the reviewed candidate
with administrator access and reload Caddy. Restore the saved original and reload
if any redirect, website, publisher or service-health check fails.

Game assets, service workers, manifest and deployment identity keep their existing
routes. Requests with `Sec-Fetch-Dest: empty` retain the original cache-fetch
behavior; navigation and ordinary GET/HEAD entry requests redirect. Existing
blocked methods and private-path exclusions still run first. The existing
`app-entry.js` fallback also sends cached alternate-host home pages to `/play/`.
Neither redirect transfers browser sessions, installs apps, clears storage or
changes game data. An old installed shortcut may need reinstalling from the
primary address; a player without a primary-domain session may need to sign in.

Validation uses `tools/test-canonical-game-routes.js` and the existing PWA routing
validator. Run the new test with `--caddy` on the server to exercise real Caddy
redirects, encoded queries, cache-fetch exclusions and preserved asset routes on
an isolated loopback port. After installation, verify public redirects and
fragments in a fresh browser profile, the website's unchanged content, exact
publisher smoke checks, and website/backup/service health endpoints. A merge
alone does not install this root-owned routing change.

Caddy's [redirect](https://caddyserver.com/docs/caddyfile/directives/redir) and
[validation/reload](https://caddyserver.com/docs/command-line) documentation
describe the server commands used here.
