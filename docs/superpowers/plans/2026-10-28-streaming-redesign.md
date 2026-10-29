# Streaming-style Redesign and Reliable Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the arcade and Movies & TV one streaming-style visual system modelled on FrameXTV's layout, and make playback recover from failing servers.

**Architecture:**
- **Shared look:** a token and component stylesheet (`src/theme.css`, `ui-` classes) plus an icon module (`src/ui/icons.ts`). The arcade templates (`src/main.ts`, `src/library/home.ts`) and the Movies templates (`src/movies/view.ts`) both use them.
- **Reliability:** two pure, unit-tested modules, wired into the existing `MoviesView`:
  - `src/movies/query.ts`: cached, retrying metadata requests.
  - `src/movies/playback.ts`: per-attempt watchdogs and server failover.
- **API:** the Netlify function gains aggregated rails, genre discovery, credits, recommendations and episode stills.

**Tech Stack:** Vite 7, strict TypeScript, plain CSS, Vitest (node environment, no DOM), Playwright (Chromium), Netlify Functions.

**Spec:** `docs/superpowers/specs/2026-10-28-streaming-redesign-design.md`. Read it first. Section numbers below (§) refer to it.

## Global Constraints

- **Original work only.** Never copy FrameXTV code, CSS, icons, logo, wordmark, artwork or wording. Use the measured values in §3–§5 and the copy fixed in the spec and this plan.
- **Brand:** `.site-brand` text stays exactly `Mauri Study Notes`, with the `.mauri-mark` SVG. Legal and privacy sentences that name "QCC" keep their wording.
- **Iframe:**
  - `sandbox="allow-scripts allow-same-origin"` and `referrerpolicy="no-referrer"`.
  - Accept a provider message only when `event.source===frame.contentWindow` and the origin is approved.
  - Post commands only to the exact provider origin.
  - No stream extraction or proxying. No calls to FrameXTV's own API.
- **Code:**
  - No new dependencies, frameworks or Tailwind.
  - Match the surrounding code style: compact TypeScript, template strings, terse names, few comments.
  - Escape every interpolated string with the existing `escape()` helper.
- **Study disguise:** `document.title` never changes, and Escape always opens Study.
- **Unchanged areas:**
  - CSP strings in `netlify.toml`, `public/_headers` and `vite.config.ts`.
  - Movies storage only under `qcc:movies:v1`; arcade storage keys unchanged.
  - `src/game-viewport.css` sizes, positions and flex bases. Never restyle game internals inside `#game-stage`.
- **Breakpoints and motion:**
  - Breakpoints are min-width 640, 768, 1024 and 1280 px.
  - Hover effects only inside `@media (hover:hover) and (pointer:fine)`.
  - Every animation and transition stops under `@media (prefers-reduced-motion: reduce)` and under the `.reduce-motion` class on `<html>`.
- **Pinned names:** keep every pinned name and class listed in §6–§7 unless a task updates the test that pins it.
- **Commands:**
  - Unit tests: `npx vitest run <files>`.
  - Types: `npm run check`.
  - Browser tests: `/tmp/claude-0/-home-user-Qcc-games-/e9699d01-8b7d-50fc-9226-7361f84e26ee/scratchpad/e2e.sh <spec files> [-g "<title regex>"]`. It uses the installed Chromium and restores `docs/evidence` afterwards. Give it a long Bash timeout (up to 600000 ms).
  - It needs the Vite dev server on `127.0.0.1:5180`. If `curl -sf http://127.0.0.1:5180/` fails, start `/tmp/claude-0/-home-user-Qcc-games-/e9699d01-8b7d-50fc-9226-7361f84e26ee/scratchpad/dev-server.sh` with the Bash tool's `run_in_background: true` and wait until curl succeeds. Never start the server inside a foreground command.
- **Commits:**
  - Never commit `docs/evidence` changes before Task 18.
  - Every commit message ends with these two lines:
    `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
    `Claude-Session: https://claude.ai/code/session_015jvJA57sZPtGC8DR3KTSrS`

## Review Focus

1. **Blocked or full `localStorage`** while saving a list item, snapshot or remembered server. Movies keeps working in memory and reports storage as unavailable (Task 5).
2. **Leaving a title, switching episode or opening Study while a server is still connecting.** No stray failover, and no watchdog fires on the next page (Tasks 3, 16).
3. **Spoofed or malformed provider messages** (wrong origin, sent from the page itself, non-numeric times). They are ignored and never count as a working server (Tasks 4, 16).
4. **320 px phones** with long titles, long season names and five tab items. No horizontal scroll and no clipped controls (Tasks 8, 9, 11, 14, 15).
5. **An aggregated rails response with invalid rails or titles mixed in.** The bad parts are dropped and the good rails still show (Tasks 6, 12).

---

### Task 1: Tokens, shared components and icons

**Files:**
- Create: `src/theme.css`, `src/ui/icons.ts`
- Modify: `src/main.ts:1` (first line becomes `import './theme.css';`), `src/style.css` (`:root` rule)
- Test: `tests/core/theme.test.ts`

**Interfaces:**
- Produces:
  - `type UiIcon='grid'|'film'|'tv'|'bookmark'|'star'|'search'|'menu'|'study'|'play'|'info'|'plus'|'check'|'chevron-left'|'chevron-right'|'back'|'close'|'image'|'alert'|'list'`.
  - `uiIcon(name:UiIcon):string` returns `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">…</svg>`. `play` is drawn filled.
  - CSS classes, built to §5:
    - Layout: `.ui-container`.
    - Header: `.ui-header`, `.ui-header-inner`, `.ui-brand`, `.ui-brand-tile`, `.ui-wordmark` (second word in a `span`, `--c-400`), `.ui-nav`, `.ui-pill`, `.ui-pill-count`, `.ui-header-actions`, `.ui-icon-btn`, `.ui-label`, `.ui-kbd`.
    - Tab bar: `.ui-tabbar`, `.ui-tab`.
    - Buttons and chips: `.ui-btn` with `.primary`, `.secondary` and `.small`; `.ui-chip` with `.rating` and `.saved`.
    - Rails: `.ui-rail`, `.ui-rail-head`, `.ui-count`, `.ui-rail-sub`, `.ui-rail-body`, `.ui-rail-row`, `.ui-rail-arrow` with `.prev` and `.next`.
    - Cards and grid: `.ui-card`, `.ui-card-poster`, `.ui-card-img`, `.ui-card-placeholder`, `.ui-card-chips`, `.ui-card-play`, `.ui-card-caption`, `.ui-card-title`, `.ui-card-meta`, `.ui-grid`.
    - Hero: `.ui-hero`, `.ui-hero-backdrop`, `.ui-hero-shade`, `.ui-hero-content`, `.ui-hero-badges`, `.ui-hero-title`, `.ui-hero-meta`, `.ui-hero-overview`, `.ui-hero-actions`, `.ui-hero-poster`.
    - Footer: `.ui-footer`, `.ui-footer-brand`, `.ui-footer-links`.
    - Panels and states: `.ui-skeleton`, `.ui-panel`, `.ui-sheet`, `.ui-drawer`, `.ui-drawer-handle`, `.ui-empty`, `.ui-status`, `.ui-switch`.
  - State contracts:
    - `[aria-current="page"]` and `[aria-pressed="true"]` mark the current `.ui-pill` or `.ui-tab`.
    - `.ui-rail[data-can-prev="false"] .ui-rail-arrow.prev` and `.ui-rail[data-can-next="false"] .ui-rail-arrow.next` are hidden.
    - `.ui-label` is visible from 768 px and visually hidden (not `display:none`) below that.
    - `.ui-card-placeholder` sits behind `.ui-card-img`, so a failed or hidden image reveals it. No JavaScript is needed for image states, which simplifies the fade-in in §5.

- [ ] **Step 1: Write the failing test** `tests/core/theme.test.ts`

```ts
import {readFileSync} from 'node:fs';import {expect,test} from 'vitest';import {uiIcon} from '../../src/ui/icons';
const css=readFileSync('src/theme.css','utf8');
test('defines the spec tokens',()=>{for(const [name,value] of [['--c-bg','#000'],['--c-950','#09090b'],['--c-900','#18181b'],['--c-800','#27272a'],['--c-400','#9f9fa9'],['--c-300','#d4d4d8'],['--c-rose','#ff2056'],['--c-amber','#ffb900'],['--r-lg','8px'],['--r-xl','12px'],['--header-h','56px'],['--tabbar-h','57px'],['--page-max','1280px']])expect(css).toMatch(new RegExp(`${name}:\\s*${value}[;}]`));});
test('focus stays visible and motion can be reduced',()=>{expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid #fff/);expect(css).toContain('prefers-reduced-motion: reduce');expect(css).toContain('.reduce-motion');expect(css).toContain('(hover:hover) and (pointer:fine)');});
test('icons are decorative 24px drawings',()=>{for(const name of ['grid','film','tv','bookmark','star','search','menu','study','play','chevron-left','chevron-right','back','close','image'] as const){const svg=uiIcon(name);expect(svg).toContain('viewBox="0 0 24 24"');expect(svg).toContain('aria-hidden="true"');expect(svg).not.toContain('undefined');}});
```

- [ ] **Step 2: Run** `npx vitest run tests/core/theme.test.ts`. Expected: FAIL (cannot resolve `src/ui/icons`).
- [ ] **Step 3: Implement.**
  - Read `.agents/skills/svg-skill/SKILL.md` first and draw original icons.
  - Write `src/theme.css`:
    - Tokens on `:root` (§4).
    - `@media(min-width:640px){:root{--gutter:24px}}`.
    - `body{margin:0;background:var(--c-bg);color:var(--c-100);font-family:var(--font-sans)}`.
    - Every class above, with §5 values.
    - `@keyframes ui-pulse`.
    - `:focus-visible{outline:2px solid #fff;outline-offset:2px}`.
    - One reduced-motion block for the media query and `.reduce-motion`: `animation:none`, `transition:none`, `scroll-behavior:auto` and no hover transforms.
  - In `src/style.css`, delete `font-family:Arcade,…` from the `:root` rule (keep the `@font-face`). Add `#game-stage{font-family:Arcade,'Arial Rounded MT Bold','Trebuchet MS',Arial,sans-serif}`.
