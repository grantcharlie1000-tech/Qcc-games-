# Optional accounts

Accounts use only a public username and password. There is no email collection and forgotten passwords cannot be recovered. Guest play and saves remain local; publishing leaderboard scores requires a valid account session. The account prompt precedes the Study chooser; choosing either an account or guest continues the existing Study flow. A remembered guest choice suppresses only the account prompt.

## Storage and identity

Sign-up imports settings, favourites and non-leaderboard game progress. Scored guest runs and bests stay separate, and historical guest leaderboard scores are never migrated by signup. Login to an existing account does **not** import guest scores or saves: on a shared school device those may belong to someone else. The guest's saves and Corn Clicker backups are held separately and restored on logout. Account leaderboard requests use the session identity and immutable username, never the guest token.

A user-initiated account transition saves and disposes the active game. Other tabs dispose the old instance without writing into the new identity’s storage; if Study is open they retain the article and remount the game on return. Account gameplay keys, timestamps, Corn Clicker tab lock/backups and account leaderboard caches are removed on logout/switch. Guest progress is then restored. Only progress not acknowledged by the server (including oversized valid snapshots) is staged separately by case-insensitive username, and is loaded only after successful authentication to that same account; another account and guest play never read it. As with all localStorage saves, someone inspecting the browser's origin storage can see staged data; it is not encrypted storage or protection from device inspection. Successfully synced staging is removed. Clearing browser storage deletes any unsent progress.

A session is stored through core/storage. Logout removes its raw token immediately after the final sync attempt. Offline server revocation retries retain only the SHA-256 digest, accepted by the server exclusively to revoke an existing session; that digest cannot authenticate or fetch saves. Server sessions expire after a fixed 60 days even if this browser never reconnects.

## Sync

The allowlist consists of `best:<game>`, `save:<game>`, settings and favourites. Corn Clicker's main farm is already `save:corn-clicker` in the shell namespace, so it follows the same sync path. Its tab lock and rolling backups are never synced. Movies, Study session choices, offline metadata and leaderboard browser tokens are excluded.

Each transfer record contains `{value,updated}`. Best scores merge by maximum; favourites, settings and game snapshots by latest timestamp. Equal timestamps have a deterministic JSON lexical tie break. Snapshot envelope timestamps must equal record timestamps. Old snapshots without timestamps acquire zero, so a dated server snapshot wins. Settings/best/favourite writes persist update timestamps. Favourites can be removed on any device; a newer removal wins on every subsequent sync. Guest favourites are imported only at sign-up.

An existing-account login must authenticate and pull its server saves before changing browser identity; if that first pull fails, guest data is preserved and the new session is revoked (or its hash queued for revocation). An already signed-in browser can continue playing offline. Sync pushes only records differing from the last server acknowledgement. Local writes debounce for 5 seconds with a 20-second maximum wait; login/logout, reconnect, pagehide and visibility hidden flush immediately. An idle visible tab pulls with GET at most once per 60-second periodic tick; hidden tabs skip periodic requests. The server merges and upserts only submitted keys and returns the full merged set. Sync never blocks gameplay; errors retain local progress and retry. Save records are batched below the request cap. The shell's pagehide handler saves synchronously before requesting account sync and sends small keepalive batches below 60,000 bytes; larger snapshots rely on periodic/reconnect sync because browsers cap outstanding keepalive data around 64 KiB. In-flight responses are ignored after identity changes. New remote snapshots are stored for the next mount rather than replacing a game while it is being played.

## Measured size limits

A record is limited to **1 MiB of UTF-8 JSON**; streamed request bodies are limited to **2 MiB**, including envelope overhead. An oversized/incompatible key stays local and produces a menu notice; other keys still sync. This is a bounded sync facility, not unlimited world storage. The database text cap allows Postgres JSON formatting expansion.

Measured on the actual serializers with fixed clock `1793000000000` and seed 1, including shell and transfer envelopes:

| Sample | Bytes |
| --- | ---: |
| Corn Clicker fresh state | 1,470 |
| Corn Clicker every upgrade, permanent upgrade, achievement and discovered variety | 4,916 |
| Blockcraft 10,000 edits encoded with `encodeEdits` | 40,166 |
| Blockcraft maximum 200,000 edits encoded with `encodeEdits` | 800,232 |

The Blockcraft sample includes version, seed, creative settings and empty systems; a real populated world adds player, inventory, entities and other systems. The 1 MiB cap provides headroom above its maximum edit payload, but unusually large systems may still exceed it and remain local.

To reproduce, load `src/games/corn-clicker/state.ts`, `data.ts` and `src/games/blockcraft/world/world.ts` using Vite `ssrLoadModule`. Serialize `freshState(clock,1)`; populate its sets from `upgradeById.keys()`, `permById.keys()`, `achievementById.keys()` and `VARIETIES.map(v=>v.id)` for the unlocked sample. For Blockcraft, construct maps of voxel indices to block 1, split into at most 30,000 edits per chunk, call `encodeEdits(chunk,0,map)` and include the resulting strings in `{version:2,seed:1,settings:{mode:'creative'},edits,systems:{}}`. Measure `Buffer.byteLength(JSON.stringify({value:{version:1,data,updated:clock},updated:clock}))`.

Auth and sync responses are `no-store`. The service worker only caches its explicit static manifest and excludes functions; no auth or sync response enters an offline pack.

## Server security

Passwords use Node scrypt with N=16384, r=8, p=1, a random 16-byte salt and 64-byte derived key in a self-describing string. Verification uses timingSafeEqual and unknown usernames run the same dummy derivation. Sessions contain 32 random bytes with an `acct_` prefix; only their SHA-256 digest is stored server-side. Legacy guest leaderboard tokens have no prefix and cannot authenticate account routes or submit scores. The leaderboard validates the account session inside the score-write transaction; revoked or expired sessions return 401 and the dialog offers login recovery.

Persistent database counters allow ten failed logins per trimmed, case-insensitive username and 100 failed logins per platform client IP in 15 minutes. Successful logins do not increment counters and reset the username counter. Sign-ups allow 60 attempts per IP per hour. Transaction-scoped database locks serialize concurrent checks before password derivation, so parallel requests cannot bypass a limit. Limits return 429 and Retry-After; Netlify allows 600 account requests per IP per minute. Expired sessions and old attempt counters are deleted opportunistically during authentication. Taken usernames are checked before scrypt, with the unique index still handling concurrent sign-ups. State-changing requests check origin, require JSON and bound streamed body bytes; auth bodies are limited to 2 KiB. SQL is parameterized; save merges take a per-account transaction lock. Tables revoke all public grants.

Account leaderboard entries display a text “account” marker in both leaderboard views, including their accessible cell text. Historical guest rows keep their existing nicknames; this policy change does not delete or rewrite them. The marker distinguishes account identities without treating a matching nickname as ownership.
