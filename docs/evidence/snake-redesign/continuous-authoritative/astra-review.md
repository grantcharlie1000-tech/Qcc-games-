# Independent continuous Snake audit

Reviewed source: `c4156180c1f590212cbeb47f25245dbfe78605c5`; narrow first correction reviewed at `8efb49b6f3251ee3b74061ac0679c6737d3fa7c6`. Review date: 2026-10-20. Read-only product review; no commits, publication, or subagents.

## Initial c415618 assessment

No Critical or Important gameplay finding. The current implementation satisfies the authorized continuous-travel architecture: rendering uses the authoritative orthogonal trail, shared solid radii align contact and visible geometry, and event time is advanced before accepting input or freezing/saving. The changed next-junction turn cutoff is explicitly documented. This is materially different from the earlier delayed interpolation and discrete fallback.

Independent fresh verification: 36 Snake unit cases, strict TypeScript, and all five focused Chromium cases passed (23.2 s). Raw logs: `/tmp/qcc-snake-astra-continuous-unit.txt`, `-check.txt`, and `-browser.txt`.

An independent oracle reconstructs polyline advection, tail trimming and signed point/segment clearance without using the production contact solver. Dense sweeps plus bisection matched 4,200 center-start fixtures / 1,319 contacts and 2,790 fractional-start fixtures / 70 contacts. Maximum contact-distance disagreement was below 3e-14 cells. Food was disabled in this oracle to isolate wall/self/tail geometry. Scripts and raw outputs: `/tmp/qcc-snake-astra-contact-oracle.{mjs,txt}` and `/tmp/qcc-snake-astra-fractional-contact-oracle.{mjs,txt}`. Eating, growth, tie priority, frame partitions, saves and junction tolerances also have passing focused tests; the oracle is additional evidence, not a claim of exhaustive coverage.

Minor finding: legacy nonterminal reverse-facing saves were accepted. For body [(5,6),(4,6),(3,6)], direction left, empty queue, running, score 0 and archived elapsed 93, Continue moved back into the neck. Loss occurred after 32 ms with path length 1.6 instead of 2; the resulting v2 save was rejected. Normal v1 gameplay did not generate this heading, so this is malformed-save robustness rather than a normal-run regression. Reject unsafe conversion/start headings while preserving legitimate terminal attempted directions.

## First correction: 8efb49b

The direct reverse-heading case is rejected by the three-line migration guard. Perpendicular running and terminal attempted directions remain accepted. Fresh 39-unit and strict TypeScript runs passed; raw outputs: `/tmp/qcc-snake-astra-postfix-unit.txt` and `/tmp/qcc-snake-astra-postfix-check.txt`.

The same Minor robustness issue remains through two related accepted paths: use the same body with legacy direction up and (1) saved queue ['left'] before Continue, or (2) empty queue followed by start(state, 'left'). Both select the reverse-to-neck first leg, shrink path length to 1.6 and produce an unreloadable v2 loss. Migration must account for an unsafe stored first turn; continuation must reject a newly supplied reverse-to-neck first turn before mutating the held state's queue. This does not require altering active continuous-leg input rules.

## Nonblocking accessibility advisory and limits

The focused canvas is role img with no aria-live. Its aria-label changed 31 times over 500 ms because render writes fractional head coordinates each frame. This exports frequent focused-name changes to accessibility consumers. A stable instruction name with paced or on-demand position detail is preferable. Actual screen-reader announcement behavior was not tested; this is not a confirmed speech failure or release blocker.

The current phone capture was inspected and shows coherent connected bends, readable controls and usable layout. Google reference navigation was blocked; no exact-reference comparison is claimed. WebKit installation failed with CDN 403. No physical device, Chromebook or assistive-technology testing occurred. Fourfold CPU profiling has recorded frame drops and does not substantiate physical 60 FPS. Unrelated game suites were not independently rerun. Earlier numeric/clock/browser failures and their successful corrections remain in the coordinator's evidence; later passes do not erase that history.

At the first-correction review, the slot remained reserved for the second narrow correction. No new movement-architecture change was requested.


## Final correction and verdict: 03d4a1c

Exact final source reviewed: `03d4a1c4c800bf803999d4859431e98d1c2982ce`, 2026-10-20. The only executable product changes since c415618 are the legacy/initial-departure guards in `src/games/snake/model.ts`; movement geometry, contact solving, event-time input handling, rendering and accessibility behavior are unchanged.

The Minor malformed-save finding is resolved. `model.ts:27–39` checks the effective first departure against the actual head-to-neck direction using a cloned candidate queue, before mutating the live queue, heading, phase or migration hold. `model.ts:152` rejects unsafe current or first queued headings during live legacy conversion. Terminal attempted headings remain preserved. The ordinary active-leg branch at `model.ts:34` still delegates input to the existing queue logic.

Independent fresh final checks:

- 43 Snake unit tests passed (38 model, 5 presentation); strict TypeScript passed.
- A separate 291-assertion script checked four rotations of the reported legacy shape, both ready/running migration rejection, invalid initial input without queue or migration mutation, safe retry, perpendicular Continue, saved-first-turn priority with a later incoming turn, terminal/v2 round trips, and active-leg queue equivalence at 0, 33 and 159.99999999 ms. All passed.
- HEAD remained the exact reviewed SHA and tracked working-tree/index diffs remained empty. Coordinator-owned untracked evidence was present and untouched by this reviewer.

Raw final evidence: `/tmp/qcc-snake-astra-final-unit.txt`, `/tmp/qcc-snake-astra-final-check.txt`, `/tmp/qcc-snake-astra-final-heading.txt`, and its reproducible script `/tmp/qcc-snake-astra-final-heading.mjs`. The initial 36-unit/five-browser and independent contact-oracle results above apply to unchanged movement/rendering source; no additional broad browser rerun was needed for the narrow guard correction. The coordinator owns final whole-suite, build and offline checks. The two correction rounds' RED logs remain preserved; first-fix success did not establish closure of the later-discovered queued/input paths.

### Remaining findings

Critical: none. Important: none. Required Minor fixes: none.

Nonblocking advisory: `src/games/snake/index.ts:28` updates the focused image's accessible name with fractional coordinates every render (observed 31 changes in 500 ms). Consider a stable instruction name and paced or on-demand position detail. No real assistive-technology session was performed, so this is not a confirmed speech defect and does not block readiness.

### Declined to judge

- Exact Google Snake visual fidelity: reference navigation was blocked; the original-art result was assessed on its own.
- WebKit behavior: browser installation was blocked by CDN 403.
- Physical phone/Chromebook performance and input: only desktop Chromium/emulation and recorded CPU throttling were available.
- Actual screen-reader speech/interaction: no assistive-technology session was available; the DOM mutation advisory above remains explicit.
- Unrelated games and broader application changes: outside this Snake-only review; no independent full 160-browser rerun.

### Readiness

Ready as the locally verified continuous Snake redesign candidate, subject to the coordinator's final integration/offline checks. The implementation now delivers continuous orthogonal travel from authoritative positions with matching contact geometry; it is not the previously unaccepted discrete checkpoint or a one-tick-delayed projection. Changed next-junction turn acceptance is authorized and documented. No unresolved required code-review issue remains, and no publication, push, merge or deployment is authorized or performed by this review. The reserved Astra review slot can be released.
