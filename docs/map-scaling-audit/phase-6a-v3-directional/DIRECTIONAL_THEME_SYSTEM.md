# Directional Crownlands region themes

Phase 6A directional approval uses a deterministic development-only classifier based on a player region's world-grid coordinate. The dominant axis selects the regional family:

- negative dominant Y: North / light winter;
- positive dominant X: East / tropical frontier;
- positive dominant Y: South / dry frontier;
- negative dominant X: West / grassy temperate.

Exact diagonal ties belong to North or South according to Y. This makes every outer-layer coordinate deterministic and keeps classification stable as layers grow.

The four families change climate palette, restrained vegetation, and perimeter material. They do not change the Crownlands camera, structure scale, lighting logic, road grammar, city capacity, or gameplay rules. This classifier is not wired into production region creation during Phase 6A.
