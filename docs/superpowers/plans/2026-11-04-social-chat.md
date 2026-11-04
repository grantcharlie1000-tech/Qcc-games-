# QCC Social + QCC Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the phase 2–4 MVP of issue #110 (authenticated schema and APIs, QCC Social, QCC Chat) plus the photo half of phase 5 (the shared media pipeline), lazy-loaded behind one Apps launcher.

**Architecture:** Three same-origin function handlers (`social`, `chat`, `media`) follow the `createAccountsHandler(db)` pattern: they take a `Database` (and a `MediaStore | null`) and return `(Request)=>Promise<Response>`. Netlify adapters, the Pages proxy and `dev:online` wrap them. Postgres holds all rows; processed WebP derivatives go to a pluggable `MediaStore`. The frontend adds two lazy section views (`SocialView`, `ChatView`) shaped like `MoviesView`, plus typed clients that use the existing `AccountsClient` bearer token.

**Tech Stack:** Vite 7, strict TypeScript, vanilla DOM, Postgres via `@netlify/database` (`@netlify/database-dev` in tests), Sharp 0.35 (server, lazy import), `@netlify/blobs` (Netlify media store), Vitest, Playwright.

**Spec:** `docs/social-chat/SPEC.md` (product and threat model) and `docs/social-chat/DESIGN.md` (visual and motion; written by the design task). References: `docs/social-chat/references/*.md`.

## Global Constraints

- No X/Twitter or Snapchat names, logos, icons, colours-as-brand, copied wording or assets in UI or code. Product names: **QCC Social**, **QCC Chat**.
- Every handler: `Cache-Control: no-store` unless stated; non-GET requests must pass the same-origin check (`origin` header absent or equal to the request origin) and `Content-Type: application/json` (media upload: `image/*` or `application/octet-stream`); honour `writeFrozen(db)` with `readOnlyResponse()`; map `isStorageFullError` to `storageFullResponse()`; never log request bodies, SQL parameters or message text.
- Authorization is enforced in SQL on every query (caller id in the `WHERE`), never only in the client.
- All user text is rendered with `textContent` or `escapeHtml`; links only as `http(s)` anchors with `rel="noopener noreferrer nofollow ugc" target="_blank"`.
- Reduced motion: every animation is gated on `preferences.reducedMotion` **and** `@media (prefers-reduced-motion: reduce)`.
- CSS prefixes: `.social-`, `.chat-`, `.apps-`. Reuse `src/theme.css` tokens and `ui-` components and `openSheet`.
- Limits (copy exactly): post body ≤280 code points, ≤4 photos; message ≤1000; display name ≤40; bio ≤160; report note ≤500; page size 20; upload body ≤4 MiB (4194304); max input side 10000 px, 40 MP.
- Rate limits: posts 30/h, likes 300/h, follows 100/day, friend requests 30/day, messages 30/min and 1000/day, reports 20/day, uploads 60/day, 100 MiB stored per account, global `QCC_MEDIA_MAX_TOTAL_BYTES` default 2147483648.
- Retention: text deleted 24 h after first view (mode `viewed`, default) or 7 days after sending (mode `week`); unviewed messages and unopened snaps are deleted 30 days after sending; saved messages are kept up to 90 days after saving; snaps can't be saved; pending media is purged after 1 h.
- Auto-hide: a post with ≥3 distinct reporters gets `hidden=true`.
- Never claim end-to-end encryption.
- Tests never contact real services; no content committed.

## Review Focus

1. **Cross-account access (BOLA):** a caller reads, opens, saves, unsends or reports another pair's conversation or message by id → 404 with no data. *(Task 4 test `rejects every action on a conversation the caller is not in`.)*
2. **Block during an active relationship:** B blocks A while they are friends and following each other → A can no longer send, see B's posts or profile, or re-request; existing follows and friendship rows are gone. *(Task 3 and Task 4 tests `block severs …`.)*
3. **Snap opened twice / sender opens own snap:** the second open returns 410, the sender gets 404, and the blob is deleted after the first open. *(Task 4 test `snap is single-use and recipient-only`.)*
4. **Malicious upload:** a PNG header followed by a ZIP, a 20000×20000 PNG, a truncated JPEG, an SVG, or a declared `image/png` that is really a GIF → 415 or 422 before full decode, with nothing stored. *(Task 2 tests `rejects …`.)*
5. **Polling while hidden or signed out:** a hidden tab or logged-out user makes no chat requests, and logout clears social/chat views and caches. *(Task 7 test `launcher stops polling when hidden or signed out`.)*

---

### Task 1: Foundation — migration, shared contracts, API helpers

**Files:**
- Create: `netlify/database/migrations/20261105090000_social_chat.sql`
- Create: `server/api.ts` (shared handler helpers)
- Create: `src/social/shared.ts`, `src/chat/shared.ts`, `src/media/policy.ts`, `src/media/store.ts`, `src/social/blocks.ts`
- Test: `tests/social/shared.test.ts`, `tests/database/social-chat-migration.test.ts`

