# Narrow terminal-save effect round-trip re-review

Reviewed runtime: `ffa5e45e18764ea07681dfc2f0d44b8887d0a3e0` (verified from Git), 2026-10-20. Comparison: independently approved continuous candidate `03d4a1c4c800bf803999d4859431e98d1c2982ce`. This is a narrow follow-up, not a replacement for the earlier continuous movement/contact audit. Product review remained read-only; no agents, publication, push, merge or deployment.

## Scope and finding disposition

The coordinator's actual-UI failure found that a converted legacy save at time zero retained a migration marker. After serializing as v2, its optional presenter metadata could be reimported and change authoritative null timestamps to -200. The original failure and the two-failure/43-pass regression RED output remain preserved in scoped evidence.

The correction is sound. `src/games/snake/index.ts:123` passes the original raw save's `version === 1` discriminator. `src/games/snake/presentation.ts:12–20` imports optional ages only when that explicit flag is true; its default is false. Retained migration markers and optional v2 metadata no longer authorize timestamp changes. Valid legacy ages remain bounded/finite and eaten cells validated; malformed optional metadata is ignored. Invalid authoritative v2 timestamps are rejected by the existing model validation rather than replaced with presenter values.

Model, artwork and style source are byte-identical to the previously reviewed 03d4 runtime. No contact, movement, input deadline or rendering geometry change is included.

## Independent fresh checks

- 45 focused Snake unit tests passed (38 model, 7 presentation); strict TypeScript passed.
- The actual Chromium restore-boundary test passed in 17.7 seconds. It covers six running-held/lost × null/active/expired effect cases, comparing complete serialized state and exact canvas pixels after v1 conversion and v2 reload.
- An additional independent script passed 216 v2 cases combining both phases, independently null/active/expired food/eating timestamps, and twelve optional metadata shapes, including malformed values. The entire model state and projected geometry remain unchanged, including after serialization-generated metadata and frozen-time advancement.
- The same script passed 24 legacy import/malformed-metadata cases and ten invalid authoritative v2 timestamp rejection cases.
- HEAD still matched the reviewed SHA after checks. No product changes were made by this reviewer.

## Evidence

- `/tmp/qcc-snake-astra-effect-version-unit.txt`
- `/tmp/qcc-snake-astra-effect-version-check.txt`
- `/tmp/qcc-snake-astra-effect-version-browser.txt`
- `/tmp/qcc-snake-astra-effect-version-browser/` (Playwright output directory)
- `/tmp/qcc-snake-astra-effect-version-matrix.txt`
- `/tmp/qcc-snake-astra-effect-version-checks.mjs` (reproducible independent matrix)

## Verdict and limits

Critical: none. Important: none. Required Minor fixes: none. The reported time-zero v2 effect reimport is resolved, and the narrowed correction is ready for local acceptance.

Declined to judge anew: unrelated games, broad performance, contact geometry and input semantics were unchanged and outside this follow-up; the prior larger audit remains applicable. Exact Google reference fidelity, WebKit, physical-device behavior and real assistive-technology behavior remain unverified for the previously recorded reasons. The prior accessible-name update-frequency advisory is unchanged and nonblocking. No broader suite is claimed as independently rerun here; the coordinator owns final integration/build/offline verification.

No remaining blocker from this review. The reserved Astra slot can be released.
