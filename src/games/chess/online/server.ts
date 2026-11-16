import { randomUUID, randomInt } from 'node:crypto';
import { resolveAccount, type Account } from '../../../accounts/server';
import type { Database } from '../../../leaderboard/server';
import { HttpError, readJson, respond, sameOrigin, rateLimit, errorResponse } from '../../../../server/api';
import { writeFrozen, readOnlyResponse } from '../../../accounts/write-freeze';
import { ChessRules, START_FEN, type Color, type Outcome } from '../rules';
import { INITIAL_RATING, PROVISIONAL_RD, rate, decay, type Rating } from './glicko';
import { categoryOf, parseTimeControl, RANKED_CONTROLS, type Category } from '../time-control';
import type { RankedGameView, RankedQueueView, LeaderboardView, ProfileView, HistoryEntry } from './protocol';

/**
 * Server-authoritative ranked chess. Every command runs in one transaction with
 * the game row locked; clocks come from the database clock; results and
 * rating settlement happen exactly once, when the row leaves 'active'.
 */
type Query = (text: string, values?: unknown[]) => Promise<{ rows: any[] }>;
const FIRST_MOVE_MS = 30_000;
const SEEN_TIMEOUT_S = 20;
const MAX_BODY = 1024;
const CATEGORIES: readonly Category[] = ['bullet', 'blitz', 'rapid', 'classical'];

export interface ChessHandlerOptions { readonly random?: () => number }

/** Rating window for a queued player, widening while they wait. */
export function searchRange(waitedMs: number): number {
  return Math.min(1000, 100 + Math.floor(Math.max(0, waitedMs) / 5000) * 50);
}

const GAME_COLUMNS = `id, rated, category, base_ms, increment_ms, white_id, black_id, moves, fen, revision, white_ms, black_ms,
 status, result, termination, draw_offer, white_rating, black_rating, white_change, black_change,
 floor(extract(epoch FROM turn_started_at) * 1000)::bigint AS turn_started, floor(extract(epoch FROM now()) * 1000)::bigint AS now_ms,
 floor(extract(epoch FROM created_at) * 1000)::bigint AS created, floor(extract(epoch FROM finished_at) * 1000)::bigint AS finished,
 (SELECT username FROM accounts WHERE id = white_id) AS white_name, (SELECT username FROM accounts WHERE id = black_id) AS black_name,
 (SELECT rating FROM chess_ratings r WHERE r.account_id = white_id AND r.category = chess_games.category) AS white_now,
 (SELECT rating FROM chess_ratings r WHERE r.account_id = black_id AND r.category = chess_games.category) AS black_now`;

interface GameRow {
  id: string; rated: boolean; category: Category; base_ms: number; increment_ms: number; white_id: string; black_id: string;
  moves: string[]; fen: string; revision: number; white_ms: number; black_ms: number; status: 'active' | 'finished' | 'aborted';
  result: string | null; termination: string | null; draw_offer: Color | null;
  white_rating: number | null; black_rating: number | null; white_change: number | null; black_change: number | null;
  turn_started: string; now_ms: string; created: string; finished: string | null; white_name: string; black_name: string;
  white_now: number | null; black_now: number | null;
}

const round = (n: number | null) => (n === null || n === undefined ? null : Math.round(Number(n)));
const turnOf = (row: GameRow): Color => (row.moves.length % 2 === 0 ? 'w' : 'b');
const clockRunning = (row: GameRow) => row.moves.length >= 2;

/** Remaining time for each side at the database's current time. */
function clocks(row: GameRow): { w: number; b: number; elapsed: number } {
  const elapsed = Math.max(0, Number(row.now_ms) - Number(row.turn_started));
  const w = row.white_ms, b = row.black_ms;
  if (row.status !== 'active' || !clockRunning(row)) return { w, b, elapsed };
  return turnOf(row) === 'w' ? { w: w - elapsed, b, elapsed } : { w, b: b - elapsed, elapsed };
}