**Interfaces (produced — later tasks use these exact names):**
- `server/api.ts`:
  - `export class HttpError extends Error { constructor(readonly status:number, readonly code:string, message:string, readonly headers?:Record<string,string>) }`
  - `export function respond(body:unknown, status?:number, extra?:Record<string,string>):Response` — JSON with `Cache-Control:no-store`, `X-Content-Type-Options:nosniff`.
  - `export async function readJson(request:Request, limit:number):Promise<unknown>` — streamed size cap → `HttpError(413)`, bad JSON → `HttpError(400)`.
  - `export function sameOrigin(request:Request):boolean`
  - `export async function rateLimit(query:Database['query'], subject:string, limit:number, seconds:number):Promise<void>` — atomically increments `account_attempts` (same UPSERT as `consume` in `src/accounts/server.ts`) and throws `HttpError(429,'rate_limited',…,{'Retry-After':…})` when `attempts>limit`.
  - `export function errorResponse(error:unknown, fallback:string):Response` — `HttpError`→its status/code/message, storage-full→507, else 503 `{error:fallback}`.
  - `export function cursorEncode(createdAt:string|Date,id:string):string` / `cursorDecode(value:string):{createdAt:string,id:string}|null` (base64url of `iso|id`).
- `src/social/shared.ts`: constants `POST_MAX_CHARS=280`, `POST_MAX_MEDIA=4`, `DISPLAY_NAME_MAX=40`, `BIO_MAX=160`, `REPORT_NOTE_MAX=500`, `PAGE_SIZE=20`, `AUTO_HIDE_REPORTS=3`, `REPORT_CATEGORIES=['spam','harassment','hate','sexual','self-harm','private-info','other'] as const`; `LIMITS` record with the rate limits from Global Constraints; `codePoints(text:string):number`; `validPostBody(body:unknown, mediaCount:number):body is string`; types `Author {username:string; displayName:string; avatar:string|null}`, `MediaRef {id:string; width:number; height:number; thumb:boolean}`, `PostView {id:string; author:Author; body:string; media:MediaRef[]; replyTo:string|null; replyToUsername:string|null; createdAt:string; likes:number; replies:number; liked:boolean; mine:boolean; deleted:boolean; hidden:boolean}`, `Page<T> {items:T[]; cursor:string|null}`, `ProfileView {username; displayName; bio; avatar:string|null; banner:string|null; joinedAt:string; followers:number; following:number; posts:number; followsYou:boolean; followedByMe:boolean; blockedByMe:boolean; mine:boolean}`, `ActivityItem {kind:'like'|'reply'|'follow'; actor:Author; postId:string|null; snippet:string|null; at:string}`, `SocialMe {profile:ProfileView; media:boolean}`.
- `src/chat/shared.ts`: `MESSAGE_MAX_CHARS=1000`, `RETENTION_MODES=['viewed','week'] as const`, `type Retention`, `EXPIRY={viewedHours:24, weekDays:7, unviewedDays:30, savedDays:90}`, `POLL_MS={conversation:4000, list:15000, badge:60000}`; types `Friend {username; displayName; avatar:string|null}`, `LastMessage {kind:'text'|'snap'|'system'; mine:boolean; viewed:boolean; at:string}`, `ConversationRow {friend:Friend; last:LastMessage|null; unread:number}`, `RequestRow {friend:Friend; at:string}`, `ChatList {friends:ConversationRow[]; incoming:RequestRow[]; outgoing:RequestRow[]}`, `MessageView {id:string; kind:'text'|'snap'|'system'; mine:boolean; body:string|null; snap:{opened:boolean}|null; createdAt:string; viewedAt:string|null; saved:boolean}`, `ConversationView {friend:Friend; retention:Retention; messages:MessageView[]}`, `ChatSummary {unread:number; requests:number}`.
- `src/media/policy.ts`: `type Purpose='post'|'snap'|'avatar'|'banner'`; `POLICIES:Record<Purpose,{maxEdge:number; floorEdge:number; targetBytes:number; maxBytes:number; thumbEdge:number|null; thumbMaxBytes:number; square:boolean}>` with post `{1600,1280,500*1024,1024*1024,480,50*1024,false}`, snap `{1440,1080,350*1024,1024*1024,null,0,false}`, avatar `{256,256,100*1024,150*1024,96,20*1024,true}`, banner `{1600,1200,300*1024,600*1024,640,60*1024,false}`; `QUALITY_LADDER=[82,76,70]`; `MAX_UPLOAD_BYTES=4194304`; `MAX_INPUT_SIDE=10000`; `MAX_INPUT_PIXELS=40_000_000`; `PENDING_TTL_MS=3600000`; `mediaKey(id:string, variant:'full'|'thumb'):string` → `${id}/${variant}`; `validMediaId(v:unknown):v is string` (`/^m_[a-f0-9]{32}$/`).
- `src/media/store.ts`: `interface MediaStore {put(key:string, bytes:Uint8Array):Promise<void>; get(key:string):Promise<Uint8Array|null>; delete(key:string):Promise<void>}`; `createMemoryStore():MediaStore & {keys():string[]}`; `createFileStore(dir:string):MediaStore`; `async function deleteMediaObjects(query, store:MediaStore|null, ids:string[]):Promise<void>` (deletes rows and both variants); `async function attachMedia(query, ownerId:string, ids:string[], purpose:Purpose):Promise<MediaRef[]>` — `UPDATE media_objects SET state='attached' WHERE id=ANY($ids) AND owner_id=$owner AND purpose=$purpose AND state='pending' RETURNING …`; throws `HttpError(400,'invalid_media')` unless every id is returned, preserving input order; `async function purgePendingMedia(query, store):Promise<void>` (pending older than `PENDING_TTL_MS`, batch 100).
- `src/social/blocks.ts`: `async function isBlockedEitherWay(query, a:string, b:string):Promise<boolean>`; `async function setBlock(query, blocker:string, blocked:string, on:boolean):Promise<void>` — on block: insert block, delete follows both ways, delete `chat_contacts` both ways; `async function accountByUsername(query, username:string):Promise<{id:string; username:string}|null>` (case-insensitive).

