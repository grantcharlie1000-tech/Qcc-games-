import {test, expect} from '../../fixtures';
import {BAND_MAX, HOP_TIME, IDLE_LIMIT, IDLE_WARN} from '../../../src/games/crossy-road/config';
import {laneVelocity, mod, platformAt, railWarning, trainHit} from '../../../src/games/crossy-road/lanes';
import {advance, cardShot, carDeath, expectDeathCard, force, hop, openGame, rail, river, showCard, state} from './helpers';

// Each death is forced on a lane the test builds, triggered through real input and stepped with advance(). Every timing is
// computed on the Node side from lanes.ts with the forced lane's own numbers. A death takes 0.9 s to play out before the
// Game Over card appears, so advance(1) after a death shows the card.

/** The first time in [from, to], scanned every millisecond, at which `holds` is true; NaN when it never is. */
function firstTime(holds: (t: number) => boolean, from: number, to: number): number {
  for (let t = from; t <= to; t += 0.001) if (holds(t)) return t;
  return Number.NaN;
}

test('a car squashes the player: car', async ({page}) => {
  const errors = await openGame(page);
  await carDeath(page);
  await showCard(page);
  await expectDeathCard(page, 'car', 'Hit by a car');
  await cardShot(page, 'death-car');
  expect(errors).toEqual([]);
});

test('a train hits the player at least one second after its warning light: train', async ({page}) => {
  test.setTimeout(60000);
  const errors = await openGame(page);
  const t0 = (await state(page)).t;
  // The next train enters the band 2.5 s from now, so the light (WARN_LEAD = 1.1 s earlier) is off while the player hops on.
  const lane = rail(1, {dir: 1, length: 14, period: 9, phase: t0 + 2.5});
  const lightOn = firstTime(t => railWarning(lane, t), t0, t0 + 6);
  const hit = firstTime(t => trainHit(lane, 4, t), t0, t0 + 6);
  expect(railWarning(lane, t0)).toBe(false);
  expect(lightOn - t0, 'the light is still off when the hop lands').toBeGreaterThan(HOP_TIME + 1);
  expect(hit - lightOn, 'the setup gives a fair warning').toBeGreaterThanOrEqual(1.0);

  await force(page, [lane]);
  expect((await state(page)).railWarnings).not.toContain(1);
  await hop(page, 'ArrowUp');
  expect(await state(page)).toMatchObject({row: 1, alive: true});
  expect((await state(page)).railWarnings, 'the light is off when the player has landed on the rails').not.toContain(1);

  let warnedAt = Number.NaN, diedAt = Number.NaN;
  for (let i = 0; i < 160 && Number.isNaN(diedAt); i++) {
    await advance(page, 0.05);
    const s = await state(page);
    if (Number.isNaN(warnedAt) && s.railWarnings.includes(1)) warnedAt = s.t;
    if (!s.alive) { diedAt = s.t; expect(s.deathCause).toBe('train'); }
  }
  expect(Number.isNaN(warnedAt), 'the light came on').toBe(false);
  expect(Number.isNaN(diedAt), 'the train hit the player').toBe(false);
  expect(diedAt - warnedAt, 'seconds of warning before the train hit').toBeGreaterThanOrEqual(1.0);
  // The browser agrees with lanes.ts to within the 0.05 s slices (plus one 1/60 s step for the hit).
  expect(warnedAt - lightOn).toBeGreaterThanOrEqual(-0.001);
  expect(warnedAt - lightOn).toBeLessThan(0.06);
  expect(diedAt - hit).toBeGreaterThanOrEqual(-0.001);
  expect(diedAt - hit).toBeLessThan(0.07);

  await showCard(page);
  await expectDeathCard(page, 'train', 'Hit by a train');
  await cardShot(page, 'death-train');
  expect(errors).toEqual([]);
});

