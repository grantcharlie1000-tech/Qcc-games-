# QCC Social and QCC Chat: deployment

Design and policy are in [SPEC.md](SPEC.md). This page is the operator checklist.

## Routes

Same-origin Functions, all under `/.netlify/functions/`:

| Route | Handler | Netlify rate limit (per IP) |
| --- | --- | --- |
| `social` | `src/social/server.ts` via `netlify/functions/social.mts` | 600 / 60 s |
| `chat` | `src/chat/server.ts` via `netlify/functions/chat.mts` | 600 / 60 s |
| `media` | `src/media/server.ts` via `netlify/functions/media.mts` | 1200 / 60 s |

The media limit is high because image GETs (avatars, post photos) share the bucket and a school's students usually share one NAT IP. Uploads are limited separately to 60/day per account, and public GETs are cacheable.

`netlify/functions/chat-purge.mts` is a scheduled function (`@hourly`). It deletes expired chat messages and their snap media, stale pending uploads, and orphaned media (attached rows older than an hour that nothing references, `sweepOrphanMedia`), in batches (up to 20 rounds per run). Blobs are deleted before rows, so a failed blob delete leaves the row for the next run. It logs only counts.

## Cloudflare Pages proxy

`functions/_middleware.ts` now allows `accounts`, `leaderboard`, `turn`, `social`, `chat` and `media`. Everything else under the prefix still returns 404. Upload `Content-Type` (`image/*`) is forwarded because `Content-Type` is already an allowed request header. The proxy has a 10 s upstream timeout, which suits the 4 MiB upload limit on normal connections. See [BACKEND_HOSTING.md](../BACKEND_HOSTING.md).

## Database migration (owner approval required)

`db/migrations/20261105090000_social_chat.sql` creates the Social, Chat and media tables. **Do not apply it without the owner's approval.** On the standalone Neon backend, apply it with the migration tooling (`npm run db:status`, then `npm run db:migrate -- --expect-env <production|preview>`; see [DATABASE.md](../DATABASE.md)). Run it separately for the production database and for the preview database, and confirm each before the matching deploy goes live. The handlers answer 503 until the tables exist.

## Media storage

Netlify uses a Netlify Blobs store named `qcc-media` (strong consistency) through `netlify/lib/media-store.mts` (`@netlify/blobs` 11.1.7, lazily imported). If Blobs is unavailable, the adapter returns `null`. Media actions then answer 503 `media_not_configured`, the UI hides photo buttons, and text keeps working. Only processed WebP derivatives are stored.

### Vercel backend (implemented)

The Vercel backend serves `/api/social`, `/api/chat` and `/api/media` from `server/app.ts` and stores photos through `server/media-store.ts` (Vercel Blob, `@vercel/blob` 2.8.2). To turn it on:

1. Get the owner's approval, then apply `20261105090000_social_chat.sql` to production and, separately, to preview.
2. Create a Vercel Blob store and connect it to the project (this sets `BLOB_READ_WRITE_TOKEN`). Without the token media stays disabled (503 `media_not_configured`) while text works.
3. Set `CRON_SECRET`, and optionally `QCC_MEDIA_MAX_TOTAL_BYTES`.
4. Deploy. `vercel.json` registers the purge cron for `/api/chat-purge` (Bearer `CRON_SECRET`; 401 otherwise).

Privacy: blobs are private (`access: 'private'`), have no public URL, and are served only through the authenticated media handler. The purge runs **daily** (`7 3 * * *`) because Vercel Hobby allows only daily cron; use `7 * * * *` on Pro for the hourly cadence above. Expired messages are filtered at read time, so the delay only postpones deletion. Details are in [BACKEND_HOSTING.md](../BACKEND_HOSTING.md#qcc-social-chat-and-media-on-vercel).

## Deleting an account directly in SQL

The app has no account-deletion UI. Deleting an `accounts` row cascades the account's `media_objects` rows, so their blobs would be orphaned with no row to find them. Remove the blobs first. List the account's media ids, delete both variants of each (snippet in [MODERATION.md](MODERATION.md#remove-an-accounts-data)), then delete the account:

```sql
SELECT id FROM media_objects WHERE owner_id='<account id>';
-- delete <id>/full and <id>/thumb from the media store for each id, then:
DELETE FROM accounts WHERE id='<account id>';
```

Snaps the account's friends sent into their shared conversations cascade with the conversation; their media rows survive as unreferenced and are removed by the hourly orphan sweep.

## Environment

| Variable | Meaning |
| --- | --- |
| `QCC_MEDIA_MAX_TOTAL_BYTES` | Global media budget in bytes. Default 2 GiB. Uploads return 507 above it. |
| `BLOB_READ_WRITE_TOKEN` | Vercel backend only. Enables the Vercel Blob media store. |
| `CRON_SECRET` | Vercel backend only. Bearer secret for `/api/chat-purge`. |

## Sharp runtime

Photo processing uses Sharp (lazy-imported on the first upload). It needs its native binary at runtime: the linux-x64 prebuilt package. `netlify.toml` sets `[functions] external_node_modules = ["sharp"]` so the bundler leaves Sharp and its native package in `node_modules`. After deploy, check that an upload works. A bundle without the native binary fails uploads only. If that happens, add the platform package to `included_files`. On Vercel, Sharp stays external in the esbuild bundle and `npm ci` installs it, so nothing extra is needed.

## Verify after deploy

Replace `$SITE` with the site origin. No secrets are needed.

```sh
code() { curl -s -o /dev/null -w '%{http_code}\n' "$@"; }
code "$SITE/.netlify/functions/social?action=me"        # expect 401 (login required)
code "$SITE/.netlify/functions/chat?action=summary"     # expect 401
code "$SITE/.netlify/functions/media?action=get&id=m_00000000000000000000000000000000"  # expect 404 (503 if no media store)
code "$SITE/.netlify/functions/social/extra"            # expect 404 (route not allowed)
```

Then sign in, post, upload a photo, and send a snap between two test accounts. Check the Netlify function log for the hourly `QCC chat purge` line.

## Local development

`npm run dev:online` serves all three routes with a local database and files under `.netlify/local-media` (gitignored). Upload bodies are capped at 4 MiB.
