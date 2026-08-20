# Core main-city rules

The server-authoritative policy is `functions/core-main-city-policy.js`.

A player may capture, own, attack from, reinforce from and normally play on every Core map. Only main-city placement is restricted.

No main city may be set, repaired, restored or assigned inside these five Core regions:

- Crown Citadel: `core-v2-crown-citadel-p0-p0`
- Greybanner Hold: `core-v2-greybanner-hold-p0-m1`
- Aurum Keep: `core-v2-aurum-keep-m1-p0`
- Swiftgate: `core-v2-swiftgate-p1-p0`
- Ironwatch: `core-v2-ironwatch-p0-p1`

Enforcement uses the authoritative city record's region, not a client-supplied region. The shared canonical-main-city repair selector excludes forbidden regions. A stale restricted pointer is reassigned to the oldest eligible owned regular city, or cleared if none exists. `changeMainCity` rejects before cooldown or reinforcement side effects. Starting-city claim also checks the policy as defense in depth, although Core regions remain structurally spawn-ineligible.

RESET-1 exercises five assignment paths across all five restricted regions: direct change, repair, reset restore, returning-player restore and starting-city claim. It also sends five malformed requests that spoof an outer `regionId` while the authoritative city remains in a restricted Core region. All 30 attempts are rejected. Twenty normal Core capture/own/reinforce/attack checks remain allowed because they do not mutate main-city identity.
