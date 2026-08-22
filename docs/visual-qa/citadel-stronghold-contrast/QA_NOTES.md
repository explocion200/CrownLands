# Citadel and Stronghold contrast QA

The fixture loads the production stylesheet cascade in the same order as `index.html` and uses the production Citadel/Stronghold DOM classes.

Views:

- `?kind=citadel&view=overview`
- `?kind=citadel&view=ledger`
- `?kind=stronghold&view=overview`
- `?kind=stronghold&view=ledger`

Validated viewports:

- 1200×800 desktop
- 844×390 mobile landscape
- 540×320 narrow landscape

The fixture deliberately includes long ruler and clan names, all dark-blue card text tiers, a normal parchment ledger row, and the highlighted current-ruler row.
