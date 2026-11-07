# Predictions

Free play-credit forecasting markets at `#/predictions`. Every eligible account gets 10 credits each Monday
(00:00 Pacific/Auckland), buys YES or NO shares in reviewed questions, can sell while trading is open, and is paid
once after an independently reviewed result. Credits are **not** money: they cannot be bought, cashed out,
transferred, gifted, redeemed or exchanged for anything of value, and nothing in the code links them to anything
that can. Built from the *NCEA Study Predictions* reference pack (7 November 2026).

**Status: built and tested locally, shipped dark.** The migration is not applied anywhere; the server flag is off;
the Menu entry only appears in development builds or a build with `VITE_QCC_PREDICTIONS=on`.

## Where things live

| Path | What it does |
| --- | --- |
| `src/predictions/lmsr.ts` | Binary LMSR (`b = 20` credits) in BigInt fixed point (40 decimal digits). Pure; server and tests only. |
| `src/predictions/week.ts` | Auckland calendar weeks for display; the database computes the authoritative weeks the same way. |
| `src/predictions/shared.ts` | API types, limits, draft validation, prohibited-subject screen, credit formatting. |
| `src/predictions/server.ts` | The `/.netlify/functions/predictions` handler, the grant operation and the settlement engine. |
| `src/predictions/{client,model,view}.ts`, `style.css` | Lazy-loaded browser feature (Explore, market, ticket, review sheet, My calls, Rankings, Ask, Review queue). |
| `netlify/database/migrations/20261108090000_predictions.sql` | Schema, append-only journal, balance and freeze triggers. **Needs owner approval.** |
| `netlify/functions/predictions.mts`, `predictions-grants.mts` | Netlify adapters: request handler and the hourly grant job. |
| `functions/_middleware.ts` | Pages proxy allowlist now includes `predictions`. |
| `scripts/predictions-fixtures.mjs` | Development-only fixtures, each flagged `fixture=true` and labelled in the UI. |

## Money rules, as implemented

- **Units.** 1 credit = 1,000,000 microcredits; 1 share = 1,000,000 microshares. All ledger values are `bigint`.
- **Pricing.** `C(qY,qN) = b ln(e^(qY/b) + e^(qN/b))`, fixed `b = 20`, start at 50%. Buys round shares down, recompute
  the exact cost and round it up (never above the budget); sells round proceeds down; void pays
  `floor((yes + no microshares) / 2)` per account. Rounding always favours the reserve.
- **Golden values** (pack, reproduced exactly): 2.00 credits at 50% → 3.818056 shares, 54.7581%; pays 3.818056 if YES;
  1.909028 if void; immediate sell-back 1.999999.
- **Reserve.** Each approved market is funded with 14 credits from the treasury (minimum `20 ln 2 = 13.862944`).
  After every trade the server asserts `reserve ≥ max(qYes, qNo)`. Unused reserve returns only after every claim is paid.
- **Ledger.** `predictions_journal` + `predictions_postings` is double-entry: every transaction sums to zero (deferred
  constraint trigger), rows are append-only (update/delete triggers), and wallet/reserve balances are maintained
  *only* by the posting trigger with `CHECK (balance >= 0)`. Corrections are new entries.
- **Allowance.** One operation (`repairGrants`) is used by the hourly job, wallet reads and trades. It locks the
  wallet and issues every missing week that overlaps an eligibility interval, never before `launch_at`, with
  `PRIMARY KEY (account_id, week_start)` as the final guard. Joining is the eligibility event (an explicit opt-in
  that accepts the rules); visiting never creates entitlement. Any ended interval is a suspension that only an
  operator can lift (people cannot end their own eligibility).
- **Trades.** Quote (30 s, bound to account, market, side, op, amount, rules hash, pricing version, tolerance) →
  execute with an operation key. In one transaction: lock market, replay a committed key, re-check eligibility,
  status and server time, lock wallet, recompute, enforce the minimum output, check funds/ownership and the 25-credit
  per-question cap, post, update shares, write the receipt and an outbox row. `UNIQUE(account_id, operation_key)` +
  request hash makes retries exactly-once; a different payload under the same key is a 409. Lock order everywhere:
  markets (by id) → wallets (by account id) → positions; deadlocks/serialisation failures retry.
- **Settlement.** `predictions_settlements.market_id` is the primary key, so a second economic settlement is
  impossible. Holder snapshots become `predictions_claims` (one per account), each paid with its own journal entry.

## Governance, as implemented

- Anyone eligible can submit (6/day, 3 pending at once). The server validates lengths, dates, category, audience,
  source, a prohibited-subject screen (bodies, relationships, health, discipline, grades, harm) and duplicate wording.
- Only a **moderator who is not the author** can approve; approval freezes the rules (hash shown on the page) and funds
  the reserve atomically. A trigger refuses any later change to economic or resolution terms.
- A **resolver or moderator** with no trades in the market and who is not its author proposes YES/NO/VOID with
  evidence. Anyone eligible except the proposer can challenge for 24 hours. A **different moderator** with no
  position finalises; a challenged result needs a decision note and may be overturned.
