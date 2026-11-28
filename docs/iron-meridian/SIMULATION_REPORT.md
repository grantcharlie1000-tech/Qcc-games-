# Iron Meridian simulation

The original TypeScript simulation is implemented in `content.ts` and `model.ts`. It consumes the authored map through `PROVINCES`, `NATIONS` and undirected `SEA_LINKS`. Shared types were preserved. No external runtime dependency or extracted game content was added.

## State and API

`createCampaign(player = 0, seed = 19360901)` creates a peaceful setup. Player commands are rejected during setup. `startCampaign` begins play; only `advanceDay` advances time. Victory and defeat stop further advancement and commands. Pause and clock speed belong to the UI.

The required API is exported: `createCampaign`, `startCampaign`, `advanceDay`, `issue`, `restoreCampaign`, `serializeCampaign`, `supplyAt`, `atWar`, `industry`, `capitalOf`, `canResearch`, `canFocus`, `availableFactories`. `supplyLevels(c, nation)` optionally computes all province supplies in one pass for the renderer.

HP and organization use 0 to 100. Entrenchment, stability, support and supply use 0 to 1. Tension uses 0 to 100. Production stocks and fuel can be fractional; displayed whole equipment counts should be rounded down. Research, focus and training progress use days; construction uses work points.

## Connected systems

- Owned provinces provide civilian factories, military factories, dockyards, steel and oil. Conquest transfers these benefits. Lost capacity trims allocations. Trade consumes one civilian factory and adds six steel and three oil while the partner remains peaceful and active.
- Allocated factories produce equipment daily. Efficiency rises toward 80%, or 95% after Assembly lines. Increasing an allocation dilutes its efficiency. Steel and oil shortages reduce production. Stability, Machine tools and Industrial drive affect output. Military factories and dockyards have separate allocation limits.
- Two research slots enforce prerequisites and reject duplicates. Army technology changes combat and movement, industrial technology changes output and supply, air technology changes mission strength, and naval technology changes patrols and convoy protection.
- A national focus has prerequisites and occupies one slot. Its completion grants the described factories, reserves, political power, public support or permanent modifier. Free factory rewards reconcile queued projects against province caps, retaining active work and cancelling the last redundant jobs.
- Civilian industry works on the first construction job. Province limits and port requirements are checked at enqueue. Cancellation removes one chosen job. Occupation cancels that province's former owner's construction.
- Recruitment reserves the complete equipment and manpower bill once at enqueue. Two training jobs progress concurrently and deploy at the current capital. Reinforcement later uses additional equipment and manpower to replace battlefield damage.
- Movement uses graph routes through friendly, allied or wartime provinces. Neutral borders block orders. Speed depends on terrain, supply, mobile doctrine and fuel. Sea routes require a friendly departure port, a destination port, ships, fuel and the patrol mission.
- Supply follows friendly and allied land connections from the current capital. Infrastructure and logistics improve throughput; distance and local division demand reduce it. Disconnected divisions suffer attrition and poor recovery. Patrols enable port connections; hostile raiding disrupts sea supply. Escorts mitigate disruption.
- Combat uses division type, HP, organization, supply, experience, technology, terrain, entrenchment, forts, combat width, air superiority and air support. Armor suffers in difficult terrain. Engaged defenders cannot leave through a standing movement order. Broken defenders retreat to friendly adjacent land or are destroyed when surrounded. Successful attacks occupy territory.
- Air missions consume fuel, influence battle strength and can lose aircraft to enemy superiority. Patrol and raiding fleets consume fuel and suffer wartime ship losses. Naval strength and escorts change convoy access and sea supply. Missions return to reserve when fuel runs out.
- Justification costs 35 political power and takes 24 days. Declaration requires that completed justification. Relations cost 20 power and improve bilateral relations by 25. An alliance requires 40 relations and 75 power, merges existing peaceful blocs, grants access and brings allies into wars. Mobilization costs 60 power, adds 12,000 reserves, increases daily recruitment and reduces stability. Rally costs 35 power and raises stability and war support.
- Strategic AI selects research and focuses, queues construction and recruitment, allocates newly available factories, issues front orders, chooses wartime missions, mobilizes depleted reserves and justifies wars against nearby rivals. Decisions use the saved seeded PRNG. The first AI justifications begin after day 90, staggered by nation.

