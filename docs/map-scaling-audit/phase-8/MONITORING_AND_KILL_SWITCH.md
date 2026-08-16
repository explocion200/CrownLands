# Monitoring, alerts, and kill switches

Recommended alerts:

- generation: warn above 2% failures for 15 minutes or three consecutive; critical above 5%
- retries: warn above one retry/map for 15 minutes; critical at five consecutive exhausted jobs
- publication or activation: any non-idempotent failure is critical
- package hash, coordinate collision, or edge inheritance: any occurrence is critical
- storage upload: warn above 1% for five minutes; critical above 5%
- STANDBY buffer: warn below 2 for five minutes; critical at zero with low placement capacity
- queue: warn when oldest job exceeds ten minutes or depth exceeds four; critical at 30 minutes
- controller: warn after two missed heartbeat minutes; critical after five
- spawn placement: warn above 5% unexpected failures for ten minutes; critical above 15%

Four independent manual switches stop expansion, generation, publication, or activation. The expansion switch supersedes the others. The rehearsal proved that engaging expansion blocks preparation while an existing ACTIVE map continues normal placement/gameplay.

Switches do not disable handcrafted maps or already-active generated maps. Feature-gate and switch changes require admin authority, revision checks, audit entries, dashboards, and paging for activation-blocking events.