**Schema (exact tables; all FKs to `accounts(id) ON DELETE CASCADE` unless stated; end with `REVOKE ALL ON <new tables> FROM PUBLIC`):**
- `social_profiles(account_id uuid PK, display_name varchar(40) NOT NULL DEFAULT '', bio varchar(160) NOT NULL DEFAULT '', avatar_id text NULL, banner_id text NULL, updated_at timestamptz NOT NULL DEFAULT now())`
- `media_objects(id text PK CHECK (id ~ '^m_[a-f0-9]{32}$'), owner_id uuid NOT NULL, purpose text NOT NULL CHECK (purpose IN ('post','snap','avatar','banner')), state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','attached')), bytes integer NOT NULL CHECK (bytes>0 AND bytes<=1048576), thumb_bytes integer NOT NULL DEFAULT 0, width integer NOT NULL, height integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`; indexes `(owner_id, created_at)`, `(state, created_at)`.
- `social_posts(id uuid PK, author_id uuid NOT NULL, body text NOT NULL DEFAULT '' CHECK (char_length(body)<=280), reply_to uuid NULL REFERENCES social_posts(id) ON DELETE SET NULL, deleted boolean NOT NULL DEFAULT false, hidden boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now())`; indexes `(author_id, created_at DESC, id DESC)`, `(created_at DESC, id DESC) WHERE reply_to IS NULL`, `(reply_to, created_at)`.
- `social_post_media(post_id uuid REFERENCES social_posts(id) ON DELETE CASCADE, position smallint CHECK (position BETWEEN 0 AND 3), media_id text NOT NULL REFERENCES media_objects(id) ON DELETE CASCADE, PRIMARY KEY(post_id, position))`
- `social_likes(post_id uuid REFERENCES social_posts(id) ON DELETE CASCADE, account_id uuid, created_at timestamptz DEFAULT now(), PRIMARY KEY(post_id, account_id))`; index `(account_id, created_at DESC)`.
- `social_follows(follower_id uuid, followee_id uuid, created_at timestamptz DEFAULT now(), PRIMARY KEY(follower_id, followee_id), CHECK (follower_id<>followee_id))`; index `(followee_id)`.
- `social_blocks(blocker_id uuid, blocked_id uuid, created_at …, PRIMARY KEY(blocker_id, blocked_id), CHECK (blocker_id<>blocked_id))`; index `(blocked_id)`.
- `social_reports(id bigserial PK, reporter_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL, target_kind text CHECK (target_kind IN ('post','account','message')), target_id text NOT NULL, target_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL, category text NOT NULL CHECK (category IN (<7 categories>)), note varchar(500) NOT NULL DEFAULT '', snapshot varchar(1000) NULL, created_at …, resolved_at timestamptz NULL)`; unique index `(reporter_id, target_kind, target_id)`.
- `social_moderation_actions(id bigserial PK, target_kind text NOT NULL, target_id text NOT NULL, action text NOT NULL CHECK (action IN ('hide','restore','delete','dismiss')), note text NOT NULL DEFAULT '', moderator text NOT NULL, created_at …)`
- `chat_contacts(owner_id uuid, contact_id uuid, created_at …, PRIMARY KEY(owner_id, contact_id), CHECK (owner_id<>contact_id))`; index `(contact_id)`. A friendship exists when both directions exist.
- `chat_conversations(id uuid PK, a_id uuid NOT NULL, b_id uuid NOT NULL, retention text NOT NULL DEFAULT 'viewed' CHECK (retention IN ('viewed','week')), created_at …, CHECK (a_id<b_id), UNIQUE(a_id, b_id))`
- `chat_messages(id bigserial PK, conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE, sender_id uuid NULL REFERENCES accounts(id) ON DELETE CASCADE, kind text NOT NULL CHECK (kind IN ('text','snap','system')), body varchar(1000) NULL, media_id text NULL REFERENCES media_objects(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), viewed_at timestamptz NULL, saved_at timestamptz NULL, expires_at timestamptz NOT NULL)`; indexes `(conversation_id, id)`, `(expires_at)`.

