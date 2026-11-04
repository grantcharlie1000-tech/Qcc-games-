# QCC Social + QCC Chat: build summary (issue #110)

Two original first-party apps inside the arcade, built on the existing accounts.
**QCC Social** follows X's feature set: a chronological feed, short posts, replies, likes, follows and profiles.
**QCC Chat** follows Snapchat's Chat: friends only, messages that disappear, and view-once photos.
Neither copies their names, logos, icons, colours or wording. Both use the QCC glass design system.

Branches:

- `claude/social-chat-110`: the apps, the API, the schema, the tests and the docs (into `main`).
- `claude/backend-social-chat-110`: the same handlers wired into the Vercel backend (into `infra/backend-move`).

Screenshots: `docs/evidence/social-chat/` (phone 390×844 and desktop 1440×900), with motion frames in `docs/evidence/social-chat/motion/`.

## What a student can do

### QCC Social (`#/social`)
- **Feeds:** *Following* shows your posts plus everyone you follow. *Discover* shows all top-level posts. Both are newest first, with no ranking, and load more as you scroll. A "New posts" pill appears when newer posts arrive; the feed checks every 60 s while the tab is visible.
- **Posts:** up to 280 characters, with a ring that shows how much is left, and up to 4 photos. Links, @mentions and #tags are clickable. Only http(s) links are allowed, and they open safely in a new tab.
- **Threads:** open a post to see its parent chain and the replies, and reply in place. A deleted post with replies stays as "This post was deleted".
- **Likes:** they show at once and roll back if the server refuses. Rapid taps are serialised.
- **Profiles:** banner, avatar, display name, @username, bio, joined date and follower/following counts, with tabs for Posts, Replies, Photos and your own Likes. Follow and unfollow from the profile.
- **Search and Activity:** search people by username prefix and posts by text. Activity lists likes, replies and new followers.
- **Safety:**
  - **Report** a post or account. The categories are spam, harassment, hate, sexual, self-harm, private info and other. A self-harm report shows NZ support contacts. A post reported by 3 different people is hidden from everyone but its author until a moderator reviews it.
  - **Block** works both ways: neither person sees the other, and follows and friendships are removed.
  - **Settings** has Edit profile, the Blocked list, and Delete all my Social and Chat data.
- **Desktop shortcuts:** j and k move, o opens, n writes a new post, l likes, r replies, / searches, ? shows help. They never fire while typing or while a sheet is open.

### QCC Chat (`#/chat`)
- **Friends only:** send a request to an exact username; the reply always reads "Request sent", so nobody can probe which accounts exist. The other person accepts or declines. There are no suggestions and no directory.
- **Chat list:** incoming requests sit on top. Each friend shows an original status icon plus words: "New photo", "3 new messages", "Opened", "Sent", "Received", "Photo opened". Shapes, not only colours, tell text and photos, sent and received, and new and opened apart.
- **Conversation:** messages are grouped under the sender's name, with day separators and a "New" line. Sending shows the message straight away, with Retry if it fails. New messages arrive every 4 s while you're looking and are announced to screen readers.
- **Photos (snaps):** view once. Tap to open full-screen with a 10 s countdown ring. Once closed, the server has already deleted the photo and the row shows "Opened". The app says plainly that screenshots can't be blocked on the web.
- **Message menu** (long-press, right-click or the "…" button):
  - **Save in chat** keeps a text message up to 90 days.
  - **Unsend** deletes it for both people.
  - **Report** copies only that message's text for moderators.
- **Chat info:**
  - The retention switch: "24 hours after viewing" (the default) or "7 days after sending". Either friend can change it, and a note appears in the chat.
  - A "Not end-to-end encrypted" note.
  - Report a message.
  - Block, with a "Report a message first" option, because blocking closes the chat.
  - Remove friend and Delete conversation.
- **Retention rules:** a text message is deleted 24 h after it is viewed (or 7 days after sending, in that mode). Unviewed messages and unopened photos are deleted after 30 days, and saved messages after 90. Expired items disappear from reads straight away; the server deletes them on requests and in a scheduled job.

### Shell
- One **Apps** tab in the glass tab bar, beside Study. It opens a sheet with the QCC Social and QCC Chat tiles and shows a badge with Chat's unread count (1–9, then 9+). The tab stays hidden unless the server has the Chat API, so a backend without these routes shows nothing broken.
- Games, Movies & TV, Study and Escape→Study behave as before. Leaving an app view restores the library's scroll position.
- Reduced motion applies through both the system setting and the app's Menu → Reduce motion.

## How it works

