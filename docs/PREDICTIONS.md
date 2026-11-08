# Predictions

Free play-credit forecasting markets at `#/predictions`. Every eligible account gets 10 credits each Monday
(00:00 Pacific/Auckland), buys YES or NO shares in questions that open the moment they are asked, can sell while
trading is open, and is paid once a moderator authorises the result from the dashboard. Credits are **not** money: they cannot be bought, cashed out,
transferred, gifted, redeemed or exchanged for anything of value, and nothing in the code links them to anything
that can. Built from the *NCEA Study Predictions* reference pack (7 November 2026).

**Status: built and tested locally, shipped dark.** The migration is not applied anywhere; the server flag is off;
the Menu entry shows by default (a build with `VITE_QCC_PREDICTIONS=off` hides it), and until the server flag is on the page only says it is not open yet.

## Where things live

| Path | What it does |
| --- | --- |
| `src/predictions/lmsr.ts` | Binary LMSR (`b = 20` credits) in BigInt fixed point (40 decimal digits). Pure; server and tests only. |
| `src/predictions/week.ts` | Auckland calendar weeks for display; the database computes the authoritative weeks the same way. |
| `src/predictions/shared.ts` | API types, limits, draft validation, prohibited-subject screen, credit formatting. |
| `src/predictions/server.ts` | The `/.netlify/functions/predictions` handler, the grant operation and the settlement engine. |
| `src/predictions/{client,model,view}.ts`, `style.css` | Lazy-loaded browser feature (Explore, market, ticket, review sheet, My calls, Rankings, Ask, Review queue, moderator Dashboard at `#/predictions/dashboard`). |
| `db/migrations/20261108090000_predictions.sql` | Schema, append-only journal, balance and freeze triggers. Gated: **needs owner approval** (`QCC_APPROVED_MIGRATIONS`). |
| `server/app.ts` | Backend routes `/api/predictions` and the `CRON_SECRET` cron `/api/predictions-grants` (daily 12:17 UTC, in `vercel.json`). |
| `netlify/functions/predictions.mts`, `predictions-grants.mts` | Legacy Netlify adapters for the same handler and job. |
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
- **Allowance.** One operation (`repairGrants`) is used by the scheduled job, wallet reads and trades. It locks the
  wallet and issues every missing week that overlaps an eligibility interval, never before `launch_at`, with
  `PRIMARY KEY (account_id, week_start)` as the final guard. Joining is the eligibility event (an explicit opt-in
  that accepts the rules); visiting never creates entitlement. Any ended interval is a suspension that only an
  operator can lift (people cannot end their own eligibility).
- **Trades.** Quote (30 s, bound to account, market, side, op, amount, rules hash, pricing version, tolerance) →
  execute with an operation key. Pressing **Predict** (or **Sell**) places the prediction immediately: there is no
  review or confirm step. The quote still protects the price: if it expired or the price moved past the tolerance,
  nothing is spent and the person is offered a fresh price. In one transaction: lock market, replay a committed key,
  re-check eligibility, status and server time, lock wallet, recompute, enforce the minimum output, check
  funds/ownership and the 25-credit per-question cap, post, update shares, write the receipt and an outbox row.
  `UNIQUE(account_id, operation_key)` + request hash makes retries exactly-once; a different payload under the same key
  is a 409. Lock order everywhere: markets (by id) → wallets (by account id) → positions; deadlocks/serialisation
  failures retry.
- **Settlement.** `predictions_resolutions.market_id` is unique (one authorisation per market) and
  `predictions_settlements.market_id` is the primary key, so a second economic settlement is impossible. Holder
  snapshots become `predictions_claims` (one per account), each paid with its own journal entry.

## Questions: nothing waits for review

A question opens the moment it is submitted. There is no approval queue and no "waiting for review" state.

- Anyone eligible can ask (6/day, 3 open at once per author, 60 open overall; `max_open_markets`). In one transaction the
  server validates the draft, hashes and freezes the rules (hash shown on the page), opens the market and funds its
  14-credit reserve from the treasury. A trigger refuses any later change to economic or resolution terms.
- Safety still applies, because nobody reads a question before it opens: lengths, dates, category, audience, a
  prohibited-subject screen and duplicate wording are enforced by the server. Harm to people and sexual content are
  refused for every question; school-life subjects (bodies, relationships, health, discipline, grades, crime) are also
  refused for **local** questions. Anyone eligible can report a question; moderators see reports on the dashboard and
  can pause trading or void the question.

### Global and local questions

`isGlobal(category, audience)` in `shared.ts` decides, everywhere (form, server, dashboard):

| | Local | Global |
| --- | --- | --- |
| Which | audience *School members only*, or category *School* or *Marlborough* | everything else (public Sport, Games, Technology, Culture, Science, Community) |
| Source when asking | free text (who or what confirms it); no link needed | must be a valid `https://` link |
| Evidence to authorise YES or NO | note only; link optional | note **and** a valid `https://` link |
| VOID | note only | note only |

