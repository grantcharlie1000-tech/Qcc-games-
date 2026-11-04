# QCC Social + QCC Chat: product spec and threat model

Source: [issue #110](https://github.com/grantcharlie1000-tech/Qcc-games-/issues/110). This file records phase 1 (product design,
threat model, retention and moderation). Choices that the issue leaves open are
**implementer decisions**, marked ⚑. The owner can change any of them; each is a
constant in `src/social/shared.ts`, `src/chat/shared.ts` or `src/media/policy.ts`.

QCC Social takes its *feature set and interaction model* from X: a chronological
following feed, short posts, threaded replies, likes, follows and profiles.
QCC Chat takes its feature set from Snapchat's Chat: friends-only conversations,
messages that disappear after they are viewed, view-once photo snaps and
status-coded chat rows. Neither app copies branding, wording, icons, colours,
logos or assets. Both are original QCC apps that use the existing glass design
system. Neither connects to, imports from or proxies any third-party account.

## Delivered in this change

| Area | In this change | Later phase |
| --- | --- | --- |
| Identity | Existing QCC accounts (stable `accounts.id`, public username). Social profile adds a display name, bio, avatar and banner | — |
| Social | Text posts (≤280 chars) with up to 4 photos, threaded replies, likes, follows, Following feed, Discover feed, user and post search, profiles, activity list, report, block, delete post, delete all my data | Video posts, short-video rail, stories, reposts, quote posts, bookmarks |
| Chat | Mutual-friend requests, 1:1 text, view-once photo snaps, unread counts, polling, per-chat retention, save-in-chat, unsend, report, block, delete conversation | Groups, reactions, typing indicators, read receipts beyond "Opened", push, realtime sockets, video snaps |
| Media | Shared photo pipeline: browser pre-shrink, server-authoritative Sharp re-encode to WebP, thumbnails, signature sniffing, bomb limits, metadata stripping, quotas, pending-upload purge | FFmpeg video worker and queue (design below; **not built**) |
| Shell | Lazy `#/social` and `#/chat` routes and one compact **Apps** launcher in the glass tab bar | — |

## Product decisions

### Access
- ⚑ Viewing Social requires a signed-in account. Guests see a short introduction and a **Log in / Sign up** button that opens the existing account sheet. This limits scraping and adult strangers browsing school users. It is stricter than the issue's minimum.
- Posting, liking, following and every Chat action require login; the server enforces this on every request.

### Social
- Post body: 1–280 characters after trimming (counted as Unicode code points), or 0 characters when at least one photo is attached. Up to **4 photos** per post.
- Replies are posts with `reply_to`. A thread view shows the parent chain (up to 20 ancestors) and the direct replies (paged).
- Feeds are strictly **chronological** (newest first) with keyset cursor pagination (`created_at,id`), 20 per page. *Following* = own posts + posts by accounts I follow. *Discover* = all visible top-level posts. No ranking algorithm.
- Follows are one-way and need no approval (as on X). ⚑ Private accounts are a later phase.
- Activity (derived, no extra table): the last 50 likes on my posts, replies to my posts and new followers.
- Search: usernames by prefix (case-insensitive, ≤20 results) and post text by substring (≤20 results, newest first). Blocked users are excluded both ways.
- Deleting a post deletes its likes and media. A post with replies becomes a tombstone ("This post was deleted"), so the thread stays readable. Otherwise the row is removed.

### Chat
- **Friends only.** A sends a request to B's exact username; B accepts, declines or blocks. Chat opens only when both rows exist. No suggestions, no "quick add" and no directory, which makes it harder to find minors.
- Text messages: 1–1000 characters. Snaps: one photo, **view once**. The recipient opens it, the server marks it opened and deletes the stored image in the same request. The sender never sees it again.
- ⚑ **Retention (explicit):**
  - Default mode **"After viewing"**: a text message is deleted from the server **24 hours after the recipient first views it**.
  - Mode **"7 days"**: messages are deleted **7 days after they were sent**, whether viewed or not.
  - Either friend can change the mode; a system line records the change in the chat.
  - **Unviewed** messages and **unopened snaps** are deleted **30 days** after sending.
  - **Save in chat** (press-and-hold or the message menu) keeps a text message until it is unsaved, **up to 90 days**. Snaps cannot be saved.
  - **Unsend**: the sender can delete any of their messages for both people at any time.
  - **Delete conversation** removes every message in the conversation for both people, together with snap images not yet opened.
  - The server purges expired rows on every Chat request (bounded batches). The Netlify adapter also runs as a scheduled function each hour.
