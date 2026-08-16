# Firebase and Storage cost model

This is a planning model, not a billing quote. Rates were checked on 2026-08-16 against official Firebase/Google Cloud pricing for a us-central1-style Standard deployment:

- Firestore reads: $0.03/100,000
- Firestore writes: $0.09/100,000
- Firestore storage: $0.00020/GiB-hour
- regional Standard Cloud Storage assumption: $0.02/GiB-month
- Cloud Storage Class A: $0.005/1,000 operations
- Cloud Storage Class B: $0.0004/1,000 operations
- conservative first-tier internet transfer assumption: $0.12/GiB after 100 GiB/month

Sources: `https://firebase.google.com/docs/firestore/pricing`, `https://firebase.google.com/docs/firestore/standard-edition`, and `https://cloud.google.com/storage/pricing`.

Per-region assumptions are 47 persistent Firestore documents, 80 KiB including index planning overhead, 227 one-time reads, 135 one-time writes, 12 immutable object uploads, and 100 monthly map views (200 object reads). Spawn volume includes 26 successful placements down through the 15-NPC boundary.

| Regions | Full package storage | One-time Firestore ops | Firestore storage/month | Object storage/month | Upload ops | 100-view origin transfer without CDN |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 0.317 GiB | $0.19 | $0.01 | $0.01 | $0.06 | 27.65 GiB |
| 10,000 | 3.166 GiB | $1.90 | $0.11 | $0.06 | $0.60 | 276.55 GiB |
| 100,000 | 31.660 GiB | $18.96 | $1.11 | $0.63 | $6.00 | 2,765.49 GiB |

At 90% CDN hit rate, modeled origin transfer falls to 2.77, 27.65, and 276.55 GiB respectively. Transfer and logging—not package storage—become the material scale variables. Confirm the real region, bucket class, free-tier eligibility, CDN pricing, backup/PITR retention, Functions compute, log ingestion, and actual player traffic before rollout.
