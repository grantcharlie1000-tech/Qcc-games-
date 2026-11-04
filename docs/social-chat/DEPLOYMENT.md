# QCC Social and QCC Chat: deployment

Design and policy are in [SPEC.md](SPEC.md). This page is the operator checklist.

## Routes

Same-origin Functions, all under `/.netlify/functions/`:

| Route | Handler | Netlify rate limit (per IP) |
| --- | --- | --- |
| `social` | `src/social/server.ts` via `netlify/functions/social.mts` | 600 / 60 s |
| `chat` | `src/chat/server.ts` via `netlify/functions/chat.mts` | 600 / 60 s |
| `media` | `src/media/server.ts` via `netlify/functions/media.mts` | 60 / 60 s |

`netlify/functions/chat-purge.mts` is a scheduled function (`@hourly`). It deletes expired chat messages and their snap media, and stale pending uploads, in batches (up to 20 rounds per run). It logs only counts.

## Cloudflare Pages proxy

`functions/_middleware.ts` now allows `accounts`, `leaderboard`, `turn`, `social`, `chat` and `media`. Everything else under the prefix still returns 404. Upload `Content-Type` (`image/*`) is forwarded because `Content-Type` is already an allowed request header. The proxy has a 10 s upstream timeout, which suits the 4 MiB upload limit on normal connections. See [BACKEND_HOSTING.md](../BACKEND_HOSTING.md).

## Database migration (owner approval required)

`netlify/database/migrations/20261105090000_social_chat.sql` creates the Social, Chat and media tables. **Do not apply it without the owner's approval.** Apply it separately to the production database and to the preview database, and confirm each before the matching deploy goes live. The handlers answer 503 until the tables exist.

## Media storage

Netlify uses a Netlify Blobs store named `qcc-media` (strong consistency) through `netlify/lib/media-store.mts` (`@netlify/blobs` 11.1.7, lazily imported). If Blobs is unavailable, the adapter returns `null`. Media actions then answer 503 `media_not_configured`, the UI hides photo buttons, and text keeps working. Only processed WebP derivatives are stored.

The separately deployed Vercel backend (`infra/backend-move`) must add the same three handlers (`social`, `chat`, `media`) and a `MediaStore` adapter. The store is an owner decision (for example Vercel Blob or Cloudflare R2). Until then media stays disabled on that path while text works. It must also run the hourly purge (a cron calling `purgeExpiredChat` and `purgePendingMedia`).

## Environment

| Variable | Meaning |
| --- | --- |
| `QCC_MEDIA_MAX_TOTAL_BYTES` | Global media budget in bytes. Default 2 GiB. Uploads return 507 above it. |

## Sharp runtime

Photo processing uses Sharp (lazy-imported on the first upload). It needs its native binary at runtime: the linux-x64 prebuilt package. `netlify.toml` sets `[functions] external_node_modules = ["sharp"]` so the bundler leaves Sharp and its native package in `node_modules`. After deploy, check that an upload works. A bundle without the native binary fails uploads only. If that happens, add the platform package to `included_files`.

## Verify after deploy

Replace `$SITE` with the site origin. No secrets are needed.

```sh
# 401 JSON: the handler is live and requires login
curl -si "$SITE/.netlify/functions/social?action=me" | head -n 1
curl -si "$SITE/.netlify/functions/chat?action=summary" | head -n 1
# 404 JSON for an unknown media id (or 503 media_not_configured when no store)
curl -si "$SITE/.netlify/functions/media?action=get&id=m_00000000000000000000000000000000"
# Disallowed routes stay closed (Pages proxy): expect 404
curl -si "$SITE/.netlify/functions/social/extra" | head -n 1
```

Then sign in, post, upload a photo, and send a snap between two test accounts. Check the Netlify function log for the hourly `QCC chat purge` line.

## Local development

`npm run dev:online` serves all three routes with a local database and files under `.netlify/local-media` (gitignored). Upload bodies are capped at 4 MiB.