- Moderators can pause a market (integrity pause stops trading; before the close time it can only be proposed as VOID, through the same review) and see reports.
- School-only questions are visible and tradable only to accounts with current eligibility, enforced in SQL.
- Every moderation, resolution and eligibility action is written to the append-only `predictions_audit`.

Roles and suspensions are operator SQL, like the Social runbook:

```sql
INSERT INTO predictions_roles(account_id,role,granted_by) SELECT id,'moderator','<your name>' FROM accounts WHERE lower(username)=lower('<username>');
-- Suspend: end the current interval. Any ended interval blocks re-joining; only an operator can restore access.
UPDATE predictions_eligibility SET eligible_until=now() WHERE account_id='<id>' AND eligible_until IS NULL;
-- Restore: INSERT INTO predictions_eligibility(account_id,method,note) VALUES ('<id>','operator','<reason>');
INSERT INTO predictions_audit(actor,action,note) VALUES ('<your name>','suspend','<account id>: <reason>');
-- Emergency: stop all new trades but keep reads, positions and the ledger.
UPDATE predictions_config SET trading_paused=true;
```

## Running it locally

```bash
QCC_PREDICTIONS=on npm run dev:online              # enables the flag locally and loads labelled fixtures
QCC_PREDICTIONS=on QCC_PREDICTIONS_MODERATORS=name npm run dev:online   # grant a local moderator (account must exist)
npm test                                            # includes Predictions on the PGlite emulator
QCC_TEST_PG_URL=postgres://postgres@127.0.0.1:55432/postgres npx vitest run tests/predictions   # + real-Postgres races
```

The concurrency suite (`tests/predictions/concurrency.test.ts`) needs a real PostgreSQL server and is skipped
without `QCC_TEST_PG_URL`; PGlite is a single session and cannot prove row locks.

## Verification on this branch

- `tests/predictions/lmsr.test.ts` (17): golden values, exp/ln accuracy, symmetry, complete-set cost, monotonicity,
  no profitable round trip, extreme prices, no shorting, void aggregation, 4,000-step 25-wallet simulation with
  conservation and YES/NO/void solvency after every step.
- `tests/predictions/server.test.ts` (20, PGlite and PostgreSQL 16): flag off, suspension via the runbook SQL, guest/school visibility, cross-origin,
  grant once, missed weeks / pre-launch / suspended weeks, job + lazy repair convergence, DST week boundaries
  (27 Sep 2026, 4 Apr 2027) matching SQL, golden purchase + replay + key conflict + receipt ownership, sell-back,
  stale quote, expiry, insufficient credits, position cap, close race, global pause, draft validation, duplicates,
  pending cap, author/role checks, frozen terms, append-only and balanced journal, payout once + reserve release +
  realised P/L, dispute → independent void, integrity pause. Ledger reconciliation after each scenario.
- `tests/predictions/concurrency.test.ts` (7, PostgreSQL 16 only): two moderators approving against the open-market budget, one wallet buying two markets at once, the same
  key five times at once, twelve wallets on one market, trade vs close, two grant jobs + lazy repairs, two moderators
  finalising at once.
- Browser (Chromium, local stack): two accounts completed join → buy YES 2.00 (3.818056 shares, 54.76%) → buy NO 3.00
  → sell half → ask → moderator approve → propose → challenge, with no horizontal overflow at 320/390/768/1440.

**Not verified here:** Safari/WebKit and Firefox (not installed in this environment), real refraction of the glass
island on Safari, low-end device frame timing, and anything on the production backend.

## Before it can go live (each needs Charlie's approval)

1. **Legal / school review — unresolved.** Free, non-redeemable credits are a product boundary, not a legal
   determination. Before launch, confirm with the school and current NZ guidance (Privacy Act 2020 information privacy principles
   as they apply to student data, Ministry of Education privacy guidance, Gambling Act 2003
   definitions of "gambling" and "prize") that this design, the school-only audience and the data kept are acceptable.
   If credits ever buy anything, reassess first.
2. **Eligibility.** The account system does not prove one person per account, and "school only" currently means
   "has joined Predictions". Decide on a proportionate school-membership check before issuing large subsidies.
3. **Backend.** Production API runs on the separate Vercel backend (`docs/BACKEND_HOSTING.md`). Port
   `src/predictions/server.ts` into its router as the `predictions` route with the existing guarded handler, and run
   `runGrantJob` from an authenticated hourly cron there. A Pages deploy alone will not make trading work.
4. **Migration.** Apply `20261108090000_predictions.sql` to Preview first, then Production.
5. **Launch.** `UPDATE predictions_config SET enabled=true, launch_at=now();` (keep `show_fixtures=false`), grant
   reviewer roles, publish 8–12 reviewed questions, then build the frontend with `VITE_QCC_PREDICTIONS=on`.

Outbox rows are written with every ledger change; no delivery worker exists yet because the app has no push channel.
