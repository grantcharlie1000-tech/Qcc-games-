# Mauri Study Notes branding — local checkpoint

Based on main `fbac0a58aa23b953ff9ed382d2cd4bd80c817008`, fetched and confirmed again on 20 October2026. The visible title, menu, game-library heading, Study wordmark, manifest names and original page-mark/favicon now identify Mauri Study Notes. Games remain clearly labelled. The description avoids a static game count.

This checkpoint uses the **current main article layout**, not the separate longer-article/photo branch. Its later reconciliation must preserve the brand in `src/study/view.ts` and `src/study/style.css`. Blocked author photos are not substituted by this decorative editorial mark. Routes, indexing, ads, game logic and update behavior are outside this change.

`compatibility-proof.json` records unchanged storage/session/offline/SW/package files. The manifest URL, start URL, scope, absent explicit id and icon URL remain unchanged. Only manifest names and description changed. The [W3C manifest id processing rule](https://www.w3.org/TR/appmanifest/#id-member) defaults an absent id to the start URL; browser-processed root and subpath manifests confirm the same effective identity. This is metadata compatibility evidence, **not an installed-PWA name/icon update test**.

## Verification

- New regression tests before branding: one unit failed with274 existing passes; all4 new browser cases failed. After branding:275 unit tests,4 focused Chromium browser tests (one worker), TypeScript and production build passed. Pack: `d59d585cb145`.
- Both original SVGs passed repository validation and XML parsing. Built root/subpath probes fetched and decoded the favicon and received error-free browser-processed manifests. The probe initially assumed32px intrinsic SVG dimensions; preserved failure output records that incorrect harness assumption. The corrected probe checks decoding and the actual square32-unit viewBox; source unchanged.
- Offline Fruit Merge and Animal Stack action/save/restart checks passed at `/` and `/Qcc-games-/` (4 gameplay cases), along with all20 chapters per scope. No page errors, failed assets, external requests or chapter-switch requests. Heavy chunks remain lazy.
- Screenshots cover picker/library/menu/Study at320,390 and1366px, plus built root/subpath at390px. They show the older main article design. No physical-device, public-host or WebKit claim is made.

The actual pre-brand persistent browser profile was captured before source edits: one real dropped fruit, UI favourite and accessibility settings, selected Forces topic, a cookie marker, and an explicitly seeded best-score sentinel2468. The first reopen test saw the old title and failed; `checks/legacy-profile-after.txt` is retained. The diagnostic then established an existing restored tab at the exact target hash URL, no controller, and a same-document `goto` returning null with no HTML response. One ordinary reload fetched HTTP200, `fromServiceWorker=false`, and the new title/menu. Stable gameplay fields, settings, favourite, best score, selected topic and cookie remained intact. Physics positions/timing can advance and are not asserted byte-identical. This demonstrates **explicit-reload brand/data compatibility only**, not automatic update reliability; PR4's separate native activation investigation remains unresolved.

## Commands and evidence

`npm test`; `npm run build`; repository SVG validation; `ARCADE_URL=http://127.0.0.1:4194 npx playwright test tests/e2e/branding.spec.ts --project=chromium --workers=1`; `ARCADE_GAMES=fruit-merge,animal-stack ARCADE_EVIDENCE_DIR=/workspace/scratch/qcc-mauri-branding/offline npm run verify:offline`.

Raw outputs are under `checks/`. Metadata, offline results, profile states and navigation boundary are adjacent JSON files. Large traces and the owned ephemeral browser profile remain outside Git under `/workspace/scratch/qcc-mauri-branding/`. Raw Playwright failure output is preserved verbatim, including any whitespace. No external publication occurred. Exact parent-coordinated review and any reconciliation with subsequently advanced main remain pending.
