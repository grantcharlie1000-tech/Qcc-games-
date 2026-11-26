import { test, expect } from '../../fixtures';
import { Chess } from '../../../src/chess-ai/providers/beginner/vendor/chess.js';

for (const width of [1440, 390]) for (const tier of [300, 500, 700]) {
  test(`${tier} plays legal moves through its worker at ${width}px`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const errors: string[] = [], requests: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(request.url()));
    await page.goto('/#/game/chess');
    await page.getByRole('button', { name: /Computer/ }).click();
    await page.locator(`.ch-opp[data-value="elo-${tier}"]`).click();
    await page.getByRole('radio', { name: 'White', exact: true }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    const cells = page.locator('.ch-moves .ch-mv'), game = new Chess();
    for (let turn = 0; turn < 6 && !game.isGameOver(); turn++) {
      const move = game.moves({ verbose: true }).sort((a,b) => Number(!!b.captured) - Number(!!a.captured))[0];
      await page.locator(`#ch-sq-${move.from}`).click();
      await page.locator(`#ch-sq-${move.to}`).click();
      if (move.promotion) await page.getByRole('dialog', { name: 'Promote to' }).getByRole('button', { name: 'queen', exact: true }).click();
      game.move(move.lan);
      if (game.isGameOver()) break;
      await expect(cells).toHaveCount((turn + 1) * 2, { timeout: 10000 });
      game.move(await cells.last().evaluate(element => element.childNodes[0].textContent || ''));
    }
    expect(requests.some(url => /engine\.worker/.test(url))).toBe(true);
    expect(requests.filter(url => /chess-engines\/(maia|stockfish)/.test(url))).toEqual([]);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `tests/games/chess/evidence/custom-${tier}-${width}.png` });
  });
}
