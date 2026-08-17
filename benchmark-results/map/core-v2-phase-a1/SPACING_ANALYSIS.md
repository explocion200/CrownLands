# Core v2 Phase A.1 spacing analysis

Development-only analysis of the approved Phase A city coordinates. `p5` is the linearly interpolated fifth percentile of each city's nearest-neighbor distance. Threshold columns count unordered city pairs with center distance strictly below the stated number of source-image pixels.

| Map | Cities | Min | p5 nearest | Median nearest | <70 | <75 | <80 | <90 | <100 | <112 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Crown Citadel | 60 | 68.542 | 68.593 | 79.474 | 3 | 10 | 18 | 39 | 54 | 71 |
| Ironwatch | 60 | 68.797 | 69.123 | 78.361 | 2 | 15 | 25 | 46 | 62 | 83 |
| South-West Holding Tower | 55 | 68.476 | 70.725 | 83.259 | 1 | 9 | 15 | 31 | 45 | 60 |
| Deed Camp West-South | 60 | 68.029 | 68.264 | 74.813 | 6 | 20 | 30 | 50 | 59 | 74 |
| West Support | 70 | 68.007 | 68.348 | 75.611 | 6 | 24 | 38 | 73 | 89 | 100 |

## Tightest pairs

- Crown Citadel: core_137edcb01078fb7532 ↔ core_94c614ada9199d0b68, 68.542 px.
- Ironwatch: core_d0e02b8a2da6475b9d ↔ core_f18c4016807f0b9bf5, 68.797 px.
- South-West Holding Tower: core_c693956b21b4452a5d ↔ core_ed33f0127eb86103cc, 68.476 px.
- Deed Camp West-South: core_5f1ecb6d3865829807 ↔ core_7e3e4489b1174f3cd8, 68.029 px.
- West Support: core_1d0917b5e1c7377016 ↔ core_4421c601ff81b7f206, 68.007 px.
