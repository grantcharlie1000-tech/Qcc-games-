# Sync traffic implementation plan

**Goal:** Deliver the user's A–G requirements without changing the database integration or losing existing data.

**Architecture:** Keep the pg-style handlers, localStorage envelopes and existing merge rules. Add an explicitly opted-in v2 delta protocol, transactionally assigned per-account revisions (including legacy writes), durable client metadata and retry scheduling. Keep v1 snapshots intact. Separate cacheable public rankings from private own-rank reads.

**Constraints:** Work on `qcc-sync-neon`, no push; no changes outside this repository except the requested temporary main measurement worktree. Preserve all rows and timestamps in an additive migration after `20261028002000`. Never output credentials or saves. Preserve 1 MiB write/2 MiB request caps; accept existing larger server records on reads.

## Tasks

- [x] Server: first add real-database failing tests for revision assignment, v1/v2 compatibility, conflict convergence, replay, small deltas, migration preservation, conditional session touches and read-only freeze. Implement the migration, protocol and freeze helper; verify targeted server tests.
- [x] Client: first add storage/content and v2 fake-clock tests for three-minute batching, idle/hidden silence, durable restart, in-flight edits, read-only/network retry and identity isolation. Implement stable content comparison, revision/hash metadata, durable pending staging and lifecycle/manual sync.
- [x] Leaderboard: first test public/private separation and cache headers, SQL no-ops, retry and timer behavior. Split opted-in reads, preserve old responses, remove sidebar polling and retry pending submissions with backoff.
- [x] Measurement: build the reproducible local DB/handler/browser harness; measure the same five flows on unmodified main and this branch. Record counts, body bytes, fixture limits and small-update payload assertions.
- [x] Integration: run TypeScript, all Vitest, production build, focused Chromium/WebKit browser tests, then full Chromium/WebKit. Reproduce unrelated failures against main. Obtain independent review and resolve findings. Document protocol/results and commit a few logical changes.

## Shared protocol

`X-QCC-Sync: 2`; GET `?action=sync&cursor=<decimal bigint>`; PUT `{cursor,bases,saves}`. Response `{protocolVersion:2,cursor,saves,revisions,acks,conflicts}`. Revisions and cursor are decimal strings. `acks[key]` carries the accepted revision without echoing its value; `revisions` covers returned and acknowledged keys. Conflicts carry authoritative records after applying the existing deterministic merge. Account-row locking makes cursor and delta a consistent transaction snapshot. Clients only clear a pending record if its current content still matches the sent content.

## Review focus

- Old deployed writes must also advance revisions, without changing v1 response shape.
- Crashes between local write, network commit and acknowledgement must replay safely.
- Equal timestamps, reordered JSONB properties and lower/equal best scores must converge.
- Another identity or tab must never inherit pending progress or delayed responses.
- Freeze reads must avoid session touches; retry deadlines must survive reload and manual/lifecycle triggers.

The user's detailed task is the approved specification and execution authorization. Native implementation proceeds in the current requested branch; independent server, leaderboard and measurement tasks are delegated under the parallel-work skill. No extra design approval is needed.


## Completion evidence

Implementation commits: `3d53fb4` (accounts/content/queue/revisions/freeze) and `c8aaf6d` (leaderboard cache/retry/lifecycle). Independent review findings were reproduced and resolved with regression tests. Final verification and the pre-existing Chromium Snake navigation failure are documented in `docs/SYNC.md`; measurements and source fingerprints are in `docs/evidence/sync-measurements.json`. The final Vitest run passed all 2,914 tests with two workers. The full browser run completed both requested engines; corrected Ball Run and transient Snake keyboard failures passed follow-up runs. No push or database-integration change.
