# Pool direct-input verification — 2026-10-20

Current horizontal/direct-input implementation, regression findings, reproducible commands and evidence are documented in [POOL_DIRECT_DRAG.md](../../../docs/POOL_DIRECT_DRAG.md). Final checks: full unit suite 282/282 (Pool 48/48), Chromium Pool/shared viewport 22/22, TypeScript and production build passed; Pool offline verification passed at root and repository subpath. Native interaction 12/12, visual-viewport scale cancellation/recovery, and both held-contact pause/Study cases passed. Production offline pack: `d443f708b79d`. The first Astra audit’s important pause/contact finding is fixed and awaits exact fix-commit follow-up review. WebKit remains unavailable (browser download HTTP 403). This update preserves the original physics, AI, rules and save tests. The earlier 2026-10-19 record below describes the original portrait/button interface and is retained as historical evidence.

# Pool verification — 2026-10-19

Worktree `/workspace/Qcc-games-/.worktrees/pool`, branch `game/pool`. Isolated Vite: `npm run dev -- --port 4191`. No shared configuration/dependency edits by Pool specialist. Browser `/usr/bin/chromium`, Chromium 154.0.8037.57, Debian 13.

## Fresh final commands

- `npx vitest run tests/games/pool` — **40 passed**, 1 file, 0 failed (08:49:58 UTC; 837ms reported duration).
- `npm test` — **44 passed**, 2 files, 0 failed: Pool 40 plus existing core storage 4 (08:50:00 UTC; 619ms duration). All unit tests present in this isolated worktree, not the other eleven worktrees.
- `npm run check` — **exit 0**, strict TypeScript no-emit check, no diagnostics.
- `ARCADE_URL=http://127.0.0.1:4191 npx playwright test tests/games/pool --project=chromium` — **6 passed**, 0 failed (23.8s), real `/#/game/pool` route and system Chromium.

## Behavior exercised

Unit tests use analytical head-on/oblique elastic momentum and energy expectations. They cover separating contacts, no repeated impulse, cushion reflection, fast pocket capture, bounded energy in seeded free flight, finite rolling stop, stable 16-ball rack break and four offset breaks without duplicate/lost balls. Rack checks prove seven solids, seven stripes, central eight and opposite-group back corners. No card/deck state exists.

Rules: open break table, group assignment, keep/pass turns, wrong first hit, scratch with pot, no rail, invalid cue placement, early/foul/wrong-pocket/legal eight, and break-eight re-spotting clear of the cue. Snapshots reject malformed fields, groups, IDs, speeds, shot events, fabricated winner and stationary overlap. A live shot saved after 130 steps finishes identically on restore. Finished scratch-on-eight saves restore.

AI: legal clear ghost-ball contact, actual intended pot, eight targeted only after its group clears, and both sides playing a deterministic complete rack. Additional direct model diagnostic: 19 shots, 12,470 steps, one foul, legal called-eight win with three opponent stripes remaining.

Browser: trackpad click aiming, power input, rolling break, pause freezes coordinates, resume, 366px-width fit, human mode, keyboard aim, restart, visible local rule disclosure, leave/re-entry, live-shot persistence, no duplicate input after re-entry, genuine computer reply, actual scratch then click/confirm ball-in-hand placement, and correctly/wrongly called eight pots. Completed outcomes restore after reload. Late-game fixtures use the normal saved-game contract; shots and outcomes run through the real game.

## Evidence and visual review

- `tests/games/pool/evidence/chromium.png`: actual full-page 390×844 Chromium screenshot after two-player restart; manually opened/inspected.
- `tests/games/pool/evidence/initial.png`: actual initial computer-mode 390×844 view; manually opened/inspected.
- `tests/games/pool/evidence/performance.json`: 120 RAF intervals during a shot, viewport 390×844/DPR1. Median 16.7ms, p95 16.7ms, max16.8ms, mean16.54ms; no page errors. One headless environment sample, not a physical Chromebook measurement.
- Browser measurement: game width366px; no horizontal document overflow at390px. Portrait table and controls scroll vertically.
- Original in-game artwork: `src/games/pool/render.ts`. Parent replaces `public/game-art/pool/cover.svg` separately as requested; no cover edit in this commit.

## Earlier failures and corrections

Initial unit run failed because the new model did not yet exist. Regression tests then reproduced two real defects: terminal scratch-eight saves rejected, and break-eight spotting overlapping the cue. Both fixed. Later failing coherence tests reproduced acceptance of a fabricated winner and overlapping stationary balls; validation now rejects them.

Initial E2E before the isolated server started: connection refused. First playable run: slow frames from rebuilding felt texture and panels every frame; cached static artwork and separated drawing from UI updates. Live-shot re-entry equality assertion changed to allow ordinary elapsed simulation; model tests prove exact deterministic restore. Late-game fixture reload initially triggered shell pagehide overwrite; setup now enters from the library after writing the fixture. Final checks above pass.

## Limits

WebKit not run: configured `/home/agent/.cache/ms-playwright/webkit-2370/pw_run.sh` absent (`existsSync=false`). Production service-worker/root/subpath offline-pack testing and all-game integration belong to parent; Pool has no runtime external requests and imports no physics engine. No physical Chromebook/touch hardware/optimal-AI claims. Local rule and physics simplifications are visible in Game rules and SPEC.md.

## Pocket openings and visible rails — 21 October 2026

- Reproduced six failures before the fix: four off-centre side-pocket entries,
  rounded-jaw deflection, and a preview stopping at the invisible wall. Central
  entries into all six pockets were retained as regression coverage.
- `npm test`: **411 tests passed, 30 files**, including 52 Pool model tests and
  the existing deterministic full rack, energy, break and save/restore checks.
- `npm run build`: **passed** (existing large bundle advisory remains).
- Chromium Pool suite: **19 passed initially**. Two tests (pause/restart/scaling
  and live-shot save/restore) encountered missing Playwright trace files because
  another invocation reused the output directory. Both passed in an isolated,
  single-worker rerun, together with the new real-pointer off-centre pot test:
  **3 passed**. All **22 distinct Pool browser scenarios** therefore passed.
- Inspected fresh canvas captures at 1366×768, 390×844 and 844×390: larger
  contrasting pocket wells, visible inner capture rims, chamfered cushions and
  highlighted physical rail noses remain legible with the existing table fit.
- Independent code review: **no blocking findings** for collision, preview,
  AI kick reflection, rendering alignment or snapshot bounds.
