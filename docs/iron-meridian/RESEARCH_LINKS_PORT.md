# Native research links and status initialization

[research-links.ts](../../src/games/iron-meridian/native/research-links.ts) ports the complete `0x140F5D0B0` graph-linking body, ordinary no-tooltip eligibility and status paths through `0x140F5B910`/`0x140F54690`, status propagation at `0x140F53500`, and the graph/status tail of `0x140F60650`. It operates on already initialized raw objects and raw definition databases. It does not manufacture native-effective technology definitions from installed text files.

## Executable and original-instruction evidence

The bound input is `C:\Program Files (x86)\Steam\steamapps\common\Hearts of Iron IV\hoi4.exe`, 56,535,160 bytes, preferred image base `0x140000000`, SHA-256:

```text
709f916afbebcfe64a26678702691aeb40945d206074c2a80de8e9d601fce148
```

[emulate_links.py](../../work/iron-meridian/native-links/emulate_links.py) verifies that identity, extracts original bytes and LLVM disassembly, and runs the original bodies in Unicorn 2.1.4. [reference.json](../../work/iron-meridian/native-links/reference.json) records **81 cases**, **27 byte ranges totaling 12,510 bytes**, and **1,709 distinct executed original instruction starts**. Every recorded start was independently checked against the decoded LLVM instruction starts. The executable, ranges, generator and 23 corroborating instruction-export hashes were checked.

Reference JSON SHA-256: `81d3ada79ce384cfdb40264321c46dde2a748e1dfff0aa466118235ccfcb1f5e`.

Fixtures declare synthetic valid raw structures, pointers, strings, allocators and runtime leaves. Nonempty active definitions exercise actual native constructors' downstream contracts, but these fixtures are not captured native-effective installed definitions. Original linker, lookup, string, eligibility and status bodies run; no hook returns an entire graph, registry lookup, eligibility result or status result. The standard memory-copy primitive is an explicit byte-copy hook, and external allocator/profile/virtual services are declared separately.

## Integration API and caller sequence

| Export | Native scope |
| --- | --- |
| `linkResearchState` | Complete `0x140F5D0B0` over one state and the owner's state-vector header |
| `evaluateResearchStatus` | `0x140F5B910`, including direct no-tooltip eligibility; returns a numeric status without storing it |
| `recomputeResearchState` | `0x140F53500`: store status, notify observers when changed, then propagate to children |
| `initializeConstructedResearchGraph` | Exact caller slice `0x140F607E7..0x140F60896`, after construction and slot preparation |

The last function follows the original caller in two distinct passes:

1. Capture the owner's state-pointer range at `owner+0x88/+0x94` and link every nonnull state. Parent pointers, dependency lists and observer registrations are established before status evaluation starts.
2. Reload the pointer range. Evaluate each nonnull state with null parent, store its status, and, only when it changes, recompute its children with notifications disabled and the native third argument set to one.

The oracle enters that retained caller slice with `RSI=owner+0x88` and the caller's post-slot-preparation RSP. Both passes and every invoked direct body run in one Unicorn invocation for the initialization cases. This proves the tail sequence under the raw fixture contract. Constructor-to-tail composition is a separate next validation, not established by these tail-only entries.

`ResearchLinksContext.entryStack` is native entry RSP for the first three functions. For `initializeConstructedResearchGraph`, it is the native caller's post-prologue RSP at `0x140F607E7`. `tlsBlock` supplies the matching TLS layout. Scratch memory must be mapped; these values are not object pointers or generated layouts.

The existing [construction port](RESEARCH_CONSTRUCTION_PORT.md) stops with boundary `research-state-graph` at `0x140F5D0B0` after state construction and slot preparation. At that exact boundary, the tail adapter uses the same raw owner and memory, with `entryStack` set to the construction context's `frameBase`. Earlier construction stops do not establish that precondition. This does not authorize rerunning the whole constructor after a partial result.

## Recovered effects

The linker preserves all four reference groups and native iteration order:

- Definition `+0x350/+0x35C` references populate state `+0xB0/+0xBC` and write each target's parent at `+0x168`.
- Definition `+0x308/+0x314` references populate state `+0xC8/+0xD4` and register `state+0x10` as an observer of each active target.
- Definition `+0x338/+0x344` references populate state `+0xE0/+0xEC` and register observers.
- Definition `+0x320/+0x32C` strings pass through the native temporary string/reference construction and register observers.