"Valid link" means a well-formed `https://` URL (no credentials, no spaces, a real hostname, under 300 characters). The
server never fetches links, so a person or agent still has to open it and check it says what the note claims.

## Moderator dashboard (authorising results and payouts)

`#/predictions/dashboard` (a **Dashboard** tab and an Explore chip, shown only to moderators; the server enforces the
role on every call). It lists every question whose trading has closed (and every paused question), with the YES, NO and
VOID rules and source, who holds shares, and **exactly what each outcome would pay**. A moderator picks YES, NO or VOID,
writes what happened, adds the evidence link where required, and presses **Authorise**. In one transaction that records
the authorisation against their account, pays every holder once and returns the unused reserve to the treasury.
The dashboard also shows open reports, totals, and the most recent authorisations (who, what, how much, the evidence).

- A question can be authorised only after trading closes, except that a question paused before its close can only be voided.
- A moderator who **created or traded** a question cannot authorise it; another moderator (or agent account) must.
- A second authorisation of the same question is refused (`already_settled`). Results cannot be changed after payout.
- Moderators can also pause and resume trading from a question page.
- The agent route is the same HTTP API with an account session: `GET ?action=dashboard`, `POST ?action=authorise`
  with `{marketId, outcome, note, link?}`. Give each agent its own account (and role) so every payout is attributable.

Roles and suspensions are operator SQL, like the Social runbook. Moderator access is granted to an existing account;
no credentials are stored in the code or this repository:

```sql
INSERT INTO predictions_roles(account_id,role,granted_by) SELECT id,'moderator','<your name>' FROM accounts WHERE lower(username)=lower('<username>');
-- Remove: DELETE FROM predictions_roles WHERE account_id=(SELECT id FROM accounts WHERE lower(username)=lower('<username>'));
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
- `tests/predictions/server.test.ts` (PGlite and PostgreSQL 16): flag off, suspension via the runbook SQL, guest/school
  visibility, cross-origin, grant once, missed weeks / pre-launch / suspended weeks, job + lazy repair convergence, DST
  week boundaries, golden purchase + replay + key conflict + receipt ownership, sell-back, stale quote, expiry,
  insufficient credits, position cap, close race, global pause; questions open at once, frozen and funded, validation,
  duplicates, per-author and overall caps, global links required and local ones not, the prohibited-subject screen;
  authorisation by moderators only, payout once, reserve release, global evidence link, void, conflict of interest, the
  dashboard's exposure figures and pause.
- `tests/predictions/concurrency.test.ts` (PostgreSQL 16 only, skipped otherwise): one wallet buying two markets at once,
  the same key five times at once, twelve wallets on one market, trade vs close, two grant jobs + lazy repairs, two
  submissions against the open-question budget, two moderators authorising at once.
- Browser (Chromium, local stack): join → Predict places immediately (golden 2.00 credits → 3.818056 shares) → sell →
  ask a local and a global question → moderator authorises from the dashboard, with no horizontal overflow at
  320/390/768/1440 on every Predictions page.

**Not verified here:** Safari/WebKit and Firefox (not installed in this environment), real refraction of the glass
island on Safari, low-end device frame timing, the real-PostgreSQL concurrency suite (no server available), and anything
on the production backend.

## Before it can go live (each needs Charlie's approval)

1. **Legal / school review — unresolved.** Free, non-redeemable credits are a product boundary, not a legal
   determination. Before launch, confirm with the school and current NZ guidance (Privacy Act 2020 information privacy principles
   as they apply to student data, Ministry of Education privacy guidance, Gambling Act 2003
   definitions of "gambling" and "prize") that this design, the school-only audience and the data kept are acceptable.
   If credits ever buy anything, reassess first.
2. **Eligibility.** The account system does not prove one person per account, and "school only" currently means
   "has joined Predictions". Decide on a proportionate school-membership check before issuing large subsidies.
3. **Backend.** Done on `infra/backend-move`: `server/app.ts` serves `/api/predictions` and runs the daily
   `/api/predictions-grants` cron (`docs/BACKEND_HOSTING.md`). The Pages proxy already allows `predictions`.
4. **Migration.** With approval, set `QCC_APPROVED_MIGRATIONS=20261108090000_predictions` for Preview, run
   `npm run db:migrate`, check, then repeat for Production. The gate refuses it otherwise.
5. **Launch.** `UPDATE predictions_config SET enabled=true, launch_at=now();` (keep `show_fixtures=false`), grant
   the moderator role (SQL above) to the accounts that will authorise results. The Menu entry and the games-library row show unless the build sets `VITE_QCC_PREDICTIONS=off`. Questions open as soon as people ask them, so decide who watches the dashboard's reports.

Outbox rows are written with every ledger change; no delivery worker exists yet because the app has no push channel.