- [ ] **Step 1: Write failing tests.** `tests/database/social-chat-migration.test.ts`: starts `NetlifyDB`, applies all migrations, asserts the 11 tables exist, the `CHECK (a_id<b_id)` rejects a reversed pair, `char_length(body)<=280` rejects 281 chars, and deleting an account cascades its posts and messages. `tests/social/shared.test.ts`: `codePoints('😀'.repeat(280))===280`; `validPostBody('',1)===true`; `validPostBody('',0)===false`; `validPostBody(' '.repeat(5),0)===false`; `validPostBody('x'.repeat(281),0)===false`; `cursorDecode(cursorEncode('2026-11-04T00:00:00.000Z',uuid))` round-trips; `cursorDecode('garbage')===null`; `validMediaId('m_'+'a'.repeat(32))`; and `rateLimit` throws 429 on call limit+1 against a real `NetlifyDB`.
- [ ] **Step 2: Run** `npx vitest run tests/social/shared.test.ts tests/database/social-chat-migration.test.ts` — expect FAIL (modules missing).
- [ ] **Step 3: Implement** the migration and modules above.
- [ ] **Step 4: Run** the same command — expect PASS; `npx tsc --noEmit` clean.

### Task 2: Media pipeline (server)

**Files:** Create `src/media/sniff.ts`, `src/media/process.ts`, `src/media/server.ts`; Modify `package.json` (add `sharp@0.35.5` dependency); Test `tests/media/sniff.test.ts`, `tests/media/process.test.ts`, `tests/media/server.test.ts` (fixtures generated in-test with Sharp and byte arrays — no binary fixtures committed).

**Interfaces:**
- Consumes: Task 1 `policy.ts`, `store.ts`, `server/api.ts`, `resolveAccount`.
- Produces: `sniffFormat(bytes:Uint8Array):'jpeg'|'png'|'webp'|'gif'|'heif'|'avif'|null`; `class MediaError extends Error {code:'unsupported_type'|'too_large'|'too_many_pixels'|'corrupt'|'cannot_compress'}`; `processImage(input:Uint8Array, purpose:Purpose):Promise<{full:Uint8Array; thumb:Uint8Array|null; width:number; height:number}>`; `createMediaHandler(db:Database, store:MediaStore|null, env?:{maxTotalBytes?:number}):(request:Request)=>Promise<Response>`.
- HTTP: `POST ?action=upload&purpose=<Purpose>` raw body → 201 `{id,width,height,bytes,thumb:boolean}`; `GET ?action=get&id=<id>&v=full|thumb` → `image/webp`. Purpose `snap` is never served by GET (404). Post media is served only when attached to a non-deleted, non-hidden post; avatar and banner only when set on a profile; pending media only to its owner (bearer). Public responses use `Cache-Control: public, max-age=31536000, immutable`; owner-only responses use `private, no-store`. A store of `null` gives 503 `{error:'media_not_configured'}`.
- Processing: `sniffFormat` is checked first (else `unsupported_type` → 415); then `sharp(input,{limitInputPixels:MAX_INPUT_PIXELS,failOn:'error',animated:false}).metadata()` checks sides ≤10000 (else `too_many_pixels` → 422); then pipeline `.rotate()` → resize (`fit:'inside', withoutEnlargement:true`; avatar: `fit:'cover', position:'attention'`, 256×256) → `.webp({quality, effort:4})` for each `QUALITY_LADDER` step until ≤`targetBytes`, then retry at `floorEdge`, accepting ≤`maxBytes`, else `cannot_compress` (422). The thumbnail uses quality 70 at `thumbEdge`. `sharp.cache(false)` and `sharp.concurrency(1)` are set on lazy import. Output never carries metadata (do not call `withMetadata`/`keepMetadata`).
- Quotas: `rateLimit('media:upload:'+id, 60, 86400)`; per-account sum(bytes+thumb_bytes) ≤ 100 MiB → 413 `quota_exceeded`; global sum > `maxTotalBytes` → 507 `storage_full`. `purgePendingMedia` runs on every upload.