test('landing in open water drowns the player: water', async ({page}) => {
  const errors = await openGame(page);
  const t0 = (await state(page)).t, landing = t0 + HOP_TIME;
  const lane = river(1, {dir: 1, speed: 1.5, cycle: 8, movers: [{offset: 0, len: 3, color: 0}]});
  // A log's left edge is at 6.5 when the hop lands, and the log before it ends at 1.5: column 4 is mid-gap.
  lane.phase = mod(6.5 - lane.dir * lane.speed * landing, lane.cycle);
  expect(platformAt(lane, 4, landing), 'no log under column 4 at landing').toBe(false);
  expect(platformAt(lane, 4, t0), 'nor when the hop starts').toBe(false);
  await force(page, [lane]);
  await page.keyboard.press('ArrowUp');
  await advance(page, 0.06);
  expect(await state(page), 'still in the air half way through the hop').toMatchObject({alive: true, hopping: true, row: 1});
  await advance(page, 0.1);
  expect(await state(page), 'dead as soon as it lands').toMatchObject({alive: false, deathCause: 'water', phase: 'dying'});
  await showCard(page);
  await expectDeathCard(page, 'water', 'Fell in the river');
  await cardShot(page, 'death-water');
  expect(errors).toEqual([]);
});

test('a log carries the player off the edge: swept', async ({page}) => {
  test.setTimeout(60000);
  const errors = await openGame(page);
  const t0 = (await state(page)).t, landing = t0 + HOP_TIME;
  const lane = river(1, {dir: 1, speed: 2.5, cycle: 40, movers: [{offset: 0, len: 20, color: 0}]});
  // One long log spans -6 to 14 when the hop lands: it carries the player from column 4 to the band's right edge.
  lane.phase = mod(-6 - lane.dir * lane.speed * landing, lane.cycle);
  expect(platformAt(lane, 4, landing), 'a log under column 4 at landing').toBe(true);
  const ride = (BAND_MAX - 4) / laneVelocity(lane);
  expect(ride).toBeCloseTo(1.8, 6);

  await force(page, [lane]);
  await hop(page, 'ArrowUp');
  let s = await state(page);
  expect(s, 'riding a log after landing').toMatchObject({alive: true, row: 1, hopping: false});
  expect(s.x, 'the log has carried the player since landing').toBeCloseTo(4 + laneVelocity(lane) * (s.t - landing), 2);

  let diedAt = Number.NaN;
  for (let i = 0; i < 100 && Number.isNaN(diedAt); i++) {
    await advance(page, 0.05);
    s = await state(page);
    if (!s.alive) diedAt = s.t;
    else expect(s.x).toBeLessThanOrEqual(BAND_MAX);
  }
  expect(Number.isNaN(diedAt), 'the player was swept off').toBe(false);
  expect(s).toMatchObject({deathCause: 'swept', phase: 'dying'});
  expect(s.x, 'dead once past the right edge').toBeGreaterThan(BAND_MAX);
  expect(Math.abs((diedAt - landing) - ride), 'seconds from landing to the edge').toBeLessThanOrEqual(0.1);

  await showCard(page);
  await expectDeathCard(page, 'swept', 'Carried away on a log');
  await cardShot(page, 'death-swept');
  expect(errors).toEqual([]);
});

test('waiting too long on safe grass: a UFO warns, then beams the player up: ufo-idle', async ({page}) => {
  test.setTimeout(60000);
  const errors = await openGame(page);
  const root = page.locator('.crossy-road');
  await hop(page, 'ArrowUp'); // the first hop starts the idle clock at t = 0; the player waits on row 1 (safe grass)
  let s = await state(page);
  expect(s).toMatchObject({row: 1, alive: true, ufoWarning: false});
  await advance(page, IDLE_WARN - 0.2 - s.idle);
  s = await state(page);
  expect(s.idle).toBeCloseTo(IDLE_WARN - 0.2, 3);
  expect(s, 'no warning at 4.8 s').toMatchObject({alive: true, ufoWarning: false});
  await expect(root).toHaveAttribute('data-warn', 'false');

  await advance(page, 0.3);
  s = await state(page);
  expect(s.idle).toBeCloseTo(IDLE_WARN + 0.1, 3);
  expect(s, 'the warning is on after 5.0 s').toMatchObject({alive: true, ufoWarning: true});
  await expect(root).toHaveAttribute('data-warn', 'true');

  await advance(page, IDLE_LIMIT - 0.2 - s.idle); // on to 6.8 s of waiting
  s = await state(page);
  expect(s.idle).toBeCloseTo(IDLE_LIMIT - 0.2, 3);
  expect(s, 'still alive and warned at 6.8 s').toMatchObject({alive: true, ufoWarning: true, phase: 'running'});

  await advance(page, 0.3);
  expect(await state(page), 'beamed up after 7.0 s').toMatchObject({alive: false, deathCause: 'ufo-idle', phase: 'dying'});
  await showCard(page);
  await expectDeathCard(page, 'ufo-idle', 'Beamed up by a UFO for waiting too long');
  await cardShot(page, 'death-ufo-idle');
  expect(errors).toEqual([]);
});

