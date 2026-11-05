# Social and Chat visual audit evidence

## No-deploy verification

The existing PR `Full browser suite` jobs in `.github/workflows/pages.yml` run Chromium and WebKit on GitHub-hosted runners, against the local Vite server. They do not require a preview or production deployment. This change does not edit workflows. The feature branch is outside the workflow’s push branches (`main` and `work`); opening the draft PR runs verification. Every production-publishing step additionally requires `main` and a non-PR event. Review the run for the exact candidate commit, not an older green run.

Selected successful UI states now write viewport PNGs using `tests/helpers/audit-evidence.ts` and attach them to their individual Playwright tests. These are review evidence, not baseline comparisons or proof of visual correctness. Captures happen after the relevant assertions; a later assertion can still fail. Performance captures occur after encode-count assertions, without disabling animations. The separate Globle static-surface captures disable animations only for their image and do not measure motion.

For a focused run in a browser-capable environment:

```sh
npm ci
npx playwright install --with-deps chromium webkit
npx playwright test tests/chat/audit.spec.ts tests/social/screenshot-fixes.spec.ts tests/social/profile-media.spec.ts tests/leaderboard/scrollbar.spec.ts tests/e2e/taskbar-autohide-performance.spec.ts tests/e2e/game-control-surfaces.spec.ts --project=chromium --project=webkit
npx playwright show-report
```

Leave `ARCADE_URL` unset so tests use the local server. Never point these evidence scenarios at a real signed-in account. Test accounts, posts, messages, scores and solid-color media are synthetic fixtures; captures do not occur while populated credential forms are visible. Do not upload user-supplied audit screenshots to the repository or CI artifacts.

For collection only (no browsers, no visual verification):

```sh
npx playwright test tests/chat/audit.spec.ts tests/social/screenshot-fixes.spec.ts tests/social/profile-media.spec.ts tests/leaderboard/scrollbar.spec.ts tests/e2e/taskbar-autohide-performance.spec.ts tests/e2e/game-control-surfaces.spec.ts --list
```

## Artifacts and coverage

Download `e2e-chromium-1`, `e2e-chromium-2`, `e2e-webkit-1` and `e2e-webkit-2` from the PR run. Each contains `playwright-report` and `test-results`. Open the HTML report and individual image attachments, or inspect `test-results/**/after-<scenario>-<width>x<height>.png`. Project/test/retry output directories keep captures separate. Failed-test screenshots and traces remain separate diagnostics; missing after-images mean the capture point was not reached, not that the UI passed.

- Chat portrait, 390×844: `chat-signup` (3), `chat-settings` (4), `chat-sent-wrapped-message` (9–10), `chat-request-accepted-badge-cleared` (11), `chat-message-actions` (14), `chat-destructive-info-actions` (13).
- Chat landscape, 844×390: `chat-info-scrolled` (5, 13), `apps-sheet-scrolled` (17–18), `chat-settings-scrolled` (19). These show the bottom of the actual scrollable sheet.
- Social portrait, 390×844: `social-mention-suggestions` and `social-mention-last-option` (20), `social-post-options` (21), `social-profile-onboarding` (26), `social-unavailable-post` (27).
- Social portrait/narrow/landscape, 390×844, 320×568 and 844×390: `social-feed-top` and `social-feed-bottom` (6, 8 and additional compose obstruction).
- Social desktop, 1440×900: `social-desktop-shortcuts` (23).
- Profile portrait, 390×844: `profile-avatar-removal-persisted` and `profile-banner-removal-persisted` after Save and reload, while replacement uploads are unavailable. Other cancellation/retry variants retain functional assertions without redundant screenshots.
- Leaderboard desktop, 1440×900 and 1160×520: `leaderboard-snake-keyboard-focus` and `leaderboard-minesweeper-keyboard-focus`, showing the scrollable list without a visible scrollbar and with keyboard focus. Wheel, keyboard and touch guard checks remain functional tests.
- Taskbar portrait/desktop, 390×844 and 1440×844: `taskbar-restored` after hide/restore and encode assertions (Chromium only). Landscape, 844×390: `taskbar-landscape-no-preference` and `taskbar-landscape-reduce`, with expanded touch targets and keyboard focus in both engines.
- Globle portrait/desktop, 390×844 and 1440×900: `globle-clear-control-edges-390` and `globle-clear-control-edges-1440` test attachments show the unboxed glass controls and retained country-input focus ring. Keyboard Menu activation, contrast and forced-colors remain functional assertions. These images use named Playwright attachments rather than the `after-*` helper filename.

No clean synthetic baseline pair has been established for these exact scenarios. Older committed social/chat evidence exists, but fixture, revision and viewport equivalence have not been verified; do not label those images comparable before/after pairs. User-supplied before images remain outside the repository and artifacts. A future baseline must use safe synthetic fixtures at the identified base revision with matching browser, viewport and scenario.

## Manual review gates and limits

1. Confirm the run's commit, browser and viewport; inspect both engines. Record missing images, failures and skips rather than interpreting them as passes.
2. Inspect wrapping, borders, destructive colors, glyphs, badge removal, modal dimming, focus outlines and content clearance at actual size. Check landscape footer actions are readable and reachable. Review each feed's top and bottom images together.
3. Read functional results alongside images. Still images cannot establish scrolling, keyboard isolation, persistence, clipboard success, animation smoothness, retention or encryption. Issue 22 (trusted moderator identity enforcement) is not validated by this evidence.
4. Test physical-device portrait/landscape rotation, software keyboard, safe-area/browser chrome, touch scrolling, contrast and motion before visual acceptance. Resized desktop browser viewports are not complete phone emulation; only the Chat suite explicitly enables mobile/touch emulation. PNGs and encode counts are not frame-time benchmarks.
5. Do not claim a browser or visual pass until the current run completes and the images are actually inspected. Adding these capture points alone generates no evidence. No merge, release or deployment is part of this plan.

## Publication guard

Keep the final pushed commit prefixed with `[CF-Pages-Skip]` and include `[skip netlify]` in that commit and the PR title. Cloudflare documents the prefix as skipping its Git-integrated deployment; Netlify documents the commit marker for a branch/multi-commit push and the PR-title marker for its Deploy Preview. Neither marker disables the main-branch Actions publisher, so this PR must not be merged or dispatched on main as part of verification. Do not change hosting settings or invoke a deploy/build hook.

Provider references: [Cloudflare GitHub integration](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/) and [Netlify skip a deploy](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/#skip-a-deploy). These are publication controls, not evidence that browser assertions or screenshots have passed.
