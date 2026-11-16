import { test, expect, type Page } from '@playwright/test';
import { closeAll, launchPlayer } from '../../multiplayer/peers';

// Two separate Chromium processes play a friend game over real WebRTC with
// PeerJS Cloud signalling. The host's browser runs the authoritative match.
test.skip(({ browserName }) => browserName !== 'chromium', 'Online tests launch their own Chromium processes.');
const moves = (page: Page) => page.locator('.ch-moves .ch-mv');
async function move(page: Page, from: string, to: string) { await page.locator(`#ch-sq-${from}`).click(); await page.locator(`#ch-sq-${to}`).click(); }

test('two browsers create, join, play, resign and rematch a friend game', async () => {
  test.setTimeout(180_000);
  const host = await launchPlayer('Hana'), guest = await launchPlayer('Gus');
  try {
    await host.page.goto('/#/game/chess');
    await host.page.getByRole('button', { name: /Friend/ }).click();
    await host.page.getByRole('radio', { name: 'White' }).click();
    await host.page.getByRole('radio', { name: '3 | 2' }).click();
    await host.page.getByRole('button', { name: 'Create game' }).click();
    const codeEl = host.page.locator('.ch-code-big');
    await expect(codeEl).toHaveText(/^[A-Z0-9]{6}$/, { timeout: 30000 });
    await host.page.screenshot({ path: 'tests/games/chess/evidence/friend-lobby-1280.png' });
    const code = (await codeEl.textContent())!;

    await guest.page.goto(`/#/game/chess?room=${code}`);
    await expect(guest.page.locator('.ch-code')).toHaveValue(code);
    await guest.page.getByRole('button', { name: 'Join', exact: true }).click();
    for (const p of [host, guest]) await expect(p.page.locator('.ch-board')).toBeVisible({ timeout: 30000 });
    await expect(host.page.locator('.ch-player[data-pos="top"]')).toContainText('Gus');
    await expect(guest.page.locator('.ch-player[data-pos="top"]')).toContainText('Hana');

    await move(host.page, 'e2', 'e4');
    await expect(moves(guest.page)).toHaveText(['e4']);
    await move(guest.page, 'e7', 'e5');
    await expect(moves(host.page)).toHaveText(['e4', 'e5']);
    // Both clocks run from the host's authoritative state.
    await expect(guest.page.locator('.ch-player[data-pos="top"] .ch-clock')).toHaveClass(/ch-running/);

    await guest.page.getByRole('button', { name: 'Draw' }).click();
    await expect(host.page.locator('.ch-banner')).toContainText('Draw offered');
    await host.page.getByRole('button', { name: 'Decline' }).click();
    await expect(guest.page.locator('.ch-banner')).toBeHidden();

    await host.page.getByRole('button', { name: 'Resign' }).click();
    await host.page.getByRole('button', { name: 'Confirm' }).click();
    await expect(guest.page.getByRole('dialog', { name: 'Game over' })).toContainText('You won');
    await expect(host.page.getByRole('dialog', { name: 'Game over' })).toContainText('Casual');

    await guest.page.getByRole('dialog', { name: 'Game over' }).getByRole('button', { name: 'Rematch' }).click();
    await host.page.getByRole('dialog', { name: 'Game over' }).getByRole('button', { name: 'Review' }).click();
    await host.page.getByRole('button', { name: 'Accept rematch' }).click();
    // The rematch swaps colours: the guest now plays White.
    await expect(moves(host.page)).toHaveCount(0, { timeout: 15000 });
    await expect(guest.page.locator('.ch-state')).toHaveText('Your move', { timeout: 15000 });
    await move(guest.page, 'd2', 'd4');
    await expect(moves(host.page)).toHaveText(['d4']);
  } finally { await closeAll([host, guest]); }
});
