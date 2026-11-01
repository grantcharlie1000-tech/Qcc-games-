# Tetris pre-push polish audit

Date: 2026-11-02. Branch: `ui/tetris-redesign`. Pre-polish baseline: `cb9bbaa`.
Checklist: [/workspace/codex-briefs/POLISH-AUDIT-CHECKLIST.md](/workspace/codex-briefs/POLISH-AUDIT-CHECKLIST.md).

All Tetris-owned findings below are fixed. Four centrally owned sheet findings are listed and intentionally unchanged, as the supervisor requested. No push, merge or deployment was performed.

## Coverage and verification

Chromium and WebKit: 390×844 at DPR 3, 1366×768 at DPR 1, and the additional 320×568 overflow check at DPR 3. Both OS light and dark preferences were exercised: Tetris has one installed dark palette in both modes (`rgb(9, 9, 11)`, shared dock tone `dark`), so no alternate light game material was invented.

- 120 automated Tetris-owned geometry, typography, focus, target, overflow, HUD and dock-height checks passed across six configurations.
- Score/Level/Lines are verified through the existing shared HUD slot, including an actual restore/report update to `12345 / 2 / 12`.
- `npm run check` and `npm run build`: passed.
- Full unit suite: 161 files, 3,284 tests passed.
- Quadfall E2E: 66 passed; 2 WebKit native-fullscreen cases skipped. The new regression changes the shared dock height without changing the run or covering board cells.
- Independent read-only polish review found no local CSS/markup regressions. Its two audit-method corrections—checking changing HUD values and sampling painted surfaces instead of wrapper backgrounds—are implemented.

## Findings and fixes

| Surface | Finding | Fix / disposition | Before / after shot |
| --- | --- | --- | --- |
| Game-over stats row | Labels were 13 px and values 28 px on separate lines; text-box bottoms differed by 38.89 px in Chromium and 38.24 px in WebKit. | **Fixed:** both label/value pairs use the same 14 px size and line height, with consistent label/value weights. All four text bottoms now share one baseline: 0 px spread in all six configurations. | [before](/workspace/qcc-liquid-glass/tetris/polish-audit/before-chromium-390x844-stats.png) / [after](/workspace/qcc-liquid-glass/tetris/polish-audit/after-chromium-390x844-stats.png) |
| Game-over sheet at 320 px | The sheet inherited the narrow well width. Five-digit Score/Best values overflowed, and “Game over” wrapped onto two lines. | **Fixed:** the same minimal sheet is a direct child of the game root, independent of well width. Five-digit values and the heading fit; row insets are symmetric. No new sheet abstraction or material was added. | [before](/workspace/qcc-liquid-glass/tetris/polish-audit/before-webkit-320x568-over-full.png) / [after](/workspace/qcc-liquid-glass/tetris/polish-audit/after-webkit-320x568-over-full.png) |
| Game-over title | Local title was 20 px / weight 600 / line-height 25 px, unlike the installed shared game-menu title. | **Fixed:** local title matches the existing 22 px / 650 / 1.2 title role. | [before](/workspace/qcc-liquid-glass/tetris/polish-audit/before-chromium-390x844-over.png) / [after](/workspace/qcc-liquid-glass/tetris/polish-audit/after-chromium-390x844-over.png) |
| Hold / start focus | The Hold chip’s default outer focus outline was clipped at the game boundary. The start pill could also lose an outer ring in a narrow well. | **Fixed:** game-local pills use a visible 2 px inset ring. Hold/Next label roles remain identical; Hold’s disabled appearance corresponds to its actual disabled state. | [before](/workspace/qcc-liquid-glass/tetris/polish-audit/before-chromium-390x844-chips.png) / [after](/workspace/qcc-liquid-glass/tetris/polish-audit/after-chromium-390x844-chips.png) and [before](/workspace/qcc-liquid-glass/tetris/polish-audit/before-chromium-390x844-start.png) / [after](/workspace/qcc-liquid-glass/tetris/polish-audit/after-chromium-390x844-start.png) |
| Board keyboard focus | The canvas referenced `--glass-ink` outside a glass surface, where that variable was undefined; the computed outline style was `none`. | **Fixed:** the existing `--c-100` token supplies a fallback and the ring stays inside the board. | [before](/workspace/qcc-liquid-glass/tetris/polish-audit/before-chromium-390x844-board-focus.png) / [after](/workspace/qcc-liquid-glass/tetris/polish-audit/after-chromium-390x844-board-focus.png) |
| Layout / shared dock ownership | Tetris still contained a local dock-order/margin override and layout tests assumed a bottom dock of exactly 56 px. | **Fixed:** removed the game-owned dock rule. The host owns placement, height and glass. Layout checks accept the host’s placement, reserve its actual height, and test taller docks while preserving state. The 390×844 board is 356×712 with the installed top dock (91.3% of viewport width). | [before](/workspace/qcc-liquid-glass/tetris/polish-audit/before-chromium-390x844-start-full.png) / [after](/workspace/qcc-liquid-glass/tetris/polish-audit/after-chromium-390x844-start-full.png) |
| Shared Tetris menu stats | Score/Best values use 16 px / 700; `Level 1` remains one 12 px / normal string. Text-bottom spread is 5 px in Chromium and about 4.8 px in WebKit. | **Shared owner — listed only.** No `.game-metrics` styling or host markup was changed in this polish pass. | [before](/workspace/qcc-liquid-glass/tetris/polish-audit/before-chromium-390x844-menu.png) / [after](/workspace/qcc-liquid-glass/tetris/polish-audit/after-chromium-390x844-menu.png) |
| Shared Tetris menu icons | Favourite and Leaderboards use identical star SVG markup. | **Shared owner — listed only.** The central run owns the distinct leaderboard icon. | [before](/workspace/qcc-liquid-glass/tetris/polish-audit/before-chromium-390x844-menu.png) / [after](/workspace/qcc-liquid-glass/tetris/polish-audit/after-chromium-390x844-menu.png) |
| Shared sheet material | The installed menu uses regular sheet optics (8 px blur, white 6% veil), while the existing game-over sheet inherits the legacy sheet optics (28 px blur, dark 62% fill and top sheen). Menu inset groups/selected rows introduce additional visible bands. | **Shared owner — listed only.** Tint/filter tokens, shared inset fills and sheet material were not changed locally. The upcoming `src/ui/game-sheet.ts` will replace the small local start/results markup. | [before](/workspace/qcc-liquid-glass/tetris/polish-audit/before-webkit-390x844-menu.png) / [after](/workspace/qcc-liquid-glass/tetris/polish-audit/after-webkit-390x844-menu.png) and [before](/workspace/qcc-liquid-glass/tetris/polish-audit/before-webkit-390x844-over.png) / [after](/workspace/qcc-liquid-glass/tetris/polish-audit/after-webkit-390x844-over.png) |
| Shared menu drag affordance | On phones a 36×4 px grab handle is visible, but a 140 px downward drag leaves the sheet open in both engines. It is absent on desktop. | **Shared owner — listed only.** No local drag handle or dismissal implementation was added. | [before](/workspace/qcc-liquid-glass/tetris/polish-audit/before-chromium-390x844-menu.png) / [after](/workspace/qcc-liquid-glass/tetris/polish-audit/after-chromium-390x844-menu.png) |