- [ ] **Step 4: Run** `npx vitest run tests/core/theme.test.ts` and `npm run check`. Expected: PASS, no type errors.
- [ ] **Step 5: Run** `e2e.sh tests/e2e/shell.spec.ts tests/e2e/branding.spec.ts`. Expected: all pass (the font changes, the layout does not).
- [ ] **Step 6: Commit:** `git add src/theme.css src/ui/icons.ts src/main.ts src/style.css tests/core/theme.test.ts`, then `git commit` with the message "Add shared streaming-style tokens, components and icons" and the trailer lines.

---

### Task 2: Cached, retrying metadata requests

**Files:**
- Create: `src/movies/query.ts`
- Test: `tests/movies/query.test.ts`

**Interfaces:**
- Consumes: `movieJson(url:string,signal:AbortSignal,timeout?:number):Promise<any>` and `MovieNetworkError {kind:'network'|'timeout'|'service'|'invalid';status?:number}` from `src/movies/network.ts`.
- Produces:

```ts
export const SEARCH_STALE=300_000, DEFAULT_STALE=900_000, RETRY_DELAYS=[500,1500], CACHE_LIMIT=100;
export interface QueryOptions{staleTime?:number;timeout?:number}
export interface QueryResult<T=any>{data:T;stale:boolean}
export function cachedJson<T=any>(url:string,signal:AbortSignal,options?:QueryOptions):Promise<QueryResult<T>>
export function clearQueryCache():void
```

Rules:
- An entry younger than `staleTime` (default `DEFAULT_STALE`) returns without a request.
- Otherwise request with `movieJson`. Retry only kind `network`, or kind `service` with status 429, 502 or 504, waiting `RETRY_DELAYS[i]` with an abort-aware delay.
- On success, store `{data,time:Date.now()}`, re-inserting to keep LRU order, and drop the oldest entries past `CACHE_LIMIT`.
- After the final failure, return `{data:cached,stale:true}` when an entry exists; otherwise rethrow.
- An abort always rejects and never returns stale data.

- [ ] **Step 1: Write failing tests.** Use `vi.useFakeTimers()`, `vi.stubGlobal('fetch',vi.fn(...))` returning `new Response(JSON.stringify(...),{status})`, and call `clearQueryCache()` in `beforeEach`.
  - `serves a fresh copy without a second request`: two calls, one fetch, both `stale:false`.
  - `refetches once the stale time has passed`: advance 900_001 ms, then 2 fetches.
  - `retries 502 after 500 ms and 1500 ms, then succeeds`: responses 502, 502, 200. Resolves after `advanceTimersByTimeAsync(2000)`, with 3 fetch calls.
  - `does not retry 503, 404 or a timeout`: one fetch call each. For the timeout, fetch never settles, then advance 20_000.
  - `returns the cached copy marked stale when every attempt fails`.
  - `an abort during the backoff rejects and stops retrying`: one 502, abort at 200 ms, rejects with `name==='AbortError'`, 1 fetch call.
  - `keeps at most 100 URLs`: after 101 distinct URLs, the first refetches.
- [ ] **Step 2: Run** `npx vitest run tests/movies/query.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `src/movies/query.ts` per the rules.
- [ ] **Step 4: Run** the tests and `npm run check`. Expected: PASS.
- [ ] **Step 5: Commit** "Cache and retry movie metadata requests".

---

### Task 3: Playback supervisor

**Files:**
- Create: `src/movies/playback.ts`
- Modify: `src/movies/provider.ts:8-13`. `STREAM_PROVIDERS` entries gain `signals`: framextv `'ready'`, vidlink `'playback'`, vixsrc `'playback'`, vidsrc `'none'`.
- Test: `tests/movies/playback.test.ts`

**Interfaces:**
- Consumes: `StreamProviderId`, `STREAM_PROVIDERS`, `streamProvider()`.
- Produces:

```ts
export const LOAD_TIMEOUT=15000, READY_TIMEOUT=12000, SLOW_PROMPT=12000, MAX_ATTEMPTS=4, ATTEMPT_BUDGET=45000, FAILURE_TTL=300000;
export type AttemptState='idle'|'connecting'|'loaded'|'ready'|'playing'|'failed';
export type FailReason='blocked'|'no-load'|'no-ready';
export interface Clock{set(fn:()=>void,ms:number):number;clear(id:number):void;now():number}
export interface SupervisorEvents{status(state:AttemptState,provider:StreamProviderId):void;switchTo(next:StreamProviderId,failed:StreamProviderId,reason:FailReason):void;slow(provider:StreamProviderId):void;exhausted(failed:StreamProviderId):void;working(provider:StreamProviderId):void}
export function providerOrder(remembered?:StreamProviderId):StreamProviderId[]
export function recordFailure(key:string,provider:StreamProviderId,now?:number):void
export function failedProviders(key:string,now?:number):Set<StreamProviderId>
export function clearFailures(key:string):void
export class PlaybackSupervisor{
 constructor(key:string,order:StreamProviderId[],events:SupervisorEvents,clock?:Clock)
 state:AttemptState; provider?:StreamProviderId; manual:boolean;
 start(provider:StreamProviderId,manual:boolean):void
 loaded():void
 message(kind:'ready'|'progress'):void
 violation():void
 stop():void
 nextProvider():StreamProviderId|undefined
}
```

Behaviour:
- `start`: clears timers; records the first start time (for the budget); marks the provider tried; sets state `connecting`; arms `LOAD_TIMEOUT`, which fails with `no-load`.
- `loaded` (only while `connecting`): sets state `loaded`. A provider with `signals==='ready'` arms `READY_TIMEOUT`, which fails with `no-ready`. Others arm `SLOW_PROMPT`, which calls `slow(provider)` and does not fail.
- `message('ready')`: state `ready`, timers cleared.
- `message('progress')`: state `playing`, timers cleared, `working(provider)` once per attempt.
- `violation`: while `connecting` or `loaded`, fails with `blocked`.
- Failing: clears timers, sets state `failed`, calls `recordFailure`, emits `status('failed',…)`. Then:
  - When `manual`, stop there.
  - When attempts ≥ `MAX_ATTEMPTS`, the elapsed time ≥ `ATTEMPT_BUDGET`, or there is no `nextProvider()`, emit `exhausted`.
  - Otherwise emit `switchTo(next,…)`. The caller then calls `start(next,false)`.
- `nextProvider`: the first entry of `order` not tried this session and not in `failedProviders(key)`.
- `stop`: clears timers and ignores every call except `start` afterwards.
- `providerOrder`: the remembered server first, then the `STREAM_PROVIDERS` order without duplicates.
- Failure memory: a module-level `Map`; entries older than `FAILURE_TTL` are ignored.
- Every state change emits `status`.

- [ ] **Step 1: Write failing tests.** Use a fake `Clock` (pending timers plus `advance(ms)`):
  - `fails over when the frame never loads within 15 seconds`: `switchTo('vidlink','framextv','no-load')`.
  - `fails over when FrameXTV loads but sends no ready message within 12 seconds`.
  - `prompts instead of failing over for servers that only report playback`: vidlink loaded and 12 s pass, so `slow` fires and `switchTo` does not.
  - `a frame-src violation fails the attempt at once`.
  - `skips servers that failed for the same title in the last five minutes, but not after`.
  - `stops after four servers or 45 seconds and reports exhaustion`.
  - `a manual pick that fails reports the failure without switching`.
  - `reports the working server once, on the first progress message`.
  - `stop cancels pending watchdogs and ignores late signals`.
  - `providerOrder puts the remembered server first`.
- [ ] **Step 2: Run** `npx vitest run tests/movies/playback.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the supervisor and the `signals` field.
- [ ] **Step 4: Run** the tests, then `npx vitest run tests/movies`, then `npm run check`. Expected: PASS.
- [ ] **Step 5: Commit** "Add a playback supervisor with server failover".

---

### Task 4: Provider parameters and signals

**Files:**
- Modify: `src/movies/provider.ts`
- Modify: `src/movies/view.ts`: delete the `frameSeek` field and its uses in `bindPlayer`, `providerMessage`, `episodeEnded` and `stopVideo`. `providerMessage` switches to `providerSignal`.
- Test: `tests/movies/provider.test.ts`, `tests/movies/movies.spec.ts` (the sandbox test at lines 155-161 and the external-progress test at lines 212-221)

**Interfaces:**
- Produces:

```ts
export const START_THRESHOLD=15;
// STREAM_PROVIDERS[i].resume becomes 'start'|'none' (vidsrc 'none')
export function frameSource(title:Title,route:MovieRoute,providerId?:StreamProviderId,startAt?:number):string|undefined
export type ProviderSignal={kind:'ready'}|{kind:'ended'}|{kind:'progress';currentTime:number;duration?:number;ended:boolean};
export function providerSignal(providerId:StreamProviderId,origin:string,message:unknown):ProviderSignal|undefined
export const FRAME_ALLOW="fullscreen; picture-in-picture; autoplay; encrypted-media; camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; usb 'none'; serial 'none'; payment 'none'";
```

- **`frameSource`:**
  - framextv: `${FRAME_ORIGIN}/embed/{id}[/{s}/{e}]?autoplay=1&muted=0`, plus `&t={Math.floor(startAt)}` when `START_THRESHOLD ≤ startAt ≤ 30*86400`.
  - vidlink and vixsrc: `autoplay=true`, plus `startAt` under the same rule. vidlink also adds `nextbutton=false`.
  - vidsrc: unchanged.
- **`providerSignal`:**
  - framextv, from `FRAME_MESSAGE_ORIGINS` only: `{event:'frameXTV:ready'}` gives `ready`; `{event:'frameXTV:ended'}` gives `ended`; `frameXTV:timeupdate` gives `progress` (validated as today).
  - vidlink and vixsrc: `PLAYER_EVENT` as today, giving `progress`.
  - vidsrc: always `undefined`.
- **`providerProgress`:** keeps its signature and returns the `progress` case only.
- **View:** `ended` triggers `episodeEnded()`. `ready` does nothing yet (Task 16 wires it).

