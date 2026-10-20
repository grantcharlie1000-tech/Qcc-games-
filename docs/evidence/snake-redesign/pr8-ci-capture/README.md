# PR 8 native pointer-capture fixture correction

The correction changes only the existing Snake browser test’s native capture fixture. It records the actual pointer ID, establishes capture through a small native move, asserts trusted `gotpointercapture`, releases that ID, and asserts trusted `lostpointercapture` before completing a 60 px movement. This mouse path now runs on both engines, alongside Chromium’s existing native touch-cancel path. Runtime, queue rules, geometry, timeouts and engine coverage remain unchanged.

## New CI evidence

[CI run 39484399211](https://github.com/grantcharlie1000-tech/Qcc-games-/actions/runs/39484399211) checked the approved `429fb551276a83e5f5736b91ec63ea4c87fba393` correction and finished **312 passed / 10 skipped / 2 failed**. [Original raw log and failure excerpt archive](original-second-ci-failure.zip) preserves both files verbatim; [readable failures](ci-second-failures.txt) includes complete assertion context. Artifact bytes remain inaccessible locally, so no screenshots or traces from this run were inspected.

The actual WebKit terminal diagnostics confirm that the previous [media synchronization correction](../pr8-ci-motion/README.md) was necessary: reduce started with query=true/rendered=false at fake time 267, remained false after frame 283, and became true at frame 299. No-preference started at 299; query=false/rendered=true persisted at 315 and 331, then both agreed at 347. These are real WebKit observations of the query/render boundary requiring two/three fake frame slices, replacing the earlier inferred timing classification. They do not by themselves expose WebKit’s internal retained-query/event ordering.

The Snake test then reached its capture fallback and found `queue: ['up']` instead of `[]`. The separate failure was an unchanged Ball Run test whose 250 ms wall-time key press did not reach x>0.5. The two fixture causes are distinguished below.

## Snake capture diagnosis and negative control

[Native diagnostic](capture-and-steering-diagnostic.json), with its [ad-hoc script](capture-and-steering-diagnostic.mjs), ran against unchanged product source on Chromium:

- Original immediate-release fallback: native pointer-down, move, up; **no got/lost capture events**, followed by `queue: ['up']`. Releasing pending capture before it has been processed does not establish a capture-loss cancellation. The subsequent movement was a valid swipe.
- Established capture then release: native down → trusted got-capture → small move → trusted lost-capture → subsequent movement/up, followed by `queue: []`.

This reproduces the failing fallback on an available engine and shows why checking an empty queue without checking actual cancellation could make the fixture invalid. No production listener or queue bug was established.

The [isolated negative control](capture-negative-control.json), with its [script](capture-negative-control.mjs), temporarily omits only production lost-capture listener registration while mounting one diagnostic page, then restores normal registration before observing native events. Both normal and negative cases receive trusted got/lost capture events. Normal runtime produces `queue: []`; the omitted-handler case produces `queue: ['up']`. No runtime file or permanent test case was patched. This demonstrates that the corrected fixture detects a broken cancellation handler and does not merely assert browser event bookkeeping.

## Ball Run failure classification only

The same diagnostic delivered trusted ArrowRight down/up over 250 ms while withholding RAF callbacks: x remained 0 before and after release. A 250 ms delivered fake-RAF window with native held input reached x=0.995. Thus wall-clock hold duration is not a guarantee of delivered simulation time. This establishes the old fixture’s failure class; the exact original CI missed-frame sequence cannot be inspected without its artifact.

**No Ball Run source or test was changed here.** The parent identified the separately reviewed Pool dependency `7c81983f69cf5e8103f75302f021ade3ff434267` as already containing its steering/timing harness repair and owns merge/dependency sequencing. That repair was not duplicated in this branch.

## Fresh verification

- [Focused Chromium repeats](focused-repeat-tests.txt): **5/5 passed (26.9 s)**. Each includes OS on/off, native touch cancellation, trusted mouse capture gain/loss, empty queue, app preference and no page errors.
- [All unit tests](unit-tests.txt): **309 passed / 25 files**.
- [Strict TypeScript](typecheck.txt): pass.
- Runtime, package files and Ball Run source/tests have no diff from the approved checkpoint. No full local browser repeat was run because these changes are isolated to this fixture; local WebKit remains unavailable due the previously recorded CDN HTTP 403.

Queued narrow independent review and a fresh dependent-head CI run remain pending. No push, PR creation, merge, deployment, settings change or new review agent was triggered by this task.
