# Clan Heraldry v2 foundation

This directory is an architecture and visual-review artifact. It is not wired into the
production clan editor, clan creation, Firebase writes, or migration behavior.

## Generate and validate artwork

Use the workspace-bundled Python runtime (Pillow and NumPy are required):

```text
python tools/import-heraldry-symbols.py --manifest assets/clan-heraldry/art-set-v1/manifest.json
python tools/import-heraldry-symbols.py --manifest assets/clan-heraldry/art-set-v1/manifest.json --check
node tools/validate-clan-heraldry-v2.js
```

The importer is manifest-driven and supports either a separately approved micro source or a
deterministic review-only derivation from the approved full source. The five new uploaded
sources are intentionally retained byte-for-byte even though they are 1254×1254 rather than
the nominal 1024×1024 source contract; each is marked as an approved source exception and is
normalized before tracing.

## Compatibility boundary

- `clanHeraldryLegacyV1.js` is the frozen compatibility renderer and has exact output fixtures
  against the current renderer in `game.js`.
- `clanHeraldryRenderer.js` dispatches version 1 to that compatibility renderer and version 2
  to the sprite-backed foundation.
- Production `renderClanShield()` is not replaced in this branch.
- Missing `heraldryRevision` reads as `0`; no clan documents are migrated here.

## Approval stop point

The branch intentionally stops before the editor redesign, v1-to-v2 save, clan creation
integration, server migration, merge, deployment, and production rollout.
