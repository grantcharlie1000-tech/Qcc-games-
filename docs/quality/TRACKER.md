# QCC quality tracker

Living record of the platform-wide quality programme. Update a row whenever its status changes.
Scores are out of 10. **Current** is the audited score before work; **Final** is filled only after the change is verified (tests + mobile/desktop check). Grade: A excellent · B targeted work · C underdeveloped · D broken/incomplete.
Crossy Road is excluded from this programme by owner instruction.

**Hosting:** production is **Cloudflare Pages** (`nceastudy`, https://nceastudy.pages.dev), published from `main` by `.github/workflows/pages.yml`. Its Pages Worker (`functions/`) serves Movies and proxies `/.netlify/functions/*` (a legacy path name only) to the API origin in `QCC_API_ORIGIN`. A change counts as deployed only when `https://nceastudy.pages.dev/deploy-info.json` reports its merge commit. Netlify is not used; `netlify.toml`, `netlify/` adapters and `docs/NETLIFY_DEPLOYMENT.md` are legacy.

Method (batch 1, 2026-11-05): static audit of every `src/` area by three parallel Haiku explorers, Opus spot-verification of their claims against the code, live screenshots of every route at 390×844 (touch) and 1366×768, a production API probe of the Cloudflare Pages site `nceastudy.pages.dev`, and reference research ([reference pack](REFERENCE_PACK.md)). Audit claims that did not survive verification are listed under *Rejected findings* so they are not re-raised.

Baseline at start: `tsc --noEmit` clean; 210 unit files / 4,299 tests passing.

## Platform and shell

| Feature | Location | Current | Grade | Reference | Problems | Improvements | Priority | Model | Status | Final |
|---|---|---|---|---|---|---|---|---|---|---|
| Account entry sheet (guest / log in / sign up) | `src/accounts/view.ts`, `src/ui/arcade-sheets.css` | 6 | C | Apple HIG *Managing accounts*; Discord sign-up | First screen every visitor sees. Fields used a 13 % black fill on a dark sheet and were nearly invisible; selected Log in / Sign up tab indistinguishable; neutral submit had no edge; empty status line left a gap and pushed the sheet past one phone screen | Hairline (`--sheet-line`) on fields, tab track, selected tab and submit; visible focus ring; selected tab bold/full ink, unselected muted; empty status collapses. Keeps guest-first single tint and shared field fill (both pinned by tests) | Critical | Opus | Tested | 8 |
| Game library grid | `src/main.ts:141-162`, `src/core/catalog.ts` | 8 | A | Apple Games app / Apple Arcade | Strong poster grid at all widths. No “continue playing” row; search only in Menu | Consider a recently-played row and an in-library search affordance (Batch 3) | Low | Opus | Not started | |
| Search & favourites filter | `src/main.ts:451-457` | 7 | B | Apple Games search tab | Discoverable only inside Menu | Surface search from the library (Batch 3) | Medium | Haiku | Not started | |
| Menu sheet & settings | `src/main.ts:458-505` | 7 | B | Apple HIG Sheets | Mixes account, prefs, search, nav; storage-full notice easy to miss | Group into sections; promote storage warning (Batch 2) | Medium | Opus | Not started | |
| Glass tab bar | `src/ui/tabbar.ts` | 8 | B | Apple HIG tab bars, iOS 26 Liquid Glass | Good; minimised capsule pointer-only (aria-hidden) by design | None now | Low | — | Not started | |
| Glass rendering layer | `src/ui/glass*.ts`, `webgl-glass.ts` | 6 | C | iOS 26 Liquid Glass | WebGL lens + pixel ink sampling per surface; cost on school laptops unprofiled; debug stats on `globalThis` | Profile on low-end CPU throttling; drop debug global (Batch 2) | High | Opus | Not started | |
| Game toolbar / pause / rules | `src/main.ts:289-404`, `src/ui/floating-controls.ts` | 7 | B | — | Milestone inferred by regex over status text (`main.ts:369`); `game-controls-adapter` “temporary bridge” in 6 games | Replace regex with explicit milestone signal (Batch 2) | Medium | Opus | Not started | |
| Study Mode topic picker & reader | `src/study/` | 7 | B | Apple News / Wikipedia mobile reader | Dead `sources` table (`view.ts:14-18`); un-removed storage listener (`privacy.ts:17`); fictional “Advertisement” slots undocumented next to “No ads” copy | Remove dead code; document or remove ad slots (owner decision) | Medium | Haiku | Not started | |
| Update prompt | `src/core/update.ts`, `src/study/view.ts:30-56` | 2 | D | — | Never wired: no production caller, `#reload-update` matches nothing | Remove dead path or wire to a version check (owner decision) | Medium | Opus | Not started | |
| Offline/service-worker recovery | `src/core/offline.ts`, `public/sw.js` | 7 | B | — | Feature retired but docs claimed offline download; page meta description still advertised it | Meta description corrected (batch 1); ARCHITECTURE.md offline section still stale | Medium | Haiku | In progress | |
| Apps launcher (Social/Chat entry) | `src/apps/launcher.ts` | 6 | C | — | Probe treats 401 as “backend ready”; production answers 401 to anonymous chat calls, so the tab shows whether or not the social/chat migration is applied. Migration state could not be verified without creating a production account | Probe a public, schema-touching endpoint instead (needs backend support) | High | Opus | Not started | |
| Accounts server rate limiting | `src/accounts/server.ts:84`, `functions/_middleware.ts:34-36`, API origin behind `QCC_API_ORIGIN` | 5 | C | — | Login/signup IP limiter reads only the Netlify-era `x-nf-client-connection-ip` header. On Cloudflare the Worker forwards the visitor IP as `X-QCC-Client-IP` (from `CF-Connecting-IP`) with `X-QCC-Proxy-Secret`, and no handler reads it, so visitors may share one bucket (100 logins / 15 min). `docs/BACKEND_HOSTING.md` specifies the fix for the API origin | Accept `X-QCC-Client-IP` only with a matching proxy secret (timing-safe) and a valid IP; apply in whichever codebase serves `QCC_API_ORIGIN` | Critical | Opus | Not started (cross-repo) | |
| Account sync / logout | `src/accounts/client.ts` | 6 | C | Apple HIG *Managing accounts* | No password change, username change or account deletion UI | Account settings page incl. deletion (Batch 3, security-sensitive) | High | Opus | Not started | |
| Leaderboard dialog | `src/leaderboard/view.ts` | 7 | B | Google Play Games leaderboards | Reached only via Menu; not offered at game over; `format.ts` pulls game modules into shell bundle | Offer leaderboard on game over; move formatters to shared (Batch 2) | Medium | Opus | Not started | |
| Leaderboard sidebar (desktop) | `src/leaderboard/sidebar.ts` | 7 | B | Google Play Games | Desktop ≥1160 px only by design | Keep | Low | — | Not started | |
| Social feed | `src/social/screens/feed.ts`, `src/social/client.ts` | 7 | B | X home timeline; Bluesky | Follow is optimistic but the feed fetch did not wait for it: Follow → Home quickly showed an empty Following feed for up to 60 s (also failing `main` CI in Chromium). Search is an unindexed ILIKE | Feed reads wait for in-flight follow/block writes (batch 1). Index search server-side (Batch 3) | High | Opus | Tested | 8 |
| Social composer | `src/social/components/composer.ts` | 7 | B | X composer | Photo-limit copy hard-coded “4” | Uses `POST_MAX_MEDIA` (batch 1) | Low | Haiku | Tested | 7 |
| Post card & menu | `src/social/components/post-card.ts` | 8 | B | X | “Copy link” threw synchronously where the Clipboard API is absent (insecure context / old browsers) | Guarded; falls back to showing the link (batch 1) | Low | Haiku | Tested | 8 |
| Social settings | `src/social/screens/settings.ts` | 7 | B | X settings | No-op `replace(/^Photos/,'Photos')` | Removed (batch 1) | Low | Haiku | Tested | 7 |
| Reports & auto-hide | `src/social/server.ts:264-268` | 6 | C | X / Bluesky moderation | Post auto-hides after 3 reporters; small groups can censor | Weight by account age / moderator review (owner decision) | Medium | Opus | Not started | |
| Chat list & thread | `src/chat/components/` | 7 | B | Snapchat Chat | GET marks messages viewed (read has write side effect); purge runs on every request | Move purge to scheduled function only; explicit mark-read POST (Batch 3) | Medium | Opus | Not started | |
| View-once snaps | `src/chat/components/snap-viewer.ts` | 8 | B | Snapchat / WhatsApp view-once | Server-enforced single open, good; no screenshot protection (web cannot provide it) | State limitation in-product | Low | Haiku | Not started | |
| Media pipeline | `src/media/` | 8 | B | — | Quota SUM over whole table per upload | Per-owner indexed quota (Batch 3) | Low | Opus | Not started | |
| Movies & TV browse / title / my list | `src/movies/` | 7 | B | Netflix, Apple TV app | 1,316-line view; duplicate escape helper; `/api/movies` has no rate limit; home fans out to 8 TMDB calls | Cache home rails server-side; rate limit (Batch 3) | Medium | Opus | Not started | |
| Movies watch page | `src/movies/provider.ts`, `playback.ts` | 6 | C | Netflix player | Single external provider; multi-provider scaffolding unused | Owner decision | Low | — | Not started | |
| Online multiplayer rooms | `src/multiplayer/` | 6 | C | — | Reassembled peer messages up to 24 M chars (memory pressure); dead `leaderboard:profile` fallback | Lower reassembly cap per game (Batch 2) | Medium | Opus | Not started | |
| Legacy Netlify deployment files | `netlify.toml`, `netlify/`, `docs/NETLIFY_DEPLOYMENT.md` | — | D | — | Production is Cloudflare Pages; the old Netlify site (`mauri-gazette.netlify.app`) returns 404. Netlify config and docs remain and can mislead | Owner decision: archive or delete. Keep any shared handler logic the API origin still imports | Low | Opus | Not started | |
| Docs / naming drift | `README.md`, `ARCHITECTURE.md`, `package.json` | 4 | D | — | Game counts 21 / 22 / 24 disagree; offline described as live; README and ARCHITECTURE still present Netlify as a deploy target | Correct counts, offline and hosting sections to Cloudflare Pages (Batch 2) | Low | Haiku | Not started | |

## Games

| Game | Location | Current | Grade | Reference | Problems (verified) | Improvements | Priority | Model | Status | Final |
|---|---|---|---|---|---|---|---|---|---|---|
| Block Blast | `src/games/color-blocks` | 8 | A | Block Blast! (Hungry Studio) | Full innerHTML redraw per pointermove | Patch only changed cells during drag | Low | Haiku | Not started | |
| Water Sort | `src/games/water-sort` | 8 | A | Water Sort Puzzle | — | Polish only | Low | — | Not started | |
| Suika Game | `src/games/fruit-merge` | 7 | B | Suika Game (Aladdin X) | Interactive canvas labelled `role="img"`; redraws every frame | Correct role; idle-frame skip | Low | Haiku | Not started | |
| Stack | `src/games/tower` | 7 | B | Stack (Ketchapp) | Fixed px overlay offsets; `serialize()` advances state | Scale overlays with board | Low | Haiku | Not started | |
| Flappy Bird | `src/games/flappy-bird` | 6 | B | Flappy Bird | Thinnest tests (7 unit / 3 e2e); test hooks written to DOM each draw | Add tests; gate hooks to dev | Medium | Haiku | Not started | |
| Ball Run | `src/games/ball-run` | 8 | A | Slope / Ball Run | Debug hitbox toggle via localStorage in prod | Gate to dev | Low | Haiku | Not started | |
| Animal Stack | `src/games/animal-stack` | 7 | B | Animal Tower Battle | Debug collider overlay reachable in prod (`?animal-colliders`, C key) | Gate to dev | Low | Haiku | Not started | |
| Snake | `src/games/snake` | 7 | B | Google Snake | — (loop is gated; see rejected) | Speed/map options per reference (Batch 3) | Low | Opus | Not started | |
| Slither.io | `src/games/neon-coil` | 8 | A | Slither.io | — | Polish only | Low | — | Not started | |
| Minesweeper | `src/games/minesweeper` | 7 | B | Google Minesweeper | Ticker interval runs while paused | Stop ticker on pause | Low | Haiku | Not started | |
| Solitaire | `src/games/solitaire` | 7 | B | Microsoft Solitaire Collection | Full re-render per change; drag ghost outside game root | Tap-to-auto-move check; contain ghost | Medium | Opus | Not started | |
| Block Fill | `src/games/block-fill` | 7 | B | One Line / Flow-style path puzzles | Level regenerated many times per input (cheap: <0.1 ms) | Optional memo | Low | Haiku | Not started | |
| Flow Free | `src/games/color-connect` | 8 | B | Flow Free (Big Duck) | Full SVG rebuild per move | Fine at current sizes | Low | — | Not started | |
| Pool | `src/games/pool` | 8 | B | 8 Ball Pool (Miniclip) | Reduced motion CSS-only | Gate ball-trail effects in JS | Low | Haiku | Not started | |
| Globle | `src/games/globle` | 7 | B | Globle (globle-game.com) | No own media queries; not a scored game | Check 320 px input bar | Low | Haiku | Not started | |
| Minecraft (Blockcraft) | `src/games/blockcraft` | 8 | B | Minecraft | 33 k LOC; some UI listeners without signal | Audit listener teardown | Medium | Opus | Not started | |
| Pac-Man | `src/games/maze-muncher` | 7 | B | Google Pac-Man doodle | Renders every frame | Idle-frame skip | Low | Haiku | Not started | |
| Corn Clicker | `src/games/corn-clicker` | 8 | B | Cookie Clicker | 1,036-line `ui.ts`; untracked timers | Track timers for dispose | Low | Opus | Not started | |
| Slipline | `src/games/slipline` | 7 | B | Arrows / “Unpuzzle” | Board regenerated (≈0.5 ms) several times per render and per input | Cached per level (batch 1) | Medium | Opus | Tested | 7 |
| Tetris | `src/games/quadfall` | 8 | B | Tetris Guideline | Very long single-line functions | Readability refactor only if touched | Low | — | Not started | |
| Wordle | `src/games/fivefold` | 8 | B | NYT Wordle | `role=dialog aria-modal` without focus trap; thin tests | Focus trap; hard mode check vs reference | Medium | Haiku | Not started | |
| Claimline | `src/games/claimline` | 8 | B | Paper.io 2 | Renderer exposes no dispose | Add dispose | Low | Haiku | Not started | |
| Quad Clash | `src/games/quad-clash` | 8 | B | Krunker.io | Heavy on phones; HUD overlaps title at 390 px | Check coarse-pointer quality default | Medium | Opus | Not started | |

## Rejected findings (verified false — do not re-raise)

- **Snake loop wastes frames while paused** — `advanceTo` returns early when paused, so `dirty` stays false and nothing renders; the idle rAF costs a branch.
- **`accounts:sync:undefined` key** — `stateKey()` is only used after a session check (`client.ts:47-56`).
- **Pac-Man wastes mobile space (scored 5)** — the classic portrait maze is width-limited at 390 px; it already fills the width.
- **Block Fill level generation is a performance problem** — 32 backbite passes over ≤64 cells; well under 0.1 ms.

## Batch log

| Batch | Branch | Contents | Verification | Deployed |
|---|---|---|---|---|
| 1 | `claude/quality-programme-batch1` | Discovery, scoring, reference pack, tracker; account sheet legibility; Slipline board cache; Social copy-link guard, composer limit constant, settings no-op; meta description | `tsc` clean; slipline + social unit (58) pass; Chromium e2e: slipline, glass-menus, accounts, closed-account-paint, social (64) pass; 390/1366 screenshots | Pending: PR #128 CI → merge → `deploy-info.json` shows merge commit |