- [ ] **Step 1: Update tests first.**
  - `provider.test.ts` exact URLs:
    - `https://framextv.cc/embed/157336?autoplay=1&muted=0`.
    - `https://framextv.cc/embed/19885/2/3?autoplay=1&muted=0`.
    - `startAt` 42 gives `…muted=0&t=42`. `startAt` 10 gives no `t`.
    - VidLink with 42 contains `autoplay=true`, `startAt=42` and `nextbutton=false`.
  - `FRAME_ALLOW` contains `autoplay` and `encrypted-media`, and still every `'none'` denial.
  - `providerSignal`:
    - `ready` is accepted from both FrameXTV origins and rejected from `https://example.org`.
    - `ended` is accepted.
    - NaN and negative times are rejected.
    - vidsrc is rejected.
  - `movies.spec.ts`:
    - The sandbox test expects `src` to contain `/embed/157336?autoplay=1`.
    - The external-progress test replaces its `body[data-seek="42"]` assertion with `expect(await page.locator('.movies-provider-frame').getAttribute('src')).toContain('t=42')` after "Resume stream".
- [ ] **Step 2: Run** `npx vitest run tests/movies/provider.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the provider changes and the view clean-up.
- [ ] **Step 4: Run** `npx vitest run tests/movies`, `npm run check`, and `e2e.sh tests/movies/movies.spec.ts tests/movies/auto-next.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** "Autoplay providers and resume through start-time parameters".

---

### Task 5: Movie storage snapshots, history and remembered server

**Files:**
- Modify: `src/movies/storage.ts`
- Test: `tests/movies/storage.test.ts`

**Interfaces:**
- Consumes: `imageAsset`, `Title` (model) and `STREAM_PROVIDERS`, `StreamProviderId` (provider).
- Produces:

```ts
export interface TitleSnapshot{id:string;kind:'movie'|'tv';name:string;year:number;poster:string;backdrop?:string}
export interface MediaMeta{duration?:number;updated:number}
export interface MoviePreferences{list:string[];progress:Record<string,number>;titles:Record<string,TitleSnapshot>;meta:Record<string,MediaMeta>;provider?:StreamProviderId}
export interface ContinueItem{key:string;id:string;season?:number;episode?:number;time:number;duration?:number;updated:number}
export const snapshotOf:(title:Title)=>TitleSnapshot;
// MovieStorage
toggle(id:string,snapshot?:TitleSnapshot):void
progress(key:string,time:number,duration?:number,snapshot?:TitleSnapshot):void   // also writes meta[key]={duration,updated:Date.now()}
setProvider(id:StreamProviderId):void
snapshot(id:string):TitleSnapshot|undefined
continueItems():ContinueItem[]    // time>0, newest updated first; parses `tv-N:sS:eE`
clear():void                      // also clears titles, meta and provider
```

Rules:
- A snapshot is kept only while its id is in `list` or has a progress key. At most 200 snapshots.
- Invalid snapshots, meta entries and provider ids are dropped on load.
- Only `qcc:movies:v1` is ever written.

- [ ] **Step 1: Write failing tests.**
  - `keeps a snapshot for a listed remote title across reloads`.
  - `drops invalid snapshots, meta and unknown servers when loading`.
  - `orders continue items newest first and reads episode keys`.
  - `clear removes list, progress, snapshots, meta and server`.
  - `blocked storage keeps snapshots and the server in memory and reports durable=false`.
- [ ] **Step 2: Run** `npx vitest run tests/movies/storage.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run tests/movies` and `npm run check`. Expected: PASS.
- [ ] **Step 5: Commit** "Keep title snapshots, viewing history and the working server".

---

### Task 6: Routes, richer titles and rails parsing

**Files:**
- Modify: `src/movies/model.ts`
- Test: `tests/movies/model.test.ts`

**Interfaces:**
- Produces:

```ts
export interface Episode{number:number;name:string;overview:string;runtime?:number;still?:string;airDate?:string;rating?:number}
export interface CastMember{name:string;character:string;photo?:string}
// Title gains: cast?:CastMember[]; related?:Title[]
// MovieRoute gains: kind?:'movie'|'tv'|'list'
export type MovieKind='all'|'movie'|'tv'|'list';
export const kindHash:(kind:MovieKind)=>string;   // all '#/movies', list '#/movies/list', movie/tv '#/movies/browse/{kind}'
export interface Rail{id:string;title:string;titles:Title[]}
export function parseTitle(value:unknown,nested?:boolean):Title|undefined   // extracted from parseCatalog's loop; nested=true skips cast and related
export function parseRails(value:unknown):Rail[]
export function previousEpisode(title:Title,season:number,episode:number):{season:number;episode:number;name?:string}|undefined
```

Rules:
- `parseMovieRoute`:
  - `#/movies/browse/movie` gives `{play:false,kind:'movie'}`.
  - `#/movies/browse/tv` gives `{play:false,kind:'tv'}`.
  - `#/movies/list` gives `{play:false,kind:'list'}`.
  - `#/movies` still gives exactly `{play:false}`.
- `imageAsset` also accepts `w300`.
- Episode fields:
  - `still` must pass `imageAsset`.
  - `airDate` must match `/^\d{4}-\d{2}-\d{2}$/`.
  - `rating` must be within 0–10.
- `cast`: at most 12 entries. Name 1–120 chars, character 0–120 chars, `photo` must pass `imageAsset`.
- `related`: at most 12 titles, parsed with `nested=true`.
- `parseRails`:
  - At most 12 rails.
  - Rail id must match `/^[a-z0-9-]{1,40}$/`; title 1–80 chars.
  - Titles parsed with `parseTitle`, de-duplicated, at most 40 per rail.
  - Rails with no valid title are dropped.
- `previousEpisode` mirrors `nextEpisode`: the previous episode in the season, else the last episode of the previous numbered season.

- [ ] **Step 1: Write failing tests.**
  - The three new routes, plus `#/movies` still `toEqual({play:false})`.
  - `kindHash` for all four kinds.
  - `w300` accepted and `w342` rejected.
  - Cast, related and still parsing, with invalid entries dropped.
  - `parseRails` drops a rail with a bad id, a rail with only invalid titles, and invalid titles inside a good rail.
  - `previousEpisode` across a season boundary, and `undefined` at S1E1.
- [ ] **Step 2: Run** `npx vitest run tests/movies/model.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `parseCatalog` must keep its current results for current inputs.
- [ ] **Step 4: Run** `npx vitest run tests/movies` and `npm run check`. Expected: PASS.
- [ ] **Step 5: Commit** "Add section routes, cast, related titles, stills and rails parsing".

---

### Task 7: API rails, genre discovery, credits, stills and CDN caching

**Files:**
- Modify: `netlify/functions/movies-search.mts`
- Test: `tests/movies/catalog-api.test.ts`

**Interfaces:**
- Produces (`GET /api/movies`):
  - **`?rails=home|movie|tv`:** `200 {rails:[{id,title,titles}]}`. Other values give `400 {error:'invalid_rails'}`. The response is `502 {error:'metadata_unavailable'}` only when every rail fails.
  - **`?type=movie|tv&genre={name}&page={1-500}`:** `{titles,page,totalPages,totalResults}` from `/discover/{type}?with_genres={id}&sort_by=popularity.desc&include_adult=false&language=en-US&page={n}`. A name not in the function's genre table gives `400 {error:'invalid_genre'}`.
  - **`?id=`:** adds `append_to_response=credits,recommendations`. The title gains:
    - `cast`: at most 12 `{name,character,photo?}`, with `photo` built as `https://image.tmdb.org/t/p/w185{path}`.
    - `related`: at most 12 mapped titles, with kind forced to the parent's kind.
  - **Season episodes** gain `still` (`https://image.tmdb.org/t/p/w300{path}`), `airDate` (`air_date` when `YYYY-MM-DD`) and `rating` (`vote_average` when `vote_count>0`).
  - **Caching:** every 200 response except search (`q` present) adds `netlify-cdn-cache-control: public, durable, s-maxage=900, stale-while-revalidate=3600`. `cache-control: no-store` stays on every response.
- Rail table (`id` "Title" ← TMDB source):
  - **home:**
    - `trending` "Trending now" ← `/trending/all/week`
    - `popular-movies` "Popular movies" ← `/movie/popular`
    - `popular-tv` "Popular TV" ← `/tv/popular`
    - `top-movies` "Top rated movies" ← `/movie/top_rated`
    - `action` "Action" ← discover movie 28
    - `comedy` "Comedy" ← discover movie 35
    - `scifi` "Science fiction" ← discover movie 878
    - `thriller` "Thrillers" ← discover movie 53
  - **movie:**
    - `trending` "Trending movies" ← `/trending/movie/week`
    - `popular` "Popular" ← `/movie/popular`
    - `now-playing` "In cinemas" ← `/movie/now_playing`
    - `top` "Top rated" ← `/movie/top_rated`
    - discover movie: `action` 28 "Action", `comedy` 35 "Comedy", `drama` 18 "Drama", `horror` 27 "Horror", `scifi` 878 "Science fiction"
  - **tv:**
    - `trending` "Trending TV" ← `/trending/tv/week`
    - `popular` "Popular" ← `/tv/popular`
    - `on-air` "On the air" ← `/tv/on_the_air`
    - `top` "Top rated" ← `/tv/top_rated`
    - discover tv: `drama` 18 "Drama", `comedy` 35 "Comedy", `crime` 80 "Crime", `scifi` 10765 "Sci-Fi & Fantasy", `mystery` 9648 "Mystery"
  - Every rail request adds `language=en-US&page=1`.
  - Discover requests add `sort_by=popularity.desc&include_adult=false`.
  - Rails run through `Promise.allSettled`, each with the existing 8 s timeout, and keep at most 20 titles. Non-trending lists map with a forced kind.
  - The `artwork()` helper accepts the sizes `w185` and `w300` as well.

- [ ] **Step 1: Write failing tests** (same `handleMoviesCatalog(request,token,fetcher)` style as the file).
  - `rails fan out and omit a failing rail`: one path returns 500, so 7 home rails.
  - `rails fail with 502 only when every rail fails`.
  - `rejects unknown rails and genres with 400`.
  - `genre discovery maps the name to the TMDB id`: the URL contains `/discover/tv?with_genres=10765`.
  - `details carry cast and related titles`: the URL contains `append_to_response=credits,recommendations`.
  - `season episodes carry w300 stills, air dates and ratings`.
  - `CDN caching applies to rails and details but not search`, with `cache-control` still `no-store`.
- [ ] **Step 2: Run** `npx vitest run tests/movies/catalog-api.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run tests/movies` and `npm run check`. Expected: PASS.
- [ ] **Step 5: Commit** "Serve aggregated rails, genre discovery, credits and episode stills".

