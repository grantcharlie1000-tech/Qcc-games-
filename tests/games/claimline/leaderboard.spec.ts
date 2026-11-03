import { test, expect, seedStudyTopic } from '../../fixtures';
import { appSettings } from '../../game-menu';
import type { BrowserContext, Page } from '@playwright/test';
import { LocalDB, createLocalPool } from '../../support/local-db';
import { createLeaderboardHandler } from '../../../src/leaderboard/server';
import { createAccountsHandler } from '../../../src/accounts/server';

// The real leaderboard and accounts handlers run against a throwaway local Postgres built from the repo migrations.
const database = new LocalDB();
let pool: ReturnType<typeof createLocalPool>;
let handle: ReturnType<typeof createLeaderboardHandler>, accounts: ReturnType<typeof createAccountsHandler>;
test.beforeAll(async () => {
  const connectionString = await database.start();
  await database.applyMigrations('db/migrations');
  pool = createLocalPool(connectionString);
  handle = createLeaderboardHandler(pool); accounts = createAccountsHandler(pool);
});
test.afterAll(async () => { await pool?.end(); await database.stop(); });

async function connect(context: BrowserContext, username: string, posts: { game: string; score: number; status: number }[]) {
  const response = await accounts(new Request('https://arcade.test/.netlify/functions/accounts?action=signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: 'test password' }) }));
  expect(response.status).toBe(201);
  const session = await response.json();
  await seedStudyTopic(context);
  await context.addInitScript(s => localStorage.setItem('pocket-arcade:v1:accounts:session', JSON.stringify(s)), session);
  await context.route(/\/\.netlify\/functions\/(leaderboard|accounts)/, async route => {
    const req = route.request();
    const result = await (req.url().includes('/accounts') ? accounts : handle)(new Request(req.url(), { method: req.method(), headers: req.headers(), body: ['POST','PUT'].includes(req.method()) ? req.postData() : undefined }));
    if (req.url().includes('/leaderboard') && req.method() === 'POST') posts.push({ ...req.postDataJSON(), status: result.status });
    await route.fulfill({ status: result.status, headers: Object.fromEntries(result.headers), body: await result.text() });
  });
  return session.username as string;
}
const pending = (page: Page, user: string) => page.evaluate(u => JSON.parse(localStorage.getItem('pocket-arcade:v1:leaderboard:pending:account:' + u) ?? '{}'), user.toLowerCase());

test('Claimline keeps its peak queued quietly across reloads while its leaderboard remains closed', async ({ browser }) => {
  test.setTimeout(90000);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const posts: { game: string; score: number; status: number }[] = [];
  try {
    const user = await connect(context, 'Loop_Ada', posts);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/#/game/claimline');
    // The glass layout has no in-game sidebar: the Leaderboards dialog (Menu > Settings > Leaderboards) is the board.
    await expect(page.getByRole('complementary', { name: 'Claimline leaderboard' })).toHaveCount(0);
    await page.locator('.cl-start').click();
    // Starting reports the human's peak; the milestone flush posts it and the database refuses the game id.
    await expect.poll(() => posts.filter(p => p.game === 'claimline').length).toBeGreaterThan(0);
    expect(posts.find(p => p.game === 'claimline')!.status).toBe(409);
    const peak = Number(await page.locator('.cl-game').getAttribute('data-peak'));
    expect(peak).toBeGreaterThan(0);
    expect(posts.every(p => p.game === 'claimline' && p.score > 0 && p.score <= 10000)).toBe(true);
    await expect.poll(async () => (await pending(page, user)).claimline ?? 0).toBeGreaterThan(0);
    // Graceful: an empty board, no error text, the local best kept, and the game keeps running.
    await expect(page.locator('#game-best strong')).toHaveText(/^\d+\.\d\d%$/);
    expect(Number(await page.evaluate(() => localStorage.getItem('pocket-arcade:v1:best:claimline')))).toBeGreaterThan(0);
    await appSettings(page); await page.locator('#open-leaderboards').click();
    await expect(page.locator('#leaderboard-game')).toHaveValue('claimline');
    await expect(page.locator('#leaderboard-dialog .lb-status')).toHaveText('No scores yet. Be the first to play!');
    await expect(page.locator('#leaderboard-dialog')).not.toContainText(/unavailable|error/i);
    const before = posts.length;
    await page.locator('#leaderboard-dialog').getByRole('button', { name: 'Refresh scores' }).click();
    await expect(page.locator('#leaderboard-dialog .lb-status')).toHaveText('No scores yet. Be the first to play!');
    expect(posts.length).toBe(before); // parked: not posted again on every refresh
    expect(errors).toEqual([]);

    // A reload may retry, but never opens the board or discards the queued/local peak.
    const queued = (await pending(page, user)).claimline as number;
    await page.reload();
    await expect.poll(() => posts.length).toBeGreaterThan(before);
    expect(posts.every(p => p.status === 409)).toBe(true);
    expect((await pending(page, user)).claimline).toBeGreaterThanOrEqual(queued);
    expect(Number(await page.evaluate(() => localStorage.getItem('pocket-arcade:v1:best:claimline')))).toBeGreaterThanOrEqual(queued);
    expect((await pool.query("SELECT * FROM arcade_scores WHERE game_id='claimline'")).rows).toHaveLength(0);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
