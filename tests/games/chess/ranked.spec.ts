import { test, expect, seedStudyTopic } from '../../fixtures';
import type { BrowserContext, Page } from '@playwright/test';
import { NetlifyDB } from '@netlify/database-dev';
import { getDatabase } from '@netlify/database';
import { createAccountsHandler } from '../../../src/accounts/server';
import { createChessHandler } from '../../../src/games/chess/online/server';

// Two isolated browser contexts play ranked chess through the real chess and
// account handlers on a real local Postgres. Only the network hop to a
// deployed backend is replaced; every request is judged by the server code.
test.describe.configure({ mode: 'serial' });
const database = new NetlifyDB({ logger: () => {} });
let pool: ReturnType<typeof getDatabase>['pool'];
let chess: ReturnType<typeof createChessHandler>;
let accounts: ReturnType<typeof createAccountsHandler>;
const EVIDENCE = 'tests/games/chess/evidence/';

test.beforeAll(async () => {
  const cs = await database.start();
  await database.applyMigrations('netlify/database/migrations');
  pool = getDatabase({ connectionString: cs }).pool;
  chess = createChessHandler(pool);
  accounts = createAccountsHandler(pool);
});
test.afterAll(async () => { await pool?.end(); await database.stop(); });

async function connect(context: BrowserContext, username?: string) {
  await seedStudyTopic(context);
  if (username) {
    const r = await accounts(new Request('https://arcade.test/.netlify/functions/accounts?action=signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: 'test password' }) }));
    expect(r.status).toBe(201);
    const session = await r.json();
    await context.addInitScript((s) => { localStorage.setItem('pocket-arcade:v1:accounts:session', JSON.stringify(s)); localStorage.setItem('qcc:christmas-welcome:2026:' + s.username.toLowerCase(), 'seen'); }, session);
  }
  await context.route(/\/\.netlify\/functions\/(chess|accounts)/, async (route) => {
    const req = route.request();
    const handler = req.url().includes('/chess') ? chess : accounts;
    const res = await handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.method() === 'POST' ? req.postData() : undefined }));
    await route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() });
  });
}
const moves = (page: Page) => page.locator('.ch-moves .ch-mv');
/** Presses a game action: on wide screens it is in the panel, on phones it is in the Options sheet. */
async function act(page: Page, name: string) {
  const direct = page.locator('.ch-actions').getByRole('button', { name, exact: true });
  if (await direct.isVisible()) { await direct.click(); return; }
  const sheet = page.getByRole('dialog', { name: 'Game options' });
  if (!(await sheet.isVisible())) await page.getByRole('button', { name: 'Options', exact: true }).click();
  await sheet.getByRole('button', { name, exact: true }).click();
}
async function move(page: Page, from: string, to: string) { await page.locator(`#ch-sq-${from}`).click(); await page.locator(`#ch-sq-${to}`).click(); }
const clockSeconds = async (page: Page, pos: 'top' | 'bottom') => {
  const t = (await page.locator(`.ch-player[data-pos="${pos}"] .ch-clock`).textContent()) ?? '';
  const [m, s] = t.split(':').map(Number);
  return s === undefined ? m : m * 60 + s;
};

test('guests are asked to log in before ranked play', async ({ browser }) => {
  const ctx = await browser.newContext();
  try {
    await connect(ctx);
    const page = await ctx.newPage();
    await page.goto('/#/game/chess');
    await page.getByRole('button', { name: /Ranked/ }).click();
    await expect(page.getByText('Log in to play ranked games.')).toBeVisible();
  } finally { await ctx.close(); }
});