---

### Task 8: Arcade header and tab bar

**Files:**
- Modify: `src/main.ts`:
  - Lines 23-30: replace the local `icon()` with `uiIcon` and build the shell markup.
  - Lines 111-121 and 186-207: `.topbar` inert handling.
  - Line 304: the menu button.
- Modify: `src/style.css`: remove the `.topbar`, `.count-pill`, `.favourites-pill` and `.hamburger` look; keep the in-game rules.
- Modify: `tests/e2e/shell.spec.ts`: `name:'FAVOURITES'` becomes `name:'Favourites'`.
- Create: `tests/e2e/redesign-shell.spec.ts`

**Interfaces:**
- Consumes: `uiIcon` and the `ui-` classes from Task 1.
- Produces:
  - `setChromeInert(value:boolean):void` in `main.ts`. It sets `inert` on `.topbar` and `.app-tabbar`.
  - The shell markup:

```html
<header class="topbar ui-header"><div class="ui-header-inner">
 <a class="site-brand ui-brand" href="#/collection"><span class="ui-brand-tile">{mauriMark}</span><span class="ui-wordmark">Mauri <span>Study Notes</span></span></a>
 <nav class="ui-nav" aria-label="Site sections"><a class="count-pill ui-pill" href="#/collection" aria-current="page" aria-label="{n} games">{grid}<small>Games</small><strong class="ui-pill-count">{n}</strong></a><a class="ui-pill" href="#/movies/browse/movie">{film}Movies</a><a class="ui-pill" href="#/movies/browse/tv">{tv}TV Shows</a></nav>
 <div class="ui-header-actions"><button class="header-search ui-icon-btn" aria-label="Search games">{search}<span class="ui-label" aria-hidden="true">Search</span><kbd class="ui-kbd" aria-hidden="true">/</kbd></button><button class="favourites-pill ui-icon-btn" aria-pressed="false">{star}<span class="ui-label">Favourites</span></button><button class="hamburger icon-button ui-icon-btn" aria-label="Open menu">{menu}</button></div>
</div></header><main id="content"></main>
<nav class="app-tabbar ui-tabbar" aria-label="Sections"><a class="ui-tab" href="#/collection" aria-current="page">{grid}<span>Games</span></a><a class="ui-tab" href="#/movies/browse/movie">{film}<span>Movies</span></a><a class="ui-tab" href="#/movies/browse/tv">{tv}<span>TV Shows</span></a><a class="ui-tab" href="#/movies/list">{bookmark}<span>My list</span></a><button class="ui-tab" data-action="study">{study}<span>Study</span></button></nav>
```

Behaviour:
- `.header-search` calls `openMenu()`, then focuses `#search`.
- Pressing `/` on the library does the same. It is ignored in inputs and dialogs, during a game and in Movies.
- The Study tab calls `openStudy()`.
- `leave()` calls `setChromeInert(false)`. The Movies route calls `setChromeInert(true)` in place of the `.topbar` lines.
- CSS hides `.app-tabbar` from 640 px, in `body.in-game` and in `body.movies-active`.
- Below 640 px, `#content` gets `padding-bottom:calc(var(--tabbar-h) + env(safe-area-inset-bottom))` when not in a game.

- [ ] **Step 1: Write the failing spec** `tests/e2e/redesign-shell.spec.ts`. Import `test` and `expect` from `'../fixtures'`.
  - `desktop header has brand, sections and actions` (1366×900):
    - `.site-brand` has the text "Mauri Study Notes".
    - Link "Movies" has `href` `#/movies/browse/movie`; link "TV Shows" has `#/movies/browse/tv`.
    - `.count-pill` has `aria-label` "21 games".
    - `.app-tabbar` is hidden.
    - The "Search games" button opens `#menu` with `#search` focused.
  - `pressing / on the library opens search`.
  - For widths 320 and 390, `phone tab bar replaces the section links at ${w}px`:
    - `.app-tabbar` is visible with 5 children, each at least 44 px tall.
    - `.ui-nav` is hidden.
    - `scrollWidth<=innerWidth`.
    - Button "Open menu" is visible.
  - `tab bar hides during games and Movies & TV` (390 px): hidden on `#/collection/1`, hidden on `#/movies`, visible again on `#/collection`.
  - `Study tab opens Study Mode`: `#study-view` is visible.
- [ ] **Step 2: Run** `e2e.sh tests/e2e/redesign-shell.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `e2e.sh tests/e2e/redesign-shell.spec.ts tests/e2e/shell.spec.ts tests/e2e/branding.spec.ts tests/movies/movies.spec.ts` and `npm run check`. Expected: PASS.
- [ ] **Step 5: Commit** "Rebuild the arcade header and add the phone tab bar".

---

### Task 9: Arcade home: hero, rails, cards and footer

**Files:**
- Modify: `src/core/catalog.ts`. `GameInfo` gains `genre:'Puzzle'|'Arcade'|'Classic'` and `blurb:string` (copy below).
- Modify: `src/core/storage.ts`. Add `savedAt(id:GameId):number|undefined`, which reads the `save:` envelope's `updated`.
- Create: `src/library/home.ts`, `src/ui/rails.ts`
- Modify: `src/main.ts:122-125` (`library()`), plus a delegated click for `[data-hero-favourite]` and a `bindRails` call on `#content`.
- Modify: `src/style.css` (library) and `src/movies/style.css` (the `.movies-launch` look only).
- Test: create `tests/core/home.test.ts`; extend `tests/e2e/redesign-shell.spec.ts`.

**Interfaces:**
- Consumes: `games`, `artUrl`, `entryHash`, `store.favourites/highScore/savedAt`, `moviesCard()` and `uiIcon`.
- Produces:

```ts
// src/library/home.ts
export interface HomeState{search:string;onlyFavourites:boolean;favourites:readonly GameId[];best(id:GameId):number;savedAt(id:GameId):number|undefined;now:number}
export const RAILS:ReadonlyArray<{genre:GameInfo['genre'];title:string;subtitle:string}>;
// [{Puzzle,'Puzzle games','Think it through'},{Arcade,'Arcade action','Quick reflexes'},{Classic,'Classics & sandbox','Take your time'}]
export function featured(state:HomeState):{game:GameInfo;mode:'continue'|'daily'}  // newest savedAt, else games[Math.floor(now/86_400_000)%games.length]
export function relativeTime(then:number,now:number):string  // 'just now' <1 min, '{n} min ago' <1 h, '{n} h ago' <24 h, 'yesterday' <48 h, else '{n} days ago'
export function homeMarkup(state:HomeState,launch:string):string
// src/ui/rails.ts
export function bindRails(root:HTMLElement,reduced:()=>boolean):()=>void  // delegated click on [data-scroll] inside .ui-rail scrolls its .ui-rail-row by ±75% of clientWidth (instant when reduced); capture 'scroll' updates data-can-prev/next; returns a disposer
export function updateRails(root:ParentNode):void                       // sets data-can-prev/next on every .ui-rail
```

- **Rail markup** (also used by Movies):

```html
<section class="ui-rail" data-rail="{id}"><div class="ui-rail-head"><h2>{title}</h2><span class="ui-count">{n} {games|titles}</span><p class="ui-rail-sub">{subtitle}</p></div><div class="ui-rail-body"><button class="ui-rail-arrow prev" data-scroll="-1" aria-label="Previous {title}">{chevron-left}</button><div class="ui-rail-row">…</div><button class="ui-rail-arrow next" data-scroll="1" aria-label="Next {title}">{chevron-right}</button></div></section>
```

- **Game card:**

```html
<a class="game-card ui-card" href="{entryHash}" aria-label="Play {title}" style="--card:{color};--ink:{ink};--accent:{accent}"><span class="ui-card-poster"><span class="ui-card-placeholder" aria-hidden="true">{image}</span><img class="ui-card-img" src="{artUrl}" alt="" width="320" height="400" decoding="async" draggable="false"><span class="ui-card-chips"><span class="ui-chip">{GENRE}</span>[<span class="ui-chip rating">★ {best}</span>]</span><span class="ui-card-play" aria-hidden="true">{play}</span></span><span class="ui-card-caption"><h3 class="ui-card-title">{title}</h3><span class="ui-card-meta">{Genre} · {Best {n}|Saved|New}</span></span></a>
```

  - Images load eagerly, because tests decode them. The first two cards keep `fetchpriority="high"`.
- **Continue playing card:** `<a class="continue-card" href="{entryHash}" aria-label="Continue {title}">` holds a 16:9 cover crop and a caption `{title}` / `Saved {relativeTime}`. It lives in the rail titled "Continue playing" ("Pick up where you left off"), newest first, at most 10.
- **Hero:**

```html
<section class="arcade-hero ui-hero" aria-labelledby="arcade-hero-title"><img class="ui-hero-backdrop" src="{artUrl}" alt=""><span class="ui-hero-shade"></span><div class="ui-hero-content ui-container"><div class="ui-hero-badges"><span class="ui-chip">{Continue playing|Game of the day}</span><span class="ui-chip">{GENRE}</span>[<span class="ui-chip rating">★ {best}</span>]</div><h2 class="ui-hero-title" id="arcade-hero-title">{title}</h2><p class="ui-hero-meta">{Genre} · {Saved {rel}|New}</p><p class="ui-hero-overview">{blurb}</p><div class="ui-hero-actions"><a class="ui-btn primary" href="{entryHash}">{play}{Continue|Play now}</a><button class="ui-btn secondary" data-hero-favourite="{id}" aria-pressed="{bool}">{star}{In favourites|Add to favourites}</button></div></div><img class="ui-hero-poster" src="{artUrl}" alt=""></section>
```

  - The hero is omitted while `search` or `onlyFavourites` is set.
  - The backdrop is blurred 28 px, scaled 1.15 and at opacity .55. The poster shows only from 768 px.
- **Layout:**
  - `homeMarkup` returns `<h1 class="sr-only">Mauri Study Notes · Games</h1>`, the hero, `<div class="game-grid" aria-label="Game library">`, then `{launch}`.
  - Next come the rails (continue, then the three genres in `RAILS` order, each in catalog order).
  - When filtering, a single `section.ui-rail` titled "Results" (or "Favourites") holds a `div.ui-grid`, or the existing `p.empty-library` copy.
  - Last comes the footer:

