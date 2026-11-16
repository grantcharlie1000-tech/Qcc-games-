import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NetlifyDB } from '@netlify/database-dev';
import { getDatabase } from '@netlify/database';
import { createAccountsHandler } from '../../../src/accounts/server';
import { createChessHandler, searchRange } from '../../../src/games/chess/online/server';

// Real handlers against a real local Postgres with every migration applied.
const local = new NetlifyDB({ logger: () => {} });
let pool: ReturnType<typeof getDatabase>['pool'];
let chess: ReturnType<typeof createChessHandler>;
let accounts: ReturnType<typeof createAccountsHandler>;
const base = 'https://arcade.test/.netlify/functions/chess';
let n = 0;

async function signup(username: string) {
  const r = await accounts(new Request('https://arcade.test/.netlify/functions/accounts?action=signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: 'test password' }) }));
  expect(r.status).toBe(201);
  return (await r.json()).token as string;
}
const get = async (token: string | null, query: string) => {
  const r = await chess(new Request(`${base}?${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }));
  return { status: r.status, body: await r.json() };
};
const post = async (token: string | null, action: string, body: unknown) => {
  const r = await chess(new Request(`${base}?action=${action}`, { method: 'POST', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};
const cmd = (token: string, gameId: string, type: string, revision: number, extra: Record<string, unknown> = {}) =>
  post(token, 'command', { gameId, type, revision, commandId: `cmd-${++n}-xxxxxxxx`, ...extra });

async function pair(a: string, b: string, tc = '3+2') {
  expect((await post(a, 'join', { timeControl: tc })).body.state).toBe('searching');
  const matched = await post(b, 'join', { timeControl: tc });
  expect(matched.body.state).toBe('matched');
  const id = matched.body.gameId as string;
  expect((await get(a, 'action=queue')).body).toEqual({ state: 'matched', gameId: id });
  const ga = (await get(a, `action=game&id=${id}`)).body;
  const [white, black] = ga.color === 'w' ? [a, b] : [b, a];
  return { id, white, black };
}

async function play(g: { id: string; white: string; black: string }, moves: string[]) {
  let rev = (await get(g.white, `action=game&id=${g.id}`)).body.revision as number;
  for (const [i, uci] of moves.entries()) {
    const r = await cmd(i % 2 ? g.black : g.white, g.id, 'move', rev, { uci });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    rev = r.body.revision;
  }
  return rev;
}

beforeAll(async () => {
  const connectionString = await local.start();
  await local.applyMigrations('netlify/database/migrations');
  pool = getDatabase({ connectionString }).pool;
  chess = createChessHandler(pool, { random: () => 0.1 });
  accounts = createAccountsHandler(pool);
}, 60000);
afterAll(async () => { await pool?.end(); await local.stop(); });
beforeEach(async () => { await pool.query('TRUNCATE accounts, account_attempts CASCADE'); });

describe('ranked chess server', { timeout: 30000 }, () => {
  it('refuses guests and expired sessions', async () => {
    expect((await post(null, 'join', { timeControl: '3+2' })).status).toBe(401);
    const t = await signup('Expired_One');
    await pool.query('UPDATE account_sessions SET expires_at = now() - interval \'1 second\'');
    expect((await get(t, 'action=me')).status).toBe(401);
  });

  it('pairs two queued players into one game and enforces turns and legality', async () => {
    const a = await signup('Alpha_Player'), b = await signup('Beta_Player'), c = await signup('Gamma_Player');
    const g = await pair(a, b);
    const start = await get(g.white, `action=game&id=${g.id}`);
    expect(start.body).toMatchObject({ status: 'active', revision: 0, moves: [], color: 'w', rated: true, category: 'blitz', clock: { w: 180000, b: 180000, running: false } });
    expect((await get(c, `action=game&id=${g.id}`)).status).toBe(404);
    expect((await cmd(c, g.id, 'move', 0, { uci: 'e2e4' })).status).toBe(404);
    expect((await cmd(g.black, g.id, 'move', 0, { uci: 'e7e5' })).body.error).toBe('not_your_turn');
    expect((await cmd(g.white, g.id, 'move', 0, { uci: 'e2e5' })).status).toBe(422);
    const moved = await cmd(g.white, g.id, 'move', 0, { uci: 'e2e4' });
    expect(moved.body).toMatchObject({ revision: 1, moves: ['e2e4'] });
    // Same revision again: rejected as stale, not applied twice.
    expect((await cmd(g.white, g.id, 'move', 0, { uci: 'd2d4' })).body.error).toBe('stale');
    const blackView = await get(g.black, `action=game&id=${g.id}&since=1`);
    expect(blackView.body.unchanged).toBe(true);
    expect(blackView.body.moves).toBeUndefined();
  });

  it('treats a repeated command id as one command', async () => {
    const g = await pair(await signup('Retry_White'), await signup('Retry_Black'));
    const body = { gameId: g.id, type: 'move', revision: 0, uci: 'e2e4', commandId: 'same-command-123' };
    const first = await post(g.white, 'command', body);
    const again = await post(g.white, 'command', body);
    expect(first.body.revision).toBe(1);
    expect(again.status).toBe(200);
    expect(again.body.moves).toEqual(['e2e4']);
    expect(again.body.revision).toBe(1);
  });

  it('rejects forged results and unknown commands', async () => {
    const g = await pair(await signup('Forge_White'), await signup('Forge_Black'));
    expect((await post(g.white, 'result', { gameId: g.id, result: '1-0' })).status).toBe(400);
    expect((await cmd(g.white, g.id, 'win', 0)).status).toBe(400);
    expect((await cmd(g.white, g.id, 'claim-draw', 0)).status).toBe(409);
    expect((await get(g.white, `action=game&id=${g.id}`)).body.status).toBe('active');
  });

  it('settles a checkmate once and updates both ratings and the leaderboard', async () => {
    const g = await pair(await signup('Mate_Ann'), await signup('Mate_Ben'));
    const rev = await play(g, ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    const end = await get(g.white, `action=game&id=${g.id}`);
    expect(end.body).toMatchObject({ status: 'finished', result: '0-1', termination: 'checkmate' });
    expect(end.body.black.change).toBeGreaterThan(0);
    expect(end.body.white.change).toBeLessThan(0);
    expect((await cmd(g.white, g.id, 'resign', rev + 1)).body.error).toBe('finished');
    const winner = end.body.black.name as string, loser = end.body.white.name as string;
    const rows = (await pool.query(`SELECT a.username, r.games, r.wins, r.losses, r.rating FROM chess_ratings r JOIN accounts a ON a.id = r.account_id ORDER BY rating DESC`)).rows;
    expect(rows.map((r: Record<string, unknown>) => [r.username, r.games, r.wins, r.losses])).toEqual([[winner, 1, 1, 0], [loser, 1, 0, 1]]);
    const board = await get(g.black, 'action=leaderboard&category=blitz');
    expect(board.body.entries.map((e: { name: string }) => e.name)).toEqual([winner, loser]);
    expect(board.body.me).toMatchObject({ rank: 1, name: winner, wins: 1 });
    expect((await get(null, `action=leaderboard&category=blitz&q=${loser.slice(0, 6).toLowerCase()}`)).body.entries.map((e: { name: string }) => e.name)).toEqual([loser]);
    expect((await get(null, 'action=leaderboard&category=bullet')).body.entries).toEqual([]);
    const profile = await get(null, `action=profile&name=${winner}`);
    expect(profile.body.ratings.blitz).toMatchObject({ games: 1, wins: 1, streak: 1 });
    expect(profile.body.recent[0]).toMatchObject({ result: '0-1', color: 'b', opponent: loser });
  });

  it('handles draw offers, resignation and abort rules', async () => {
    const g = await pair(await signup('Draw_White'), await signup('Draw_Black'));
    expect((await cmd(g.white, g.id, 'offer-draw', 0)).body.error).toBe('too_early');
    let rev = await play(g, ['e2e4', 'e7e5']);
    expect((await cmd(g.white, g.id, 'abort', rev)).body.error).toBe('too_late');
    const offered = await cmd(g.white, g.id, 'offer-draw', rev);
    expect(offered.body.drawOffer).toBe('w');
    const declined = await cmd(g.black, g.id, 'decline-draw', offered.body.revision);
    expect(declined.body.drawOffer).toBeNull();
    rev = declined.body.revision;
    const again = await cmd(g.white, g.id, 'offer-draw', rev);
    const agreed = await cmd(g.black, g.id, 'offer-draw', again.body.revision);
    expect(agreed.body).toMatchObject({ status: 'finished', result: '1/2-1/2', termination: 'agreement' });

    const h = await pair(await signup('Resign_White'), await signup('Resign_Black'));
    const r2 = await play(h, ['d2d4', 'd7d5']);
    expect((await cmd(h.black, h.id, 'resign', r2)).body).toMatchObject({ status: 'finished', result: '1-0', termination: 'resignation' });

    const k = await pair(await signup('Abort_White'), await signup('Abort_Black'));
    expect((await cmd(k.black, k.id, 'abort', 0)).body.status).toBe('aborted');
    const unrated = (await pool.query(`SELECT count(*)::int AS n FROM chess_ratings r JOIN accounts a ON a.id = r.account_id WHERE a.username LIKE 'Abort%' AND games > 0`)).rows[0].n;
    expect(unrated).toBe(0);
  });

  it('flags a player whose server clock runs out, and aborts a game nobody starts', async () => {
    const g = await pair(await signup('Clock_White'), await signup('Clock_Black'), '1+0');
    await play(g, ['e2e4', 'e7e5']);
    await pool.query(`UPDATE chess_games SET turn_started_at = now() - interval '61 seconds' WHERE id = $1`, [g.id]);
    // The flag falls on the next read; a late move is refused.
    expect((await cmd(g.white, g.id, 'move', 2, { uci: 'g1f3' })).body.error).toBe('finished');
    const end = await get(g.black, `action=game&id=${g.id}`);
    expect(end.body).toMatchObject({ status: 'finished', result: '0-1', termination: 'timeout', clock: { w: 0 } });

    const idle = await pair(await signup('Idle_White'), await signup('Idle_Black'), '1+0');
    await pool.query(`UPDATE chess_games SET turn_started_at = now() - interval '31 seconds' WHERE id = $1`, [idle.id]);
    expect((await get(idle.black, `action=game&id=${idle.id}`)).body).toMatchObject({ status: 'aborted' });
  });

  it('charges thinking time from the server clock and adds the increment', async () => {
    const g = await pair(await signup('Inc_White'), await signup('Inc_Black'), '3+2');
    await play(g, ['e2e4', 'e7e5']);
    await pool.query(`UPDATE chess_games SET turn_started_at = now() - interval '10 seconds' WHERE id = $1`, [g.id]);
    const r = await cmd(g.white, g.id, 'move', 2, { uci: 'g1f3' });
    expect(r.body.clock.w).toBeGreaterThan(171000);
    expect(r.body.clock.w).toBeLessThanOrEqual(172000);
    expect(r.body.clock.b).toBe(180000);
  });

  it('widens the rating window while players wait', async () => {
    expect(searchRange(0)).toBe(100);
    expect(searchRange(30000)).toBe(400);
    const a = await signup('Strong_One'), b = await signup('Weak_One');
    await pool.query(`INSERT INTO chess_ratings(account_id, category, rating, deviation, games, wins) SELECT id, 'blitz', 2000, 80, 30, 30 FROM accounts WHERE username = 'Strong_One'`);
    expect((await post(a, 'join', { timeControl: '5+0' })).body.state).toBe('searching');
    expect((await post(b, 'join', { timeControl: '5+0' })).body.state).toBe('searching');
    await pool.query(`UPDATE chess_queue SET joined_at = now() - interval '60 seconds'`);
    expect((await get(b, 'action=queue')).body.state).toBe('matched');
    expect((await post(a, 'leave', {})).body.state).toBe('idle');
  });

  it('does not let a player queue twice or into a non-ranked time control', async () => {
    const a = await signup('Twice_One');
    expect((await post(a, 'join', { timeControl: '7+5' })).status).toBe(400);
    await post(a, 'join', { timeControl: '3+0' });
    await post(a, 'join', { timeControl: '3+0' });
    expect((await pool.query('SELECT count(*)::int AS n FROM chess_queue')).rows[0].n).toBe(1);
  });
});