- Unread count: incoming messages not yet viewed. The Apps launcher shows a dot with the count.
- Polling (no sockets in the MVP): 4 s on an open conversation, 15 s on the chat list, 60 s for the launcher badge. Polling stops while the tab is hidden.
- Copy says plainly that messages are **not end-to-end encrypted** and that reported messages can be reviewed by QCC moderators. End-to-end encryption is never claimed.

### Blocking and reporting (both apps)
- Block is mutual in effect. Neither person sees the other's posts, profile or search result. Follows in both directions are removed, any friendship and pending request is removed, and messaging is refused. Unblock restores visibility only; follows and friendships are not restored.
- Report categories: spam, harassment or bullying, hate, sexual content, self-harm, private information, other (with an optional note ≤500 chars).
- A reported message's text is **copied into the report** at report time, so moderators can still read it after the message expires. The report keeps nothing else from the conversation.
- ⚑ **Auto-hide threshold:** a post reported by **3 distinct accounts** is hidden from everyone except its author ("Hidden while reviewed") until a moderator resolves it. Moderation actions are recorded in `social_moderation_actions`. The operator SQL runbook is in [MODERATION.md](MODERATION.md); a moderator UI is a later phase.

### Deletion
- **Delete all my Social and Chat data** (Social settings) removes the caller's profile, posts (tombstones stay for threads), likes, follows, blocks they made, friendships, requests, sent messages, conversations and media. Reports they filed stay with the reporter field set to null; reports about them stay for moderation.
- Deleting a QCC account cascades through every table through foreign keys.

## Quotas and rate limits (⚑ starting values)

| Action | Limit |
| --- | --- |
| Posts + replies | 30 / hour / account |
| Likes | 300 / hour |
| Follows | 100 / day |
| Friend requests | 30 / day |
| Messages | 30 / minute, 1000 / day |
| Reports | 20 / day |
| Photo uploads | 60 / day, stored total ≤ 100 MiB / account (media still stored) |
| Global media budget | `QCC_MEDIA_MAX_TOTAL_BYTES` (default 2 GiB); uploads return 507 above it |

Counters reuse `account_attempts` (`subject = 'social:post:'+account_id`, etc.), so they need no new table. Netlify function limits are 600 requests per IP per minute for social and chat, and 60 for media.

## Media pipeline (photos)

The Whetū (`kiakura`) photo code was requested as the source. **This session could not access the private repository** (adding it was refused), so the module is a clean-room implementation of the behaviour the issue describes. It should be compared with the Whetū files before release.