```html
<footer class="site-footer ui-footer"><div class="ui-footer-brand"><span class="ui-brand-tile">{mark}</span><strong>Mauri Study Notes</strong><span>Games, films and revision in one place</span></div><nav class="ui-footer-links" aria-label="Footer"><a href="#/collection">Games</a><a href="#/movies/browse/movie">Movies</a><a href="#/movies/browse/tv">TV Shows</a><button type="button" data-action="leaderboards">Leaderboards</button></nav><p>{n} games. No ads. Optional accounts.</p></footer>
```

- **Click behaviour:**
  - `main.ts` calls `bindRails(content,()=>preferences.reducedMotion)` once, and `updateRails(content)` after every `library()` render.
  - `[data-hero-favourite]` toggles `store.toggleFavourite(id)`, updates `aria-pressed` and the label, and announces "Added to favourites" or "Removed from favourites".
  - Footer `[data-action="leaderboards"]` opens the leaderboards dialog the same way `#open-leaderboards` does.
- **Blurbs and genres** (exact copy, catalog id → genre, blurb):
  - **Puzzle:**
    - color-blocks: "Fit blocks on the board and clear full rows and columns before you run out of room."
    - water-sort: "Pour coloured water between tubes until every tube holds a single colour."
    - fruit-merge: "Drop fruit into the jar and merge matching pairs into bigger fruit without overflowing."
    - minesweeper: "Read the number clues to clear the field and flag every mine."
    - block-fill: "Draw one path that fills every square on the board."
    - color-connect: "Join matching dots and fill the whole grid with pipes."
    - slipline: "Slide each arrow out along its route without hitting another."
    - quadfall: "Rotate falling pieces and clear lines before the stack reaches the top."
    - fivefold: "Guess the five-letter word in six tries. A new puzzle every day."
  - **Arcade:**
    - tower: "Time each drop and stack the sliding blocks as high as you can."
    - flappy-bird: "Tap to flap through the reed gates. One touch ends the run."
    - ball-run: "Steer a rolling ball down a twisting course while the speed keeps climbing."
    - snake: "Eat, grow longer and never bite your own tail."
    - neon-coil: "Glide through the arena, collect light and outgrow the other coils."
    - maze-muncher: "Clear the maze of dots while four chasers hunt you down."
  - **Classic:**
    - animal-stack: "Balance animal cutouts into a tower that stays standing."
    - solitaire: "Classic Klondike patience: build each suit from ace to king."
    - pool: "Pot your set and sink the eight, solo or against a friend online."
    - globle: "Guess the mystery country. Every guess shows how close you are."
    - blockcraft: "Explore, mine, craft and build in an endless block world."
    - corn-clicker: "Click the cob, hire farmhands and grow a corn empire, even while you are away."

- [ ] **Step 1: Write failing tests.**
  - `tests/core/home.test.ts` (string assertions; there is no DOM):
    - `each game appears once, in catalog order, across three rails`: 21 matches of `class="game-card`; rail titles appear in order; the first card links to Block Blast.
    - `searching shows one results section and no hero`.
    - `empty favourites keep the existing guidance`: contains "Your favourites".
    - `the hero prefers the newest save, else the daily pick`.
    - `continue cards are named Continue {title}, newest first, at most 10`.
    - `no hero control is named Play {title}`.
    - `relativeTime thresholds`.
  - Extend `redesign-shell.spec.ts`:
    - `home shows a hero, three rails and a footer` (1440): `.arcade-hero` visible, at least 3 `.ui-rail`, 21 `.game-card`, `.site-footer` visible.
    - `hero favourite toggle feeds the Favourites filter`: 1 card after filtering.
    - For 320 and 390: `home fits ${w}px phones`: no horizontal scroll, first `.game-card` visible.
- [ ] **Step 2: Run** `npx vitest run tests/core/home.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run`, `npm run check`, and `e2e.sh tests/e2e/redesign-shell.spec.ts tests/e2e/shell.spec.ts tests/e2e/branding.spec.ts tests/e2e/study.spec.ts tests/movies/movies.spec.ts -g "launch|library|full-width|grid offset"`. Expected: PASS.
- [ ] **Step 5: Commit** "Rebuild the arcade home with a hero, rails and footer".

---

### Task 10: Menu, dialogs and in-game chrome

**Files:**
- Modify: `src/style.css` (menu, rules dialog, dialog buttons, `.game-toolbar`, `.game-metrics`, `#pause-overlay`, `.game-view` background)
- Modify: `src/accounts/style.css`, `src/leaderboard/style.css`
- Modify: `src/game-viewport.css`: colour, border, radius and font declarations only.
- Modify: `src/main.ts`: add `ui-panel` or `ui-sheet` classes to the dialogs in the shell markup if your CSS needs them.
- Test: extend `tests/e2e/redesign-shell.spec.ts`.

**Interfaces:**
- Consumes: Task 1 classes. Produces: none.
- Rules:
  - `#menu` is a right-hand sheet: margin pushes it to the right edge, height `100dvh`, width `min(420px,100vw)`, `--c-950`, left border `--line`, radius `16px 0 0 16px`.
  - Rules, accounts and leaderboard dialogs use the `.ui-panel` look, with a `::backdrop` of black at 85% and 12 px blur.
  - `dialog .game-button` gets the primary button look; `dialog .game-button.secondary` gets the secondary look.
  - The toolbar `h1` uses `var(--font-sans)` at 700, at the existing sizes.
  - `.metric-label`: 10 px mono, uppercase, `--c-400`. Metric values are white. `.record-crown` is `--c-amber`.

- [ ] **Step 1: Write failing tests** in `redesign-shell.spec.ts`.
  - `menu opens as a right-hand sheet` (1366×900): `#menu` box right edge ≈ 1366 (±1) and height ≈ 900 (±1).
  - `dialogs and the in-game toolbar use the panel look`: the computed `border-radius` of `#rules-dialog` is `16px`, and the computed `font-family` of `.game-toolbar h1` starts with `-apple-system`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `e2e.sh tests/e2e/redesign-shell.spec.ts tests/e2e/viewport.spec.ts tests/e2e/play-surface.spec.ts tests/e2e/shell.spec.ts tests/accounts/accounts.spec.ts tests/e2e/study.spec.ts`. Expected: PASS. Capture and look at the menu at 390 and 1440, and at Minesweeper and Pool at 390×844 and 844×390. Save the screenshots in the scratchpad, not the repo.
- [ ] **Step 5: Commit** "Restyle the menu, dialogs and in-game chrome".

---

### Task 11: Movies routes, header, tab bar and rails behaviour

**Files:**
- Modify: `src/movies/view.ts`:
  - `header()`, `mobileNav()`, `navigate()`.
  - In `click`, the kind and search branches.
  - Delete the old `data-scroll` branch.
  - The constructor calls `bindRails`; `dispose()` calls its disposer.
- Modify: `src/movies/style.css`: header and tab bar. Delete `.movies-view:focus,.movies-view :focus{outline:none}` and the rule hiding `kbd`.
- Create: `tests/movies/redesign.spec.ts`. Copy the `beforeEach` from `movies.spec.ts`, and also route `https://framextv.xyz/**`, `https://vidlink.pro/**`, `https://vixsrc.to/**` and `https://vidsrc.to/**` to the same fixture page.

**Interfaces:**
- Consumes: `kindHash`, `MovieRoute.kind` (Task 6), `uiIcon`, `bindRails`, `updateRails` (Task 9), and `mauriMark` (`import mauriMark from '../assets/mauri-mark.svg?raw'`).
- Produces: `this.kind` derived from the route, and this markup:

```html
<header class="movies-top ui-header"><div class="ui-header-inner"><a class="movies-brand ui-brand" href="#/movies" aria-label="Movies and TV home"><span class="ui-brand-tile">{mark}</span><span class="ui-wordmark">Mauri <span>Study Notes</span></span></a><nav class="ui-nav" aria-label="Movies and TV navigation">{all Home | movie Movies | tv TV Shows | list My list as <button class="ui-pill" data-kind="{k}" aria-pressed="{kind===k&&!route.id}">}</nav><div class="ui-header-actions"><button data-action="search" class="movies-search-toggle ui-icon-btn" aria-label="Search movies and TV">{search}</button><a class="movies-back ui-icon-btn" aria-label="Games" href="#/collection">{grid}<span class="ui-label" aria-hidden="true">Games</span></a><button data-action="study" class="movies-study ui-icon-btn">{study}<span class="ui-label">Study Mode</span><kbd class="ui-kbd" aria-hidden="true">Esc</kbd></button></div></div></header>
```

  - The tab bar is `nav.movies-mobile-nav.ui-tabbar[aria-label="Mobile movies navigation"]`. Its Home, Movies, TV Shows and My list items are `button.ui-tab[data-kind][aria-pressed]`; Study is `[data-action="study"]`.
  - `.movies-study` and the header `.ui-nav` are hidden below 640 px.
- **Kind buttons:**
  - Reset the query, genre and remote search state.
  - If `location.hash===kindHash(kind)`, `render()`, set `scrollTop` to 0 and focus the `h1`.
  - Otherwise set `homeNavigation=true` and `location.hash=kindHash(kind)`.
- **`navigate()`:** sets `this.kind=next.id?this.kind:(next.kind??'all')`.
- **Search action:** keeps its behaviour (kind `all`, then `#/movies`, then focus `#movies-search`).
- **After each `render()`:** call `updateRails(this.root)`.
- **Rail markup:** `shelf()` adopts the Task 9 rail markup, keeping the arrow names "Previous {name}" and "Next {name}".

- [ ] **Step 1: Write failing tests** in `redesign.spec.ts`.
  - `section buttons change the address and survive reload`: "TV Shows" gives `#/movies/browse/tv` and becomes pressed; after a reload it is still pressed; browser back makes "Home" pressed.
  - For 320 and 390: `the phone tab bar replaces the section buttons at ${w}px`. `.movies-mobile-nav` is visible with 5 items, `.movies-top .ui-nav` is hidden, and `.movies-view` has no horizontal overflow.
  - `focus is visible on header controls and cards`: Tab to "Home" gives a solid `outline-style` of at least 2 px; focusing the first `.movies-poster` gives a solid outline too.
