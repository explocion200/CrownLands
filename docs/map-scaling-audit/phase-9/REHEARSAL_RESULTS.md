# Real staging rehearsal results

The deployment started with all controls OFF and created no world state merely by deploying code. The controlled synthetic run then enabled only the required switches and returned all five controls to OFF at revision 36.

- 25 Core cells initialized; all 25 are spawn-ineligible; seasonal objective state initialized.
- Three generated player regions published and activated in clockwise order.
- Two additional validated packages remain STANDBY.
- Exactly 40 cities initialized for every ACTIVE generated region.
- Four starting candidates remained in every package.
- 15-NPC threshold: claim accepted at 15, leaving 14; subsequent placement rejected.
- Same-city contention: one success and one rejection.
- Three publications verified 9/9 objects; three activations completed atomically.
- Twelve immutable edge-contract documents; zero hidden OPEN destinations.
- All five generated packages contain 200 globally unique deterministic city IDs.
- Kill switches for generation, publication, activation, and expansion rejected their operation independently while existing claim/read gameplay continued.
- Control propagation observations ranged from roughly 0.36 to 0.75 seconds.
- Audit captured allocation, transition, publication, activation, control, and city-claim actions without unnecessary player personal data.

The two local worker adapters completed five deterministic package generations with zero retries and zero failures. Generation work took 54.85–102.17 ms per map; real Storage upload took 1.83–2.45 seconds; measured process RSS was 100.38 MiB. The process-local road cache remained bounded at 12 entries and used four entries. This proves the two-worker adapter and real upload path, but not cold-start/CPU/contention behavior of a fully cloud-hosted raster composer.
