# Crownlands Master Development Specification

**Version:** 1.7  
**Effective date:** August 24, 2026  
**Document status:** Authoritative baseline with read-only implementation verification  
**Evidence reviewed through:** August 24, 2026  

> [!IMPORTANT]
> This specification is the authority for intended Crownlands behavior and confirmed design decisions. The current Git repository and backend are the authority for current technical implementation. A verified production build is the authority for what players can actually use in that release channel. These states must never be silently conflated.

This document records confirmed rules, verified deployment status, unresolved conflicts, and planned direction for Crownlands. An old conversation, prompt, roadmap entry, implementation report, commit, or pull request does not become an authoritative design rule merely because it exists.

---

# Part I — Document Control

## FM-1. Authority and Source Precedence

### Intended behavior and design authority

1. This Master Development Specification is the planning source of truth for confirmed Crownlands behavior.
2. A later decision supersedes an existing rule only when the decision is explicitly confirmed and the affected rule is updated here.
3. If a new decision conflicts with this specification, the conflict must be identified before the specification is changed.
4. Brainstorms, questions, mockups, old prompts, roadmap ideas, and unapproved implementation suggestions are not authoritative rules.
5. Important replaced decisions should remain in the superseded-decision record when the history prevents future confusion.

### Technical implementation authority

1. The current Crownlands Git repository and backend are authoritative for how the game is technically implemented.
2. Codex must inspect the current repository before modifying anything. Prompts must not invent filenames, functions, Firebase collections, APIs, deployment topology, or architecture.
3. A local checkout that is behind current `main` is historical evidence, not current implementation authority.
4. A compiled distribution artifact can prove what that artifact contains, but it does not replace inspection of current source code.

### Deployment authority

1. `https://playcrownlands.com` is the primary LIVE production authority.
2. itch.io is a secondary published distribution channel and may temporarily lag web production.
3. A feature is not LIVE merely because it was implemented, committed, pushed, reviewed, or merged.
4. LIVE status requires a verified deployment to the named channel. When risk warrants it, production smoke-test evidence is also required.
5. A feature present on web but absent from the published itch.io build must be recorded as `LIVE — WEB`, not `LIVE — ALL PUBLISHED CHANNELS`.

### Evidence precedence

When sources disagree, use the following evidence order for the specific question being answered:

1. Explicit confirmed design decision recorded in this specification — intended behavior.
2. Current repository/backend inspection — technical implementation.
3. Verified release manifest and production smoke result — deployed behavior for that channel.
4. Current player-facing rules and guides — documented player-facing behavior.
5. Merged PR and completion report — implemented behavior, subject to deployment verification.
6. Open PR or development branch — work in progress or implemented but not live.
7. Roadmap entry — planned direction only.
8. Old conversations, prompts, prototypes, and brainstorms — historical or proposed material only.

## FM-2. Current Production Snapshot

Snapshot verified on August 24, 2026.

| Item | Verified state |
|---|---|
| Primary web production | Build `27105ae76fbb329559151030ebbac652a9ee8119` |
| Web deployment date | August 23, 2026 |
| Web world | 20 connected regions |
| Web release ID | `crownlands-2026-08-02-single-active-skill-preset-v1` |
| Web reset generation | `fresh-2026-07-26-server-reset` |
| Web world ID | `main-fresh-2026-07-26-server-reset` |
| Web API contract hash | `e6029faf76eb863612cebf975f69bbd2e5116571153a916993825a7a7f674020` |
| Published itch.io client | Build `289a9d82f16739fac8d73376a5c4c85e08aeadc5` |
| itch.io client date | August 22, 2026 |
| itch.io world | 15 connected regions |
| Authoritative repository commit inspected | `origin/main` at `27105ae76fbb329559151030ebbac652a9ee8119` |
| Remote `origin/main` verification | Local remote-tracking ref and remote Git ref matched at the audit time |
| Local working branch during audit | `codex/cloud-map-transitions` at `495e7dae04dafe630c36cc0481fb65823bcf261d`; inspected without checkout or mutation |
| New-player initialization in inspected source | 100 Gold, 200 troops, one Level 1 Main City |
| Exact deployed Cloud Functions source and runtime | **NEEDS VERIFICATION** through authenticated deployment/runtime evidence |

The web and itch.io clients target the same release ID, reset generation, world ID, and API contract hash. Their server-source fingerprints differ. Compatibility is intended but must be verified as part of cross-channel release QA.

The August 24 implementation verification inspected the exact `origin/main` Git object read-only. Repository facts in this document are therefore verified for commit `27105ae...`; they are not automatically proof that the corresponding backend code is deployed or that production data follows the same path.

## FM-3. Release Channel Matrix

| Capability | Web production | itch.io published client | Specification status |
|---|---|---|---|
| Core cities, economy, armies, combat, objectives, clans, rallies, chat, missions, achievements, Shop, Bag, and Common Gear foundation | Present | Present | `LIVE — ALL PUBLISHED CHANNELS` |
| Connected world size | 20 regions | 15 regions | Channel-specific LIVE state |
| Gear skill stacking and same-level upgrade availability | Present | Present | `LIVE — ALL PUBLISHED CHANNELS` |
| Gear Effects in battle reports | Present | Present | `LIVE — ALL PUBLISHED CHANNELS` |
| Inner Castle entry from Profile | Present | Absent | `LIVE — WEB` |
| Stronghold/Citadel contrast restoration | Present | Absent | `LIVE — WEB` |
| Scalable Shop pricing | Present | Absent | `LIVE — WEB` |
| Clan Heraldry v2 and live-editor fixes | Present | Absent | `LIVE — WEB` |
| Reworked Item Bag presentation | Present | Absent | `LIVE — WEB` |
| Identical Bag-item quantity stacking | Present | Absent | `LIVE — WEB` |
| Shop ad-layout and carousel-stability fix | Present | Absent | `LIVE — WEB` |
| Touch map-selection Shop/Bag guard | Present | Absent | `LIVE — WEB` |
| Holding Towers and Clan Treasury | Absent | Absent | `IMPLEMENTED BUT NOT LIVE` |
| Pending 5×5 Core world | Absent | Absent | `IN DEVELOPMENT` |
| Dynamic automatic map expansion | Absent | Absent | `IN DEVELOPMENT` |

The Release Channel Matrix must be updated whenever either published channel changes.

## FM-4. Status Definitions

| Status | Meaning |
|---|---|
| `LIVE — WEB` | Verified in the primary `playcrownlands.com` production build, but not verified in the current itch.io build. |
| `LIVE — ITCH.IO` | Verified in the published itch.io build, but not verified in current web production. This should be unusual and investigated. |
| `LIVE — ALL PUBLISHED CHANNELS` | Verified in both current web production and the current published itch.io build. |
| `IMPLEMENTED BUT NOT LIVE` | Implementation exists and may be review-ready or merged in a non-production state, but deployment has not been verified. |
| `IN DEVELOPMENT` | Active design, coding, integration, migration, or testing work remains. |
| `PLANNED` | Direction is accepted for future work, but implementation and/or detailed rules are incomplete. |
| `PROPOSED` | An idea under consideration; it is not an authoritative Crownlands rule. |
| `NEEDS VERIFICATION` | Available evidence is insufficient, stale, contradictory, or requires current repository/backend or production inspection. |

Status describes implementation and deployment state. It does not replace the distinction between confirmed design intent and current behavior.

## FM-5. Release Compatibility Policy

1. Web production is the primary LIVE channel.
2. itch.io may temporarily lag during release work, but the intended normal state is parity with the latest verified production-compatible web build.
3. The itch.io client must not be described as containing a feature until that feature is verified in the published itch.io artifact.
4. Before updating itch.io, validate artifact integrity, relative/subpath asset loading, authentication, backend contract compatibility, service-worker behavior where applicable, and representative gameplay flows.
5. A release must record build ID, channel, deployment time, artifact hash when applicable, validation result, and any known channel differences.
6. If the web and itch.io clients use the same backend while their source fingerprints differ, compatibility must be tested rather than assumed.
7. The target maximum duration for ordinary web/itch.io release lag is **NEEDS VERIFICATION**.

## FM-6. Terminology Glossary

| Term | Meaning |
|---|---|
| Crownlands | The shared real-time medieval strategy game and its connected realm. |
| Region / map | A connected, handcrafted world area containing cities, routes, and configured objectives. |
| City | A capturable holding that produces resources and contributes to progression. |
| Regular city | A normal player- or neutral-owned city, excluding Camps, Strongholds, the Crown Citadel, and Holding Towers. |
| Main City | The player’s primary city and home destination for system-specific returns and progression access. |
| Camp | A timed neutral reward objective: Gold, Warband/Troop, Relic, or Deed. |
| Stronghold | One of four major regional objectives that grants a specialized realm bonus. |
| Crown Citadel | The central prestige objective with a Reign Ledger and scheduled Citadel Legion pressure. |
| Holding Tower | A planned clan-owned military objective with shared garrison and no passive bonus. It is not currently LIVE. |
| Clan Treasury | The planned clan-owned Gold balance used for Holding Tower services. It is not currently LIVE. |
| Rally | A coordinated clan attack formed under the rules for its target type. |
| Reinforcement | Troops sent to support a valid friendly destination without transferring ownership. |
| Raw production | Base production used for scaling before temporary items, Gear, skills, objectives, or similar bonuses unless a rule explicitly says otherwise. Exact calculation scope must be configuration-backed. |
| Common Gear | Persistent officer equipment currently available at Common rarity. |
| Bag item / consumable | A normal consumable item held in the player’s Bag. These do not persist across seasons. |
| King Power | The ranking measure for individual kingdoms and aggregate clan strength. The `origin/main` implementation uses version 11; exact production runtime parity remains **NEEDS VERIFICATION**. |
| Season | A competitive period intended to end in a controlled reset and persistence process. Current cadence is not yet confirmed. |
| Reset | A controlled transition that clears normal world progression while preserving only explicitly allowlisted data. |