- [ ] **Step 2: Run** `e2e.sh tests/movies/redesign.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `e2e.sh tests/movies` and `npm run check`. Expected: PASS.
- [ ] **Step 5: Commit** "Give Movies & TV section routes and the shared header".

---

### Task 12: Movies home: hero, filter bar, cards, rails and continue watching

**Files:**
- Modify: `src/movies/view.ts`:
  - Rewrite `browse()` (home branch), `card()` and `shelf()`.
  - Add `continueRail()` and `fetchRails()`.
  - Move `fetchCatalog()` and `loadTitle()` to `cachedJson`.
  - Status lines.
- Modify: `src/movies/style.css`
- Test: extend `tests/movies/redesign.spec.ts`.

**Interfaces:**
- Consumes: `cachedJson`, `SEARCH_STALE`, `DEFAULT_STALE` (Task 2); `parseRails`, `Rail` (Task 6); `continueItems`, `snapshot`, `snapshotOf` (Task 5); `ui-` classes.
- Produces:
  - Fields `rails:Rail[]` and `railsError:boolean`.
  - `fetchRails(kind:'home'|'movie'|'tv'):Promise<void>`, which fetches `/api/movies?rails={kind}`.
  - `card(t:Title):string`.
  - `shelf(id:string,name:string,titles:Title[],subtitle?:string):string`.
  - `lookup(id:string):Title|undefined`, which searches catalog, rails, remote and related titles.
- **Card:**

```html
<a class="movies-poster ui-card" href="#/movies/{id}" data-title="{id}" aria-label="Details for {name}"><span class="ui-card-poster"><span class="ui-card-placeholder" aria-hidden="true">{image}<span>{name}</span></span><img class="ui-card-img" data-poster="{poster}" src="{poster}" alt="" width="320" height="480" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span class="ui-card-chips"><span class="ui-chip">{FILM|SERIES}</span>[<span class="ui-chip rating">★ {x.x}</span>]</span><span class="ui-card-play" aria-hidden="true">{play}</span></span><span class="ui-card-caption"><strong class="ui-card-title">{name}</strong><small class="ui-card-meta">{year} · {Movie|Series}</small></span></a>
```

- **Hero** (`section.movies-hero.ui-hero`):
  - Featured title: `rails[0]?.titles[0] ?? catalog.titles[0]`.
  - Badges: "Featured film" or "Featured series", plus the rating chip.
  - Title: `h1[tabindex=-1]` holding text only.
  - Meta: `{year} · {Movie|Series} · {up to 3 genres joined " / "}`. Then the overview.
  - Actions: `button.movies-primary.ui-btn.primary[data-play-route]` "Play"; `a.ui-btn.secondary` "Details"; `button.movies-hero-list.ui-btn.secondary[data-list][aria-pressed][aria-label="Add {name} to my list"|"Remove {name} from my list"]`.
  - Backdrop `img.ui-hero-backdrop` (backdrop, else poster), with `fetchpriority="high"`.
- **Data flow:**
  - The landing without a route id calls `fetchRails('home')` in place of `fetchCatalog('',1)`.
  - Unfiltered results show:
    - Continue watching, when there are items: "Continue watching" / "Pick up where you left off". Each item is `a.movies-continue[href="{play route}"][aria-label="Resume {name}"]` with a 16:9 image, a `.movies-progress` bar when the duration is known, and caption `{name}` / `S{s} · E{e}` or `Movie`.
    - My list, when it has entries.
    - Then the API rails, or the current starter shelves.
  - **Failed rails request with no query:** `p.movies-rails-status[role=status]` reads "Showing the starter selection. The full catalog is unavailable right now." with `button[data-action="retry-rails"]` "Retry". The search error copy and "Retry search" appear only for searches, as today.
  - **Results status:** `#movies-results` drops `aria-live`, and `.movies-result-count` gets `role="status"`.
  - **Previous results:** stay visible while the next page or query loads.
  - **Rail titles:** go into `dynamicIds` so their detail pages fetch like trending titles do today.
  - **Late rails response:** a rails response that arrives after a title route opened updates state but must not re-render. This is the same guard as `renderSearchState` (`network-recovery.spec.ts` "late browse metadata cannot reload an active player").
  - **Empty rails response:** a response that parses to zero rails is handled like a failed request.
  - **Test update:** automatic retries now absorb single failures. In `network-recovery.spec.ts` "retry resumes the failed catalog page…", change `let failures=1` to `let failures=3`, with the comment `// all three automatic attempts fail, so the manual retry is still exercised`.

- [ ] **Step 1: Write failing tests.**
  - `home rails come from one aggregated request`: a fixture with 2 rails for URLs containing `rails=home`. "Trending now" and "Popular movies" are visible, and exactly one `/api/movies` request is made.
  - `a failed rails request shows the starter rails and a quiet retry`: `.movies-rails-status` is visible, "Retry search" has count 0, and "Movies you’ll love" is visible.
  - `continue watching lists in-progress titles newest first`: seed `qcc:movies:v1` with two progress keys, meta and snapshots through `addInitScript`.
  - `malformed rails are skipped`: one bad rail is dropped and the good rail renders.
- [ ] **Step 2: Run** `e2e.sh tests/movies/redesign.spec.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `e2e.sh tests/movies` and `npm run check`. Expected: PASS.
- [ ] **Step 5: Commit** "Rebuild the Movies home with a hero, rails and continue watching".

---

### Task 13: Section pages and My list

**Files:**
- Modify: `src/movies/view.ts`: the `browse()` kind branches; add `pageHead()` and `fetchGenre()`; list toggles pass snapshots.
- Modify: `src/movies/style.css`
- Test: extend `tests/movies/redesign.spec.ts`.

**Interfaces:**
- Consumes: Tasks 5, 6, 7, 11 and 12.
- Produces: `pageHead(kind:'movie'|'tv'|'list',count?:number):string`, which renders `<div class="movies-page-head ui-container"><h1 class="movies-page-title" tabindex="-1">{title}</h1><p>{subtitle}</p>[<span class="ui-count">{n} titles</span>]</div>`.
- **Copy:**
  - Movies: "Films for every mood, from new releases to old favourites."
  - TV Shows: "Series to start tonight and seasons to catch up on."
  - My list: "Titles you saved on this device."
  - Empty list: h2 "Your list is empty", p "Open a title and choose Add to my list to save it here.", and `button[data-action="reset"]` "Explore all titles".
- **Section pages (movie, tv):**
  - Show `fetchRails(kind)` rails; when those fail, show `.movies-results-grid` of that kind's bundled titles.
  - Any genre other than "All" with a working API calls `cachedJson('/api/movies?type={kind}&genre={genre}&page={n}')`. Its results merge with local matches in the filtered grid, with the existing pagination.
- **List page:** a `.movies-results-grid` of `storage.data.list` ids, resolved through `lookup()` and then `storage.snapshot()`. A snapshot becomes a `Title` with `genres:[]`, `overview:''` and `seasons:[]`.
- **List toggles:** pass `snapshotOf(title)` when adding.
- **Genre options:** the sorted union of the genres on catalog, rail and remote titles.

- [ ] **Step 1: Write failing tests.**
  - `TV Shows shows TV rails and asks the server for a genre`: fixtures for `rails=tv` and `type=tv&genre=Drama`.
  - `My list keeps a remote title after a reload`: add "Remote Expedition" from its detail page, then reload `#/movies/list` with the API returning 503. "Details for Remote Expedition" is visible.
  - `an empty list explains how to add titles`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `e2e.sh tests/movies` and `npm run check`. Expected: PASS.
- [ ] **Step 5: Commit** "Add Movies and TV pages and a persistent My list".

---

### Task 14: Title detail page

**Files:**
- Modify: `src/movies/view.ts`:
  - `detail()`.
  - Season pill clicks replace both `#movies-season` change handlers, with the same navigation result.
  - Remove the detail back link and the "Playback information" link.
- Modify: `src/movies/style.css`
- Modify: `tests/movies/movies.spec.ts`:
  - The two `getByLabel('Season',{exact:true}).selectOption('2')` calls become `getByRole('button',{name:/^Season 2\b/}).click()`.
  - The "Playback information" click becomes `getByRole('button',{name:'Play movie'}).click()`.
- Test: extend `tests/movies/redesign.spec.ts`.

**Interfaces:**
- Consumes: Task 6 fields and Task 5 `continueItems()` and progress.
- Produces: `formatRuntime(minutes:number):string` (`2h 49m`, `2h`, `49m`) and `formatClock(seconds:number):string` (`m:ss`, or `h:mm:ss` from one hour), exported from `src/movies/view.ts` or a small `src/movies/format.ts` with unit tests.
- **Detail markup:**
  - `section.movies-detail` contains `div.movies-detail-backdrop[aria-hidden=true]` (an image of the backdrop, else the poster) and `div.movies-detail-inner.ui-container`.
  - The inner block holds `img.movies-detail-art[alt="Poster for {name}"]` and `div.movies-detail-info`, which contains:
    - Chips: type, year, `★ x.x`, runtime.
    - `h1[tabindex=-1]`, `div.movies-tags` and `p.movies-overview`.
    - `div.movies-actions`:
      - Movie: `button.movies-primary.ui-btn.primary[data-play]` "Play movie", plus `small.movies-resume` "Resume at {m:ss}" when progress is at least 15 s.
      - TV: `a.movies-primary.ui-btn.primary` "Play S{s} E{e}", or "Continue S{s} · E{e}" when the newest continue item belongs to this title.
      - Every title: `button.ui-btn.secondary[data-list][aria-pressed]` "Add to my list" / "In my list".
    - `p#movies-unavailable.movies-availability`.
- **TV sections:**
  - `section.movies-episodes.ui-container` holds an h2 "Seasons" with the count "{n} seasons", then `div.movies-season-pills[role=group][aria-label="Seasons"]`.
  - Each pill is `button.ui-pill[data-season][aria-pressed]` with the season name and `span.movies-pill-count` holding the episode count when it is above zero.
  - Then the episode rows:

```html
<article class="movies-episode"><a class="movies-episode-thumb" href="{play}" tabindex="-1" aria-hidden="true"><img src="{still||backdrop||poster}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span class="ui-chip">EP {n}</span><span class="ui-card-play">{play}</span>[<span class="movies-progress"><span style="width:{pct}%"></span></span>]</a><div class="movies-episode-body"><h3>{name}</h3><p class="movies-episode-meta">{airDate} · {runtime} · ★ {rating}</p><p>{overview||'No description supplied.'}</p></div><a class="ui-btn primary small" href="{play}" aria-label="Play {name}">{play}Play</a></article>
```

