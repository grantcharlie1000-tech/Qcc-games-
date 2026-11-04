import { test, expect, seedStudyTopic } from '../../fixtures';
import { appSettings } from '../../game-menu';
import type { BrowserContext, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { NetlifyDB } from '@netlify/database-dev';
import { getDatabase } from '@netlify/database';
import { createLeaderboardHandler } from '../../../src/leaderboard/server';
import { createAccountsHandler } from '../../../src/accounts/server';

// The real leaderboard and accounts handlers run against a throwaway local Postgres built from the repo migrations.
const database = new NetlifyDB({ logger: () => {} });
let pool: ReturnType<typeof getDatabase>['pool'];
let handle: ReturnType<typeof createLeaderboardHandler>, accounts: ReturnType<typeof createAccountsHandler>;
let migration = '';
test.beforeAll(async () => {
  const connectionString = await database.start();
  await database.applyMigrations('netlify/database/migrations');
  pool = getDatabase({ connectionString }).pool;
  handle = createLeaderboardHandler(pool); accounts = createAccountsHandler(pool);
  migration = await readFile('netlify/database/migrations/20261102090000_claimline_leaderboard.sql', 'utf8');
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
    const result = await (req.url().includes('/accounts') ? accounts : handle)(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.method() === 'POST' ? req.postData() : undefined }));
    if (req.url().includes('/leaderboard') && req.method() === 'POST') posts.push({ ...req.postDataJSON(), status: result.status });
    await route.fulfill({ status: result.status, headers: Object.fromEntries(result.headers), body: await result.text() });
  });
  return session.username as string;
}
const pending = (page: Page, user: string) => page.evaluate(u => JSON.parse(localStorage.getItem('pocket-arcade:v1:leaderboard:pending:account:' + u) ?? '{}'), user.toLowerCase());

test('before the migration a Claimline peak stays queued quietly, and it syncs by itself once the database accepts it', async ({ browser }) => {
  test.setTimeout(90000);
  await pool.query(migration.replace(",'claimline'", '')); // production as it stands before the migration
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const posts: { game: string; score: number; status: number }[] = [];
  try {
    const user = await connect(context, 'Loop_Ada', posts);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/#/game/claimline');
    // Since #93/#94 desktop widths carry a floating "Top scores" panel for every game. It starts collapsed, so a queued
    // peak shows nothing loud; the Leaderboards dialog (Menu > Settings > Leaderboards) is the full board.
    const panel = page.getByRole('complementary', { name: 'Claimline leaderboard' });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Top scores' })).toHaveAttribute('aria-expanded', 'false');
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

    // The migration lands (here: on the throwaway test database). No code changes; the next page load sends the queue.
    await pool.query(migration);
    const queued = (await pending(page, user)).claimline as number;
    await page.reload();
    await expect.poll(() => posts.filter(p => p.game === 'claimline' && p.status === 200).length).toBeGreaterThan(0);
    await expect.poll(async () => (await pending(page, user)).claimline).toBeUndefined();
    expect(posts.filter(p => p.status === 200).at(-1)).toMatchObject({ game: 'claimline', score: queued });
    await appSettings(page); await page.locator('#open-leaderboards').click();
    await expect(page.locator('#leaderboard-game')).toHaveValue('claimline');
    const you = page.locator('#leaderboard-dialog tr.lb-you');
    await expect(you).toContainText('Loop_Ada'); await expect(you).toContainText(/\d+\.\d\d%/);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await pool.query(migration);
  }
});