## FM-7. Conflict and Superseded-Decision Rules

1. Do not silently select one of two conflicting sources.
2. Record the conflict, affected section, evidence, and required resolution.
3. Do not mark a conflict resolved until the applicable implementation is inspected or a design decision is explicitly confirmed.
4. Later dates alone do not prove that one design decision superseded another. Supersession must be explicit or directly evidenced by an approved replacement.
5. Deployment never supersedes intended design automatically. A deployed defect remains a defect, not a new rule.
6. Implementation status and design intent must be edited independently.
7. The conflict register in Appendix B is part of this specification.

---

# Part II — System Specification

## 1. Game Vision & Design Principles

### Confirmed design

- Crownlands is a real-time, online-first medieval strategy game centered on building armies, capturing and developing cities, contesting objectives, joining clans, and expanding across a connected persistent realm.
- The strategic value of cities, armies, geography, timing, information, and clan coordination must remain central.
- Progression systems such as skills, items, Gear, and objectives should create meaningful choices without making the core city-and-army game irrelevant.
- Shared gameplay is server-authoritative. Client presentation must not determine authoritative outcomes.
- The game should remain understandable during time-sensitive decisions. Medieval atmosphere must not make text, actions, reports, timers, or state unreadable.
- The game experience is designed for landscape mobile play and PC.

**Status:** `LIVE — ALL PUBLISHED CHANNELS`

### Boundaries

- Crownlands is not defined by the superseded single-island, five-island, portal, or disconnected-world concepts.
- Public roadmap concepts remain non-authoritative until promoted to confirmed design.

### Open information

- Formal target audience, session-length goals, retention goals, accessibility standard, and product success metrics: **NEEDS VERIFICATION**.

## 2. Current World & Map Structure

### Current production

- Web production contains 20 connected regions. **Status:** `LIVE — WEB`.
- The published itch.io client contains 15 connected regions. **Status:** `LIVE — ITCH.IO` as a channel-specific world snapshot.
- Regions connect through defined north, south, east, and west edge routes. Portals are not part of the current map model. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Map artwork is a visual background; cities and objective markers are placed from gameplay data. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Region capacity is configured per region rather than treated as one universal capacity value. **Status:** `LIVE — WEB` and documented as actively balanced.

### Current region names

Confirmed named regions include:

- Crownlands Heart
- North Frontier
- West Marches
- East Reach
- Southfields
- Bandit Wastes
- Ironfall Hills
- Redbanner Fields
- Ashenfen March
- Relic Vale
- Graywood Hollow
- Greenrook Vale
- Lowroad Vale
- Stonebrook Farms
- Goldmere Plains

The web world also contains Regions 16, 17, 19, 21, and 22. These are temporary identifiers.

**Confirmed design rule:** Every Crownlands region should ultimately have a medieval-authentic name consistent with the established world. Final names for Regions 16, 17, 19, 21, and 22 are **NEEDS VERIFICATION** and must not be invented in implementation work.

### Pending Core world

- A 5×5 Core layout containing 25 maps, approximately 1,480 cities, 17 configured objectives, 40 reciprocal internal connections, and 20 gated outward edges has been developed and staged. **Status:** `IN DEVELOPMENT`.
- The Core is intended to be non-spawnable where reserved central/objective rules require it. Exact current reservation data must come from the current branch. **Status:** `IN DEVELOPMENT`.
- Future outward player regions are intended to expand the realm as population and capacity require. **Status:** `IN DEVELOPMENT`.
- Production migration to this world has not occurred.

### Needs verification

- Exact 20-region production topology, city capacities, total city count, reserved positions, and connection graph: **NEEDS VERIFICATION** against current production data.
- Exact automated expansion trigger, generation order, rollback behavior, and capacity thresholds: **NEEDS VERIFICATION** before promotion from development design.

## 3. Cities & Progression

### Cities

- A player begins with one Main City. **Status:** `LIVE — ALL PUBLISHED CHANNELS` for the starting-city flow.
- Cities produce Gold and troops over time, contribute progression value, and can be captured and developed. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- City levels contribute victory points used by progression and production systems. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Captured regular cities lose one level and never fall below Level 1. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Neutral captures are limited to 30 per player-local day, and neutral capture is blocked after the player owns 30 cities. Expansion beyond that ownership threshold must come from players. **Status:** `LIVE — ALL PUBLISHED CHANNELS` based on current audited rules.
- A city remains owned, productive, and defensible across the connected realm regardless of the region currently displayed. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.

### Hero and skill progression

- Hero XP awards Hero Levels, and Hero Levels award skill points. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- The current skill groups are Attack, Defense, and Utility. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Current skills include Swordmastery, March Orders, Field Medics, Shieldwall Discipline, Stoneworks, Tax Stewardship, Royal Granaries, and Guild Charters. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Four private skill presets unlock at Hero Levels 25, 50, 75, and 100. Current Apply cost is documented as 1,000,000 Gold. **Status:** `LIVE — ALL PUBLISHED CHANNELS`; current backend value should be checked before balance changes.

**Confirmed season rule:** Hero level, Hero XP, unspent skill points, acquired skill upgrades, and saved skill presets reset each season. Hero progression is normal seasonal world progression and is not part of permanent Gear progression.

### Verified `origin/main` initialization

The current server implementation at commit `27105ae...` initializes a fresh/reset player with:

- 100 Gold (`TEST_STARTING_GOLD`)
- 200 troops in the starting city (`PLAYER_STARTING_TROOPS`)
- one Level 1 Main City with defense `1`, invested Gold `0`, and current production timestamps
- Hero Level 1, XP `0`, and skill points `0`
- empty skill upgrades and default presets
- an empty normal Bag, no active item effects or purchase cooldowns, and default Common Gear state
- no battle or scout reports
- a default march percentage of 50%

These are **verified implementation facts**, not an independent balance-design confirmation. The exact deployed backend/runtime values remain **NEEDS VERIFICATION**. The prior 500 Gold/50 troops observation is not present in the inspected current initialization path.

### Needs verification

- Whether production Cloud Functions execute the inspected 100 Gold/200 troop initialization path: **NEEDS VERIFICATION** through a controlled runtime claim or authenticated deployment record.
- Whether 100 Gold and 200 troops should be promoted from current implementation values to explicitly confirmed long-term balance rules: **NEEDS VERIFICATION** by design decision.
- Current Hero XP curve, per-battle XP caps, Main City relocation rules, inactivity release rules, city level maximum, and every city-upgrade cost/time value: **NEEDS VERIFICATION** against current configuration.

## 4. Economy & Resources

### Confirmed current rules

- Gold and troops are the primary normal world resources. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- City production continues across the owned kingdom and must be resolved authoritatively. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Troop production is based on city progression value plus applicable production bonuses. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Gold production follows its configured production curve plus applicable skills, items, Gear, and objective effects. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Gold Camp, Troop/Warband Camp, world-pickup, Daily Mission, and Achievement production-scaled rewards use raw production rather than already-boosted production. **Status:** `LIVE — ALL PUBLISHED CHANNELS` for the August 22 and later clients.
- Raw production must exclude temporary bonuses and other multipliers unless a specific rule explicitly includes them.

### Verified `origin/main` production implementation

At commit `27105ae...`, regular-city production is server-authoritative and mirrored client-side for presentation:

- Gold production units at city level `L` are `floor(20 × 1.115^(L - 1) + 0.000001)`.
- Base Gold per hour through Level 100 is `production units × 15`.
- Above Level 100, the Level 100 base is multiplied by `1.08^(L - 100)` and floored.
- Level 1 therefore produces 300 base Gold per hour.
- City progression value for troop production is `floor(6 + 4L + 2 × L^1.35)`.
- Base troops per hour are `city progression value × 10`.
- Level 1 therefore produces 120 base troops per hour.
- Strongholds and the Crown Citadel produce zero base Gold and zero base troops themselves.

Permanent/untimed and temporary production additions are calculated separately against base production:

- Gold per hour = `base × (1 + (Tax Stewardship + Gear + objective Gold bonus) / 100) + base × Royal Tax Decree / 100`.
- Troops per hour = `base × (1 + (Royal Granaries + Gear + objective troop bonus) / 100) + base × War Drums / 100`.
- Royal Tax Decree is configured at 50%.
- War Drums is configured at 30%. The server code has a 5% fallback, but the active executable economy configuration at the inspected commit overrides it with 30%.

These formulas are verified repository implementation. Exact deployed backend parity remains **NEEDS VERIFICATION**.

### Web Shop scaling