- **Cast and related:**
  - `section.movies-cast` ("Cast", `{n} people`) holds 3:4 photo cards with initials when there is no photo, the name, and the character.
  - Then `shelf('related','More like this',related)`.

- [ ] **Step 1: Write failing tests.**
  - `detail shows chips, cast and more like this from the API`: an `id` fixture with `cast` and `related`.
  - `season pills mark the current season and switch episodes`.
  - `TV detail offers to continue the newest episode in progress`.
  - `a long title fits a 320px phone`: no horizontal overflow.
  - Unit: `formatRuntime` and `formatClock` cases.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement**, and update the two `movies.spec.ts` interactions.
- [ ] **Step 4: Run** `npx vitest run tests/movies`, `e2e.sh tests/movies` and `npm run check`. Expected: PASS.
- [ ] **Step 5: Commit** "Rebuild the title page with chips, season pills, episodes and cast".

---

### Task 15: Watch page, servers row, episode controls and drawer

**Files:**
- Modify: `src/movies/view.ts`:
  - `player()` and `refreshPlayer()`.
  - Click handlers for `[data-server]`, `[data-action="episodes"]`, `[data-action="close-drawer"]` and `[data-action="next-server"]`.
  - `switchProvider(providerId,manual=true)`.
  - Close the drawer in `pause`, `stopVideo`, `navigate` and `dispose`.
  - Remove `select#movies-source`, `[data-action="next-source"]` and `.movies-source-controls`.
- Modify: `src/movies/style.css`
- Test: extend `tests/movies/redesign.spec.ts`.

**Interfaces:**
- Consumes: `previousEpisode` and `nextEpisode` (Task 6), `formatClock` (Task 14), `STREAM_PROVIDERS` (server *n* is index + 1).
- Produces:
  - `switchProvider(providerId:StreamProviderId,manual?:boolean):void`.
  - The direct children of `div.movies-player`, in the order fixed by §7.6.
  - The servers markup:

```html
<div class="movies-servers" role="group" aria-label="Servers"><span class="movies-servers-label">Servers</span>{for each provider: <button class="movies-server" data-server="{id}" aria-pressed="{current}" data-state="idle"><span class="movies-server-dot" aria-hidden="true"></span>Server {n}<small>{name}</small></button>}<button data-action="reload-stream" class="ui-btn secondary small">Reload player</button><p id="movies-source-help">If a server will not start we try the next one automatically. You can also pick one.{ vidsrc: ' This server starts from the beginning.'}</p><p class="movies-failover" role="status"></p></div>
```

- **Episode controls** (`div.movies-episode-controls`, TV only):
  - `a.ui-btn.secondary[aria-label="Previous episode"]` "Previous". At the first episode it is a disabled `button` named "First episode".
  - `button[data-action="episodes"].ui-btn.secondary` showing "S{s} · E{e}" with `aria-haspopup="dialog"`.
  - `a.ui-btn.primary[aria-label="Next episode"]` "Next". At the last episode it is a disabled `button` named "Final episode".
  - `label.movies-auto-next` (the pinned checkbox), styled with `.ui-switch`.
- **Drawer:**
  - `dialog.movies-drawer.ui-drawer[aria-label="Select episode"]` holds a handle, an h2 "Episodes", and `button[data-action="close-drawer"][aria-label="Close episode list"]`.
  - It also holds `button.ui-pill[data-drawer-season]` pills and rows of `a[href="{play route}"]`, with the current row marked `aria-current="true"` in rose.
  - It opens with `showModal()`.
- **Inside `.movies-screen`:**
  - `div.movies-connecting` (hidden until Task 16).
  - The restyled `.movies-next` with an added `div.movies-next-bar > span`. Its width is set each second from `seconds/10`, with no transition when motion is reduced.
  - `div.movies-resume-pill` "Resumed at {m:ss}", shown for 4 s when the stream starts at a saved time of at least 15 s. Its timer is cleared in `stopVideo`.
  - The fullscreen button, unchanged.

- [ ] **Step 1: Write failing tests.**
  - `the servers row switches provider and marks it pressed`: "Server 2" gives iframe `data-provider="vidlink"`.
  - `episode controls step between episodes and stop at the ends`: "First episode" is disabled on S1E1, and "Next episode" goes to S1E2.
  - `the episode drawer lists the season and closes for Study`: Escape shows `#study-view` and the drawer has `open` false; "Games" leads to "Resume stream".
  - `the watch page fits a 320px phone`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `e2e.sh tests/movies` (auto-next, network-recovery and movies must stay green) and `npm run check`. Expected: PASS.
- [ ] **Step 5: Commit** "Rebuild the watch page with servers, episode controls and a drawer".

---

### Task 16: Automatic failover, remembered server and episode validation

**Files:**
- Modify: `src/movies/view.ts` (supervisor wiring and validation in `player()`)
- Modify: the `beforeEach` provider fixture in `tests/movies/movies.spec.ts`, `tests/movies/network-recovery.spec.ts`, `tests/movies/auto-next.spec.ts` and `tests/movies/redesign.spec.ts`:
  - The FrameXTV fixture body appends `<script>parent.postMessage({event:'frameXTV:ready'},'*')</script>`.
  - The other four provider origins are routed to a fixture page too, so no test reaches the network.
- Create: `tests/movies/failover.spec.ts`

**Interfaces:**
- Consumes: `PlaybackSupervisor`, `providerOrder`, `failedProviders`, `clearFailures` (Task 3); `providerSignal` (Task 4); `MovieStorage.setProvider` and `data.provider` (Task 5); `switchProvider(id,manual)` (Task 15).
- **Wiring:**
  - Each player render picks the first server of `providerOrder(storage.data.provider)` that is not in `failedProviders(mediaKey)`, unless the user chose one this session.
  - `bindPlayer` creates the supervisor with that order and calls `start(providerId,manualPick)`.
  - The iframe `load` event calls `loaded()`.
  - `providerSignal` results call `message('ready')` for `ready`, or `message('progress')` for `progress` and `ended`.
  - A document `securitypolicyviolation` listener with `effectiveDirective==='frame-src'` calls `violation()`. It is added in the constructor and removed in `dispose`.
  - `stop()` runs in `stopVideo`, `pause`, `navigate` and `dispose`.
- **Events:**
  - `status`: sets the server buttons' `data-state` (`trying`, `working` or `failed`) and shows `.movies-connecting` ("Connecting to Server {n}…") while `connecting` or `loaded`.
  - `slow`: adds "Taking a while? Try another server." and `button[data-action="next-server"]` "Try Server {m}".
  - `switchTo`: `.movies-failover` reads "Server {n} didn't start. Trying Server {m}…", then `switchProvider(next,false)`.
  - A failed manual pick: "Server {n} didn't start. Try Server {m}."
  - `exhausted`: `.movies-media` becomes `div.movies-player-unavailable` with h2 "Playback didn't start", p "This title would not start on any server.", and `button[data-action="retry-servers"]` "Try again", which calls `clearFailures` and restarts at the first server.
  - `working`: `storage.setProvider(id)` and clears `.movies-failover`.
- **Validation (§8.3):** a TV route whose season is not in `title.seasons`, or whose loaded season lacks the episode, renders `div.movies-player-unavailable` with h2 "Episode unavailable", p "This episode isn't in this season's list.", and `a.ui-btn.primary` "Choose another episode" to the title's season route. No iframe.

- [ ] **Step 1: Write the failing spec** `tests/movies/failover.spec.ts`. Use `page.clock.install()` before `goto` whenever time must pass, then `page.clock.runFor(ms)`.
  - `a provider redirect blocked by the CSP moves to Server 2`: FrameXTV fulfils `302` to `https://example.org/`. The iframe gets `data-provider="vidlink"` and the status text appears.
  - `a server that never loads is replaced after 15 seconds`: the FrameXTV route never fulfils.
  - `FrameXTV that loads without a ready message is replaced after 12 seconds`.
  - `a ready FrameXTV stays selected`: still `framextv` after 30 s.
  - `the server that played is remembered after a reload`: the VidLink fixture posts `{type:'PLAYER_EVENT',data:{event:'timeupdate',currentTime:5,duration:100}}`.
  - `a manual pick that fails does not switch by itself`.
  - `when every server fails, Try again restarts at Server 1`.
  - `opening Study while connecting stops the watchdog`: no switch after returning and 20 s more.
  - `leaving the title while connecting leaves no switch behind`.
  - `ready messages posted by the page itself do not count`.
  - `a missing episode shows Episode unavailable and no iframe`: `#/movies/tv-19885/season/9/episode/9/play`.