test('two players are matched, play, agree a draw, then a decisive game updates ratings and the leaderboard', async ({ browser }, info) => {
  test.setTimeout(120_000);
  const ca = await browser.newContext({ viewport: { width: 390, height: 844 } }), cb = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    await connect(ca, 'Ana_Ranked');
    await connect(cb, 'Ben_Ranked');
    const a = await ca.newPage(), b = await cb.newPage();
    for (const p of [a, b]) {
      await p.goto('/#/game/chess');
      await p.getByRole('button', { name: /Ranked/ }).click();
      await expect(p.getByRole('button', { name: 'Find opponent' })).toBeVisible();
      await expect(p.locator('.ch-rating-card').first()).toContainText('1500');
    }
    await a.getByRole('button', { name: 'Find opponent' }).click();
    await expect(a.getByRole('heading', { name: 'Finding opponent' })).toBeVisible();
    if (info.project.name === 'chromium') {
      await a.screenshot({ path: EVIDENCE + 'matchmaking-390.png' });
      await a.setViewportSize({ width: 1440, height: 900 });
      await a.screenshot({ path: EVIDENCE + 'matchmaking-1440.png' });
      await a.setViewportSize({ width: 390, height: 844 });
    }
    await b.getByRole('button', { name: 'Find opponent' }).click();
    for (const p of [a, b]) await expect(p.locator('.ch-board')).toBeVisible({ timeout: 15000 });

    const row = (await pool.query(`SELECT w.username AS white FROM chess_games g JOIN accounts w ON w.id = g.white_id WHERE g.status = 'active'`)).rows[0];
    const [white, black] = row.white === 'Ana_Ranked' ? [a, b] : [b, a];
    await expect(white.locator('.ch-state')).toHaveText(/Move within \d+ s or the game is aborted/);
    await expect(black.locator('.ch-state')).toHaveText('Opponent to move');

    // Moves made on one device appear on the other through the server.
    await move(white, 'e2', 'e4');
    await expect(moves(black)).toHaveText(['e4']);
    // Out of turn, a move is only queued as a premove; it plays once Black has moved.
    await move(white, 'd2', 'd4');
    await expect(moves(white)).toHaveCount(1);
    await expect(white.locator('.ch-state')).toContainText('Premove set');
    await move(black, 'e7', 'e5');
    await expect(moves(black)).toHaveText(['e4', 'e5', 'd4']);
    await move(black, 'e5', 'd4');
    await move(white, 'g1', 'f3');
    await expect(moves(black)).toHaveText(['e4', 'e5', 'd4', 'exd4', 'Nf3']);
    // Both screens show the same server clocks (within polling and rounding).
    await black.waitForTimeout(1200);
    const [wb, ba] = await Promise.all([clockSeconds(white, 'top'), clockSeconds(black, 'bottom')]);
    expect(Math.abs(wb - ba)).toBeLessThanOrEqual(2);

    // A forged command from the browser is refused by the server.
    const forged = await black.evaluate(async () => {
      const s = JSON.parse(localStorage.getItem('pocket-arcade:v1:accounts:session')!);
      const me = await (await fetch('/.netlify/functions/chess?action=me', { headers: { Authorization: `Bearer ${s.token}` } })).json();
      const game = await (await fetch(`/.netlify/functions/chess?action=game&id=${me.activeGameId}`, { headers: { Authorization: `Bearer ${s.token}` } })).json();
      const r = await fetch('/.netlify/functions/chess?action=command', { method: 'POST', headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ gameId: me.activeGameId, type: 'move', revision: game.revision, ply: game.moves.length, uci: 'd8d2', commandId: 'forged-move-1' }) });
      const r2 = await fetch('/.netlify/functions/chess?action=result', { method: 'POST', headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ gameId: me.activeGameId, result: '0-1' }) });
      return [r.status, r2.status];
    });
    expect(forged).toEqual([422, 400]);

    // Reload mid-game: the player returns to the same game with its moves.
    await black.reload();
    await expect(moves(black)).toHaveText(['e4', 'e5', 'd4', 'exd4', 'Nf3'], { timeout: 15000 });

    // Draw offer and acceptance.
    await act(black, 'Draw');
    await expect(white.locator('.ch-banner')).toContainText('Draw offered');
    if (info.project.name === 'chromium') await (white === a ? white : black).screenshot({ path: EVIDENCE + 'ranked-game-390.png' });
    await white.getByRole('button', { name: 'Accept' }).click();
    for (const p of [a, b]) {
      const result = p.getByRole('dialog', { name: 'Game over' });
      await expect(result).toContainText('Draw');
      await expect(result).toContainText('Draw agreed');
      await expect(result).toContainText('Rated');
    }

    // A second game, decided by resignation, moves both ratings.
    await a.getByRole('dialog', { name: 'Game over' }).getByRole('button', { name: 'New opponent' }).click();
    await b.getByRole('dialog', { name: 'Game over' }).getByRole('button', { name: 'New opponent' }).click();
    for (const p of [a, b]) await expect(p.locator('.ch-moves .ch-mv-none')).toBeVisible({ timeout: 20000 });
    const row2 = (await pool.query(`SELECT w.username AS white FROM chess_games g JOIN accounts w ON w.id = g.white_id WHERE g.status = 'active'`)).rows[0];
    const [w2, b2] = row2.white === 'Ana_Ranked' ? [a, b] : [b, a];
    await move(w2, 'd2', 'd4');
    await expect(moves(b2)).toHaveCount(1);
    await move(b2, 'd7', 'd5');
    await expect(moves(w2)).toHaveCount(2);
    await act(b2, 'Resign');
    await act(b2, 'Confirm');
    await expect(w2.getByRole('dialog', { name: 'Game over' })).toContainText('You won');
    await expect(b2.getByRole('dialog', { name: 'Game over' })).toContainText('You lost');
    if (info.project.name === 'chromium') await w2.screenshot({ path: EVIDENCE + `ranked-result-${w2 === a ? 390 : 1440}.png` });
    const ratings = (await pool.query(`SELECT a.username, r.games, r.wins, r.losses, r.draws, round(r.rating) AS rating FROM chess_ratings r JOIN accounts a ON a.id = r.account_id ORDER BY a.username`)).rows;
    const winnerName = w2 === a ? 'Ana_Ranked' : 'Ben_Ranked';
    for (const r of ratings) {
      expect(Number(r.games)).toBe(2);
      expect(Number(r.draws)).toBe(1);
      if (r.username === winnerName) expect(Number(r.rating)).toBeGreaterThan(1500); else expect(Number(r.rating)).toBeLessThan(1500);
    }

    // The leaderboard reflects the settled results.
    await b.getByRole('dialog', { name: 'Game over' }).getByRole('button', { name: 'Menu' }).click();
    await b.getByRole('button', { name: /Leaderboard/ }).click();
    await b.getByRole('radio', { name: 'Blitz' }).click();
    await expect(b.locator('.ch-lb-row')).toHaveCount(2);
    await expect(b.locator('.ch-lb-row').first()).toContainText(winnerName);
    await expect(b.locator('.ch-lb-mine')).toContainText('Ben_Ranked');
    if (info.project.name === 'chromium') {
      await b.screenshot({ path: EVIDENCE + 'leaderboard-1440.png' });
      await b.setViewportSize({ width: 390, height: 844 });
      await b.screenshot({ path: EVIDENCE + 'leaderboard-390.png' });
    }
  } finally { await ca.close(); await cb.close(); }
});
