# Native positive-budget research status

The raw-memory research status evaluator now continues through resource lookup and adjusted cost instead of stopping at those helper entries. The [category-sort closure](RESEARCH_CATEGORY_SORT_PORT.md) also replaces the old size-based sort stops. This closes the ordinary null-tooltip branch of `140F5B910` over explicitly supplied native state. It does not create effective technology definitions, construct a campaign, deduct resources or implement the scheduler.

`native/research-budget.ts` exports `computeResearchBudgetCost`, `readResearchBudgetResource` and `evaluateResearchBudget`. The graph evaluator composes the last function after its existing eligibility gates. Recovered code covers `F5BB10`, country/resource access, `1338750/142572DB0`, raw modifier lookup, local inline vectors, definition membership, small category sorting/intersection and reduction collection.

Allocation, release and the descriptor context-mask target remain individual services. Country tables, resource entries, category vectors, definitions, inline vtable bytes, TLS and stack memory are explicit supplied state. No cost, resource, collector, vector or sort output is provided as a callback result.

The implementation preserves signed wrapping arithmetic, native clamping and fixed-point conversion. Its cost/resource APIs return both the actual native output pointer and the signed value loaded through it. The status caller compares the returned cost value against the resource value, producing two or six without spending the balance.

Review found substantive argument-home and loop-end reloads omitted from an earlier staged version. The corrected implementation preserves state/country/output/tooltip home stores, output-pointer retention across cleanup, the collector's stack-backed end, the intersection's reloaded right end, and country TLS diagnostic gates. A callback that activates a tooltip stops before its unrecovered builder. These effects have discriminating original-instruction regressions. Compiler register saves, return-address traffic and complete x64 fault behavior remain outside the API.

The original-instruction oracle executes 129 cases over 54 exact code windows, 19,986 bytes and 1,702 visited decoded starts from executable SHA-256 `709f916afbebcfe64a26678702691aeb40945d206074c2a80de8e9d601fce148`. There are 118 returns and eleven explicit stops. Three readonly data ranges retain the original inline allocator tables and special-category name. Tests compare output pointers/values, raw objects, allocation bytes, condition contexts, ordered object/heap writes and service calls. Separate snapshots cover the semantic stack slots omitted from the general write trace.

The old 114-case checkpoint and red regressions remain preserved under `work/iron-meridian/native-budget`. Closing the old helper stops invalidated two intentionally incomplete graph fixtures. Their replacements retain every earlier raw write as an exact prefix and add explicit resource/world state, then execute the original full caller. The other 79 graph cases and all 29 initialization cases remain unchanged. Earlier references were preserved. A hash-checked promotion changes only module imports, the new implementation, its test and the graph reference import.

Independent review reran 129 budget, 81 graph, 29 initialization and 58 additional mutation/arithmetic checks, for 297 passing checks with overlapping composition coverage. It separately reexecuted both replacement original callers and verified their outputs, traces and snapshots. This is not a count of independent gameplay scenarios or a parity percentage.

| Remaining path | Explicit boundary |
| --- | --- |
| Missing category scratch allocation/release services | Before the actual leaf targets `1425A01DC` / `1425CEC00` |
| Cold allocator TLS | Before `1425A0588` |
| Cold country TLS | Before `1425A04D0` |
| Activated tooltip | Before `140B23890` |
| Native diagnostics | Before `14254AB40` |
| Missing allocator/release/context-mask service or unexpected virtual target | At the actual resolved target |

The API assumes valid nonnegative counts, valid mapped pointers, ordinary stack space and the declared TLS/inline-vtable state. Current verification retains 128 unchanged cases from the original 129-case handoff and replaces its obsolete sort stop with the identical input's complete original-caller result, plus three new caller cases. Standalone sorting adds 55 component cases; original AVX execution remains unverified. Effective definitions/resources, source-entry construction, resource consumption, completion effects, scheduling and full engine/browser campaign parity remain open. [PARITY_LIMITS.md](PARITY_LIMITS.md) records the wider boundary.

Original artifacts, frozen handoff hashes, promotion records, independent reviews and compiler/test logs are retained under `work/iron-meridian/native-budget`, `native-budget-review` and `native-budget-integration`. These raw-memory research functions remain outside the browser campaign. The actual browser currently uses recovered file callers for base-file startup over the authored provider described in [NATIVE_BROWSER_FILES.md](NATIVE_BROWSER_FILES.md).
