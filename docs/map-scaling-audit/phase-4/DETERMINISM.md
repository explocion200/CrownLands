# Seed and generator version

The seed is the SHA-256 digest of:

```text
worldId | seasonId | regionId | gridX | gridY | generatorVersion | seedSalt
```

`phase4-prototype-v2` is the exact-40-capacity generator version. Version 1 remains a historical prototype and is not silently reinterpreted. Every publication package must retain its generator version, seed hash, configuration, topology, definition, and validation receipt. A later algorithm version must not regenerate an old region automatically.

Each named fixture was generated three times. City IDs, positions, counts, starting candidates, connection states, validation outcome, and generation hash were identical across all repeats. Reversing city array order also retained the same identity/coordinate projection.

The open fixture produced hash `9f34e7f1fdb1183e0fbd5263bf6c4317a8292a074a24ad54c675b9c480ae7b25`. The explicit alternate seed produced `e2d208f47b3378bdb246621a062a2800842b43e5545b78d12b7901549c34138b`. The layouts differed while both produced exactly 40 valid positions and satisfied spacing, blockers, corridors, and starting-candidate rules.