| Layer | Files | Notes |
| --- | --- | --- |
| Schema | `netlify/database/migrations/20261105090000_social_chat.sql` | 12 tables (profiles, posts, post media, likes, follows, blocks, reports, moderation actions, chat contacts, conversations, messages, media objects) and their indexes. Account deletion cascades. **Approved; still to be applied by you.** |
| API helpers | `server/api.ts` | JSON responses, a streamed body cap, the same-origin check, per-account rate limits (stored in `account_attempts`), the error mapping and keyset cursors |
| Social API | `src/social/server.ts` | `/.netlify/functions/social?action=…`: me, feed, thread, profile, posts, search, activity, post, delete_post, like, follow, block, blocks, report, profile, delete_all |
| Chat API | `src/chat/server.ts` | `…/chat?action=…`: summary, list, messages, request, respond, remove_friend, send, open_snap, save, unsend, retention, delete_conversation, report, block |
| Media | `src/media/{sniff,process,server,store,policy,plan,client}.ts` | Browser preflight and shrink, then server re-encode with Sharp: magic-byte sniff, a 10,000 px side / 40 MP limit, EXIF rotate, metadata strip, and WebP at quality 82, then 76, then 70, with a smaller fallback size and a size ceiling. A thumbnail for feed photos. Storage goes through the `MediaStore` interface (Netlify Blobs, Vercel Blob private, file or memory) |
| Deploy | `netlify/functions/{social,chat,media,chat-purge}.mts`, `functions/_middleware.ts`, `scripts/leaderboard-dev.mjs` | Guarded by the environment marker, with per-IP limits: social and chat 600/min, media 1200/min. An hourly purge job. The Pages proxy allows the three new routes |
| UI | `src/apps/*`, `src/social/view.ts` + `components/`, `src/chat/view.ts` + `components/` | Lazy-loaded views (no cost to the games library), shared sheets, avatar, motion helper, upload chips and original SVG icons |

**Photo limits** (server-enforced):

| Purpose | Longest edge | Target size | Maximum |
| --- | --- | --- | --- |
| Post | 1600 px | ≤500 KiB | 1 MiB, plus a 480 px thumbnail |
| Snap | 1440 px | ≤350 KiB | 1 MiB |
| Avatar | 256×256 | ≤100 KiB | — |
| Banner | 1600 px | ≤300 KiB | — |

Uploads are capped at 4 MiB after the browser shrinks them. Each account gets 60 uploads a day and 100 MiB stored.

**Rate limits:**

| Action | Limit |
| --- | --- |
| Posts | 30 an hour |
| Likes | 300 an hour |
| Follows | 100 a day |
| Friend requests | 30 a day |
| Messages | 30 a minute, 1000 a day |
| Reports | 20 a day |
| Searches | 60 a minute |

**Whetū alignment:** the photo pipeline has been compared line by line with the Whetū implementation (kiakura `9208032`), and the 13 missing behaviours were ported with tests. See `docs/social-chat/WHETU_COMPARISON.md` (71 rows) and `MEDIA_BENCHMARK.md`.

## Safety and privacy (school-aged users)

- **Authorization is checked in SQL on every request.** Tests confirm that a third account gets 404, and no data changes, for every action on someone else's conversation.
- **Usernames can't be probed.** Friend request, remove friend and block answer the same way for unknown and real usernames.
- **XSS is covered.** User text is only ever set as text, never as HTML. Tests feed `<img onerror>` payloads through posts, display names, bios, search and messages.
- **Photos are private.** Snap photos are never served by a plain GET. Pending uploads are visible only to their owner. Public photos are cached for 10 minutes, so hiding or deleting one takes effect quickly.
- **Nothing is logged.** No message text, request body or SQL value is logged, and no user content goes into the repository.
- **No end-to-end encryption claim.** The app never claims it.
- **Moderation** is documented in `docs/social-chat/MODERATION.md`: an SQL runbook for operators, plus a safeguarding note.

## Verification (final commits)

| Check | Result |
| --- | --- |
| `npm run check` (TypeScript) | clean |
| `npm test` (Vitest, single worker) | 204 files, 4,271 tests passed. The Whetū port then added 151/151 passing in the media, apps, social and chat folders |
| `npm run build`, `verify:noindex` | pass |
| Playwright (chromium) | 490 passed, 0 failed, 7 skipped (screenshot generators) across apps, social, chat, accounts, Movies and the shell glass/viewport suites |
| Backend branch | `check:server`, `build:server`, `tsc` clean; 207 server, social, chat and media tests pass |

Four browser tests that already failed on `main` were fixed along the way: Globle overflowed the 390 px layout, two Movies tests had a stale game count, and one Movies test waited for a grid swap that never happens by design.

**Process:** Haiku agents built the reference packs (X patterns, Snapchat patterns, safety and media, the QCC design system). Opus produced the design spec, the icons, the mockups and the motion audit. Sonnet wrote the code. Each task had its own review and fix rounds; an Opus whole-branch review and a backend review followed.

## To turn it on

1. **Migration:** set `QCC_APPROVED_MIGRATIONS=20261105090000_social_chat` and deploy, preview first and then production. The migrate script refuses this migration without that variable.
2. **Photos on Vercel:** set `BLOB_READ_WRITE_TOKEN`, `QCC_MEDIA_MAX_TOTAL_BYTES` (sized to your Blob plan) and `CRON_SECRET`. Without them, text works and the photo buttons are hidden.
3. **Merge** `claude/social-chat-110` into `main` and `claude/backend-social-chat-110` into `infra/backend-move`.

## Not in this release

- Video, stories, group chats, reactions, typing indicators, push notifications and a moderator UI. They need decisions on object storage, a video worker and moderation staffing.
- On Vercel Hobby, the purge runs daily. Expired items are already hidden from reads; switch to hourly on Pro.
- The NZ helpline numbers in the self-harm card (111, 1737, Youthline 0800 376 633) should be checked by the school before release.
- Not yet tested on real phones or in WebKit/Safari.