- Paid consumable pricing scales from raw regular-city Gold production. **Status:** `LIVE — WEB`.
- The confirmed pricing model uses the following production-hour multipliers: Royal Tax Decree `0.18`, Swift March Order `1.0`, Recall Horn `1.25`, War Drums `1.5`, Veil of Silence `2.0`, and Royal Peace Shield `3.5`.
- The city-count premium is `1 + min(cityCount / 500, 0.35)`.
- The minimum calculated price is 50 Gold.
- Common Gear Box pricing remains separate at 1 billion Gold.
- The server calculates raw price as `raw regular-city base Gold per hour × item multiplier × city-count premium`.
- The premium uses floored non-negative city count: `1 + min(floor(cityCount) / 500, 0.35)`.
- Rounding uses `step = 10^max(1, floor(log10(raw price)) - 1)`, rounds to the nearest step, and enforces the 50-Gold minimum.
- The server recalculates pricing in the purchase transaction and rejects a stale client quote. These are verified `origin/main` facts; exact production runtime parity remains **NEEDS VERIFICATION**.

### Needs verification

- Resource caps, offline-production behavior, collection timing, upgrade costs, repair costs, gift limits, and economic sinks not listed above: **NEEDS VERIFICATION** against current configuration.
- Formal inflation targets and season-level economy budgets: **NEEDS VERIFICATION**.

## 5. Armies, Movement & Combat

### Movement

- Armies move in real time along valid routes for attacks, scouting, transfers, support, regrouping, and rallies. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Cross-region movement must use configured region connections. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- The attacking army’s launch-time attack value is locked when dispatched. Defender troops, reinforcements, ownership, wall repair, and applicable live defensive state may change until arrival. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.

### Combat

- Combat uses a two-stage siege: attack power damages one physical wall, then remaining attack power fights the garrison. Capture requires remaining attack power to exceed garrison defense. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Each attacking troop has `1.25` base attack power. Maximum Swordmastery raises it by 60% to `2.0`. **Status:** `LIVE — ALL PUBLISHED CHANNELS` based on current audited rules.
- Each defending troop has `1.30` base defense power before Shieldwall and other valid support. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Shieldwall Discipline adds 2% per level up to 60%. City level does not increase per-soldier defense. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- The regular-city wall curve is `200 + 28,858 × (level - 1)`. Stoneworks is the wall-strength skill multiplier. **Status:** `LIVE — ALL PUBLISHED CHANNELS` based on current audited rules.
- Full-breach repair time is `round(15 + 0.3 × city level)` minutes. Wall damage below 5% does not persist. **Status:** `LIVE — ALL PUBLISHED CHANNELS` based on current audited rules.
- Failed attacks and lost defenses award reduced XP according to current configuration. Exact current award calculation is **NEEDS VERIFICATION**.
- Field Medics returns a configured share of losses to the Main City. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.

### Scouting and reports

- A normal scout sends one troop and produces a ten-minute intelligence snapshot. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- A newer successful scout replaces the earlier snapshot for that target and restarts the timer. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Attack and defense reports remain available for 24 hours; successful scout entries expire with their ten-minute intelligence. **Status:** `LIVE — ALL PUBLISHED CHANNELS` based on current audited rules.
- Forecasts must explain wall and garrison stages and distinguish launch-time attack state from live arrival-time defense state. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.

### Needs verification

- Complete loss formulas, tie behavior, protected-raid rules, reinforcement limits, march-speed formula, route calculation, cancellation behavior, and every combat modifier order: **NEEDS VERIFICATION** against current client/server configuration.

## 6. Camps & World Objectives

### Camps

- Four Camp categories are live: Gold, Warband/Troop, Relic, and Deed. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- A neutral Camp starts with 20,000 defenders, has no wall, and gives each defender `1.00` defense with no personal skill or objective bonus. **Status:** `LIVE — ALL PUBLISHED CHANNELS` based on current audited rules.
- Camps are timed contestable objectives. A ruler must defeat defenders and hold the Camp through its public resolution timer to receive the applicable reward. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Gold and troop production-based Camp rewards use raw production. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Relic Camp payouts can include the configured Common Gear Box chance. Current audited value is 1%. **Status:** `LIVE — ALL PUBLISHED CHANNELS`; backend value should be verified before balance changes.

### Verified `origin/main` reward implementation

- A Gold Camp hold uses a 10-minute timer. The first four UTC-day rewards use: 20,000 minimum/0.5 production hour; 40,000/1 hour; 60,000/1.5 hours; and 80,000/2 hours. Later daily claims pay zero.
- A Warband/Troop Camp hold uses a 15-minute timer. The first four UTC-day rewards use: 10,000 minimum/0.5 production hour; 20,000/1 hour; 30,000/1.5 hours; and 40,000/2 hours. Later daily claims pay zero.
- Each production-scaled Gold or troop Camp payout is `max(minimum reward, floor(raw kingdom production per hour × reward hours))`.
- A Relic Camp uses a 30-minute hold and permits five item rewards per player per UTC day. Its item weights are War Drums 35, Veil of Silence 25, Swift March Order 18, Royal Tax Decree 12, Recall Horn 8, and Royal Peace Shield 2, plus a separate 1% Common Gear Box chance.
- A Deed Camp uses a 60-minute hold and permits one reward per player per UTC day. It grants one eligible neutral regular non-center city at that city’s existing level with zero troops.
- World pickups spawn every three minutes, expire after 20 minutes, and grant one hour of raw Gold or troop production with a minimum of 250. Daily caps are 50 total, 25 Gold, and 25 troop pickups, with at most one active pickup per player.

These are verified repository facts for commit `27105ae...`; exact deployed backend parity remains **NEEDS VERIFICATION**.

### Needs verification

- Camp respawn cadence, eligible rally behavior, contention edge cases, and production runtime parity for the verified values above: **NEEDS VERIFICATION**.

## 7. Strongholds & Crown Citadel

### Strongholds

- Four regional Stronghold types are live: Gold, Training, Movement, and Defense. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Strongholds provide specialized realm bonuses and serve as clan rally targets. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Stronghold ownership and relevant support must be represented in combat, scouting, and reports without double-counting. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Restored Stronghold information contrast is `LIVE — WEB` and absent from the audited itch.io build.

### Verified `origin/main` objective bonuses

- Direct control grants 8% for the objective’s specialization: Gold, troop training, march speed, or city defense.
- Clan-shared Stronghold benefit is half of the direct value: 4%.
- Direct Crown Citadel control grants 10% each to base Gold production, base troop production, march speed, city defense, and upgrade-cost reduction.
- Clan-shared Crown Citadel benefit is half of the direct value: 5%.
- Clan-aware calculation prevents an ordinary Stronghold holder from receiving its own full benefit plus its own shared half a second time.
- The Citadel controller receives the 10% Citadel benefit plus half of personally held non-Citadel Strongholds. For example, holding the Citadel and a Gold Stronghold yields 14% Gold production benefit.
- Another Gold Stronghold holder in the Citadel controller’s clan receives 8% from the held Gold Stronghold plus 5% shared Citadel benefit, for 13%.

The objective logic and explicit validator coverage are verified in `origin/main`; exact production runtime parity remains **NEEDS VERIFICATION**.

### Crown Citadel

- The Crown Citadel is the central prestige objective. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Citadel control is recorded in a Reign Ledger. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- The Citadel Legion selects up to 20 eligible regular non-main cities in the Citadel region at 9:45 AM and 6:15 PM America/New_York time and attacks at 10:00 AM and 6:30 PM with 100,000 NPC troops per target. **Status:** `LIVE — ALL PUBLISHED CHANNELS` based on current audited rules.
- Citadel Legion attacks ignore walls without damaging them. If the defenders are defeated, the city loses five levels; Level 5-or-lower cities return to neutral at Level 1 with 10 troops. Peace Shields do not block the event, and defenders receive no XP. **Status:** `LIVE — ALL PUBLISHED CHANNELS` based on current audited rules.
- Restored Citadel information contrast is `LIVE — WEB`. The separate Inner Castle entry from Profile is tracked in Section 16.

### Needs verification

- Capture safeguards, reset behavior, Legion target exclusions, scheduling failure recovery, complete Reign Ledger retention rules, and production runtime parity for the verified bonuses: **NEEDS VERIFICATION**.

## 8. Holding Towers

### Deployment status

