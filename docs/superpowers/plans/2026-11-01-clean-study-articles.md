# Clean study articles implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Independent review uses superpowers:requesting-code-review.

**Goal:** Make all 80 cover readings and the topic picker clean, neutral study pages without fake ads, invented contributors or disclaimer clutter.

**Architecture:** Keep the existing article IDs, topic session, privacy and Escape lifecycle. Remove advertising renderers and assets, simplify the reading layouts to a bounded prose column, and add subject-specific section headings to the alternate readings. Retain only relevant local illustrations with descriptive captions and preserve their provenance outside the rendered page.

**Tech stack:** Existing TypeScript, CSS, Vitest and Playwright.

**Spec:** User brief in this session (Charlie’s preview 82 feedback and standing polish audit).

## Global constraints

- Work only in `/workspace/qcc-articles`, branch `ui/study-articles-clean`, base `8a68e52`.
- Use ports 4199/4200 only. Keep shared shell/glass, main, movies, verify scripts, game menu helpers, saves, scoring, online and deployment configuration untouched.
- Capture untouched before shots first; store all image evidence under `/workspace/qcc-liquid-glass/articles/` and never commit it.
- Preserve topic/session storage and Escape behaviour. Use neutral site labels without invented authors or publisher impersonation.
- Run check, unit tests, build and all study e2e on Chromium and WebKit. Audit every article and picker at 390×844 and 1366×768; check 320 reflow too.
- Commit small verified changes; restore generated tracked evidence before every commit. No push, merge or deploy.

## Review focus

- Alternate reading IDs must still restore and advance with the same topic; existing expansion e2e covers this.
- Optional reading storage failures must still preserve game saves; existing reading layout e2e covers this.
- Topics without appropriate images must render without a generic fallback; media and editorial tests cover this.
- Hidden answers and accessible image/control labels must also be free of fluff; clean-article regression covers this.
- Reduced motion, keyboard focus, narrow widths and long titles must remain usable; audit and layout tests cover this.

### Task 1: Remove fake advertising and invented editorial identity

**Files:** `src/study/{view,variant-view,editorial,media,topics,extensions,articles-*,article-depth-*}.ts`, `src/study/{style,variants}.css`, removed `fictional-ads.*`, removed public fake-ad/contributor assets, retained image provenance and media schema. Update `tests/core/study-fictional-ads.test.ts`, `tests/core/study-media.test.ts`, and study e2e advertising/editorial/layout expectations plus offline asset lists in `tests/e2e/study.spec.ts`.

- [x] Capture before screenshots on untouched code at both requested sizes, through ad positions.
- [x] Replace ad-presence tests with absence, neutral identity, genuine prose/section and local-figure assertions; run to observe failure.
- [x] Remove render paths/assets and stale captions/bylines; add coherent section headings, bounded layouts and accessible controls. Keep session/privacy logic unchanged.
- [x] Run focused study unit tests, check, and focused Chromium/WebKit regression; commit only verified source/test/assets changes.

### Task 2: Audit and final verification

**Files:** Study-only CSS/content/test fixes if required; evidence and audit documents outside the repo.

- [x] Audit every article and picker with the standing nine-item checklist on both browsers and sizes; measure geometry, targets, typography, surface samples and focus. Inspect contact sheets and fix findings.
- [x] Capture after screenshots at matching content anchors through former ad positions. Produce `ARTICLES_BEFORE_AFTER.jpg`, `polish-audit/AUDIT.md` and `polish-audit/AUDIT_SHEET.jpg`.
- [ ] Run `npm run check`, `npm test`, `npm run build`, and all study e2e in Chromium and WebKit; require exit 0.
- [x] Request an independent code review against the user scope; address material findings and verify the fixes.
- [ ] Restore generated tracked evidence, verify the scoped diff, and commit remaining verified changes. Report removals, test results and evidence paths.
