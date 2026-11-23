import { test, expect } from '../fixtures';

// The GTA IV engine runs on each player's own computer. This test must not
// pretend that QCC hosts the game or that a game disc is publicly available.
test('GTA IV entry explains the owned-disc requirement and launches the local web port', async ({ page }) => {
  await page.goto('/#/game/gta-iv-web');

  await expect(page.getByRole('heading', { name: 'GTA IV on the Web' })).toBeVisible();
  await expect(page.getByText(/USA Xbox 360/i)).toBeVisible();
  await expect(page.getByText(/Title Update 8/i)).toBeVisible();
  await expect(page.getByText(/not hosted on QCC-Games/i)).toBeVisible();

  const play = page.getByRole('link', { name: 'Open local game' });
  await expect(play).toHaveAttribute('href', 'http://localhost:8765/');
  await expect(play).toHaveAttribute('target', '_blank');

  const release = page.getByRole('link', { name: 'Get the web port' });
  await expect(release).toHaveAttribute('href', 'https://github.com/itzzace/gta4-web/releases/latest');
});

test('GTA IV launcher can be left using QCC normal game navigation', async ({ page }) => {
  await page.goto('/#/game/gta-iv-web');
  await expect(page.locator('.gta4-local')).toBeVisible();
  await page.locator('.game-dock a[href="#/collection"]').click();
  await expect(page).toHaveURL(/#\/collection$/);
  await expect(page.locator('.gta4-local')).toHaveCount(0);
});
