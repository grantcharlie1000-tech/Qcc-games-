import { test, expect, type Page } from '../../fixtures';

const move = async (page: Page, from: string, to: string) => {
  await page.locator('#ch-sq-' + from).click();
  await page.locator('#ch-sq-' + to).click();
};

test.describe('Chess Academy', () => {
  test('fits on mobile, teaches through the board and saves progress', async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/game/chess');
    await page.getByRole('button', { name: /Learn chess/ }).click();
    await expect(page.locator('.ch-academy-card')).toHaveCount(15);
    await expect(page.getByText('0 of 15 lessons')).toBeVisible();

    await page.locator('[data-lesson="centre-pawn"]').click();
    const box = await page.locator('.ch-board').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    if (info.project.name === 'chromium') await page.screenshot({ path: 'tests/games/chess/evidence/academy-390.png' });

    await move(page, 'e2', 'e3');
    await expect(page.locator('.ch-academy-feedback')).toContainText('does not meet');
    await expect(page.locator('.ch-piece[data-square="e2"]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Hint' }).click();
    await expect(page.locator('.ch-guide')).toHaveCount(1);
    await move(page, 'e2', 'e4');
    await expect(page.locator('.ch-academy-feedback')).toContainText('Lesson complete');
    await page.getByRole('button', { name: 'Back to lessons' }).click();
    await expect(page.getByText('1 of 15 lessons')).toBeVisible();
    await expect(page.locator('[data-lesson="centre-pawn"] .ch-academy-stars')).toHaveText('★☆☆');

    await page.getByRole('button', { name: 'Back to Chess' }).click();
    await page.reload();
    await page.getByRole('button', { name: /Learn chess/ }).click();
    await expect(page.locator('[data-lesson="centre-pawn"] .ch-academy-stars')).toHaveText('★☆☆');
  });

  test('supports playing as Black and correctly distinguishes mate from stalemate', async ({ page }) => {
    await page.goto('/#/game/chess');
    await page.getByRole('button', { name: /Learn chess/ }).click();
    await page.locator('[data-lesson="save-e5"]').click();
    await expect(page.getByText('Play as Black')).toBeVisible();
    await move(page, 'b8', 'c6');
    await expect(page.locator('.ch-academy-feedback')).toContainText('Lesson complete');

    await page.getByRole('button', { name: 'Back to lessons' }).click();
    await page.locator('[data-lesson="avoid-stalemate"]').click();
    await move(page, 'b6', 'c7');
    await expect(page.locator('.ch-academy-feedback')).toContainText('does not meet');
    await expect(page.locator('.ch-piece[data-square="b6"]')).toHaveCount(1);
    await move(page, 'b6', 'b7');
    await expect(page.locator('.ch-academy-feedback')).toContainText('Qb7#');
  });
});