- [ ] **Step 2: Run** `e2e.sh tests/movies/failover.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, and update the four fixtures.
- [ ] **Step 4: Run** `e2e.sh tests/movies`, `npx vitest run` and `npm run check`. Expected: PASS.
- [ ] **Step 5: Commit** "Fail over between servers, remember the working one and validate episodes".

---

### Task 17: Movies footer, motion and stylesheet clean-up

**Files:**
- Modify: `src/movies/view.ts`: `footer()`. Keep paragraph order, because `render()` rewrites `.movies-footer p` index 1.
- Modify: `src/movies/style.css`: delete rules that no markup uses any more, such as `.movies-eyebrow`, `.movies-card-mark`, `.movies-poster-logo`, `.movies-profile`, `.movies-hero-index`, `.movies-hero-note` and `.movies-source-controls`.
- Test: extend `tests/movies/redesign.spec.ts`.

**Interfaces:**
- Produces this footer:

```html
<footer class="movies-footer ui-footer" aria-label="Credits and privacy"><div class="ui-footer-brand"><span class="ui-brand-tile">{mark}</span><strong>Mauri Study Notes</strong><span>Movies &amp; TV</span></div><nav class="ui-footer-links" aria-label="Movies and TV sections"><a href="#/movies">Home</a><a href="#/movies/browse/movie">Movies</a><a href="#/movies/browse/tv">TV Shows</a><a href="#/movies/list">My list</a></nav><strong>Your screen. Your privacy.</strong>{existing paragraphs, wording unchanged}<button data-action="clear" class="ui-btn secondary small">Clear my list &amp; playback progress</button><p class="movies-storage" role="status">…</p></footer>
```

- [ ] **Step 1: Write failing tests.**
  - `reduced motion stops card, rail and drawer animations`: with `page.emulateMedia({reducedMotion:'reduce'})`, hovering a card and opening the drawer leaves `document.getAnimations().length` at 0, and `.ui-card-img` has `transition-duration` `0s`.
  - `the footer keeps the privacy copy and clears saved data`.
  - `no unused legacy Movies styles remain`: a Vitest string check that `src/movies/style.css` contains none of the deleted selectors.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `e2e.sh tests/movies`, `npx vitest run` and `npm run check`. Expected: PASS.
- [ ] **Step 5: Commit** "Finish the Movies footer and remove legacy styles".

---

### Task 18: Documentation, evidence and full verification

**Files:**
- Modify: `docs/MOVIES_TV.md`, `docs/MOVIES_TV_DESIGN_REFERENCES.md`, `ARCHITECTURE.md` (shell and Movies sections), `README.md` (the look and the Movies & TV paragraph).
- Create: `docs/evidence/redesign/*.png`, plus the `docs/evidence` images the specs regenerate.

**Steps:**
- [ ] **Step 1: Update the docs.** Cover:
  - The design system and its reference measurements, including that FrameXTV's guard blocked rendering and that no FrameXTV code or assets are used.
  - Routes.
  - Provider autoplay and start-time parameters.
  - Failover behaviour and limits.
  - Storage fields.
  - The API rails, genre, credits and stills, and the CDN caching.
  - How to run e2e locally (`ARCADE_URL` and `CHROMIUM_PATH`).
  - The open sandbox question (§13).
- [ ] **Step 2: Run** `npm run check`, `npx vitest run`, `npm run build`, and then `KEEP_EVIDENCE=1 e2e.sh tests/e2e tests/movies tests/accounts tests/leaderboard`. Expected: all pass. Record any failure with its output. Never skip or delete a test.
- [ ] **Step 3: Capture screenshots** at 1440×900 and 390×844 with a scratchpad Playwright script into `docs/evidence/redesign/`:
  - Arcade home, game view, and menu.
  - Movies home, Movies page, TV page, My list.
  - Movie detail, TV detail, and the watch page with the drawer open, the auto-next card, and the failover status.
  - Search results.
  - Look at every image against §3–§7 and fix what does not match.
- [ ] **Step 4: Commit** "Document the redesign and record evidence", including the docs and `docs/evidence`.

---

### Task 19: Glass island tab bar that hides on scroll (user request, runs after Task 9)

The user asked for the phone bottom bar to be "an Apple glass island that disappears on scroll down" (spec §5 `.ui-tabbar` and §15). It applies to every `.ui-tabbar`. The arcade binds it in this task. Task 11 binds the Movies tab bar to its own scroller.

**Files:**
- Create: `src/ui/tabbar.ts`
- Modify: `src/theme.css`: tokens, `.ui-tabbar`, `.ui-tab`, and the hidden, reduced-motion, reduced-transparency, contrast and no-blur states.
- Modify: `src/style.css`: `#content` bottom clearance below 640 px.
- Modify: `src/main.ts`: bind once to `.app-tabbar` with `window`, and call `reset()` in `route()` and `leave()`.
- Test: create `tests/core/tabbar.test.ts`; extend `tests/e2e/redesign-shell.spec.ts`.

**Interfaces:**

```ts
// src/ui/tabbar.ts
export interface TabbarScroll{hidden:boolean;lastY:number;travel:number}
export const TABBAR_THRESHOLD=12; // px of travel in one direction before the bar changes state
export const TABBAR_EDGE=24;      // px from the top or the end of the page where the bar always shows
export function nextTabbarState(state:TabbarScroll,y:number,max:number):TabbarScroll
export function autoHideTabbar(bar:HTMLElement,scroller:Window|HTMLElement):{reset():void;dispose():void}
```

- **`nextTabbarState` (pure):**
  - Clamp `y` into `[0,max]`, so rubber-band overscroll is ignored.
  - When `max<=2*TABBAR_EDGE` (too short to scroll), when `y<=TABBAR_EDGE`, or when `y>=max-TABBAR_EDGE`, return `{hidden:false,lastY:y,travel:0}`.
  - Otherwise take `delta=y-lastY`. If it has the same sign as `travel` (or `travel` is 0), add it to `travel`; else `travel=delta`.
  - `travel>=TABBAR_THRESHOLD` hides; `travel<=-TABBAR_THRESHOLD` shows. Otherwise `hidden` is unchanged. Always set `lastY=y`.
- **`autoHideTabbar`:**
  - Use one passive `scroll` listener on `scroller`, throttled to one `requestAnimationFrame`.
  - It reads `y` and `max` from the window (`scrollY`, `documentElement.scrollHeight-innerHeight`) or from the element (`scrollTop`, `scrollHeight-clientHeight`).
  - It sets `data-hidden="true"` on the bar, or removes the attribute, only when the state changes.
  - `reset()` shows the bar and re-bases `lastY` on the current position.
  - `dispose()` removes the listener, cancels the frame and shows the bar.
- **Tokens (theme.css `:root`):**
  - `--tabbar-h:64px`
  - `--tabbar-gap:12px`
  - `--ease-drawer:cubic-bezier(.32,.72,0,1)`
- **`.ui-tabbar` (below 640 px; the existing `min-width:640px` hide stays):**
  - **Placement:** fixed; `left:12px;right:12px;bottom:calc(var(--tabbar-gap) + env(safe-area-inset-bottom))`; `max-width:440px;margin-inline:auto`; `min-height:var(--tabbar-h)`; `padding:6px`; `gap:2px`; `border-radius:999px`.
  - **Glass:**
    - `border:1px solid #ffffff1f`.
    - `background:linear-gradient(180deg,#ffffff1a,#ffffff05 45%,#ffffff00),rgb(18 18 20 / .72)`.
    - `backdrop-filter` and `-webkit-backdrop-filter`: `blur(24px) saturate(1.8)`.
    - `box-shadow:inset 0 1px 0 #ffffff33,inset 0 -1px 0 #ffffff0d,0 12px 32px -8px #000000b3,0 2px 6px #00000066`.
    - A `::before` sheen: `radial-gradient(120% 90% at 20% 0%,#ffffff24,#ffffff00 55%)`, with `border-radius:inherit` and `pointer-events:none`. Tabs sit above it.
  - **Motion:** `transition:transform var(--t) var(--ease-drawer)`, named properties only.
  - **Hidden:**
    - `.ui-tabbar[data-hidden="true"]:not(:has(:focus-visible)){transform:translateY(calc(100% + var(--tabbar-gap) + env(safe-area-inset-bottom) + 16px));pointer-events:none}`.
    - Use `:focus-visible`, not `:focus-within`, so a tab focused by a tap does not pin the bar open, while keyboard focus always shows it.
  - **Fallbacks:**
    - With no `backdrop-filter` support (`@supports not`), the fill becomes `rgb(18 18 20 / .96)`.
    - `@media (prefers-reduced-transparency:reduce)`: the fill is `rgb(18 18 20 / .97)` and there is no backdrop filter.
    - `@media (prefers-contrast:more)`: `border-color:#ffffff66`.
  - **Reduced motion** (the media query and `.reduce-motion`):
    - The bar transitions only `opacity` (`var(--t-fast) var(--ease)`).
    - When hidden it keeps `transform:none` and uses `opacity:0;pointer-events:none`.
    - If the theme's global reduced-motion block forces near-zero durations, the fade is instant. That is acceptable; record it.
- **`.ui-tab`:**
  - `color:var(--c-300)`, `border-radius:999px`, `position:relative`.
  - The current item (`[aria-current="page"]`, `[aria-pressed="true"]`) is `#fff` 700 on a lozenge: `background:#ffffff1f;box-shadow:inset 0 1px 0 #ffffff26`.
  - Keep the 54×44 px minimum, the 10 px label and the .95 press.
- **Clearance:** below 640 px, outside games and Movies, `#content` gets `padding-bottom:calc(var(--tabbar-h) + 2*var(--tabbar-gap) + env(safe-area-inset-bottom))`.

- [ ] **Step 1: Write failing tests.**
  - `tests/core/tabbar.test.ts`, for `nextTabbarState`:
    - It hides after `TABBAR_THRESHOLD` px of downward travel and not before.
    - It shows after `TABBAR_THRESHOLD` px of upward travel.
    - Jitter of alternating ±5 px never toggles it.
    - It always shows within `TABBAR_EDGE` of the top and of the end.
    - A page with `max<=48` never hides it.
    - Values below 0 or above `max` are clamped.
  - `redesign-shell.spec.ts`, at 390×844 unless noted:
    - `the phone tab bar is a floating glass island`:
      - Bar box: left ≥ 10, right ≤ 380, bottom ≤ 834.
      - The computed `border-radius` is at least 24 px.
      - The computed `backdrop-filter` contains `blur`.
      - Five items, each at least 44 px tall.
    - `scrolling down hides the tab bar and scrolling up brings it back`:
      - Scroll down 400 px. The bar has `data-hidden="true"` and its box top is ≥ 844.
      - Scroll up 120 px. There is no `data-hidden` and the box bottom is ≤ 844.
    - `the tab bar shows again near the top and after navigation`.
    - `keyboard focus brings a hidden tab bar back`: hide the bar, press Tab once, then focus the first tab. The bar box is inside the viewport.
    - `a tapped tab does not pin the bar open`: click the Games tab with the mouse, then scroll down 400 px. The bar is hidden.
    - `reduced motion fades the bar instead of sliding`: use `page.emulateMedia({reducedMotion:'reduce'})` before load. When hidden, the computed `transform` is `none`, `opacity` is `0` and `pointer-events` is `none`.
- [ ] **Step 2: Run** `npx vitest run tests/core/tabbar.test.ts` and `e2e.sh tests/e2e/redesign-shell.spec.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** Then look at it. Capture 390×844 screenshots:
  - the island over the hero at the top;
  - the island over the bright game cards (scroll down to a rail, then up 120 px);
  - the hidden state;
  - 320×700.
  Check that the labels are legible over the cards.
- [ ] **Step 4: Run** `npx vitest run tests/core`, `npm run check`, `e2e.sh tests/e2e/redesign-shell.spec.ts tests/e2e/shell.spec.ts tests/e2e/branding.spec.ts tests/e2e/study.spec.ts`, and `e2e.sh tests/movies/movies.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** "Float the phone tab bar as a glass island that hides on scroll".
