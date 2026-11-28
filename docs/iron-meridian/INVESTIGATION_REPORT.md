# Investigation report

Historical initial static pass. Subsequent actual executable decompilation and bounded native ports are tracked in [NATIVE_PLAN.md](NATIVE_PLAN.md). Statements below describe this earlier pass only.

## Result and scope

This was a bounded read-only inspection of a specific installed Hearts of Iron IV build, completed on 17 November 2026. It produced a source inventory and a mechanics relationship dossier. Full reverse engineering was not completed. The native game was not executed, and its binary was not decompiled or disassembled. No claim of native behavioral equivalence or full reconstruction is supported.

The local target was `C:\Program Files (x86)\Steam\steamapps\common\Hearts of Iron IV`. Launcher metadata reports `Operation Postern v1.19.5.0.7c6c (c184)`, raw version `1.19.5.0`; the Steam manifest reports app ID `394360` and build `26479645`. These are local declarations, not a verification that the installed files match the publisher's entire distribution.

| Artifact | SHA-256 |
| --- | --- |
| `hoi4.exe` | `709F916AFBEBCFE64A26678702691AEB40945D206074C2A80DE8E9D601FCE148` |
| `common/defines/00_defines.lua` | `727AC0522AC7E55313DD249C819F273A248C4A438C5E4CE21C867923F9DD0767` |
| `common/terrain/00_terrain.txt` | `2BC3931762C4A88F689311803D06C2C2EE50F8FE065743D96115ED7B9315BB91` |

The executable is 56,535,160 bytes. A Python standard-library PE-header read observed signature `50450000` at file offset 336, machine `0x8664`, six sections, and optional-header magic `0x20b`. The AMD64 PE32+ identification is an interpretation of those header declarations. It establishes neither original source language nor runtime engine behavior.

## Method and tooling

The installed [reverse-engineer-anything skill](C:/Users/charlie/.codex/skills/reverse-engineer-anything/SKILL.md) and its connection/recovery guidance were read. The active tool inventory did not expose REA binary or analysis operations. A skill installation alone supplies instructions, not an analysis engine or live MCP connection. No global MCP configuration was changed and no unrelated native engine was installed. There was no REA session, so there is no REA Evidence bundle or Evidence ID to cite.

