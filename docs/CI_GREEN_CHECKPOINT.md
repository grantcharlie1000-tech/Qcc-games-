# PR #1: green-CI checkpoint

Local preparation only. The changes described here have not been pushed, merged,
or deployed. Publishing the workflow change requires parent approval.

## Verified remote state

- PR: <https://github.com/grantcharlie1000-tech/Qcc-games-/pull/1>, open and mergeable.
- Reviewed PR head: `e0fb7b63a1ba00e044dc552f675dd8d25069eaf7`.
- Main: `375e2501dcd8241cdacb7b3b4f3af5eae2f84f41`.
- Latest main Actions run: [39310116897](https://github.com/grantcharlie1000-tech/Qcc-games-/actions/runs/39310116897), failed.
- That run finished with **11 failed, 9 skipped, 262 passed** browser tests. Its
  browser failure prevented build, offline/update verification and Pages deployment.
- The workflow currently has no PR trigger. The PR therefore has no Actions
  verification result; its Netlify preview check succeeds.
- Netlify reports the preview ready at the reviewed head, and production ready at
  the unchanged main commit. The browser's attempt to open the public preview
  failed with `net::ERR_TUNNEL_CONNECTION_FAILED`; public gameplay is unverified.
- No merge, production deployment, manual deployment, credential, security,
  permission or account-setting changes were performed.

## Proposed workflow change

The local `.github/workflows/pages.yml` diff adds `pull_request` for `main` and
guards configure-pages, upload-pages-artifact and the deployment job so they do
not run on a PR. Each PR gets its own concurrency group, so a PR cannot replace a
pending main/work run; non-PR runs retain the existing `pages` group. Every
existing verification command remains, including the full
Chromium and WebKit suite, build, update and offline checks. Existing permissions,
push behavior and action versions are unchanged. No test exclusions, retries,
continue-on-error or relaxed merge conditions are added.

## Actual main failures

| Engine | Test | Observed failure / status |
| --- | --- | --- |
| Chromium | Block Fill: all twelve gardens | Garden 12 covered 24 instead of 36. Intermittent locally; local test readiness repair prepared. |
| Chromium | Minesweeper: phone levels / adjustable cells | Rendered cell 39.2977 instead of logical 44 CSS px under the shared stage transform. Local test now checks logical width and its scaled rendered width. |
| Chromium | Tower: tall camera / nine perfect floors | 30-second test timeout while software-rendering intermediate frames. Local test uses elapsed-time jumps while preserving all nine real keyboard drops, combo assertion and screenshot, and adds full slab-size assertions. |
| WebKit | Animal Stack: held directional keys | Aim remained 190 instead of exceeding 210. Unresolved; requires reproduction in WebKit. |
| WebKit | Color Blocks: square board, 390×844 | Width/height differ by 8 px. Unresolved. |
| WebKit | Color Blocks: square board, 844×390 | Width/height differ by 6 px. Unresolved. |
| WebKit | Color Blocks: square board, 1366×768 | Width/height differ by 8 px. Unresolved. |
| WebKit | Pool: scratch / ball-in-hand placement | Requested logical x=180, saved x=176.8916. Unresolved; inspect native coordinate quantization and fitting before changing code or assertions. |
| WebKit | Snake: swipe and direction buttons | Test unconditionally called Chromium-only `newCDPSession`. Local repair retains native Chromium touch, exercises native mouse pointer swipe on WebKit, and retains native touch direction-button taps plus all state assertions in both engines. No new skip. |
| WebKit | Solitaire: long tableau after phone resize | Last card extends beyond its column. Unresolved. |
| WebKit | Water Sort: captured drag cancellation on resize | Capture remained held. Unresolved; inspect resize event/layout timing and cancellation. |

## Local diagnosis and verification

The Block Fill failed trace measured the first post-reload drag point at
`x=378, y=488.703125`, before the stage fit; following points used the fitted board
center `x=195`. The drag never reached the trail head. The test now waits for the
stage-fit marker and Playwright's stable native hover before measuring coordinates.
It still uses real mouse moves, interpolation, all twelve gardens and unchanged
completion assertions, plus an explicit completion check after reload.

- Before: targeted Chromium run, **1 failed / 2 passed**; the post-reload drag
  failed. Raw output: `docs/evidence/ci-green/chromium-before.txt`.
- After: targeted Chromium run, **4/4 passed** (Block Fill post-reload and all
  twelve gardens, Snake swipe/buttons, Tower nine perfect floors). Tower fell from
  15.9 seconds in the immediately preceding successful run to 1.9 seconds, without
  increasing its timeout. Raw output: `docs/evidence/ci-green/chromium-targeted-after.txt`.
- Minesweeper targeted Chromium case: **1/1 passed** in 5.4 seconds; output:
  `docs/evidence/ci-green/chromium-minesweeper-after.txt`.
- `npm run check`: **passed**; output: `docs/evidence/ci-green/typescript.txt`.
- Repeated all five repaired Chromium cases three times: **15/15 passed** in
  1.8 minutes; output: `docs/evidence/ci-green/chromium-repeat-after.txt`.
- Workflow YAML parsed with PyYAML; unchanged permissions, push triggers and
  verification commands, all three PR deployment guards and isolated PR
  concurrency groups were checked. Astra identified the initial shared pending
  queue risk; the local proposal now isolates each PR and preserves the `pages`
  queue for non-PR runs.
  The full suite has not been declared green.
- WebKit is unavailable in this environment. The previous browser installer was
  rejected by the network proxy with HTTP 403 `Domain forbidden` while fetching
  the Playwright FFmpeg dependency. No alternative download route was attempted.

## Merge blockers and requested decision

1. Approve publishing the exact scoped PR-CI workflow change and these test-harness
   repairs to PR #1 so GitHub can run the full two-engine suite on the PR.
2. Main is already red, and the remaining WebKit failures are not fixed. The
   instruction to merge only with green main and CI still applies. A green PR
   alone would not make the current main run green. Parent must determine the
   authorized main-restoration path; this checkpoint does not request a waiver,
   direct push to main, or an unrelated repair PR.
3. Obtain full green results and an exact-head review after any further repair;
   then, if the main/CI gate is satisfied, squash merge and verify the automatic
   production deploy commit plus actual public gameplay.