Every `Command` union case has actual behavior and validation. `issue` always operates on the player's nation. Orders validate all selected units and routes before mutation. The Front command assigns the current reachable enemy frontier; the player can issue it again after a breakthrough. AI reassesses its fronts weekly.

## Outcomes

Victory is checked after each day: the player and current allies together control at least 60% of the map's total victory points and at least three original national capitals. Alliance diplomacy and conquest both contribute.

A nation capitulates when its original capital is no longer controlled by itself or an ally and its surviving friendly control is at most 40% of its home victory points. Its surviving territory transfers to the holder of its original capital, its divisions and pending national projects are removed, and its wars end. Player capitulation causes defeat. There is no campaign time limit within ordinary play; the defensive numeric bound is one million days.

## Save boundaries

Saves are version 1. Restore checks every nested field, exact object shape, known content IDs, numeric ranges, finite values, graph-valid division paths, unique IDs, prerequisites, queue sizes, province caps, factory allocations, reciprocal alliances and active wars before cloning the snapshot. Input objects and returned serialized snapshots cannot mutate active campaign state. Cycles, malformed values and unexpected prototypes are rejected. Stockpiles, manpower, fuel, political power, tension, score and entity counts have bounds.

The PRNG state, queues, movement progress, battles and all economic state are serialized. No wall clock, `Math.random`, asynchronous callback or UI state participates in simulation results. Front planning uses one graph traversal per division and precomputed defender counts rather than searching again for each candidate province.

## Verification

Final scoped command: `npx.cmd vitest run tests/games/iron-meridian/model.test.ts`.

The specialist's initial result was 28 passing tests. After parent review fixes, 31 model tests pass, and the combined game/navigation command passes 37 tests (31 model, 4 geometry, 2 navigation). Coverage includes every command; economy, allocation and trade; prerequisites and parallel research; focus rewards; construction and cancellation; reservation and deployment; land and naval movement; isolation, raiding and escort supply effects; sustained combat, defensive modifiers, air support and defender pinning; capitulation, victory and defeat; snapshot cloning, deterministic continuation, malformed saves and resource overflow. Long runs exercise up to 500 campaign days from each of the six starting nations with repeated save validation.

Parent review added regressions for a retreated division fighting again through a stale pending attack reference, sparse arrays accepted before JSON cloning, and justifications becoming invalid after an alliance or an incoming war declaration. All three were observed failing before their focused fixes, then passed in the combined suite.

The exact legal seven-factory queue plus Civic plan regression was observed failing before the queue reconciliation fix and passing after it, including the day 24 snapshot and eventual queue completion. Defender pinning, malformed enum objects and mobilization overflow were also observed failing before their fixes.

An early application typecheck found save-validator narrowing errors in this file and an independent UI command typing error. The model narrowing was fixed. Final application typecheck, production build, browser behavior, screenshots and whole-integration review are parent-owned checks. This report does not claim those from the scoped simulation tests.

## Deliberate limits

This is a compact original strategy simulation. It has one abstract global air region and sea zone, pooled aircraft and ships, three land templates, a province supply graph, a single construction lane and two training grounds. It does not implement ship-by-ship maneuvers, equipment variants, weather, historical events, peace conferences, continuous persistent front plans or the scope of HOI4 and its DLC. Six-nation geography differs while starting industrial totals are intentionally comparable. Automated checks establish the listed mechanics and deterministic outcomes; they do not establish exhaustive campaign balance or complete playthrough quality.