Reference lookup `0x140B1A3E0` reads the actual supplied pointer and 40-byte reference tables. It compares the raw hash, then strings, reloads a matched pointer after comparison, and uses pointer index zero as fallback. ASCII folding is byte based. A nonzero locale global requires the named CRT locale service. No Unicode normalization is invented. `0x140B1E990`/`0x140C1F080` preserve short/heap strings, ASCII-folded FNV hashing, large allocation alignment and native free checks.

Forward counts reset in native order. Capacity growth preserves binary32 multiplication and signed conversion behavior, including NaN/overflow conversion to the indefinite integer before the minimum-capacity comparison. New elements are written before old elements are copied and released. The first forward vector publishes its new count before pointer/capacity; the other vectors preserve their different native publication order. The 32-byte observer-record path writes only its actual fields, preserving untouched poisoned padding.

The eligibility path includes category selection `0x140B22E30`, the real temporary pointer vector, initialized-TLS gate, recursive prerequisite conditions `0x140B24CC0`, direct level/reference checks, and visibility `0x140B24ED0`. Condition contexts use direct `0x14057BDB0`, `0x140581970`, `0x1405830B0`, `0x140C07100` and inverse-country-table logic. The first completed prerequisite short-circuits later prerequisite references in the no-tooltip path. The native empty-string scratch object is initialized and cleared even when no tooltip is requested.

Status propagation always stores the evaluated dword. An unchanged value skips notifications and children. On change, the observer count is captured, observer pointers are reloaded for each call, and the child count is loaded after callbacks. Native callback arguments include the previous status. Recursion retains the native check-parent argument and caller stack positions.

## Runtime services and remaining reachable stops

Named leaves are allocation/release, CRT locale comparison `0x1425D05D0`, profile enter/exit `0x142551E20`/`0x142552500`, condition virtual `+0x18`, and observer virtual `+0x10`. Missing services stop at their actual target addresses. Profile and condition hooks receive native argument addresses; tests compare initialized context fields before applying callback mutations.

| Remaining path | Stop |
| --- | --- |
| Cold allocator TLS guard | `0x1425A0588` |
| Required general TLS initialization during context reset | `0x1425A04D0` |
| Assertion branches | `0x14254AB40` |
| Positive budget after successful mutual exclusion eligibility, type other than four | Before resource accessor `0x1407171E0` |
| Positive budget, type four | Before adjusted-cost routine `0x140F5BB10` |
| Inactive definition in the additional-level check | First logging helper `0x14254B3F0` |
| Nonempty condition-owned virtual destruction | Resolved virtual target |
| Nonempty condition-owned vector | Before `0x140201280` |
| Invalid string pointers/length/alignment | Specific CRT/string stop addresses retained by the result |

The budget accessors' reconstructed bodies are available. This slice deliberately stops before that separate resource/adjusted-cost branch; it does not replace it with a callback result. The adjusted-cost closure includes `0x140F52F80`, `0x140B23210`, country/category modifier lookup and signed fixed-point arithmetic. No tree-based bookkeeping, positive-budget adjustment or tooltip generation is claimed here.

Stops preserve prior object, heap and declared scratch effects. They do not roll back or provide resumable continuations. Repeating graph initialization can append duplicate reverse observers. Caller preconditions include mapped extents, valid lengths/capacities, usable allocations, valid runtime objects and a finite supported recursion depth. Host memory errors propagate. Native saved-register/return-address stack traffic and the internals of declared external services are outside the translated memory contract.

## Verification

```text
npx.cmd vitest run tests/games/iron-meridian/native-research-links.test.ts --reporter=dot
81 passed: 63 returned, 18 runtime-required
Scoped strict/noUnused TypeScript: 0 diagnostics
```

Checks compare full poisoned state objects, all allocated buffers, selected scratch objects, allocation arguments, initialized condition fields, and the ordered sequence of semantic writes and service calls. Cases include four-group links, inactive and fallback references, duplicate observers, both observer storage forms, short/aligned strings through length 4096, float growth, conditional categories, recursive conditions, level gates, status propagation, caller sequencing and partial-stop effects.

The tests were observed failing against unimplemented link/status/tail bodies. Original-byte regression cases also caught a premature stack-backed visited-record capture, a missing prerequisite short-circuit, and omitted empty-string scratch initialization before those changes were corrected.

Source and tests were temporarily staged under `work/iron-meridian/native-links/` during the parent's validation freeze. Original draft copies remain under `staged/`; the completed files are restored to `src` and `tests`. No full application build/check, browser, original game process, Ghidra project access, installation, commit or deployment occurred in this slice. Independent review and whole-app integration remain parent-owned.
