# Acceptance and evidence

1. Vitest pure rules: seeded generation, invariants, invalid moves, completion and restoration; numerical tolerances for physics. Each game must prove its specific master-prompt conditions.
2. Playwright interactions: genuine input modifies game state, restart resets, pause halts input/simulation, instructions visible, and save/restore persists. Test pointer as used by mouse/trackpad, keyboard where appropriate and touch/long press for touch games. Tests live under `tests/games/<id>/*.test.ts` and `*.spec.ts`.
3. Homepage screenshot at 390×844, 768×1024, 1366×768; manual comparison to all nine references. Each game's screenshot saved inside `tests/games/<id>/evidence/` to respect ownership. Parent captures final integrated evidence under `docs/evidence` in Chromium and WebKit when engines are available.
4. Lifecycle: repeated exit/re-entry, no errors, no duplicate callbacks, no stale input, physics engines and GPU resources disposed. Pause on hidden, restart while paused, malformed snapshots handled.
5. Accessibility: keyboard focus, semantic labels, status announcements, native dialogs, touch targets, no horizontal document overflow, reduced motion, redundant shapes/labels for colour-dependent puzzles.
6. Offline: production build at root and `/Qcc-games-/`; download pack while online, disable browser network, reload and interact with all twelve. Verify no external runtime calls and shell loads without Matter.js/Three.js.
7. Record test command/output and actual screenshots, not assumptions. Performance measured from RAF intervals on this environment with hardware limitations stated; no claim about physical Chromebook performance without that hardware.
8. Playwright browser downloads may be blocked by this environment's network policy. Use preinstalled Chromium; report a missing WebKit engine explicitly unless a supported installation succeeds. CI installs both engines with dependencies.
