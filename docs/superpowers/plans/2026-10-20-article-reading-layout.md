# Article reading layout implementation plan

**Goal:** Twenty substantial original revision articles in a consistent dark reading layout, with genuine generated photographs, honest fictional contributors and disabled article-only ad reservations.
**Architecture:** Preserve StudyView and game/session lifecycle; move topic selection into top navigation, extend topic prose in a dedicated content module, replace diagram/portrait SVGs with supplied local raster assets. Add a small privacy controller that gates optional session-topic storage while essential game storage remains untouched.
**Stack:** Existing TypeScript/Vite, CSS, native dialog and Playwright/Vitest; no dependencies.
**Authority:** User approved local implementation; parent supplies photographs and exact review. No publication, live ads, accounts or PR4 changes.

- [x] Baseline units/build; RED content, sidebar/layout and optional-storage regressions.
- [x] Expand all20 topics to approximately900–1300 useful words with additional worked cases, misconceptions and practice; primary-source check nuanced Treaty/history/hauora claims.
- [x] One dark central article layout (~70ch), centered heading/byline/hero; compact top topic/Games/privacy navigation; remove sidebar/contents/save/session copy and all study SVG diagrams/portraits.
- [x] Wide bilateral vertically distributed disabled-ad rails, responsive in-flow slots. No ads in picker/game/menu and no providers or tracking.
- [x] Explicit accept/reject/customize controls; optional topic storage disabled until accepted, legacy topic unread while undecided/rejected, essential game keys untouched. Accessible dialog/focus/Escape/reopen; no privacy UI outside Study.
- [ ] Integrate parent-supplied photos at base-aware same-origin paths; minimal offline-manifest study-asset inclusion, all20 readable offline.
- [ ] Verify full units/TypeScript/build, Study/editorial lifecycle,20 switches,6 target viewports/zoom/reduced motion and retained actual game progress. Save real top/middle/bottom screenshots and qualified raw evidence.
- [ ] Freeze exact local checkpoint for parent-arranged Astra review; no push/merge/deploy.

Review focus: consent before optional read; storage failures preserve in-memory reading; modified Games clicks and manual-pause state; ad/photo sizing at320px and zoom; images and all chapters available offline; original mathematical/history explanations remain accurate.
