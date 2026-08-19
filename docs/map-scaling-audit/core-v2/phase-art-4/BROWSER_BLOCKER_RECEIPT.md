# ART-4.1 external Browser blocker receipt

ART-4.1 interactive Browser QA is formally deferred because the external Codex Browser local-origin permission layer rejected a healthy development fixture.

## Evidence

- The isolated loopback fixture served successfully.
- `http://127.0.0.1:8816/__core_b1__/` returned HTTP 200.
- A fresh in-app Browser session still reported a saved local-origin permission block.
- No alternate browser, port, hostname, raw CDP command, or other workaround was attempted.
- The failed attempts did not change Crownlands candidate art, geometry, runtime code, settings, production files, or production state.

## Recorded decision

```yaml
interactiveRuntimeQA:
  status: DEFERRED_EXTERNAL_TOOL_BLOCK
  blocker: CODEX_BROWSER_LOCAL_ORIGIN_PERMISSION
  productionBlocking: true
  artProductionBlocking: false
```

ART-4 may be checkpointed and later Core art production may proceed after review. This status must never be represented as an interactive runtime pass.

Before Core v2 can replace production Core maps, enter live-world migration, activate, or be used for a season reset, all 25 finished Core maps must pass the final consolidated interactive Core QA gate described in `RUNTIME_QA.md`. The five ART-4 maps are mandatory members of that future run.
