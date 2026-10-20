# Post-audit legacy heading correction

Astra’s audit of exact candidate `c4156180c1f590212cbeb47f25245dbfe78605c5` identified one minor validation gap: malformed ready/running v1 saves could face back through their own neck, convert successfully, then produce an invalid v2 trail after continuation. Production v1 nonterminal saves did not generate that heading.

The minimal migration guard rejects a negative head-to-neck/heading dot product only for ready/running v1 saves. Perpendicular headings remain accepted; lost saves retain their fatal attempted direction. Version-2 geometry, contact, timing, input, rendering and migration of valid progress are unchanged.

- [Red regression](legacy-heading-red.txt): **2 failed / 37 passed**, reproducing reverse-facing ready and running legacy acceptance.
- [Focused units](unit-tests.txt): **39 passed / 2 files**, including explicit perpendicular running/lost and reverse fatal-lost migration, exact v2 reload, continuation and frozen-loss checks.
- [Strict TypeScript](typecheck.txt): pass.

This is a local corrective checkpoint pending independent re-review. Earlier audit/browser logs and screenshots remain historical evidence for their exact source, and no external publication occurred.
