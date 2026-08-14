# Seed and generator version

The seed is the SHA-256 digest of:

```text
worldId | seasonId | regionId | gridX | gridY | generatorVersion | seedSalt
```

`phase4-prototype-v1` is the initial generator version. Every publication package must retain its generator version, seed hash, configuration, topology, definition, and validation receipt. A later algorithm version must not regenerate an old region automatically.

Each named fixture was generated three times. City IDs, positions, counts, starting candidates, connection states, validation outcome, and generation hash were identical across all repeats. Reversing city array order also retained the same identity/coordinate projection.

The open fixture produced hash `6c5d16e91ab14c7bdc3122076564124774f4bfc84b003210641b13cbe095a742`. The explicit alternate seed produced `6d6a7b6bc827760f9046dd03a39a36fe2fe3685517c31e0c7bfb5b6c68d96042`. The layouts differed while both satisfied spacing, blockers, corridors, starting candidates, and the 15-city minimum.