Holding Towers and Clan Treasury are `IMPLEMENTED BUT NOT LIVE`. The audited implementation is in open [PR #159](https://github.com/explocion200/CrownLands/pull/159) at commit `e1abf11b46ab66d0586faeab06da083363fd565c`. None of the following gameplay rules may be described as LIVE until the PR is merged, deployed to web production, and verified.

### Confirmed design specification

- Four Holding Towers are planned:
  - Ravenwatch — northwest
  - Highguard — northeast
  - Blackthorn — southwest
  - Stoneward — southeast
- Holding Towers are clan-owned military objectives and grant no passive realm bonus.
- A clan may control all four Towers.
- Neutral Towers begin at Wall Level 1 with full integrity and 10,000,000 NPC defenders.
- Tower conquest is rally-only and requires five unique eligible clan members, each contributing at least one troop.
- A new clan member has a 24-hour Tower participation probation.
- Each contributor’s troops remain personally attributed inside the shared clan garrison.
- Surviving attackers remain in the Tower after capture.
- All valid defenders fight together.
- A Tower may launch solo attacks, rallies, and scouting against normal valid targets. Tower conquest itself remains rally-only.
- When a member leaves or is removed from the clan, that member’s surviving Tower troops return to the member’s Main City.
- Clan disbanding neutralizes and resets controlled Towers.

### Tower walls and construction

- Tower wall levels have no maximum.
- A Tower wall upgrade costs five times the equivalent regular-city wall upgrade cost.
- Each wall level takes ten minutes to construct.
- A Tower may queue up to ten wall levels.
- Capture reduces the Tower wall by five levels, never below Level 1, and sets wall integrity to zero.
- A wall must be fully repaired before another upgrade begins.
- Repair cost equals five times the equivalent regular-city wall cost multiplied by the damaged percentage.
- Repairs use the unmodified regular-city wall repair rate. Speed items and modifiers do not apply.
- Repair and upgrade cannot be started while the Tower is under attack.
- An existing repair continues through an attack.
- Construction pauses during an attack.
- Queued construction is lost without refund when the Tower is captured.

### Tower Veil

- Tower Veil is a Tower-specific Clan Treasury service, not a normal Bag item.
- Duration is ten minutes.
- Limit is three uses per Tower per day.
- Cost is one times the equivalent regular-city wall cost at the Tower’s current wall level.

### Needs verification before deployment

- Current PR implementation parity with every rule above.
- Exact UI states, permissions, notification behavior, concurrent attack behavior, disconnect handling, refund guarantees, logs, admin recovery, migration, test coverage, and production rollout plan.
- Production smoke-test matrix and rollback procedure.

## 9. Clans, Rallies & Clan Treasury

### Clans

- Players may create or join clans, hold clan roles, coordinate through Clan Chat, send clan gifts, complete weekly clan goals, reinforce allies, and participate in rallies. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Current operative roles include Leader, Officer, and Member. Exact permission tables are **NEEDS VERIFICATION** against current backend rules.
- Clan ID, clan name, clan tag, clan heraldry, member roster, and each member’s current role—including Leader, Officer, and Member—persist across seasons.
- Clan Treasury balance and ledger, seasonal statistics, weekly-goal progress, rallies, reinforcements, donations/gifts activity, and ownership of Holding Towers, Strongholds, the Crown Citadel, or other world objectives reset each season.

**Implementation conflict:** The inspected `origin/main` reset path does not preserve clan identity, roster, membership, or roles. Current clan documents and memberships are generation-scoped, and the reset emulator explicitly expects old clan state not to survive. The design rule above remains authoritative; implementation correction is `IN DEVELOPMENT`. See Section 15.

### Clan Heraldry

- Legacy clan heraldry remains available in the itch.io client. **Status:** `LIVE — ITCH.IO` as the current itch presentation.
- Clan Heraldry v2, its approved catalog, landscape scrolling fix, and live-editor correction are `LIVE — WEB`.
- Existing v1 clans must not be visually changed merely because v2 exists; migration occurs when the authorized clan leader deliberately saves v2 heraldry. This is a confirmed design compatibility rule.

### Rallies

- The confirmed ordinary Rally design supports 2–20 unique clan members, with one army from one city per participant. A clan may have no more than five active Rallies. There is no formation expiry or automatic launch timer.
- Any active clan member may join. Only Clan Leaders and Officers may create a Rally. Only the Rally creator or the Clan Leader may manually launch or cancel a forming Rally; only the creator may recall the launched combined army.
- A launch is atomic and must be blocked with a clear explanation unless every participant is still an eligible clan member, every contribution has arrived and is Ready, the creator still owns the assembly city, the objective is still eligible and hostile, and at least two participants remain. An invalid non-creator contribution is removed and returned; an invalid creator cancels the Rally.
- Ordinary Rallies may target only Strongholds and the Crown Citadel. Reward Camps and ordinary cities are not Rally targets. The future four Holding Towers will also be Rally targets under their separate Tower rules.
- A launched Rally travels at its slowest participant's march speed, locked at launch. Each participant keeps that ruler's own attack skills, Common Gear, applicable bonuses, casualty recovery, and troop ownership. Combat resolves all participant packages together against live arrival-time defense.
- Attacker losses are allocated proportionally to troops contributed, with deterministic whole-troop rounding. A defeated Rally has no surviving attackers.
- On victory, the Rally creator becomes the personal controller of a Stronghold or Crown Citadel and the clan receives its shared benefit. The creator's survivors hold the objective; allied survivors remain there as individually attributable reinforcements their owners may recall. Future Holding Towers remain clan-owned and all survivors are stationed as attributed clan garrison troops rather than creating a personal owner.
- Every participant receives the same Rally battle outcome snapshot with a clearly labeled breakdown of each participant's committed troops, losses, survivors, and contribution.
- If a Rally return's original city is still owned by the participant, the army returns there. If it is neutral or clan-owned, the army returns to the participant's Main City. If an enemy owns it, the returning army attacks that city.
- Ordinary objective Rallies are not restricted by ordinary-city attack protection, neutral-city caps, or anti-farming gates. Committing Rally troops does not remove a Royal Peace Shield.
- The implementation correction for these confirmed rules is `IN DEVELOPMENT` until reviewed, validated, merged, and separately deployed. Published clients may still exhibit the older three-participant behavior in the meantime.
- The five-member Holding Tower conquest rule documented in Section 8 is target-specific and `IMPLEMENTED BUT NOT LIVE`; its five-member minimum does not replace the ordinary Rally minimum globally.

### Clan Treasury

- Clan Treasury is `IMPLEMENTED BUT NOT LIVE` as part of Holding Towers.
- Treasury funds are donated personal Gold and cannot be withdrawn.
- All members may donate; only Leaders and Officers may spend.
- Treasury balance resets each season.
- The ledger records simplified total donated and total spent values.
- A member’s daily donation cap is 12 hours of raw base Gold production, atomically snapshotted on the first successful donation of each UTC day.

### Needs verification

- Maximum clan size, invitation rules, role-change cooldowns, gift values and limits, weekly-goal configuration, inactivity handling, clan-name rules, disband recovery, and moderation controls: **NEEDS VERIFICATION**.

## 10. Items, Shop & Monetization

### Current items

Current strategic consumables include:

- War Drums
- Royal Peace Shield
- Royal Tax Decree
- Veil of Silence
- Swift March Order
- Recall Horn

Common Gear Boxes are Shop/Bag objects connected to Gear progression. Unopened Common Gear Boxes are persistent Gear-system assets and are not normal consumable Bag items for season persistence.

**Core item status:** `LIVE — ALL PUBLISHED CHANNELS`.

### Item behavior

- Items support attack, protection, production, concealment, movement, or recall according to their server-authoritative rules.
- Normal consumable Bag items do not persist across seasons.
- On web, identical Bag items are grouped by quantity. **Status:** `LIVE — WEB`.
- The web Bag uses All, Boosts, War, Defense, and Utility categories with an eight-item, four-by-two visible layout and supported paging/navigation. **Status:** `LIVE — WEB`.
- The web Shop uses scalable pricing described in Section 4. **Status:** `LIVE — WEB`.
- The itch.io client retains the older Shop/Bag presentation and pricing behavior. Exact itch prices are **NEEDS VERIFICATION** from that artifact if they must be documented.

### Monetization

- Optional rewarded-ad pathways exist. **Status:** `LIVE — ALL PUBLISHED CHANNELS` for the foundation; exact availability may depend on channel configuration.
- Rewarded ads must not bypass server authority or grant a reward more than once for one validated completion.
- Shop rewarded-ad layout and carousel-stability fixes are `LIVE — WEB`.
- Formal monetization principles, paid-product policy, premium currency policy, ad-frequency limits, regional compliance, and player-protection rules: **NEEDS VERIFICATION**.

### Needs verification

- Exact duration, limits, stacking, cancellation, target eligibility, and interaction priority for every consumable.
- Exact deployed reset behavior for unopened Common Gear Boxes. The confirmed design requires persistence, while the current `origin/main` reset implementation resets them to zero.

## 11. Gear & Persistent Progression

### Current Common Gear

- Common Gear is the live persistent equipment foundation. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Gear is organized around War Captain, Master of Coin, Cavalry Master, and Defensive Commander roles.
- Each role has eight equipment slots, for 32 Common Gear definitions in the current foundation.
- Common Gear progresses from Level 1 through Level 5.
- A Common Gear Box reveals exactly three server-rolled Level 1 Common pieces.
- Current Box sources include weekly daily-login milestones, completion of all three Daily Missions, the configured Relic Camp bonus chance, and one 1-billion-Gold purchase per UTC day.
- Gear inventory, Box opening, purchasing, equipping, and upgrading are server-authoritative and must not be writable through ordinary profile saves.
- Equipped bonuses apply additively to their applicable base systems.
- Common Gear bonuses stack with skills and may raise an effective result above the skill-only cap where the implemented rule allows. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Gear Effects appear in battle reports. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.

### Confirmed season persistence

The following Common Gear data persists across seasons/resets:

- Owned Common Gear
- Equipped Common Gear
- Common Gear levels
- Common Gear upgrades
- Associated Common Gear progression that belongs to the Gear system
- Unopened Common Gear Boxes

This is a confirmed design rule. Production reset enforcement remains `IN DEVELOPMENT` until verified.

### Current implementation divergence

The inspected `origin/main` reset initializer replaces the entire Gear state with a default empty state. It therefore resets owned Common Gear, equipped Common Gear, Gear levels, upgrades, duplicate/progression state, and unopened Common Gear Boxes. This is a **verified implementation conflict** with the confirmed persistence rule above.

The current reset emulator test explicitly expects the old reset behavior. The test must be updated together with the implementation when the confirmed persistence policy is implemented; otherwise it will reject the intended fix.

### Planned progression

- Higher Gear rarities and deeper progression are `PLANNED` after the Common foundation is stable.
- Exact rarity names, power curves, sources, duplicate requirements, and protection against unchecked power growth are **NEEDS VERIFICATION**.

### Needs verification

- Complete Common Gear definition table, upgrade material quantities, Gold costs, bonus values, rounding, slot restrictions, duplicate handling, and reset field allowlist.
- Exact deployed production reset behavior; repository inspection alone does not prove which server code is deployed.

## 12. Daily Missions & Achievements

### Daily Login

- Daily Login follows the current UTC calendar month rather than a fixed 30-day loop. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Each month distributes a documented total budget of 111 hours of Gold production, 111 hours of troop production, and six rotating items.
- Missed days pause progress, at most two earned rewards wait for collection, and unclaimed rewards expire at month rollover.
- Current reward tables and production snapshots must be verified before balance changes.

### Daily Missions

- Three missions are assigned at 00:00 UTC. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Missions are server-locked, capacity-scaled, and based on validated gameplay events.
- One unfinished mission may be rerolled each day.
- Rewards are claimed manually and remain visibly completed until reset.
- Production-scaled rewards use raw production.

The verified `origin/main` reward values are 0.5 production hour for Easy, 1 hour for Medium, and 2 hours for Hard. Camp-capture and Clan Gift special missions always use 0.5 hour. Production rewards are locked when missions are generated from the then-current raw production snapshot. A non-special Hard mission has a 20% item-substitution chance subject to the configured price constraint. Claiming all three daily missions grants one Common Gear Box.

### Achievements

- Crownlands currently has 40 seasonal Achievements. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Achievement presentation supports scrolling and prioritizes claimable information in the corrected interface.
- Production-scaled Achievement rewards use raw production.
- The earlier proposed count of 50 is superseded.

**Confirmed season rule:** Achievement progress, completed state, claimed state, unclaimed rewards, and completion history reset each season. No Achievement completion record persists as permanent progression or prestige history.

The verified `origin/main` production-reward hours are 0.5 for Easy, 1 for Medium, 2 for Hard, 3 for Very Hard, and 6 for Prestige. Achievement production rewards are locked when the completion event is processed using the stored global-stat base rates, not when the monthly achievement set is generated. The achievement cycle identifier combines the reset generation and UTC year-month, and unclaimed rewards expire at monthly rollover.

### Needs verification

- Complete mission pool, scaling ranges, reroll exclusions, all 40 Achievement definitions, category behavior, and production runtime parity for the verified reward and reset logic.

## 13. Leaderboards & Rankings

### Current state

- Crownlands provides a Top 100 Kingdoms leaderboard based on King Power. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Crownlands provides a Top Clans leaderboard based on combined clan strength. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Public ruler and clan identity are part of ranking presentation.

### Confirmed season history policy

- Active Kingdom and Clan leaderboard entries reset each season.
- At season finalization, the final Kingdom Top 100 and final Clan leaderboard must be locked and preserved as read-only historical records.
- Historical leaderboard records do not contribute power, resources, eligibility, or progression in later seasons.
- Final-season locking and archival are `PLANNED`; they are not currently implemented or LIVE.

### Verified `origin/main` implementation

- King Power uses implementation version 11.
- Every controlled troop contributes 2 power. The count includes city and Camp garrisons, marching troops, stationed reinforcements, and committed rally troops, with implementation safeguards against double-counting.
- Replacement power is `floor(objective-supported sustainable base troop production per hour × 12)`.
- Defensive power is `floor(max(0, total defense - garrison troop count) × 0.25)`.
- Total King Power is army power plus replacement power plus defensive power. Territory, city-count, Gold-production, and separate Stronghold score fields contribute zero in the current formula.
- Personal skills, Common Gear, and timed items are excluded from infrastructure power. Objective production and defense benefits are included.
- Kingdom entries are generation-scoped under the current reset generation, filtered to the current generation/world, sorted by King Power descending, and limited to 100.
- Clan entries are generation-scoped and sorted by total King Power descending, limited to 100.
- No explicit secondary tie-break, final leaderboard lock, final-rank rewards, historical archive, or automatic season rollover was found.

These are verified repository facts for commit `27105ae...`; exact deployed backend data and runtime parity remain **NEEDS VERIFICATION**.

### Needs verification

- Production runtime parity for King Power version 11 and live leaderboard contents.
- Update frequency, tie-breaking, eligibility, cheater removal, inactive-player treatment, caching, season-finalization trigger, archive fields and retention, final-rank rewards, and privacy controls.

## 14. Chat, Social & Announcements

### Chat

- Global Chat and Clan Chat are server-authoritative live systems. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- The audited rules include a three-second send cooldown and seven-day retention. Current backend enforcement must be checked before changing these values.
- Clan Chat visibility follows clan membership and authorization.
- Chat must not allow client-side impersonation or unauthorized clan-channel access.

### Social identity

- Player flags, profiles, clan identity, public leaderboard identity, and clan heraldry form the current social identity layer.
- Player name, complete player flag design, account creation date, and notification preferences persist across seasons.
- Clan ID, name, tag, heraldry, member roster, and member roles persist across seasons.
- Authentication and active-session data may carry forward as technical account state, but they are not seasonal progression or player customization.
- Current `origin/main` preserves the confirmed player identity fields but does not preserve clan identity/membership. The clan behavior is implementation divergence, not a change to the confirmed design policy.
- Player Flag save reliability after the reported production issue is **NEEDS VERIFICATION** through a current production smoke test.

### Announcements and moderation

- Profanity filtering, spam controls beyond current rate limits, message reporting, moderator workflows, sanctions, announcement authoring, scheduled announcements, and audit retention are **NEEDS VERIFICATION**.
- Earlier discussion deferred several moderation features. Deferred discussion is not a confirmed rejection or permanent rule.

## 15. Seasons, Resets & Persistence

### Confirmed design policy

The persistence allowlist is explicit. The following are intended to persist across seasons/resets:

1. Player name
2. Complete player flag design
3. Account creation date
4. Notification preferences
5. Clan ID, clan name, clan tag, and clan heraldry
6. Clan member roster and each member’s current Leader, Officer, or Member role
7. Owned Common Gear
8. Equipped Common Gear
9. Common Gear levels
10. Common Gear upgrades
11. Associated Common Gear progression that belongs to the Gear system
12. Unopened Common Gear Boxes
13. Read-only final-season Kingdom Top 100 and Clan leaderboard archives

Authentication and active-session data may carry forward as technical account state. They are not part of the player-facing persistence allowlist and confer no seasonal progression.

Normal consumable Bag items do not persist.

Hero level, Hero XP, unspent skill points, acquired skill upgrades, and saved skill presets reset each season.

Achievement progress, completed/claimed state, unclaimed rewards, and completion history reset each season.

Active Kingdom and Clan leaderboards reset each season. Their locked final-season archives persist as read-only history and do not count as active progression.

Clan Treasury balance and ledger, seasonal statistics, weekly-goal progress, rallies, reinforcements, donations/gifts activity, and world-objective ownership reset each season.

Normal world progression resets unless another system is explicitly added to the persistence allowlist.

The earlier broad statement that “items persist” is superseded by this allowlist.

### Implementation state

- Season/reset persistence policy is confirmed design.
- Production reset enforcement is `IN DEVELOPMENT`.
- A previously reported staging reset rehearsal preserved flags, clans, and Common Gear data while resetting world/season state. The inspected current `origin/main` executable reset path does not preserve clans or Common Gear, so the rehearsal is not evidence of current code parity.
- The production reset has not been verified as executed under this policy.

### Verified current `origin/main` reset behavior

No named, field-level persistence allowlist exists. The reset behavior is implicit in `createFreshResetPlayerProfile` and the generation-scoped data model.

| Data/system | Confirmed intended policy | Inspected `origin/main` behavior | Result |
|---|---|---|---|
| Player name | Persist | Preserved | Matches design in source |
| Complete player flag design | Persist | Preserved and normalized | Matches design in source |
| Account creation date | Persist | `createdAt` is carried forward | Matches design in source |
| Notification preferences | Persist | Carried forward when present | Matches design in source |
| Authentication and active-session state | May carry forward as technical state | Selected authentication fallbacks and active-session state are carried forward | Technical carry-forward; not progression |
| Clan ID/name/tag/heraldry, roster, membership, and roles | Persist | Fresh profile omits clan identity/membership; clan and membership records are generation-scoped and old records fail current-generation checks | **CONFLICTS WITH SPECIFICATION** |
| Clan Treasury/ledger, seasonal statistics, goals, rallies, reinforcements, donations/gifts activity, and objective ownership | Reset | Current clan/world activity is generation-scoped | Matches the reset direction in inspected source; exact future Treasury path is not LIVE |
| Owned Common Gear | Persist | Gear state is replaced with an empty default | **CONFLICTS WITH SPECIFICATION** |
| Equipped Common Gear | Persist | Equipment is reset | **CONFLICTS WITH SPECIFICATION** |
| Common Gear levels/upgrades/progression | Persist | Gear progression is reset | **CONFLICTS WITH SPECIFICATION** |
| Unopened Common Gear Boxes | Persist | Reset to zero | **CONFLICTS WITH SPECIFICATION** |
| Normal Bag consumables | Reset | Counts reset to zero; effects and purchase cooldowns reset | Matches design in source |
| Hero progression and skill presets | Reset | Hero returns to Level 1/XP 0/skill points 0; skill upgrades and presets return to defaults | Matches design in source |
| Achievement progress, state, rewards, and history | Reset | Achievement cycles are reset-generation/month scoped; no permanent completion archive was found | Matches design in source |
| Active Kingdom and Clan leaderboards | Reset | Entries are reset-generation scoped | Matches the active-reset portion of the design |
| Final-season leaderboard archives | Persist read-only | No final lock or historical archive implementation was found | `PLANNED` |
| Normal world progression | Reset | Gold, cities, reports, Camps, armies, and related generation state are rebuilt/reset | Matches the default-reset rule unless a field is later allowlisted |

The initializer also carries forward selected authentication display/email/photo fallbacks and active-session state. These are technical implementation facts, not additions to player-facing seasonal progression.

The reset emulator currently asserts that player name and flag survive while clan state, reports, normal items, and Hero/world progression reset. It therefore codifies the superseded clan-reset behavior and does not test the confirmed Common Gear persistence design.

### Verified generation/versioning behavior

- Current release ID: `crownlands-2026-08-02-single-active-skill-preset-v1`.
- Current reset generation: `fresh-2026-07-26-server-reset`.
- Current world ID: `main-fresh-2026-07-26-server-reset`.
- Current API contract hash: `e6029faf76eb863612cebf975f69bbd2e5116571153a916993825a7a7f674020`.
- Client/server admission checks gate release ID, reset generation, and world ID; the client also checks the API contract through realm information.
- Reset generation advances by static configuration change. No scheduler that automatically advances a season/reset generation was found.
- Achievement cycles are monthly within a reset generation, using `{resetGeneration}_{YYYY-MM}`.

These facts are verified in repository commit `27105ae...`. Exact deployed Functions source, production data, backup state, and real reset execution remain **NEEDS VERIFICATION**.

### Operational gate

- The planned production reset remains gated by verified backup completion and restore readiness.
- Point-in-time recovery, retention, delete protection, and scheduled backup configuration were reported, but completed backup/restore proof was not available at the audit cutoff.

### Needs verification

- Season length, start/end time, automatic versus manual reset, player notice period, leaderboard finalization trigger, tie handling, archive fields/retention, rewards, legacy records, rollback, and exact production reset procedure.
- Authenticated production evidence for the deployed reset implementation and any administrative migration code or data process outside the repository.

## 16. UI/UX Standards

### Confirmed standards

- The game must remain readable and operable in landscape mobile layouts and on PC.
- Critical actions, timers, troop counts, resource values, reports, warnings, and state changes must have sufficient contrast and must not depend on decorative texture alone.
- Medieval presentation should use parchment, wood, leather, rope, wax, stone, and worn metal without sacrificing clarity.
- Modal content must remain reachable on supported short landscape screens.
- Touch and pointer targets must not overlap or retarget to unrelated controls.
- Map switching must not open Shop or Bag unintentionally. The current web fix is `LIVE — WEB`.
- Movement HUD, Reports, Chat, and modal layers must stack predictably.
- Reduced-motion and performance-sensitive behavior must be respected where animation exists.

### Current presentation status

- Broad medieval UI theme and readability corrections: `LIVE — ALL PUBLISHED CHANNELS`.
- Inner Castle Profile entry, current Stronghold/Citadel contrast, scalable Shop presentation, reworked Bag, Clan Heraldry v2, and latest map-touch guard: `LIVE — WEB`.
- UI polish remains ongoing: `IN DEVELOPMENT`.

### Needs verification

- Formal contrast target, keyboard-navigation requirements, screen-reader scope, localization, minimum supported resolution, text-scaling behavior, and accessibility acceptance criteria.

## 17. Mobile Landscape & PC Requirements

### Confirmed requirements

- The game is landscape-oriented on mobile. Portrait gameplay is not a supported target requirement.
- A landscape-orientation prompt may block or redirect unsupported portrait play.
- PC/browser play is supported.
- PWA installation and launcher support are live where the browser/platform supports them.
- Public informational pages may remain portrait-responsive; the landscape-only rule applies to the game experience.

**Status:** `LIVE — ALL PUBLISHED CHANNELS` for the landscape/PC/PWA foundation.

### Superseded direction

- Earlier portrait Gear QA does not establish portrait gameplay support and is superseded by the landscape game requirement.

### Needs verification

- Supported browser/version matrix, minimum device performance, minimum viewport, tablet behavior, notch/safe-area requirements, input methods, memory budget, real-device regression suite, and offline/PWA limitations.

## 18. Art & Medieval Visual Direction

### Authority

The [Crownlands Art Bible](./CROWNLANDS_ART_BIBLE.md) is the detailed visual authority and is incorporated by reference. If this section and the Art Bible conflict, record the conflict and obtain an explicit design decision before changing either source.

### Confirmed direction

- Grounded 14th–15th century frontier-kingdom character.
- Rough stone, timber framing, limewash, thatch, worn iron, leather, rope, parchment, wax, and hammered metal.
- Earthy ochre, rust, charcoal, moss, faded blue, and burgundy palettes.
- Natural light, readable silhouettes, functional fortification, and lived-in construction.
- Avoid neon, glossy game-show surfaces, generic high-fantasy excess, interchangeable Gothic decoration, and unreadable texture.
- Regional and objective art should communicate gameplay role at practical map sizes.
- Region names and world language should be medieval-authentic and consistent with Crownlands.

**Status:** Established direction, with the current migrated visual foundation `LIVE — ALL PUBLISHED CHANNELS` and continuing polish `IN DEVELOPMENT`.

### Needs verification

- Final art production pipeline, asset licensing register, source-file ownership, generation provenance, animation style guide, audio art direction, and approval criteria for new regional art.

## 19. Backend, Performance & Scalability

### Current verified foundation

- Crownlands is online-first and uses Firebase Authentication, Firestore, and callable Functions for shared gameplay authority. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- The audited release contract exposes 102 callable operations and the API contract hash recorded in FM-2. These are implementation snapshots, not permanent design requirements.
- Authoritative mutations must be validated on the server.
- Multi-step economic and batch operations should be atomic or idempotent so retrying cannot duplicate charges, rewards, or launches.
- The current world is connected across 20 web regions; scaling work must preserve route parity, state integrity, and acceptable crowded-map performance.

### Scalability direction

- Pending Core and dynamic region expansion are `IN DEVELOPMENT`.
- World expansion must mature together with connection rules, player placement, capacity controls, backend performance, and rollback safeguards.

### Needs verification

- Service-level objectives, concurrent-player targets, per-region capacity targets, query budgets, latency budgets, callable quotas, indexing strategy, observability, alerting, cost budgets, rate limits, degradation behavior, incident response, backup success monitoring, and demonstrated restore time.

## 20. Security / Anti-Exploit Requirements

### Confirmed requirements

- The server, not the client, determines authoritative resources, ownership, movement, combat, rewards, Gear, clan access, and protected actions.
- Authentication identity must be bound to every protected operation.
- A client must not be able to alter Gear inventory, Box outcomes, equipment, upgrades, resource balances, or clan permissions through ordinary profile saves.
- Economic transactions, batch scouts, regroup actions, donations, purchases, claims, and rewarded-ad grants must resist replay, retry duplication, partial charging, and race conditions.
- One active browser session per account is part of the audited current behavior. **Status:** `LIVE — ALL PUBLISHED CHANNELS`; exact enforcement should be verified before modification.
- Release/backend parity must be checked for security-sensitive changes such as player flags and server rules.
- Sensitive anti-exploit details should be documented for developers without exposing actionable abuse instructions in player-facing material.

### Needs verification

- Formal threat model, App Check production status, device attestation, bot/automation controls, abuse rate limits, administrator permissions, audit-log retention, secret management, dependency scanning, vulnerability response, account recovery, sanctions, and data-deletion workflow.

## 21. Testing & QA Standards

### Existing foundation

- The current `origin/main` repository contains static and emulator-backed validators for the audited economy, scalable Shop, Camps, pickups, Daily Missions, Achievements, Common Gear, objective bonuses, King Power, leaderboards, and reset-gate behavior, in addition to broader combat, city, clan, rally, chat, security, release-artifact, and UI coverage. This is verified repository evidence, not player-facing LIVE status.
- Production artifacts are validated for file inventory, size, asset integrity, release metadata, and channel-specific path behavior.
- Balance-affecting changes must run the season-balance audit and relevant configuration-backed tests.
- Visual changes must be checked at supported desktop and landscape-mobile viewports.
- Server-authoritative changes require emulator or equivalent integration coverage, not client-only validation.

The August 24 implementation verification did not execute tests or builds because the task was strictly read-only and repository scripts could generate artifacts. Test presence and assertions were inspected; passing CI/runtime status remains **NEEDS VERIFICATION**.

### Verified test gap

`tools/validate-king-power.js` hardcodes three troops per city progression point in its local calculation, while executable economy configuration uses ten. The validator can therefore disagree with live King Power replacement-power calculation and must be corrected with the implementation work. Reset emulator coverage also codifies clan reset and does not cover the confirmed Common Gear/clan persistence policy.

### Release acceptance

Before a status becomes LIVE:

1. Inspect current source and affected tests.
2. Run the proportionate static and integration suites.
3. Build and validate the production artifact.
4. Deploy only when authorized.
5. Verify the release manifest/build ID.
6. Smoke-test affected production behavior.
7. Update the Release Channel Matrix.

### Needs verification

- Required test suite by change category, acceptable flaky-test policy, production smoke ownership, supported real-device matrix, accessibility QA, load-test thresholds, rollback drills, backup restore drills, and defect severity/release-blocking policy.

## 22. Git, PR & Deployment Workflow

### Required workflow

1. Work defines and confirms intended behavior in this specification.
2. A Codex implementation prompt must instruct Codex to inspect the current repository before modifying anything.
3. Implementation occurs on an appropriately scoped branch.
4. Relevant automated and manual tests must pass.
5. The change is reviewed against this specification.
6. Commits and PRs record implementation evidence.
7. Merge does not imply deployment.
8. Deployment occurs only with explicit authorization.
9. Production build and smoke evidence determine LIVE status.
10. itch.io is updated to a verified production-compatible artifact as a separate channel action.
11. This specification and its deployment ledger are updated after verified results.

### Safety rules

- Preserve unrelated user changes and dirty worktrees.
- Do not reset, overwrite, or deploy without authorization.
- Do not infer Firebase schema, functions, files, APIs, or hosting architecture from an old prompt.
- A Codex completion report must be compared against intended design, tests, deployment evidence, remaining work, regressions, and specification impact.

### Current workflow issues

- The local working branch used during the audit is behind current GitHub `main`; the audit nevertheless inspected the exact `origin/main` Git object without changing branches.
- The local `dist` matches the itch.io build, not current web production.
- Exact deployment ownership and the target parity interval between web and itch.io are **NEEDS VERIFICATION**.

## 23. Current Development Status

Status verified through August 24, 2026.

| System | Status | Notes |
|---|---|---|
| Core city/economy/army/combat game | `LIVE — ALL PUBLISHED CHANNELS` | Channel world sizes differ. |
| Web world expansion to 20 regions | `LIVE — WEB` | itch.io remains at 15 regions. |
| Camps, Strongholds, Crown Citadel | `LIVE — ALL PUBLISHED CHANNELS` | Latest contrast fixes are web-only. |
| Clans and ordinary rallies | `LIVE — ALL PUBLISHED CHANNELS` | Holding Tower rally rules are not live. |
| Global and Clan Chat | `LIVE — ALL PUBLISHED CHANNELS` | Moderation expansion is unresolved. |
| Daily Login, Daily Missions, 40 Achievements | `LIVE — ALL PUBLISHED CHANNELS` | Reward calculations are verified in source; complete definitions and production runtime parity remain open. |
| Common Gear foundation and upgrades | `LIVE — ALL PUBLISHED CHANNELS` | Future rarities are planned. |
| Scalable Shop pricing | `LIVE — WEB` | itch.io retains older behavior. |
| Reworked/stacked Item Bag | `LIVE — WEB` | itch.io retains older behavior. |
| Clan Heraldry v2 | `LIVE — WEB` | itch.io retains legacy presentation. |
| Holding Towers and Clan Treasury | `IMPLEMENTED BUT NOT LIVE` | Open PR #159. |
| Pending 5×5 Core | `IN DEVELOPMENT` | Staged; not production. |
| Production reset/persistence enforcement | `IN DEVELOPMENT` | Current source preserves flags/names and resets normal consumables, but conflicts with confirmed Common Gear and clan persistence. Backup/restore gate remains. |
| Dynamic map expansion | `IN DEVELOPMENT` | Not represented as live automatic growth. |
| Seasons | `PLANNED` | Cadence and reward policy unresolved. |
| More Gear rarities | `PLANNED` | Detailed rules unresolved. |
| Clan Wars / regional control / more world events | `PROPOSED` or roadmap-level `PLANNED` only | No authoritative detailed rules. |

## 24. Known Issues / Technical Debt

### Verified current issues

- The local working branch is behind current GitHub `main`; the verification audit inspected the current `origin/main` Git object directly.
- The locally preserved `dist` represents itch.io build `289a9d82f167`, not web build `27105ae76fbb`.
- itch.io currently lags web production by 29 commits and five regions.
- Web roadmap copy contains an internal 20-versus-15-region contradiction.
- The descriptive release ID remains dated August 2 despite newer builds.
- Five web regions use placeholder numeric names.
- Starting-resource documentation conflicts with the current source. `origin/main` initializes 100 Gold and 200 troops; deployed runtime parity remains unverified.
- Production Player Flag saving needs a current smoke test.
- Holding Towers/Clan Treasury remain in an unmerged PR.
- Production reset backup/restore readiness is not fully evidenced.
- Current reset implementation deletes Common Gear ownership/equipment/progression and unopened Gear Boxes instead of applying the confirmed persistence policy.
- Current reset implementation removes clan identity, roster, membership, and roles instead of applying the confirmed persistence policy.
- The reset emulator asserts the superseded clan-reset behavior and lacks coverage for required Common Gear persistence.
- The King Power validator uses a hardcoded troop-production factor of 3 while executable economy configuration uses 10.
- The Codex implementation audit reported War Drums at 5%, but executable economy configuration sets 30%; 5% is only a fallback. The specification records 30% as the current repository fact.
- No automatic season-generation advance, final leaderboard lock/rewards, or historical leaderboard archive was found. Final-season leaderboard archival is now confirmed design with status `PLANNED`.

### Technical debt requiring current-source confirmation

- Main runtime concentration in large client files and accumulated style overrides.
- Potential baseline issues involving line endings and specific validators.
- Transient emulator timing/port failures reported during development.
- Duplicated or competing readability/contrast overrides.

These source-level items are **NEEDS VERIFICATION** against current `main` before remediation is planned.

## 25. Planned Features / Roadmap

### Confirmed active direction

- Complete review, merge decision, production validation, and authorized rollout for Holding Towers and Clan Treasury. Current status: `IMPLEMENTED BUT NOT LIVE`.
- Prepare the pending 5×5 Core and safe reset path. Current status: `IN DEVELOPMENT`.
- Develop scalable outward map expansion. Current status: `IN DEVELOPMENT`.
- Define and deliver Seasons using the persistence policy in Section 15. Current status: `PLANNED`.
- Implement final-season locking and read-only archives for the Kingdom Top 100 and final Clan leaderboard. Current status: `PLANNED`.
- Expand Gear beyond the Common foundation after the base system is stable. Current status: `PLANNED`.
- Replace placeholder region identifiers with confirmed medieval-authentic names. Naming decision: `NEEDS VERIFICATION`.
- Maintain itch.io compatibility and restore channel parity after web releases. This is a release-policy requirement, not a gameplay feature.

### Roadmap concepts not yet authoritative

- Broader Clan Wars
- Regional-control scoring
- Additional scheduled or reactive world events
- Additional animation and sound systems
- Deeper objective history

These remain `PROPOSED` or roadmap-level `PLANNED` directions. Their detailed mechanics are not authoritative.

### Needs verification

- Priority order, milestones, owners, target dates, dependencies, release trains, and go/no-go gates.

## 26. Open Design Decisions

### Highest-priority unresolved design decisions

1. Final medieval-authentic names for Regions 16, 17, 19, 21, and 22.
2. Season length, reset schedule, notice period, end-of-season resolution, and rewards.
3. Leaderboard tie-breaking, eligibility, season rewards, finalization trigger, archive fields, and archive retention.
4. Formal monetization principles, rewarded-ad frequency/limits, and whether premium products or currency are permitted.
5. Chat moderation, player reporting, announcements, sanctions, and administrator policy.
6. Design rules for higher Gear rarities and protection against unchecked power growth.
7. Final triggers and player-facing behavior for dynamic world expansion.
8. Whether roadmap concepts such as Clan Wars and regional control should become committed features.

### Highest-priority verification decisions

1. Confirm through production runtime/deployment evidence whether the deployed new-player path uses the repository-verified 100 Gold and 200 troops.
2. The maximum intended web/itch.io release lag and channel-parity service level.
3. Current production Player Flag save behavior.
4. Exact deployed Functions parity for King Power version 11, production/reward configuration, and reset logic.
5. Backup completion and proven restore readiness before a production reset.

---

# Appendix A — Consolidated Status Register

| Status | Major systems/features |
|---|---|
| `LIVE — ALL PUBLISHED CHANNELS` | Core game, 15-region common world subset, cities, economy, movement, combat, scouting, Camps, Strongholds, Citadel, clans, ordinary rallies, Global/Clan Chat, Daily Login, Daily Missions, 40 Achievements, Common Gear foundation, Gear upgrading, Gear Effects reports, existing consumables |
| `LIVE — WEB` | 20-region world, Profile Inner Castle entry, current Stronghold/Citadel contrast, scalable Shop, reworked/stacked Bag, Clan Heraldry v2, Shop carousel/ad-layout fix, map-touch Shop/Bag guard |
| `LIVE — ITCH.IO` | No feature is known to be uniquely newer on itch.io; the channel retains older versions of several web-live systems |
| `IMPLEMENTED BUT NOT LIVE` | Holding Towers and Clan Treasury |
| `IN DEVELOPMENT` | Pending 5×5 Core, production reset enforcement including Common Gear/clan persistence corrections, dynamic map expansion, continuing UI/performance/onboarding work |
| `PLANNED` | Seasons, final-season Kingdom/Clan leaderboard archives, higher Gear rarities |
| `PROPOSED` | Detailed Clan Wars, regional-control scoring, unconfirmed world-event concepts, unconfirmed expanded sound/animation mechanics |
| `NEEDS VERIFICATION` | Exact production runtime parity for repository-verified starting resources/formulas/reset behavior, ranking policy, monetization policy, moderation, SLOs, security posture, device matrix, and channel parity target |

# Appendix B — Conflict and Superseded-Decision Register

| Topic | Earlier or conflicting source | Current ruling |
|---|---|---|
| Primary production authority | Web and itch.io could both be described broadly as published | Web is primary LIVE authority; itch.io is separately tracked and may lag |
| World size | Local/itch documentation says 15; web says 20 | Both are channel-specific current facts; intended primary production state is 20 web regions |
| Starting resources | 100 Gold/200 troops versus 500 Gold/50 troops | Current `origin/main` initializes 100 Gold/200 troops. Deployed backend/runtime parity and long-term design confirmation remain **NEEDS VERIFICATION**. |
| World structure | Single island, five islands, portals, disconnected or 100-city-map concepts | Superseded by connected regions and edge-route model |
| Achievement count | Earlier proposal of 50 | Superseded; current confirmed count is 40 |
| Season item persistence | Earlier broad statement that items persist | Superseded by explicit player identity, clan, and Common Gear allowlist; normal consumables do not persist |
| Bag stacking | Earlier limited-stacking discussion versus all-identical-item request | Web implementation now groups identical Bag items by quantity; itch.io remains older |
| Rally size | 2–20-player ordinary Rally versus five-member-minimum Tower conquest Rally | Both apply to different target types; Tower rule is not live |
| Mobile portrait | Earlier portrait Gear QA | Does not establish portrait game support; landscape is authoritative |
| Item pricing | Older fixed prices versus scalable pricing | Scalable formula is confirmed and `LIVE — WEB`; itch.io remains older |
| Clan heraldry | v1 compatibility versus v2 presentation | v1 remains unchanged until deliberate v2 save; v2 is `LIVE — WEB` |
| Merge versus deployment | Completion reports sometimes implied live status | Merge never proves deployment; release evidence controls LIVE status |
| Common Gear reset persistence | Confirmed design preserves owned/equipped/leveled/upgraded Common Gear and unopened Common Gear Boxes; current reset initializer creates an empty Gear state | Design remains authoritative; implementation is divergent and `IN DEVELOPMENT` |
| Clan reset persistence | Confirmed design preserves clan ID/name/tag/heraldry, roster, membership, and roles; current reset initializer and generation gates remove them | Design remains authoritative; implementation and its emulator expectation are divergent and `IN DEVELOPMENT` |
| War Drums production bonus | Codex audit summary said 5%; executable config says 30% while server fallback is 5% | Repository fact is 30% at `27105ae...`; exact production runtime parity remains **NEEDS VERIFICATION** |
| King Power replacement-power validator | Validator hardcodes three troops per progression point; executable config uses ten | Executable implementation uses ten; validator is stale technical debt |
| Season leaderboard history | Current rankings are generation-scoped and no final lock/archive exists | Active rankings reset; final Kingdom Top 100 and Clan leaderboard must persist as read-only archives. Implementation is `PLANNED`. |

# Appendix C — Evidence Register

| Source | Purpose | Audit note |
|---|---|---|
| [Web release manifest](https://playcrownlands.com/release-manifest.js) | Primary web build identity | Verified build `27105ae76fbb...` |
| [Live world](https://playcrownlands.com/world) | Current player-facing web world | Verified 20 regions; five placeholder names |
| [Game rules](https://playcrownlands.com/game-rules) | Current player-facing rules | Used for live rules baseline |
| [Roadmap](https://playcrownlands.com/roadmap) | Public direction and status | Planning evidence only; contains stale 15-region copy |
| [Updates](https://playcrownlands.com/updates) | Public release narrative | Used with release manifests, not alone |
| [itch.io](https://crownlands.itch.io/crownlands) | Secondary published channel | Published build `289a9d82f167...` verified locally |
| [GitHub commit `289a9d82f167...`](https://github.com/explocion200/CrownLands/commit/289a9d82f16739fac8d73376a5c4c85e08aeadc5) | itch.io artifact source point | Includes itch subpath fix and prior merged Gear work |
| [GitHub commit `27105ae76fbb...`](https://github.com/explocion200/CrownLands/commit/27105ae76fbb329559151030ebbac652a9ee8119) | Current web/main source point at audit | Matches web release manifest |
| August 24 read-only implementation verification | Exact `origin/main` source audit of initialization, economy, King Power, objectives, Shop, rewards, reset persistence, rankings, and version gates | No checkout, code/config/data change, test run, build, commit, push, merge, deployment, or production mutation; deployed Functions parity remains unverified |
| [GitHub PR #159](https://github.com/explocion200/CrownLands/pull/159) | Holding Towers/Clan Treasury | Open, unmerged, not live |
| `README.md` | Historical mechanics and implementation documentation | Detailed but stale on world/build state |
| `docs/CROWNLANDS_ART_BIBLE.md` | Visual direction | Incorporated by reference |
| `docs/CROWNLANDS_VISUAL_MIGRATION.md` | Visual migration history | Historical implementation evidence |
| Local `dist` and `Crownlands-current-build` ZIP | itch.io artifact inspection | 261 files; exact byte match; verified SHA-256 |
| Crownlands Work conversations and Codex completion reports | Design and implementation history | Decisions used only when confirmed; reports do not prove deployment |

# Appendix D — Change Log

## v1.7 — August 24, 2026

- Confirmed persistence for clan ID, name, tag, heraldry, member roster, and each member’s Leader/Officer/Member role.
- Confirmed seasonal reset of Clan Treasury balance/ledger, seasonal statistics, weekly-goal progress, rallies, reinforcements, donations/gifts activity, and world-objective ownership.
- Expanded the documented implementation conflict to include clan presentation, roster, and roles.
- Removed clan-role persistence from unresolved season decisions.

## v1.6 — August 24, 2026

- Replaced the vague player-customization persistence entry with an exact allowlist.
- Confirmed persistence for player name, complete player flag design, account creation date, and notification preferences.
- Classified authentication and active-session carry-forward as technical account state rather than seasonal progression.
- Recorded that the inspected current reset implementation matches the confirmed player-identity persistence set.
- Removed player-identity field scope from Open Design Decisions.

## v1.5 — August 24, 2026

- Confirmed that active Kingdom and Clan leaderboards reset each season.
- Confirmed that the final Kingdom Top 100 and final Clan leaderboard are locked and preserved as read-only historical records.
- Added final-season leaderboard archives to the persistence allowlist without treating them as active progression.
- Recorded final leaderboard locking and archival as `PLANNED` because no current implementation was found.
- Removed the foundational leaderboard-history question from Open Design Decisions while retaining finalization, tie, field, retention, eligibility, and reward details as unresolved.

## v1.4 — August 24, 2026

- Confirmed that Achievement progress, completed/claimed state, unclaimed rewards, and completion history fully reset each season.
- Confirmed that no Achievement completion ledger persists as permanent progression or prestige history.
- Recorded that the inspected generation/month-scoped implementation matches the full-reset design.
- Removed Achievement persistence from Open Design Decisions.

## v1.3 — August 24, 2026

- Confirmed that Hero level, Hero XP, unspent skill points, acquired skill upgrades, and saved skill presets reset each season.
- Distinguished seasonal Hero progression from permanent Common Gear progression.
- Recorded that the inspected current reset implementation matches this Hero-reset rule.
- Removed Hero progression persistence from Open Design Decisions.

## v1.2 — August 24, 2026

- Confirmed that unopened Common Gear Boxes persist across seasons/resets as part of permanent Gear progression.
- Added unopened Common Gear Boxes to the explicit season-persistence allowlist.
- Reclassified the current reset-to-zero behavior for unopened Gear Boxes as an implementation conflict.
- Removed unopened Gear Box persistence from Open Design Decisions and retained production enforcement as `IN DEVELOPMENT`.

## v1.1 — August 24, 2026

- Recorded the read-only implementation verification against exact `origin/main` commit `27105ae76fbb...`.
- Verified repository initialization at 100 Gold, 200 troops, and one Level 1 Main City while retaining production-runtime verification as an open gate.
- Added exact repository formulas for Gold production, troop production, city-level scaling, objective bonuses, scalable Shop pricing, Camps, pickups, Daily Missions, Achievements, and King Power.
- Recorded current leaderboard generation/versioning behavior and missing season-finalization systems.
- Documented that current reset code preserves flags/names and resets normal Bag consumables but conflicts with confirmed Common Gear and clan persistence policy.
- Recorded that unopened Gear Boxes currently reset while their intended persistence remains unresolved.
- Corrected the audit’s War Drums value: executable configuration is 30%, while 5% is only a fallback.
- Added the stale King Power validator and reset-emulator expectations to technical debt.
- Preserved all LIVE statuses because repository inspection alone did not verify a new deployment.

## v1.0 — August 24, 2026

- Initial authoritative Crownlands development specification created.
- Established web production as primary LIVE authority.
- Added separate itch.io release-channel tracking.
- Established explicit implementation/deployment status model.
- Recorded confirmed season-persistence design policy.
- Preserved unresolved starting-resource conflict for technical verification.

---

# Ongoing Change-Management Procedure

When a Crownlands design decision is explicitly confirmed:

1. Identify every affected section and appendix entry.
2. Check for conflicts with confirmed rules.
3. Update intended behavior independently from implementation and deployment status.
4. Preserve useful superseded history.
5. Never mark the change LIVE without verified channel deployment.
6. Update the Release Channel Matrix if channel behavior changed.
7. Add a dated Change Log entry.

When a Codex completion report is returned:

1. Compare completed work with this specification.
2. Identify what matches, remains incomplete, or diverges.
3. Review tests, regressions, security, performance, and channel compatibility.
4. Keep implementation status separate from LIVE deployment status.
5. Recommend the next scoped Codex prompt.
6. Update this document only when design, verified implementation status, or verified deployment status changed.