## Material inspection

The contact sheet was visually inspected at both required sizes in both engines. Each painted Back, HUD, Menu, Hold, Next, start and results surface was sampled at five body heights (15%, 32.5%, 50%, 67.5%, 85%). Interior sample columns avoid icons, text and rounded corners. The unpainted dock/chip layout wrappers are not treated as glass. A second menu column records the inset-group band separately.

Raw RGB arrays for all six configurations are in the external `material-samples.json`; raw geometry/styles are in `before-metrics.json` and `after-metrics.json`. Pixels can vary with backdrop content, focus and the installed rim; uniformity was assessed with the computed materials and the visible layer boundaries, not by demanding identical screenshot pixels.

Chromium 390×844 body samples, top to bottom:

| Surface | Five RGB samples |
| --- | --- |
| back | `29,29,30 · 25,25,26 · 25,25,26 · 25,25,26 · 29,29,30` |
| hud | `29,29,30 · 25,25,26 · 25,25,26 · 25,25,26 · 29,29,30` |
| pause | `28,28,29 · 25,25,26 · 25,25,26 · 25,25,26 · 28,28,29` |
| hold | `24,24,26 · 23,23,25 · 23,23,25 · 23,23,25 · 25,25,27` |
| next | `24,24,26 · 23,23,25 · 23,23,25 · 23,23,25 · 25,25,27` |
| start | `31,39,45 · 30,38,44 · 37,46,50 · 30,38,44 · 31,39,45` |
| over | `25,30,36 · 20,25,31 · 20,25,31 · 20,25,32 · 21,25,32` |
| menu | `35,35,36 · 35,35,36 · 35,35,36 · 35,35,36 · 35,35,36` |
| menu-groups | `35,36,36 · 53,54,54 · 42,43,43 · 42,43,43 · 42,43,43` |

## Standing step and artifacts

Before any push, read the checklist and run:

```sh
ARCADE_URL=http://127.0.0.1:4195 node tests/games/quadfall/polish-audit.mjs
python3 tests/games/quadfall/polish-contact-sheet.py
```

Use `--before` before changing a surface. The audit fails when a Tetris-owned check fails; shared findings remain visible in the report for their owners. Inspect the generated contact sheet and update this findings table before reporting or pushing.

External deliverables: `/workspace/qcc-liquid-glass/tetris/polish-audit/AUDIT.md`, `AUDIT_SHEET.jpg`, the before/after surface shots, and the raw measurement files. Only this Markdown, the audit source scripts and game/test changes are committed; no images, video or evidence JSON are committed. The shared `createGameDock` and all protected shared files remain unchanged by this polish pass.