- [ ] **Step 1: Failing tests** — `sniff.test.ts`: the magic bytes for each format; `'<svg'` → null; `'PK\x03\x04'` → null; a PNG signature with junk afterwards is still `png` (the decode step rejects it). `process.test.ts`: a 4000×3000 noisy JPEG with EXIF orientation 6 and GPS → output WebP with longest edge ≤1600, `width<height` (rotation applied), `sharp(out).metadata()` has no `exif` and no `icc`... (only check `exif` undefined), and ≤1 MiB; a 300×200 PNG is not upscaled (300×200 out); a PNG with alpha keeps `hasAlpha`; the avatar is exactly 256×256; a 20000×20000 PNG header (create with `sharp({create:{width:20000,height:20000,channels:3,background:'#000'}}).png({compressionLevel:9})`) → `too_many_pixels`; a truncated JPEG → `corrupt`; an animated GIF → a single-frame WebP. `server.test.ts` (real NetlifyDB + `createMemoryStore`): upload → 201 and the store holds `id/full` and `id/thumb`; a declared `image/png` with GIF bytes still works (content sniffed); SVG → 415; no token → 401; snap GET → 404; pending GET by a stranger → 404, by the owner → 200; store `null` → 503 `media_not_configured`; the 61st upload in a day → 429; a non-same-origin POST → 403.
- [ ] **Step 2: Run** `npx vitest run tests/media` — FAIL.
- [ ] **Step 3: Implement**; `npm i sharp@0.35.5` (record in package.json/lock).
- [ ] **Step 4: Run** `npx vitest run tests/media` — PASS; `npx tsc --noEmit` clean. Record encode times and bytes for the 4000×3000 fixture in `docs/social-chat/MEDIA_BENCHMARK.md` (a script run, not a claim).

### Task 3: Social API

**Files:** Create `src/social/server.ts`; Test `tests/social/server.test.ts`.

**Interfaces:** Consumes Task 1 (all) and `resolveAccount`. Produces `createSocialHandler(db:Database, store:MediaStore|null):(request:Request)=>Promise<Response>`.

Actions (`?action=`), all require a valid bearer (401 `{error:'Please log in again.'}` otherwise):
- GET `me` → `SocialMe` (creates no row; a missing profile reads as display name = username).
- GET `feed&tab=following|discover&cursor=` → `Page<PostView>`. Following = the caller's and followees' top-level posts and replies; Discover = top-level posts from everyone. Both exclude blocked-either-way authors, `deleted` posts without replies, and `hidden` posts unless they are the caller's.
- GET `thread&id=` → `{ancestors:PostView[]; post:PostView; replies:Page<PostView>}` (ancestors are oldest first, ≤20); 404 if the post is invisible to the caller.
- GET `profile&username=` → `ProfileView` (404 if not found or blocked either way). GET `posts&username=&kind=posts|replies|media|likes&cursor=` → `Page<PostView>`.
- GET `search&q=` (1–50 chars) → `{users:Author[]; posts:PostView[]}`.
- GET `activity` → `{items:ActivityItem[]}` (last 50, excluding blocked actors).
- POST `post {body:string, media?:string[], replyTo?:string}` → 201 `PostView` (rate limit `social:post`, 30/3600; `attachMedia` purpose post; a reply to an invisible or deleted post gets 404).
- POST `delete_post {id}` → `{ok:true}` (author only, else 404; tombstone when replies exist: `deleted=true, body=''`, media rows and blobs deleted; otherwise row delete).
- POST `like {id, on:boolean}` → `{likes:number, liked:boolean}` (idempotent; 300/3600).
- POST `follow {username, on}` → `{followedByMe:boolean, followers:number}` (self → 400; blocked → 404; 100/86400).
- POST `block {username, on}` → `{blockedByMe:boolean}` (uses `setBlock`).
- GET `blocks` → `{users:Author[]}`.
- POST `report {kind:'post'|'account', id?:string, username?:string, category, note?}` → `{ok:true}` (20/86400; a duplicate report by the same reporter is a no-op `{ok:true}`; after insert, when distinct reporters for a post ≥ `AUTO_HIDE_REPORTS`, set `hidden=true`).
- POST `profile {displayName?:string, bio?:string, avatarId?:string|null, bannerId?:string|null}` → `ProfileView` (UPSERT; `attachMedia` purposes avatar/banner; the replaced old avatar/banner is deleted from the store).
- POST `delete_all {confirm:'DELETE'}` → `{ok:true}` (performs the SPEC "Delete all my Social and Chat data" list in one transaction, then deletes the blobs).
- Unknown action → 404; wrong method → 405 with `Allow`.

- [ ] **Step 1: Failing tests** (real NetlifyDB; sign up accounts through `createAccountsHandler` like `tests/accounts/server.test.ts`): `post and read back in following and discover feeds`; `rejects 281 code points and empty text without media`; `cursor pagination returns 20 then the rest with no overlap`; `reply appears in thread and replies count increments`; `like is idempotent and counts once`; `follow adds author to following feed`; `block severs follows both ways and hides profile, posts and search results both ways`; `three distinct reports auto-hide a post except for its author`; `delete_post tombstones a post with replies and hard-deletes one without`; `cannot delete another user's post` (404); `cannot attach another account's media or a snap-purpose media to a post` (400); `delete_all removes profile, posts, likes, follows, messages and media`; `requests without a token get 401`; `cross-origin POST is 403`; `post rate limit returns 429 with Retry-After after 30`; `user text is returned verbatim (no HTML processing)`.
- [ ] **Step 2: Run** `npx vitest run tests/social/server.test.ts` — FAIL.
- [ ] **Step 3: Implement.** Use keyset pagination `(created_at,id) < ($c,$id)` ordered `created_at DESC, id DESC LIMIT 21` to detect the next page.
- [ ] **Step 4: Run** — PASS; `npx tsc --noEmit` clean.

