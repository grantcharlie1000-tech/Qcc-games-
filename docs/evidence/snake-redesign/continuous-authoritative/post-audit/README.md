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

## Version-gated effect import correction

A later actual-UI check of 03d4 exposed a separate presentation roundtrip issue: a converted lost save at time zero correctly had `foodAt: null`, but its v2 reload reimported serialized presenter age 200 and changed the model timestamp to −200. Pixels and semantic age were unchanged, but exact model restoration was violated. The retained migration marker is not the original save version.

`index.restore` now passes whether the original raw data is version 1. `restorePresentation` defaults that authorization to false and imports optional legacy ages only when explicitly authorized. Version 2 always owns model timestamps, including null, active and expired values at time zero. Model/contact/input/geometry code is unchanged.

- [Original UI whole-state failure](legacy-ui-v2-effect-reimport-failure.txt) is copied verbatim from the coordinator’s failed run; earlier initial analytic-coordinate harness strictness remains separately recorded by the coordinator.
- [Unit red regression](effect-version-red.txt): **2 failed / 43 passed**, covering held and lost time-zero effect ownership.
- [Focused units](effect-version-unit-tests.txt): **45 passed / 2 files**, including raw-v1 active/expired ages, nulls, ignored optional v2 metadata, exact model/view/pose restoration and retained previous migration/contact regressions.
- [Strict TypeScript](effect-version-typecheck.txt): pass.
- [Targeted Chromium](effect-version-browser-tests.txt): **2 passed (20.6 s)**. The existing continuous growth-save pixel case and a new six-scenario raw-v1 → time-zero-v2 reload matrix pass exact complete snapshots and canvas pixel equality for held/lost × null/active(80/30)/expired(200) ages.

Earlier 03d4 broad results retain their exact-source provenance. Independent re-review of this narrow effect-version correction remains pending; no external publication occurred.