1. **Browser** (`src/media/client.ts`): `createImageBitmap(file,{imageOrientation:'from-image'})` → canvas shrink to the purpose's longest edge → JPEG 0.9 (PNG with transparency stays PNG) with cancel (`AbortController`) and upload progress (`XMLHttpRequest.upload`). HEIC decodes where the browser can (Safari); elsewhere the original goes to the server, which can decode HEIC only if its Sharp build supports it, and otherwise returns a clear error. This step is only an optimisation.
2. **Server** (`src/media/server.ts`, Sharp lazy-imported): read the body up to 4 MiB (below Vercel's 4.5 MB request limit). Sniff magic bytes (JPEG, PNG, WebP, GIF, HEIC/HEIF, AVIF), ignore the declared type, reject polyglots or unknown formats, and read the header dimensions first (max side 10,000 px, max 40 MP). Then `sharp(input,{limitInputPixels:40e6,failOn:'error',animated:false}).rotate()`, resize `fit:'inside',withoutEnlargement`, encode WebP with the quality ladder **82 → 76 → 70**, then reduce the edge to the purpose floor, then fail. Metadata (EXIF, GPS, ICC except sRGB conversion) is stripped. Animated GIF/WebP keep only the first frame (⚑ policy).
3. **Policies** (`src/media/policy.ts`):

| Purpose | Longest edge (floor) | Target | Hard max | Thumbnail |
| --- | --- | --- | --- | --- |
| post | 1600 (1280) | 200–500 KiB | 1 MiB | 480 px, ≤50 KiB |
| snap | 1440 (1080) | 150–350 KiB | 1 MiB | none (view once) |
| avatar | 256×256 centre crop | ≤100 KiB | 150 KiB | 96 px |
| banner | 1600 wide (1200) | ≤300 KiB | 600 KiB | 640 px |

4. Only processed derivatives are stored, through the `MediaStore` interface: Netlify Blobs on Netlify, memory in tests, files under `.netlify/local-media` in `dev:online`. Originals are never written. An upload is **pending** until a post, profile or message attaches it; pending uploads older than 1 hour are purged. Without a configured store, media actions return 503 `media_not_configured`, the UI hides photo buttons, and text keeps working.
5. Retrieval: public post, avatar and banner media are served by unguessable id with `Cache-Control: public, max-age=600` (short so moderation and deletion take effect within 10 minutes), unless the post is hidden, deleted or the viewer is blocked (those require a signed-in request). Snap media are never served by GET; they come only through the authenticated, recipient-only, single-use `open_snap` action with `no-store`.

### Video (later phase, not built)
Video needs object storage with signed direct uploads, plus an FFmpeg worker on a queue. Serverless request bodies and timeouts cannot do it. Target: 720p, ≤30 fps, H.264/AAC MP4 with `+faststart`, CRF 28–32 and a ~0.6–1.2 Mbps cap, an optional 480p variant, a WebP poster, ≤60 s, metadata stripped, originals deleted after conversion. That needs an owner decision on the object store (for example Cloudflare R2 or Vercel Blob) and the worker host before work begins.

## Threat model (school-aged users)

| Threat | Mitigation in this change |
| --- | --- |
| Grooming / unwanted contact by strangers | Friends-only Chat with mutual acceptance; no suggestions or directory; exact-username requests limited to 30 a day; block removes the friendship and refuses future requests |
| Broken object-level authorization (OWASP API1) | Every Chat query is scoped by `conversation_id` **and** membership of the caller (`a_id=$me OR b_id=$me`) in SQL; snaps open only for the recipient; media GET checks attachment visibility; tests cover cross-account access attempts for every action |
| Harassment / pile-ons | Block (two-way invisibility), report, auto-hide after 3 reports, rate limits on replies |
| Spam / flooding | Per-account rate limits, body size limits, IP limits at the function edge |
| Image abuse | Report categories, auto-hide, view-once snaps that the server deletes on open, metadata stripping, and copy that warns that screenshots cannot be prevented on the web |
| Location / private info leaks | GPS and EXIF stripped server-side; no location features; "private information" report category |
| Malicious files (polyglot, decompression bombs, parser exploits) | Magic-byte sniff, header dimension check before decode, Sharp `limitInputPixels`, `failOn:'error'`, 4 MiB body cap, WebP-only output, served with `nosniff` and an exact `Content-Type` |
| Account enumeration | Social requires login; profile lookups are rate-limited; friend requests answer the same way whether or not the user exists and has blocked you |
| XSS through user content | All user text is rendered with `textContent` or escaped; links are detected and rendered as `rel="noopener noreferrer nofollow ugc"` anchors with http(s) only |
| Data in public GitHub | No content in the repo; tests use in-process databases; logs never include bodies |
| Over-retention | Explicit Chat retention with purges; post delete; delete-all-my-data |

Proxy: the Cloudflare Pages middleware forwards only `/.netlify/functions/{accounts,leaderboard,turn,social,chat,media}`. The separately deployed backend (Vercel `infra/backend-move`) must add the same three handlers before the new routes work in that production path. See [DEPLOYMENT.md](DEPLOYMENT.md).