### Task 4: Chat API

**Files:** Create `src/chat/server.ts`; Test `tests/chat/server.test.ts`.

**Interfaces:** Consumes Task 1; Produces `createChatHandler(db:Database, store:MediaStore|null):(request:Request)=>Promise<Response>` and `purgeExpiredChat(query, store):Promise<number>` (deletes `chat_messages` with `expires_at<=now()` in batches of 500, deleting snap blobs; also `purgePendingMedia`).

Actions (bearer required). Every action that names a friend resolves `accountByUsername`, then requires friendship (both `chat_contacts` rows) and no block, else **404 `{error:'not_found'}`**. Every message-id action joins `chat_conversations` with `(a_id=$me OR b_id=$me)`, else 404.
- GET `summary` → `ChatSummary`.
- GET `list` → `ChatList` (friends ordered by last activity desc).
- GET `messages&with=<username>&after=<id?>` → `ConversationView` (oldest first, ≤200, `id>after`); marks the caller's incoming unviewed **text** messages viewed: `viewed_at=now()` and, for mode `viewed`, `expires_at=least(expires_at, now()+24h)` unless saved.
- POST `request {username}` → always `{status:'sent'}` unless a mutual friendship now exists → `{status:'friends'}`. It inserts the caller's contact row only if the target exists, isn't self and isn't blocked either way; if the target already requested, the friendship completes (30/86400).
- POST `respond {username, accept:boolean}` → `{status:'friends'|'declined'}` (decline deletes the requester's row).
- POST `remove_friend {username}` → `{ok:true}` (deletes both contact rows; the conversation stays until it expires or is deleted).
- POST `send {to, kind:'text'|'snap', body?, mediaId?}` → 201 `MessageView` (rate limits `chat:msg:min` 30/60 and `chat:msg:day` 1000/86400; text 1–1000 chars; snap `attachMedia` purpose snap; `expires_at=now()+30 days`, or `+7 days` in mode `week`).
- POST `open_snap {id}` → `image/webp` body, `Cache-Control:no-store` (recipient only; already opened → 410 `{error:'opened'}`; the sender → 404). In one transaction: set `viewed_at`, compute expiry as for text, read the blob, delete the blob and `media_objects` row, and return the bytes.
- POST `save {id, on}` → `MessageView` (text only; either participant; on: `saved_at=now(), expires_at=now()+90 days`; off: recompute the normal expiry).
- POST `unsend {id}` → `{ok:true}` (sender only; deletes the row and any snap blob).
- POST `retention {with, mode}` → `ConversationView`; inserts a `system` message whose `body` is `'retention:'+mode` and recomputes `expires_at` for the conversation's unsaved messages.
- POST `delete_conversation {with}` → `{ok:true}` (deletes the conversation row, cascading messages, and deletes blobs).
- POST `report {messageId, category, note?}` → `{ok:true}` (copies `body` into `snapshot`; `target_kind='message'`, `target_account_id` = sender; you can't report your own message → 400).
- POST `block {username}` → `{ok:true}` (uses `setBlock`, on=true).
- `purgeExpiredChat` runs at the start of every request (after auth).

- [ ] **Step 1: Failing tests:** `friend request must be accepted before messaging` (send → 404 before accept); `request reply is identical for unknown, blocked and real users`; `rejects every action on a conversation the caller is not in` (third account C tries messages, save, unsend, open_snap and report on A↔B message ids → 404, and no rows change); `snap is single-use and recipient-only` (sender 404, first open 200 bytes, second 410, blob gone from the memory store); `viewing sets 24 h expiry in viewed mode and saved messages expire in 90 days` (assert `expires_at` deltas within 5 s); `week mode sets 7-day expiry and records a system line`; `purge removes expired messages and their snap media` (set `expires_at` in the past via SQL); `unsend only by sender`; `block severs friendship and refuses send, request and messages`; `unread summary counts incoming unviewed messages and pending requests`; `report snapshots message text`; `message rate limit 31st in a minute → 429`.
- [ ] **Step 2: Run** `npx vitest run tests/chat/server.test.ts` — FAIL.
- [ ] **Step 3: Implement** (canonical pair: `a_id=least, b_id=greatest`; create the conversation lazily on first send or `messages` read).
- [ ] **Step 4: Run** — PASS; `npx tsc --noEmit` clean.

### Task 5: Wiring, deployment docs, moderation runbook

**Files:** Create `netlify/functions/social.mts`, `chat.mts`, `media.mts`, `chat-purge.mts` (scheduled `@hourly`), `netlify/lib/media-store.mts` (Netlify Blobs store `qcc-media`, `@netlify/blobs` lazy import, returns `null` when Blobs are unavailable), `docs/social-chat/DEPLOYMENT.md`, `docs/social-chat/MODERATION.md`; Modify `functions/_middleware.ts` (`ROUTES` adds `social`,`chat`,`media`), `scripts/leaderboard-dev.mjs` (serve the three handlers with `createFileStore('.netlify/local-media')`, upload body cap 4 MiB), `package.json` (`@netlify/blobs`), `tests/pages/*` middleware test if one exists for ROUTES, `ARCHITECTURE.md` and `README.md` (short sections).
- Netlify configs: social and chat `rateLimit` 600/60 s per IP; media 60/60 s.
- [ ] Tests: extend the existing middleware test (find with `grep -rl "_middleware" tests`) to assert `social`, `chat` and `media` are proxied and `/.netlify/functions/other` is 404. Run `npx vitest run tests/pages` (or the file found) — PASS. `npx tsc --noEmit` clean.

### Task 6: Browser clients and text utilities

**Files:** Create `src/apps/api.ts`, `src/social/client.ts`, `src/chat/client.ts`, `src/media/client.ts`, `src/apps/text.ts`; Test `tests/apps/text.test.ts`, `tests/apps/clients.test.ts`.

**Interfaces:**
- `src/apps/api.ts`: `class AppApi {constructor(endpoint:string, token:()=>string|null, fetcher?:typeof fetch); get<T>(action:string, params?:Record<string,string>, signal?:AbortSignal):Promise<T>; post<T>(action:string, body:unknown, signal?:AbortSignal):Promise<T>}`; throws `ApiError {status:number; code:string; message:string; retryAfter:number|null}`; 8 s timeout; `cache:'no-store'`; it never retries non-GET requests.
- `SocialClient` methods mirror Task 3 one-to-one (`me()`, `feed(tab,cursor?)`, `thread(id)`, `profile(username)`, `posts(username,kind,cursor?)`, `search(q)`, `activity()`, `createPost(body,media,replyTo?)`, `deletePost(id)`, `like(id,on)`, `follow(username,on)`, `block(username,on)`, `blocks()`, `report(input)`, `updateProfile(input)`, `deleteAll()`), endpoint `.netlify/functions/social` (relative, works under a subpath).
- `ChatClient` mirrors Task 4 (`summary()`, `list()`, `messages(username,after?)`, `request(username)`, `respond(username,accept)`, `removeFriend(username)`, `send(to,input)`, `openSnap(id):Promise<Blob>`, `save(id,on)`, `unsend(id)`, `retention(username,mode)`, `deleteConversation(username)`, `report(messageId,category,note?)`, `block(username)`).
- `src/media/client.ts`: `prepareImage(file:Blob, purpose:Purpose, signal?:AbortSignal):Promise<Blob>` (`createImageBitmap(file,{imageOrientation:'from-image'})`; scale to `POLICIES[purpose].maxEdge`; never upscale; canvas area ≤16 MP; JPEG 0.9, or PNG when the source type is PNG; if decode fails (e.g. HEIC on Chrome) return the original file when ≤4 MiB, else throw `Error('This photo type can’t be read here. Try a JPEG or PNG.')`); `uploadImage(blob, purpose, token, {onProgress?:(fraction:number)=>void, signal?}):Promise<{id:string;width:number;height:number;thumb:boolean}>` via `XMLHttpRequest` with `upload.onprogress`; `mediaUrl(id:string, variant:'full'|'thumb'):string`; `type UploadStage='compressing'|'uploading'|'processing'|'ready'|'failed'`.
- `src/apps/text.ts`: `escapeHtml(s)`, `renderRichText(text:string):DocumentFragment` (links http(s) only, `@mentions` → `#/social/u/<name>`, `#tags` → `#/social/search?q=%23tag`; built with DOM nodes, never innerHTML), `relativeTime(iso:string, now?:number):string` (`now`, `45s`, `12m`, `3h`, `2d`, then `4 Nov`, with the year if different), `codePoints`.
- [ ] Tests (`environment: node`; for DOM functions add `// @vitest-environment jsdom` only if jsdom is installed, otherwise test string-level helpers): `renderRichText` never produces a `javascript:` href and escapes `<img onerror>`; `relativeTime` boundaries; `AppApi` sends `Authorization: Bearer`, maps 429 with `Retry-After`, and times out. Run `npx vitest run tests/apps` — PASS.

### Task 7: Shell integration — Apps launcher and routes

**Files:** Create `src/apps/launcher.ts`, `src/apps/launcher.css`, `src/apps/icons.ts` (from the design task's SVGs); Modify `src/main.ts` (a route branch for `#/social…` and `#/chat…` mirroring the movies branch: lazy `import('./social/view')` / `import('./chat/view')`, `leave()`, chrome handling, dispose on route away, `pause()` on study), `src/ui/navigation.ts` only if needed; Test `tests/apps/launcher.spec.ts`.
- The launcher: one `ui-tab` button **Apps** (icon `apps`) placed before Study in the tab bar. It opens a glass sheet (`openSheet`) with two large tiles, *QCC Social* and *QCC Chat*. Chat's tile and the tab carry an unread badge (`aria-label="Apps, 3 unread messages"`). The badge polls `chat.summary()` every `POLL_MS.badge` only when signed in and `document.visibilityState==='visible'`, and stops on logout (`accounts.onChange`).
- View contract (both views): `constructor(root:HTMLElement, deps:AppDeps)`, `navigate(hash:string):void`, `pause():void`, `resume():void`, `dispose():void`, where `AppDeps={accounts:AccountsClient; openAccounts:()=>void; reducedMotion:()=>boolean; openMenu:()=>void}` (define `AppDeps` in `src/apps/types.ts`).
- [ ] Playwright: `launcher opens Social and Chat routes and back`; `launcher stops polling when hidden or signed out` (count `chat?action=summary` requests via `context.route`); `Escape still opens Study from #/social` (existing Study behaviour preserved). Run `npx playwright test tests/apps/launcher.spec.ts --project=chromium` — PASS.

### Task 8: QCC Social UI

**Files:** Create `src/social/view.ts`, `src/social/components/*.ts` (post card, composer, media grid, profile header, sheet menus), `src/social/style.css`; Test `tests/social/social.spec.ts`.
- Routes: `#/social` (Following), `#/social/discover`, `#/social/post/<uuid>`, `#/social/u/<username>[/replies|/media|/likes]`, `#/social/search?q=`, `#/social/activity`, `#/social/settings` (edit profile, blocked list, delete all data).
- Follow `docs/social-chat/DESIGN.md` for layout, components, copy and motion. Composer: 280-code-point ring, photo attach (≤4) with `UploadStage` chips (Compressing → Uploading → Processing → Ready / Failed with Retry and Remove), Post disabled until valid and all media are ready. Optimistic like with rollback. A "New posts" pill appears when a refresh finds newer items. Infinite scroll via `IntersectionObserver`. Overflow menu: delete (own) / block / report (others). Signed-out state: intro + Log in button (`deps.openAccounts`).
- [ ] Playwright (real handlers via `context.route`, as `tests/accounts/accounts.spec.ts` does, with `createMemoryStore`): `two users: follow, post, see in following feed, like, reply, open thread`; `composer ring and limit`; `block hides the other user's posts`; `report menu submits`; `photo post uploads through pipeline and renders thumbnail` (`setInputFiles` with a generated PNG); `signed out shows log in prompt`; `phone (390×844) and desktop (1440×900) layouts have no horizontal scroll`. Run `npx playwright test tests/social --project=chromium` — PASS.

### Task 9: QCC Chat UI

**Files:** Create `src/chat/view.ts`, `src/chat/components/*.ts`, `src/chat/style.css`; Test `tests/chat/chat.spec.ts`.
- Routes: `#/chat` (list + requests), `#/chat/add`, `#/chat/with/<username>`.
- Follow DESIGN.md: chat list rows with original status glyphs (text vs snap; sent vs received; new vs opened), conversation with sender-labelled message groups, day separators, composer (text, photo-snap button), press-and-hold or menu to Save / Unsend / Report, view-once snap viewer (full-screen glass overlay, tap or hold to view, closes on release or after 10 s, then shows "Opened"), retention switch in the chat header menu, Delete chat, Block. Polling per `POLL_MS`, paused when hidden. A "not end-to-end encrypted" note in the chat info sheet.
- [ ] Playwright: `friend request, accept, exchange messages in two browser contexts`; `snap opens once`; `save keeps message, unsend removes for both`; `retention change shows system line`; `non-friend cannot be messaged (UI shows request flow)`; `phone and desktop layouts`. Run `npx playwright test tests/chat --project=chromium` — PASS.

### Task 10: Motion and visual verification pass (design agent)

- Apply DESIGN.md's motion spec with the `animate` skill: like burst, send, snap open, sheet and route transitions, new-posts pill, unread badge. Check reduced-motion fallbacks. Take screenshots at 390×844 and 1440×900 (light and dark if supported) into `docs/evidence/social-chat/` and review them against DESIGN.md. Fix defects.

### Task 11: Whole-branch review and verification

- `npm run check`, `npm test -- --maxWorkers=1`, `npx playwright test tests/apps tests/social tests/chat tests/accounts --project=chromium`, `npm run build`, `npm run verify:noindex`.
- An independent reviewer (`requesting-code-review`) covers security (BOLA, XSS, uploads), correctness and the Review Focus list; apply fixes per `receiving-code-review`.