Observations here came from PowerShell, ripgrep, Python file reads/hashes, and the [publisher's official product overview](https://www.paradoxinteractive.com/games/hearts-of-iron-iv/about). Ordinary shell output is explicitly not REA Evidence. The public page supports broad system categories only; detailed facts below come from the installed files.

Inspection was restricted to the named installation and project documentation. No broad user-home search occurred. Installed assets and scripts were not copied. The three deliverables contain authored analysis, selected scalar values, source locations, file identities, and aggregate counts. Installation files were read only.

## Inventory boundary

[source-inventory.json](source-inventory.json) records 28 explicit directory inventories, 31 selected source-file identities, 43 scoped declaration records, the static PE header, and the remaining unknowns. Each selected source has a full-file SHA-256, byte length, and text line count where applicable. File counts include nested ordinary files and documentation. Parent and child directory counts overlap and must not be added together.

| Directory | Recursive files | What this count establishes |
| --- | ---: | --- |
| `common/technologies` | 13 | Files in the named directory, not individual technologies |
| `common/national_focus` | 81 | Focus-related files, not tree or focus counts |
| `common/units` | 297 | Unit and nested equipment-related files |
| `common/units/equipment` | 52 | Subset of the unit count |
| `common/doctrines` | 27 | Doctrine files, whose full contents were not analyzed |
| `common/ideas` | 213 | Idea/law files, not active ideas |
| `common/decisions` | 147 | Decision files, not available decisions |
| `events` | 128 | Event files, not event counts or observed events |
| `common/ai_strategy_plans` | 128 | Strategy-plan files, not executed plans |
| `common/peace_conference` | 37 | Script and documentation files |
| `common/special_projects` | 17 | Project, specialization, reward, and documentation files |
| `history/states` | 1,081 | State-history files, not a validated runtime state count |
| `history/countries` | 364 | Country-history files, not selectable-country count |
| `history/units` | 609 | Order-of-battle files, not division count |
| `map` | 391 | Map files, without topology extraction or asset copying |
| `dlc` | 14,392 | Installed content files, not owned/enabled expansions |
| `integrated_dlc` | 3,587 | Integrated content files, not an entitlement decision |

## Finding ledger

Every path in this ledger is relative to the installation root. Line numbers are one based. All rows are partially answered: they establish selected shipped declarations, with exact provenance and hashes in the JSON, while leaving effective native behavior unresolved.

| Question | Observed declaration and provenance | Inference and remaining unknown |
| --- | --- | --- |
| How does construction create capacity? | `common/buildings/00_buildings.txt:55-81` declares military factory cost 7,200, civilian factory cost 10,800, production roles, and shared state slots. Dockyard `:226-240` costs 6,400, is coastal, and supplies naval production. | Three capacity types have different roles. Effective queue allocation, construction scaling, slot availability, conversion, repairs, and consumer-goods rounding were not executed or recovered from native code. |
| How is production constrained? | `common/defines/00_defines.lua:633-659`: general/military/naval base speeds 4/3.5/2; start efficiency 10%; base cap 50%; shortage penalty -0.05. `common/technologies/industry.txt:3-24`: basic machine tools adds max-efficiency modifier 0.1. | Output depends on more than assigned factories. Exact growth, penalty composition, switching behavior, rounding, energy, and all overrides remain unresolved. The 50% figure is a base declaration, not a universal final cap. |
| What tradeoffs do economy laws create? | `common/ideas/_economic.txt:101-113`: civilian economy expected consumer-goods value 0.35, civilian/military construction -0.3. War economy `:479-624`: value 0.20, military construction +0.2, energy consumption +0.25. | Mobilization changes competing uses of industry. Availability predicates are country/DLC dependent; no final economy state was observed. |
| What is new in this installed economy data? | `common/buildings/00_buildings.txt:715-750` declares energy and industrial infrastructure, both cost 12,000, with energy-consumption and resource-gain modifiers. | An economy model based solely on older remembered versions would omit declared systems. Native energy mechanics and player-facing availability are unverified. |
| Where does recruitable manpower come from? | `common/ideas/_manpower.txt:49-137`, `:166-322`, `:411-701`: conscription 0.015/0.025/0.05; the third adds training factor 0.1. Service by requirement `:732-1011`: 0.10, factory/dockyard/construction -0.1 and training +0.2. | Manpower mobilization has industrial and training costs. Core population application, mobilization timing, casualties, reinforcement priority, and country exceptions are not fully traced. |
| How do equipment and recruitment meet? | `common/units/infantry.txt:7-49`: infantry battalion manpower 1,000, equipment need 100, training time 90, width 2, organization 60, supply 0.06. `common/units/equipment/infantry.txt:56-75`: 1936 equipment references the archetype and parent, costs 0.50, and has soft attack 6. | Equipment is a separate stock and technology progression, not a unit count. Template aggregation, training completion, shortage scaling, and replacement selection require more evidence. |
| How do technology trees affect other systems? | `common/technologies/infantry.txt:16-38` enables infantry and its equipment, names a successor, research cost 1.5 and year 1918. `common/defines/00_defines.lua:305,711-713`: two base slots, 30 saved points, base tech cost 110, ahead factor 2. | The graph affects unit availability and production. A nominal base product of 1.5 times 110 is 165, but this is not a measured research duration. All time modifiers, prerequisite semantics, and country slot totals remain unverified. |
| How do focuses affect research and industry? | `common/national_focus/generic.txt:34-65` supplies a prerequisite and cost-10 focuses; `:1110-1115` constructs civilian industry; `:1854-1875` adds a research slot. `common/defines/00_defines.lua:3614-3617` declares seven days per point and equal base peace/war progress. | The focus graph crosses subsystem boundaries. Cost 10 suggests nominal 70 days, but final progress, interruption, bypass, mutually exclusive branches, and country trees were not exhausted. |
| How does supply reach armies? | `common/defines/00_defines.lua:1004`: 72-hour grace; `:4281-4286`: capital base 5 plus civilian/military/dockyard terms 0.3/0.6/0.4; `:4337-4349`: hub bonus 2.2, 60 trucks, rail base flow 10, level term 5 and damage term 5. `:4365-4373` declares captured-rail cooldown and train/distance terms. | Infrastructure, transport equipment, and industry are coupled. The complete routing algorithm, bottleneck selection, local distribution, allied access, convoy risk, and update order are not known. Rail and supply-node files were identified and hashed, not recreated. |
| How do combat and terrain interact? | `common/terrain/00_terrain.txt:29-53` declares forest movement 1.5, width 60, attack -0.15; mountain `:80-105` declares movement 2, width 50, attack -0.5. Both have supply penalties. `common/defines/00_defines.lua:895-914` declares combat-time and organization-damage constants. | Terrain changes multiple constraints simultaneously. No complete damage formula, tactical selection, targeting, initiative, armor/piercing resolution, retreat, encirclement, or native outcome was established. |
| What do air and naval systems contain? | `common/units/equipment/plane_airframes.txt:4-71` declares mission-compatible types, slots, fuel 0.05, manpower 20 and resource costs. `common/units/equipment/ship_hull_light.txt:3-140` declares screen role, required battery and engine, speed 32, range 2,000, strength 25 and cost 400. | Modular hulls/airframes feed resource-dependent production. These are archetype declarations, not finished design stats. Mission assignment, detection, range efficiency, sorties, screening, convoys, weather, battle phases, and losses remain unobserved. |
| How are wars and peace constrained? | `common/ideologies/00_ideologies.txt:32-53` declares democratic restrictions and tension values. `common/wargoals/00_invasion.txt:3-28` declares base/per-state costs 200/50, limit 5 and expiration 60. `common/peace_conference/cost_modifiers/00_generic_peace.txt:9-21` applies qualifying core-action multiplier 0.25. | Declaration, combat control, and negotiated transfer are distinct systems. World tension is not the only gate. Faction escalation, capitulation, score distribution, contested bids, subjects, guarantees, and peace runtime were not fully traced. |
| Is AI just random attacking? | `common/ai_strategy_plans/GER_historical_strategy_plan.txt:1-27` has game-rule/DLC/flag activation conditions; `:105-115` lists ordered focus preferences; `:209-249` has research weights, template priority 111, and zero-weight focus choices. | At least part of strategy is data driven across systems. Native evaluators, competing-plan precedence, pathfinding, front planning, and actual decisions remain unknown. A weight is not an observed probability. |
| What does espionage require? | `common/intelligence_agency_upgrades/intelligence_agency_upgrades.txt:6-24`: an upgrade uses five civilian factories during progress, adds civilian intel factor 0.25. `common/operations/00_operations.txt:6-55`: rescue takes 35 days, network 30, one operative, risk 0.1, and frees a captured operative. | Intel operations are staged resource and actor workflows. Network generation, capture, counterintelligence, decryption, operation resolution and DLC enablement are not validated. |
| How do special projects and expansions fit? | `common/special_projects/projects/nuclear_projects.txt:1-69` links atomic research, nuclear specialization, materials 6 steel/3 tungsten/6 chromium, symbolic prototype time, and technology/building output. `:260-288` gates a child commercial project on DLC and construction technology. | Advanced research has dependencies beyond the normal technology tree. Symbolic time is intentionally not converted into guessed days. Facilities, scientists, experiments, reward weighting, raids, and enabled expansion combinations remain unresolved. |

## Primary public corroboration

The [official Paradox overview](https://www.paradoxinteractive.com/games/hearts-of-iron-iv/about), accessed 17 November 2026, describes national industry and alliances, division templates, technology research, factory orders, and political objectives. Those high-level features agree with the categories found locally. The product page does not establish any of the numerical mechanics above and was not used as a substitute for native observation. No long quotation is reproduced.

## Implementation relationship and parity gaps

Iron Meridian is an original browser game with fictional nations and map. Its authored implementation can use connected construction, production, recruitment, research, logistics, combat, air/naval pressure, diplomacy, and AI as a compact strategy loop. This dossier does not certify which of those are implemented or validated in the current working tree. Implementation and browser-test claims belong to the application's own evidence.

These major Hearts of Iron IV parity requirements remain open regardless of whether a small browser prototype works:

- Exact simulation scheduling, native arithmetic, rounding, modifier stacking, random streams, load order, and determinism.
- Historical global province/state geography, terrain, sea and air regions, starting history, order of battle, country tags, localization, and all start dates.
- Complete national focus trees, mutually exclusive branches, events, decisions, civil wars, leaders, advisors, politics, balance of power, factions, and country-specific rules.
- Full equipment inheritance, designers and modules, military industrial organizations, division templates, support companies, commanders, traits, doctrines, and experience.
- Local supply graph and bottlenecks, hubs, trains, trucks, ports, convoy routing, fuel, energy, resources, occupation access, damage, and repair.
- Detailed land battle tactics and targeting, planning, fronts and battle plans, terrain/weather/night, armor and piercing, reserves, retreat, encirclement, attrition, and reinforcement.
- Complete air missions and theaters, detection, interception, sortie and range efficiency, losses, naval targeting, carriers, and all ship combat phases.
- All diplomacy conditions, guarantees, volunteers, lend lease, markets, trade, subjects, autonomy, world tension, war participation, capitulation, peace bidding, occupation, compliance and resistance.
- Intelligence networks, agencies, upgrades, operatives, operations, decryption, collaboration, facilities, scientists, special projects, raids, and nuclear outcomes.
- Full strategic/operational/tactical AI, historical and alternate plans, game rules, difficulty, every DLC combination, and mod compatibility.
- Native save/load and ironman compatibility, achievements, multiplayer synchronization, hotjoin, cross-platform behavior, native controls/accessibility, and full-scale performance.

No implementation should label any of these passed merely because the corresponding tab or button exists.

## Follow-up investigation plan

| Stage | Required evidence | Completion condition |
| --- | --- | --- |
| Effective data model | Full load-order and override resolution for a selected subsystem, including DLC/mod conditions and scripted dependencies | Every retained scalar and dependency binds to an effective selected configuration, with unresolved symbols explicit |
| Native formula trace | An actually available REA/native provider, exact executable identity, focused functions/call paths, retained observations and limitations | The particular formula and its inputs are established to the tool's supported scope; indirect/unknown paths remain open |
| Native scenario | Explicitly authorized target execution, controlled country/date/DLC/mods, initial/final state and visible completion | Repeatable observed behavior for the selected input, with failures and deviations retained |
| Original implementation | Authoritative original rules, state transitions, behavior tests and browser interaction evidence | Actual connected behavior passes its own rules; borrowed numerical accuracy is claimed only where measured |
| Parity assessment | Per-feature source evidence plus matched native/browser scenarios and a comprehensive content matrix | Exact passes, approximations, omissions, and unmeasured cells reported separately |

No MCP registration, global configuration repair, native-engine installation, native launch, or broader file acquisition was undertaken in this bounded pass. Those are future actions, not hidden completed work.

## Validation performed

The dossier was checked by parsing its JSON, rehashing all selected files, checking that every declaration's line range lies inside its cited file, checking the three known parent hashes, and inspecting the owned documentation for unsupported full-reconstruction claims and accidental proprietary payloads. These are documentation/provenance checks. They do not validate gameplay, native execution, browser behavior, or performance.
