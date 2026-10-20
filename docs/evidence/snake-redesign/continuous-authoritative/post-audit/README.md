# Post-audit legacy heading correction

Astra’s audit of exact candidate `c4156180c1f590212cbeb47f25245dbfe78605c5` identified one minor validation gap: malformed ready/running v1 saves could face back through their own neck, convert successfully, then produce an invalid v2 trail after continuation. Production v1 nonterminal saves did not generate that heading.

The minimal migration guard rejects a negative head-to-neck/heading dot product only for ready/running v1 saves. Perpendicular headings remain accepted; lost saves retain their fatal attempted direction. Version-2 geometry, contact, timing, input, rendering and migration of valid progress are unchanged.

- [Red regression](legacy-heading-red.txt): **2 failed / 37 passed**, reproducing reverse-facing ready and running legacy acceptance.
- [Focused units](unit-tests.txt): **39 passed / 2 files**, including explicit perpendicular running/lost and reverse fatal-lost migration, exact v2 reload, continuation and frozen-loss checks.
- [Strict TypeScript](typecheck.txt): pass.

This is a local corrective checkpoint pending independent re-review. Earlier audit/browser logs and screenshots remain historical evidence for their exact source, and no external publication occurred.

## Related first-leg cases from 8ef re-review

The first correction still allowed a perpendicular nonterminal legacy heading with an unsafe first saved queued turn, or an unsafe incoming initial turn. Both could depart back through the actual neck despite being legal relative to the nominal saved heading.

A shared departure check now validates both the stored live heading and first queued turn during v1 migration. Ready/held startup computes a candidate queue without mutating live state, verifies the actual first executed heading against the neck, then commits queue/direction/phase/continuation together. Rejected unsafe input leaves the save unchanged for a safe retry. A valid saved first turn retains priority; an incoming turn that initially points backward may remain queued for a later center after that valid first turn. Ordinary active-running input, geometry, clocks and rendering are unchanged.

- [Second red regression](second-heading-red.txt): **3 failed / 40 passed**, covering malformed saved first turns in ready/running and unsafe startup input.
- [Second focused units](second-heading-unit-tests.txt): **43 passed / 2 files**. Tests cover immutable failure and safe retry for v2 ready/held states, safe perpendicular continuation, and valid saved-turn priority through later movement and v2 reload.
- [Second strict TypeScript](second-heading-typecheck.txt): pass.

Broader verification of the initial 8ef fix remains historical to that source. No broad/browser rerun was performed for this extension before the requested targeted independent re-review.
