import { test, expect, type Page } from '../../fixtures';

const EVIDENCE = 'tests/games/chess/evidence/';
const sq = (page: Page, s: string) => page.locator(`#ch-sq-${s}`);
async function move(page: Page, from: string, to: string) {
  await sq(page, from).click();
  await sq(page, to).click();
}
const moves = (page: Page) => page.locator('.ch-moves .ch-mv');
async function startLocal(page: Page) {
  await page.goto('/#/game/chess');
  await page.getByRole('button', { name: /Pass and play/ }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.ch-board')).toBeVisible();
}

test.describe('chess', () => {
  test('home fits a phone and opens every mode', async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/game/chess');
    for (const name of ['Computer', 'Pass and play', 'Friend', 'Ranked']) await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (info.project.name === 'chromium') await page.screenshot({ path: EVIDENCE + 'home-390.png' });
  });

  test('plays a legal game by tap, rejects illegal moves and ends in checkmate', async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startLocal(page);
    // Illegal: a pawn cannot jump three squares. The position stays unchanged.
    await move(page, 'e2', 'e5');
    await expect(moves(page)).toHaveCount(0);
    await move(page, 'f2', 'f3');
    await move(page, 'e7', 'e5');
    await move(page, 'g2', 'g4');
    await move(page, 'd8', 'h4');
    await expect(moves(page)).toHaveText(['f3', 'e5', 'g4', 'Qh4#']);
    const result = page.getByRole('dialog', { name: 'Game over' });
    await expect(result).toContainText('Black wins');
    await expect(result).toContainText('Checkmate');
    await expect(sq(page, 'e1')).toHaveClass(/ch-check/);
    if (info.project.name === 'chromium') await page.screenshot({ path: EVIDENCE + 'result-390.png' });
    // Pieces cannot move after mate.
    await result.getByRole('button', { name: 'Review' }).click();
    await move(page, 'a2', 'a3');
    await expect(moves(page)).toHaveCount(4);
  });

  test('drags a piece with the mouse and snaps an illegal drop back', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await startLocal(page);
    const box = async (s: string) => (await sq(page, s).boundingBox())!;
    const drag = async (from: string, to: string) => {
      const a = await box(from), b = await box(to);
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
      await page.mouse.up();
    };
    await drag('g1', 'g3');
    await expect(moves(page)).toHaveCount(0);
    await expect(page.locator('.ch-piece[data-square="g1"]')).toHaveCount(1);
    await drag('g1', 'f3');
    await expect(moves(page)).toHaveText(['Nf3']);
    await expect(page.locator('.ch-piece[data-square="f3"]')).toHaveCount(1);
  });

  test('promotes through the chooser, including underpromotion', async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startLocal(page);
    for (const [a, b] of [['a2', 'a4'], ['b7', 'b5'], ['a4', 'b5'], ['a7', 'a6'], ['b5', 'a6'], ['c8', 'b7'], ['a6', 'b7'], ['h7', 'h6']]) await move(page, a, b);
    await move(page, 'b7', 'a8');
    const chooser = page.getByRole('dialog', { name: 'Promote to' });
    await expect(chooser).toBeVisible();
    if (info.project.name === 'chromium') await page.screenshot({ path: EVIDENCE + 'promotion-390.png' });
    await chooser.getByRole('button', { name: 'knight' }).click();
    await expect(moves(page).last()).toHaveText('bxa8=N');
    await expect(page.locator('.ch-piece[data-square="a8"] use')).toHaveAttribute('href', '#ch-wn');
  });

  test('moves with the keyboard alone', async ({ page }) => {
    await startLocal(page);
    await page.locator('.ch-board').focus();
    // The cursor starts on e2.
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(moves(page)).toHaveText(['e4']);
  });

  test('keeps a pass and play game across a reload', async ({ page }) => {
    await startLocal(page);
    await move(page, 'e2', 'e4');
    await move(page, 'c7', 'c5');
    // The shell saves on pause; leaving the game saves too.
    await page.evaluate(() => { location.hash = '#/collection'; });
    await expect(page.locator('.ch')).toHaveCount(0);
    await page.reload();
    await page.goto('/#/game/chess');
    await page.getByRole('button', { name: /Continue pass and play/ }).click();
    await expect(moves(page)).toHaveText(['e4', 'c5']);
    await expect(page.locator('.ch-state')).toHaveText('White to move');
  });

  test('says truthfully when no engines are installed', async ({ page }) => {
    await page.goto('/#/game/chess');
    await page.getByRole('button', { name: /Computer/ }).click();
    await expect(page.getByText('No engines are installed yet.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
    await expect(page.locator('.ch-opp').first()).toContainText('Not installed');
  });

  test('plays the computer through the AI contract with the test engine', async ({ page, context }, info) => {
    await context.addInitScript(() => localStorage.setItem('qcc:chess:mock-ai', '1'));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/game/chess');
    await page.getByRole('button', { name: /Computer/ }).click();
    await expect(page.locator('.ch-opp[aria-checked="true"]')).toContainText('Test engine');
    if (info.project.name === 'chromium') await page.screenshot({ path: EVIDENCE + 'computer-setup-1440.png' });
    await page.getByRole('radio', { name: 'White' }).click();
    await page.getByRole('radio', { name: '5 | 3' }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await move(page, 'e2', 'e4');
    // The engine's reply arrives through the contract and is applied by the rules layer.
    await expect(moves(page)).toHaveCount(2);
    await expect(page.locator('.ch-player[data-pos="bottom"] .ch-clock')).toHaveClass(/ch-running/);
    if (info.project.name === 'chromium') await page.screenshot({ path: EVIDENCE + 'computer-game-1440.png' });
    // A takeback returns to the player's turn.
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(moves(page)).toHaveCount(0);
  });

  test('reviews a finished game, stepping through moves, and never invents an evaluation', async ({ page }) => {
    await startLocal(page);
    for (const [a, b] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]) await move(page, a, b);
    await page.getByRole('dialog', { name: 'Game over' }).getByRole('button', { name: 'Review' }).click();
    await expect(page.getByText('Engine analysis is not installed.')).toBeVisible();
    await expect(page.locator('.ch-evalbar')).toBeHidden();
    await page.getByRole('button', { name: 'First move' }).click();
    await expect(page.locator('.ch-piece[data-square="h4"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Next move' }).click();
    await expect(page.locator('.ch-piece[data-square="f3"]')).toHaveCount(1);
    await expect(page.locator('.ch-state')).toHaveText('Viewing move 1 of 4');
    await page.getByRole('button', { name: 'g4' }).click();
    await expect(page.locator('.ch-piece[data-square="g4"]')).toHaveCount(1);
    await expect(page.locator('.ch-piece[data-square="h4"]')).toHaveCount(0);
    // The finished game is kept on this device and opens again from My games.
    await page.evaluate(() => { location.hash = '#/collection'; });
    await page.goto('/#/game/chess');
    await page.getByRole('button', { name: 'My games' }).click();
    await page.locator('.ch-hist').first().click();
    await expect(moves(page)).toHaveText(['f3', 'e5', 'g4', 'Qh4#']);
  });

  test('runs engine analysis through the contract when an analysis engine is present', async ({ page, context }, info) => {
    await context.addInitScript(() => localStorage.setItem('qcc:chess:mock-ai', '1'));
    await page.setViewportSize({ width: 1440, height: 900 });
    await startLocal(page);
    for (const [a, b] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]) await move(page, a, b);
    await page.getByRole('dialog', { name: 'Game over' }).getByRole('button', { name: 'Review' }).click();
    await page.getByRole('button', { name: /Analyze with Test engine/ }).click();
    await expect(page.locator('.ch-graph')).toBeVisible();
    await expect(page.locator('.ch-evalbar')).toBeVisible();
    if (info.project.name === 'chromium') await page.screenshot({ path: EVIDENCE + 'review-1440.png' });
  });

  test('has no horizontal scroll and a full-width board on a phone in a game', async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startLocal(page);
    const board = (await page.locator('.ch-board').boundingBox())!;
    expect(board.width).toBeGreaterThan(340);
    expect(board.x).toBeGreaterThanOrEqual(0);
    expect(board.x + board.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await move(page, 'e2', 'e4');
    await sq(page, 'g8').click();
    if (info.project.name === 'chromium') await page.screenshot({ path: EVIDENCE + 'game-390.png' });
  });
});