test('before the first hop there is no UFO, however long the player waits', async ({page}) => {
  const errors = await openGame(page);
  await advance(page, 20);
  const s = await state(page);
  expect(s.t).toBeGreaterThan(19.9);
  expect(s).toMatchObject({alive: true, phase: 'ready', started: false, ufoWarning: false, idle: 0, deathCause: null, row: 0});
  await expect(page.locator('.crossy-road')).toHaveAttribute('data-phase', 'ready');
  await expect(page.locator('.crossy-road')).toHaveAttribute('data-warn', 'false');
  await expect(page.locator('.hw-over')).toBeHidden();
  expect(errors).toEqual([]);
});

test('three rows behind the furthest row, a UFO beams the player up: ufo-behind', async ({page}) => {
  const errors = await openGame(page);
  for (let i = 0; i < 3; i++) await hop(page, 'ArrowUp'); // rows 1-4 are safe start grass
  await hop(page, 'ArrowDown');
  await hop(page, 'ArrowDown');
  expect(await state(page), 'two rows back is still fine').toMatchObject({row: 1, maxRow: 3, alive: true, deathCause: null});
  await page.keyboard.press('ArrowDown'); // row 0 is the furthest row (3) minus 3
  await advance(page, 0.1);
  expect(await state(page), 'three rows back is fatal at once').toMatchObject({row: 0, maxRow: 3, alive: false, deathCause: 'ufo-behind', phase: 'dying'});
  await showCard(page);
  await expectDeathCard(page, 'ufo-behind', 'Beamed up by a UFO for falling behind');
  await cardShot(page, 'death-ufo-behind');
  expect(errors).toEqual([]);
});

test('Space starts a new run after a death', async ({page}) => {
  const errors = await openGame(page);
  await carDeath(page);
  await advance(page, 1);
  await expectDeathCard(page, 'car', 'Hit by a car');
  await page.keyboard.press('Space');
  await expect(page.locator('.crossy-road')).toHaveAttribute('data-phase', 'ready');
  expect(await state(page)).toMatchObject({phase: 'ready', row: 0, col: 4, score: 0, alive: true, deathCause: null, started: false});
  await expect(page.locator('.hw-over')).toBeHidden();
  await expect(page.locator('.crossy-road')).toHaveAttribute('data-cause', '');
  await expect(page.locator('#game-score strong')).toHaveText('0');
  // The new run plays: it takes input and moves.
  await hop(page, 'ArrowUp');
  expect(await state(page)).toMatchObject({row: 1, phase: 'running'});
  expect(errors).toEqual([]);
});

test('R starts a new run even when focus is not on the Play again button', async ({page}) => {
  const errors = await openGame(page);
  await carDeath(page);
  await advance(page, 1);
  await expectDeathCard(page, 'car', 'Hit by a car');
  // With focus on the button, Space and Enter activate it natively. Off the button the game's own key handler must do it.
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await expect(page.getByRole('button', {name: 'Play again', exact: true})).not.toBeFocused();
  await page.keyboard.press('r');
  await expect(page.locator('.crossy-road')).toHaveAttribute('data-phase', 'ready');
  expect(await state(page)).toMatchObject({phase: 'ready', row: 0, score: 0, alive: true, deathCause: null});
  await expect(page.locator('.hw-over')).toBeHidden();
  expect(errors).toEqual([]);
});

test('Rankings opens the shell leaderboard dialog, and its close button closes it', async ({page}) => {
  const errors = await openGame(page);
  await carDeath(page);
  await advance(page, 1);
  await expectDeathCard(page, 'car', 'Hit by a car');
  await page.getByRole('button', {name: 'Rankings', exact: true}).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', {name: 'Leaderboards'})).toBeVisible();
  await expect(dialog.locator('#leaderboard-game')).toHaveValue('crossy-road');
  await dialog.getByRole('button', {name: 'Close leaderboards'}).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  // Back on the game over card, which still works.
  await expect(page.locator('.hw-over')).toBeVisible();
  expect((await state(page)).phase).toBe('over');
  expect(errors).toEqual([]);
});
