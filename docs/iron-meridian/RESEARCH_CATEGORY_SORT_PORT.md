# Native research category sort

`native/research-category-sort.ts` translates original `14045B190` and its insertion, merge, rotation, reverse and scratch-allocation closure. `research-budget.ts` now composes it in the resource/cost/status path. Counts above 32 no longer stop merely because the sort implementation was missing.

The API takes valid mapped native vector storage and the original entry-stack address. Allocation and release remain individual services. It preserves unsigned pointer ordering, left selection on equality, 32-entry insertion blocks, adaptive buffered merging, allocation retries, 512-slot stack fallback, callback capture/reloads and substantive argument/descriptor stores. It does not supply sorted output through a callback.

The frozen [handoff](../../work/iron-meridian/native-budget/sort-closure/PORT.md) retains 55 original-instruction cases over 13 windows and 3,237 bytes, visiting 834 decoded starts. Four additional original full cost/status runs cover 62 windows, 22,666 bytes and 1,825 visited starts. One preserves the former 33-category stop input exactly and now returns cost 80000. The three other cases use explicit synthetic 65-, 129- and 512-category memory. The old 129-case reference remains unchanged; current tests run its other 128 cases and these four complete callers.

[Independent review](../../work/iron-meridian/native-budget-review/sort/REVIEW.md) found no material implementation defect and added 32 original-instruction probes, visiting seven additional one-right-element merge starts. It inspected all 170 memory-writing instruction classifications. Ordered substantive stack writes are checked in standalone sort cases; the composed caller trace covers objects, heap and service calls. Compiler register saves, return-address traffic and stack commitment are outside the API.

One tooling defect remains documented in the frozen composed verifier: its assertions disappear under optimized Python. Promotion instead uses the independent unconditional [verify_owner.py](../../work/iron-meridian/native-budget-review/sort/verify_owner.py), which passes under `-O`. Its negative check proves the old verifier accepts a deliberately incorrect target hash when optimized. Frozen owner evidence was preserved.

Original AVX execution remains unverified because Unicorn rejects `VPERMQ` at `1425A32C0`; that failed attempt is retained and excluded from passing coverage. The AVX translation received static instruction review only. Other bounds include valid nonnegative counts, ordinary available nonoverlapping stack/storage, successful host byte-move primitives and no native exception unwinding. Effective technologies, resource consumption, scheduling, completion and campaign integration remain incomplete.

[Promotion records](../../work/iron-meridian/native-closure-integration/promotion.json) bind the staged source and import-only copies. The main graph source is byte-preserved. This component is outside the browser campaign.