export function createChessHandler(db: Database, options: ChessHandlerOptions = {}) {
  const random = options.random ?? (() => randomInt(0, 2 ** 31) / 2 ** 31);

  async function tx<T>(work: (q: Query) => Promise<T>): Promise<T> {
    const client = await db.connect();
    const q: Query = (text, values) => client.query(text, values);
    try {
      await q('BEGIN');
      const value = await work(q);
      await q('COMMIT');
      return value;
    } catch (error) {
      await q('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async function ratingOf(q: Query, accountId: string, category: Category, lock = false): Promise<Rating & { games: number; days: number }> {
    const r = await q(`SELECT rating, deviation, volatility, games, extract(epoch FROM now() - updated_at) / 86400 AS days
      FROM chess_ratings WHERE account_id = $1 AND category = $2${lock ? ' FOR UPDATE' : ''}`, [accountId, category]);
    const row = r.rows[0];
    if (!row) return { ...INITIAL_RATING, games: 0, days: 0 };
    return { rating: Number(row.rating), deviation: Number(row.deviation), volatility: Number(row.volatility), games: Number(row.games), days: Number(row.days) };
  }

  /** Ends an active game once, settling ratings in the same transaction. */
  async function finish(q: Query, row: GameRow, outcome: Outcome, final: { w: number; b: number }): Promise<void> {
    if (row.status !== 'active') return;
    let changes: { w: number; b: number; wr: number; br: number } | undefined;
    if (row.rated) {
      // Lock both rating rows in a fixed order to avoid deadlocks between concurrent settlements.
      const ids = [row.white_id, row.black_id].sort();
      for (const id of ids) {
        await q(`INSERT INTO chess_ratings(account_id, category) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, row.category]);
      }
      const before: Record<string, Rating & { games: number; days: number }> = {};
      for (const id of ids) before[id] = await ratingOf(q, id, row.category, true);
      const white = decay(before[row.white_id], before[row.white_id].days);
      const black = decay(before[row.black_id], before[row.black_id].days);
      const ws = outcome.result === '1-0' ? 1 : outcome.result === '0-1' ? 0 : 0.5;
      const nw = rate(white, black, ws as 0 | 0.5 | 1);
      const nb = rate(black, white, (1 - ws) as 0 | 0.5 | 1);
      for (const [id, next, score, prev] of [[row.white_id, nw, ws, white], [row.black_id, nb, 1 - ws, black]] as const) {
        await q(`UPDATE chess_ratings SET rating = $3, deviation = $4, volatility = $5, games = games + 1,
          wins = wins + ($6::float8 = 1)::int, losses = losses + ($6::float8 = 0)::int, draws = draws + ($6::float8 = 0.5)::int,
          streak = CASE WHEN $6::float8 = 1 THEN greatest(streak, 0) + 1 WHEN $6::float8 = 0 THEN least(streak, 0) - 1 ELSE 0 END,
          best_rating = CASE WHEN games + 1 >= 5 AND $3::float8 > best_rating THEN $3::float8 ELSE best_rating END,
          last_change = $3::float8 - $7::float8, updated_at = now()
          WHERE account_id = $1 AND category = $2`, [id, row.category, next.rating, next.deviation, next.volatility, score, prev.rating]);
      }
      changes = { w: nw.rating - white.rating, b: nb.rating - black.rating, wr: white.rating, br: black.rating };
    }
    await q(`UPDATE chess_games SET status = 'finished', result = $2, termination = $3, white_ms = $4, black_ms = $5, draw_offer = NULL,
      white_rating = $6, black_rating = $7, white_change = $8, black_change = $9, finished_at = now(), revision = revision + 1 WHERE id = $1 AND status = 'active'`,
    [row.id, outcome.result, outcome.termination, Math.max(0, Math.round(final.w)), Math.max(0, Math.round(final.b)),
      changes?.wr ?? null, changes?.br ?? null, changes?.w ?? null, changes?.b ?? null]);
  }

  async function loadGame(q: Query, id: string, lock: boolean): Promise<GameRow | undefined> {
    if (!/^[0-9a-f-]{36}$/.test(id)) return undefined;
    const r = await q(`SELECT ${GAME_COLUMNS} FROM chess_games WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id]);
    return r.rows[0];
  }

  /** Applies time forfeit or first-move abort if due. Returns true if the row changed. */
  async function adjudicate(q: Query, row: GameRow): Promise<boolean> {
    if (row.status !== 'active') return false;
    const c = clocks(row);
    if (!clockRunning(row)) {
      if (c.elapsed > FIRST_MOVE_MS) {
        await q(`UPDATE chess_games SET status = 'aborted', termination = 'no-first-move', finished_at = now(), revision = revision + 1 WHERE id = $1`, [row.id]);
        return true;
      }
      return false;
    }
    const side = turnOf(row);
    if (c[side] > 0) return false;
    const rules = new ChessRules(START_FEN, row.moves);
    await finish(q, row, rules.timeoutOutcome(side), { ...c, [side]: 0 });
    return true;
  }

  function view(row: GameRow, me: string): RankedGameView {
    const c = clocks(row);
    const color: Color | null = row.white_id === me ? 'w' : row.black_id === me ? 'b' : null;
    return {
      id: row.id, rated: row.rated, category: row.category, baseMs: row.base_ms, incrementMs: row.increment_ms,
      white: { name: row.white_name, rating: round(row.white_rating), change: round(row.white_change) },
      black: { name: row.black_name, rating: round(row.black_rating), change: round(row.black_change) },
      ratings: { w: Math.round(Number(row.white_rating ?? row.white_now ?? INITIAL_RATING.rating)), b: Math.round(Number(row.black_rating ?? row.black_now ?? INITIAL_RATING.rating)) },
      color, moves: row.moves, revision: row.revision, status: row.status, result: row.result, termination: row.termination,
      drawOffer: row.draw_offer, clock: { w: Math.max(0, Math.round(c.w)), b: Math.max(0, Math.round(c.b)), running: row.status === 'active' && clockRunning(row) },
      firstMoveMsLeft: row.status === 'active' && !clockRunning(row) ? Math.max(0, FIRST_MOVE_MS - c.elapsed) : null,
      createdAt: Number(row.created), finishedAt: row.finished ? Number(row.finished) : null,
    };
  }

  async function gameFor(q: Query, id: string, account: Account, lock: boolean): Promise<GameRow> {
    let row = await loadGame(q, id, lock);
    if (!row || (row.white_id !== account.id && row.black_id !== account.id)) throw new HttpError(404, 'not_found', 'Game not found.');
    if (lock && await adjudicate(q, row)) row = (await loadGame(q, id, true))!;
    return row;
  }

  async function commandSeen(q: Query, row: GameRow, account: Account, commandId: unknown): Promise<boolean> {
    if (typeof commandId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(commandId)) throw new HttpError(400, 'bad_command', 'Missing command id.');
    const r = await q(`INSERT INTO chess_commands(game_id, command_id, account_id, revision) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING 1`,
      [row.id, commandId, account.id, row.revision]);
    return r.rows.length === 0;
  }

  async function ratingsFor(q: Query, accountId: string) {
    const r = await q(`SELECT category, rating, deviation, games, wins, losses, draws, streak, best_rating, last_change FROM chess_ratings WHERE account_id = $1`, [accountId]);
    return Object.fromEntries(CATEGORIES.map((c) => {
      const row = r.rows.find((x) => x.category === c);
      return [c, row ? {
        rating: Math.round(Number(row.rating)), provisional: Number(row.deviation) >= PROVISIONAL_RD, games: row.games, wins: row.wins, losses: row.losses,
        draws: row.draws, streak: row.streak, best: Math.round(Number(row.best_rating)), change: Math.round(Number(row.last_change)),
      } : { rating: INITIAL_RATING.rating, provisional: true, games: 0, wins: 0, losses: 0, draws: 0, streak: 0, best: INITIAL_RATING.rating, change: 0 }];
    })) as ProfileView['ratings'];
  }

  async function queueState(q: Query, account: Account): Promise<RankedQueueView> {
    const r = await q(`SELECT category, base_ms, increment_ms, rating, game_id, floor(extract(epoch FROM now() - joined_at) * 1000)::bigint AS waited
      FROM chess_queue WHERE account_id = $1 FOR UPDATE`, [account.id]);
    const row = r.rows[0];
    if (!row) return { state: 'idle' };
    if (row.game_id) {
      await q(`DELETE FROM chess_queue WHERE account_id = $1`, [account.id]);
      return { state: 'matched', gameId: row.game_id };
    }
    await q(`UPDATE chess_queue SET seen_at = now() WHERE account_id = $1`, [account.id]);
    // Pairing is serialized per time control so two searchers never match the same opponent.
    await q(`SELECT pg_advisory_xact_lock(hashtext('qcc-chess-queue:' || $1 || '+' || $2))`, [row.base_ms, row.increment_ms]);
    const waited = Number(row.waited);
    const candidates = await q(`SELECT account_id, rating, floor(extract(epoch FROM now() - joined_at) * 1000)::bigint AS waited
      FROM chess_queue WHERE base_ms = $1 AND increment_ms = $2 AND game_id IS NULL AND account_id <> $3
      AND seen_at > now() - ($4 * interval '1 second') ORDER BY joined_at LIMIT 50`, [row.base_ms, row.increment_ms, account.id, SEEN_TIMEOUT_S]);
    const mine = Number(row.rating);
    const match = candidates.rows.find((c) => {
      const gap = Math.abs(Number(c.rating) - mine);
      return gap <= searchRange(waited) && gap <= searchRange(Number(c.waited));
    });
    if (!match) return { state: 'searching', category: row.category, waitedMs: waited, range: searchRange(waited), timeControl: `${row.base_ms / 60000}+${row.increment_ms / 1000}` };
    const id = randomUUID();
    const [white, black] = random() < 0.5 ? [account.id, match.account_id] : [match.account_id, account.id];
    await q(`INSERT INTO chess_games(id, rated, category, base_ms, increment_ms, white_id, black_id, fen, white_ms, black_ms)
      VALUES ($1, true, $2, $3, $4, $5, $6, $7, $3, $3)`, [id, row.category, row.base_ms, row.increment_ms, white, black, START_FEN]);
    await q(`UPDATE chess_queue SET game_id = $1 WHERE account_id = $2`, [id, match.account_id]);
    await q(`DELETE FROM chess_queue WHERE account_id = $1`, [account.id]);
    return { state: 'matched', gameId: id };
  }

  async function activeGameId(q: Query, accountId: string): Promise<string | null> {
    const r = await q(`SELECT id FROM chess_games WHERE status = 'active' AND (white_id = $1 OR black_id = $1) ORDER BY created_at DESC LIMIT 1`, [accountId]);
    return r.rows[0]?.id ?? null;
  }

  async function command(account: Account, body: Record<string, unknown>): Promise<RankedGameView> {
    return tx(async (q) => {
      const row = await gameFor(q, String(body.gameId ?? ''), account, true);
      const me: Color = row.white_id === account.id ? 'w' : 'b';
      if (await commandSeen(q, row, account, body.commandId)) return view((await loadGame(q, row.id, false))!, account.id);
      const type = body.type;
      if (row.status !== 'active') throw new HttpError(409, 'finished', 'This game has ended.');
      if (body.revision !== row.revision) throw new HttpError(409, 'stale', 'The game moved on. Refreshing.');
      const rules = new ChessRules(START_FEN, row.moves);
      const c = clocks(row);
      if (type === 'move') {
        if (turnOf(row) !== me) throw new HttpError(409, 'not_your_turn', 'It is not your turn.');
        const record = rules.move(String(body.uci ?? ''));
        if (!record) throw new HttpError(422, 'illegal', 'That move is not legal.');
        const running = clockRunning(row);
        const spent = running ? c.elapsed : 0;
        const left = (me === 'w' ? row.white_ms : row.black_ms) - spent + (running ? row.increment_ms : 0);
        // A draw offer lapses when the opponent of the offerer moves.
        const offer = row.draw_offer && row.draw_offer !== me ? null : row.draw_offer;
        await q(`UPDATE chess_games SET moves = array_append(moves, $2), fen = $3, revision = revision + 1, ${me === 'w' ? 'white_ms' : 'black_ms'} = $4,
          turn_started_at = now(), draw_offer = $5 WHERE id = $1`, [row.id, record.uci, record.fen, Math.round(left), offer]);
        const next = (await loadGame(q, row.id, true))!;
        const outcome = rules.outcome();
        if (outcome) await finish(q, next, outcome, clocks(next));
      } else if (type === 'resign') {
        if (!clockRunning(row)) await abort(q, row);
        else await finish(q, row, { result: me === 'w' ? '0-1' : '1-0', termination: 'resignation', winner: me === 'w' ? 'b' : 'w' }, c);
      } else if (type === 'abort') {
        if (clockRunning(row)) throw new HttpError(409, 'too_late', 'The game can only be aborted before both players move.');
        await abort(q, row);
      } else if (type === 'offer-draw') {
        if (!clockRunning(row)) throw new HttpError(409, 'too_early', 'Make a move first.');
        if (row.draw_offer && row.draw_offer !== me) await finish(q, row, { result: '1/2-1/2', termination: 'agreement' }, c);
        else await q(`UPDATE chess_games SET draw_offer = $2, revision = revision + 1 WHERE id = $1`, [row.id, me]);
      } else if (type === 'decline-draw') {
        if (row.draw_offer && row.draw_offer !== me) await q(`UPDATE chess_games SET draw_offer = NULL, revision = revision + 1 WHERE id = $1`, [row.id]);
      } else if (type === 'claim-draw') {
        if (turnOf(row) !== me) throw new HttpError(409, 'not_your_turn', 'Claim on your turn.');
        const claim = rules.claimable()[0];
        if (!claim) throw new HttpError(409, 'no_claim', 'No draw can be claimed.');
        await finish(q, row, { result: '1/2-1/2', termination: claim }, c);
      } else throw new HttpError(400, 'bad_command', 'Unknown command.');
      return view((await loadGame(q, row.id, false))!, account.id);
    });
  }

  async function abort(q: Query, row: GameRow) {
    await q(`UPDATE chess_games SET status = 'aborted', termination = 'aborted', finished_at = now(), revision = revision + 1 WHERE id = $1 AND status = 'active'`, [row.id]);
  }

  async function leaderboard(category: Category, search: string, account: Account | null): Promise<LeaderboardView> {
    const values: unknown[] = [category];
    let filter = '';
    if (search) { values.push(search.toLowerCase().replace(/[%_\\]/g, '\\$&') + '%'); filter = `AND lower(username) LIKE $${values.length}`; }
    const r = await db.query(`WITH ranked AS (
      SELECT row_number() OVER (ORDER BY r.rating DESC, r.games DESC, a.username)::int AS rank, a.id, a.username, r.rating, r.deviation, r.games, r.wins, r.losses, r.draws, r.last_change, r.streak
      FROM chess_ratings r JOIN accounts a ON a.id = r.account_id WHERE r.category = $1 AND r.games > 0 AND r.deviation < 350
    ) SELECT * FROM ranked WHERE true ${filter} ORDER BY rank LIMIT 50`, values);
    const entry = (x: any) => ({ rank: x.rank, name: x.username, rating: Math.round(Number(x.rating)), provisional: Number(x.deviation) >= PROVISIONAL_RD,
      games: x.games, wins: x.wins, losses: x.losses, draws: x.draws, change: Math.round(Number(x.last_change)), streak: x.streak });
    let me = null;
    if (account) {
      const m = await db.query(`SELECT * FROM (SELECT row_number() OVER (ORDER BY r.rating DESC, r.games DESC, a.username)::int AS rank, a.id, a.username, r.rating, r.deviation, r.games, r.wins, r.losses, r.draws, r.last_change, r.streak
        FROM chess_ratings r JOIN accounts a ON a.id = r.account_id WHERE r.category = $1 AND r.games > 0 AND r.deviation < 350) t WHERE id = $2`, [category, account.id]);
      if (m.rows[0]) me = entry(m.rows[0]);
    }
    return { category, entries: r.rows.map(entry), me };
  }

  async function profile(username: string): Promise<ProfileView> {
    const a = await db.query(`SELECT id, username FROM accounts WHERE lower(username) = lower($1)`, [username]);
    const acct = a.rows[0];
    if (!acct) throw new HttpError(404, 'not_found', 'Player not found.');
    return { name: acct.username, ratings: await ratingsFor(db.query.bind(db) as Query, acct.id), recent: await history(acct.id, 10) };
  }

  async function history(accountId: string, limit: number): Promise<HistoryEntry[]> {
    const r = await db.query(`SELECT g.id, g.category, g.base_ms, g.increment_ms, g.result, g.termination, cardinality(g.moves) AS plies,
      g.white_id = $1 AS white, w.username AS white_name, b.username AS black_name, g.white_change, g.black_change, g.white_rating, g.black_rating,
      floor(extract(epoch FROM g.finished_at) * 1000)::bigint AS finished
      FROM chess_games g JOIN accounts w ON w.id = g.white_id JOIN accounts b ON b.id = g.black_id
      WHERE (g.white_id = $1 OR g.black_id = $1) AND g.status = 'finished' ORDER BY g.finished_at DESC LIMIT $2`, [accountId, limit]);
    return r.rows.map((x) => ({
      id: x.id, category: x.category, timeControl: `${x.base_ms / 60000}+${x.increment_ms / 1000}`, result: x.result, termination: x.termination,
      plies: Number(x.plies), color: x.white ? 'w' : 'b', opponent: x.white ? x.black_name : x.white_name,
      rating: x.white ? x.white_rating : x.black_rating, change: x.white ? x.white_change : x.black_change, finishedAt: Number(x.finished),
    }));
  }

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') ?? '';
    try {
      if (request.method === 'GET' && action === 'leaderboard') {
        const category = url.searchParams.get('category') as Category;
        if (!CATEGORIES.includes(category)) throw new HttpError(400, 'bad_category', 'Choose a rating category.');
        const search = (url.searchParams.get('q') ?? '').slice(0, 24);
        if (search && !/^[A-Za-z0-9_.-]+$/.test(search)) return respond({ category, entries: [], me: null });
        const account = request.headers.get('authorization') ? await resolveAccount(db, request) : null;
        return respond(await leaderboard(category, search, account));
      }
      if (request.method === 'GET' && action === 'profile') {
        const name = url.searchParams.get('name') ?? '';
        if (!/^[A-Za-z0-9_.-]{3,24}$/.test(name)) throw new HttpError(404, 'not_found', 'Player not found.');
        return respond(await profile(name));
      }
      const account = await resolveAccount(db, request);
      if (!account) throw new HttpError(401, 'login', 'Log in to play ranked chess.');
      await rateLimit(db.query.bind(db), `chess:${account.id}`, 400, 60);
      if (request.method === 'GET') {
        if (action === 'me') {
          const q = db.query.bind(db) as Query;
          return respond({ name: account.username, ratings: await ratingsFor(q, account.id), activeGameId: await activeGameId(q, account.id), recent: await history(account.id, 20) });
        }
        if (action === 'queue') return respond(await tx((q) => queueState(q, account)));
        if (action === 'game') {
          const id = url.searchParams.get('id') ?? '';
          const sinceText = url.searchParams.get('since');
          const since = sinceText === null ? NaN : Number(sinceText);
          return respond(await tx(async (q) => {
            const row = await gameFor(q, id, account, true);
            const v = view(row, account.id);
            // Clocks are always fresh; moves are omitted when the caller already has this revision.
            return Number.isInteger(since) && since === row.revision ? { ...v, moves: undefined, unchanged: true } : v;
          }));
        }
        throw new HttpError(400, 'bad_action', 'Unknown action.');
      }
      if (request.method !== 'POST') return respond({ error: 'method' }, 405);
      if (await writeFrozen(db)) return readOnlyResponse();
      if (!sameOrigin(request)) throw new HttpError(403, 'origin', 'This request is not allowed.');
      if (!request.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(415, 'json', 'Send JSON.');
      const body = await readJson(request, MAX_BODY);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'bad_body', 'Invalid request.');
      const data = body as Record<string, unknown>;
      if (action === 'join') {
        const control = parseTimeControl(String(data.timeControl ?? ''));
        if (!control || !RANKED_CONTROLS.some((c) => c.id === control.id)) throw new HttpError(400, 'bad_control', 'Choose a ranked time control.');
        return respond(await tx(async (q) => {
          const active = await activeGameId(q, account.id);
          if (active) return { state: 'matched', gameId: active } as RankedQueueView;
          const category = categoryOf(control);
          const rating = await ratingOf(q, account.id, category);
          await q(`INSERT INTO chess_queue(account_id, category, base_ms, increment_ms, rating) VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT(account_id) DO UPDATE SET category = excluded.category, base_ms = excluded.base_ms, increment_ms = excluded.increment_ms,
            rating = excluded.rating, joined_at = now(), seen_at = now(), game_id = NULL`, [account.id, category, control.baseMs, control.incrementMs, rating.rating]);
          return queueState(q, account);
        }));
      }
      if (action === 'leave') {
        await db.query(`DELETE FROM chess_queue WHERE account_id = $1 AND game_id IS NULL`, [account.id]);
        return respond({ state: 'idle' });
      }
      if (action === 'command') return respond(await command(account, data));
      throw new HttpError(400, 'bad_action', 'Unknown action.');
    } catch (error) {
      return errorResponse(error, 'Chess is temporarily unavailable.');
    }
  };
}
