# STANDBY buffer evaluation

Phase 7 evaluated buffer sizes one and two. Both kept every package undiscoverable until explicit publication.

| Buffer | Measured asset bytes | Operational behavior |
| ---: | ---: | --- |
| 1 | 344,998 | No warm spare remains after consumption. |
| 2 | 682,706 | One package may be consumed while one remains ready. |

The approved Phase 6F raster pipeline has a 3,413.631 ms p95. A second package costs approximately one additional map plus thumbnail (296,943 bytes by the 10,000-map baseline) and covers a single worker delay or failure without authorizing automatic activation.

Recommendation: maintain a target of two validated STANDBY packages per world frontier. This is a controller target, not an activation trigger. Administrators must still separately approve publication and activation.

Back pressure should stop new generation when the target is met, object-storage health is degraded, validation failure rate rises, or the previous clockwise coordinate is unresolved. The controller must never skip a failed coordinate and create a ring hole.
