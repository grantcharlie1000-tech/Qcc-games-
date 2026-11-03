/** Shared helpers for the CrossyRoad browser specs: the typed wrapper over the dev-only `window.__crossyRoadTest` hook, builders
 * for forced lanes, real-input helpers, and the evidence screenshots.
 *
 * Determinism: every spec opens the game with `openGame`, which freezes the simulation and seeds a fresh run, so game time
 * only moves when a test calls `advance`. Input is always real (keyboard, mouse and touch events); the hook only reads
 * state, steps time and replaces lanes. */
import {expect, test} from '../../fixtures';
import type {Page} from '../../fixtures';
import {COLS, EDGE_COLS, TRAIN_SPEED} from '../../../src/games/crossy-road/config';
import type {DeathCause, GrassLane, Lane, LilyLane, RailLane, RiverLane, RoadLane} from '../../../src/games/crossy-road/config';
import {mod, vehicleHit} from '../../../src/games/crossy-road/lanes';
import type {HookState, CrossyRoadTestApi} from '../../../src/games/crossy-road/test-hook';

export type {HookState, Lane};

declare global {
  interface Window { __crossyRoadTest?: CrossyRoadTestApi; __crossyRoadFrames?: number }
}

/** The seed most specs play on: rows 0-4 are the safe start, and nothing about it matters beyond that. */
export const SEED = 11;
export const EVIDENCE = '/workspace/qcc-copy-shots/crossy-road';

// ---------------------------------------------------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------------------------------------------------

/** Typed wrappers over `window.__crossyRoadTest`. Each call is one `page.evaluate`. */
export function hook(page: Page) {
  return {
    setSeed: (seed: number) => page.evaluate(s => window.__crossyRoadTest!.setSeed(s), seed),
    freeze: (on: boolean) => page.evaluate(v => window.__crossyRoadTest!.freeze(v), on),
    advance: (seconds: number) => page.evaluate(s => window.__crossyRoadTest!.advance(s), seconds),
    state: () => page.evaluate(() => window.__crossyRoadTest!.state()),
    lanes: (from: number, to: number) => page.evaluate(([a, b]) => window.__crossyRoadTest!.lanes(a, b), [from, to] as const),
    forceLanes: (lanes: Lane[]) => page.evaluate(l => window.__crossyRoadTest!.forceLanes(l), lanes),
    stats: () => page.evaluate(() => window.__crossyRoadTest!.stats()),
    setQuality: (quality: 'high' | 'low') => page.evaluate(q => window.__crossyRoadTest!.setQuality(q), quality),
  };
}
export const state = (page: Page): Promise<HookState> => hook(page).state();
export const advance = (page: Page, seconds: number): Promise<void> => hook(page).advance(seconds);
export const force = (page: Page, lanes: Lane[]): Promise<void> => hook(page).forceLanes(lanes);

/** Collects uncaught page errors and console errors; a spec asserts the list is empty when it finishes. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console.error: ${message.text()}`); });
  return errors;
}

export interface OpenOptions { seed?: number; viewport?: { width: number; height: number } }

/** Opens CrossyRoad, freezes the simulation and starts a fresh run on `seed` (t = 0, phase 'ready'). Returns the error list. */
export async function openGame(page: Page, options: OpenOptions = {}): Promise<string[]> {
  const errors = watchErrors(page);
  if (options.viewport) await page.setViewportSize(options.viewport);
  await page.goto('/#/game/crossy-road');
  await page.waitForFunction(() => window.__crossyRoadTest !== undefined);
  // Freeze first, then seed: the new run starts at t = 0 and no real time can leak into it.
  await hook(page).freeze(true);
  await hook(page).setSeed(options.seed ?? SEED);
  await expect(page.locator('.crossy-road')).toHaveAttribute('data-phase', 'ready');
  return errors;
}

// ---------------------------------------------------------------------------------------------------------------------
// Real input
// ---------------------------------------------------------------------------------------------------------------------

/** A real key press followed by `seconds` of game time (a hop takes 0.12 s, so the default lands it). */
export async function hop(page: Page, key: string, seconds = 0.2): Promise<void> {
  await page.keyboard.press(key);
  await advance(page, seconds);
}

/** The middle of the playfield canvas in page coordinates. */
export async function canvasCenter(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('.hw-canvas').boundingBox();
  if (!box) throw new Error('the CrossyRoad canvas has no layout box');
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

/** A real pointer drag from the middle of the canvas: press, four moves, release. A (0, 0) drag is a click. */
export async function swipe(page: Page, dx: number, dy: number): Promise<void> {
  const {x, y} = await canvasCenter(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, {steps: 4});
  await page.mouse.up();
}

/** Resolves after `count` animation frames. The draw loop keeps running while the simulation is frozen, so this lets the
 * camera and the effects (which run on real time) catch up with the frozen game state. */
export async function frames(page: Page, count = 12): Promise<void> {
  await page.evaluate(n => new Promise<void>(resolve => {
    let seen = 0;
    const tick = () => { if (++seen >= n) resolve(); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }), count);
}

// ---------------------------------------------------------------------------------------------------------------------
// Forced lanes (they replace the generated row with the same `row`; use rows >= 1)
// ---------------------------------------------------------------------------------------------------------------------

/** A grass row with a tree on each column in `blocked`. */
export function grass(row: number, blocked: number[] = []): GrassLane {
  const flags = Array.from({length: COLS}, (_, c) => blocked.includes(c));
  return {
    kind: 'grass', row, shade: (((row % 2) + 2) % 2) as 0 | 1, blocked: flags,
    obstacles: flags.map(b => (b ? 'tree' : null)), variant: new Array<number>(COLS).fill(0), edge: new Array<null>(2 * EDGE_COLS).fill(null),
  };
}
/** A road lane; the defaults are one car at 2 tiles/s, heading right. Every field can be overridden. */
export function road(row: number, over: Partial<Omit<RoadLane, 'kind' | 'row'>> = {}): RoadLane {
  return {kind: 'road', row, dir: 1, speed: 2, vehicle: 'car', cycle: 12, phase: 0, movers: [{offset: 0, len: 1, color: 0}], ...over};
}
/** A river lane; the defaults are one 3-tile log per 8 tiles at 1.5 tiles/s, heading right. */
export function river(row: number, over: Partial<Omit<RiverLane, 'kind' | 'row'>> = {}): RiverLane {
  return {kind: 'river', row, dir: 1, speed: 1.5, cycle: 8, phase: 0, movers: [{offset: 0, len: 3, color: 0}], ...over};
}
/** A railway lane; the defaults are a 14-tile train every 9 s at the game's train speed, heading right. */
export function rail(row: number, over: Partial<Omit<RailLane, 'kind' | 'row'>> = {}): RailLane {
  return {kind: 'rail', row, dir: 1, speed: TRAIN_SPEED, length: 14, period: 9, phase: 0, color: 0, ...over};
}
/** A lily-pad row with pads on the given columns. */
export function lily(row: number, pads: number[]): LilyLane {
  return {kind: 'lily', row, pads: Array.from({length: COLS}, (_, c) => pads.includes(c))};
}

// ---------------------------------------------------------------------------------------------------------------------
// Dying, the Game Over card, evidence
// ---------------------------------------------------------------------------------------------------------------------

/** Forces a car over column 4 on `row` and hops up into it from row `row - 1`: the player dies 'car' in the first step. The car's
 * left edge is at 3.5 when the hop starts, so it spans 3.5 to 4.5: its middle is over column 4. */
export async function carDeath(page: Page, row = 1): Promise<void> {
  const t0 = (await state(page)).t;
  const lane = road(row, {dir: 1, speed: 2, vehicle: 'car', cycle: 12, movers: [{offset: 0, len: 1, color: 0}]});
  lane.phase = mod(3.5 - lane.dir * lane.speed * t0, lane.cycle);
  expect(vehicleHit(lane, 4, t0), 'the forced car is over column 4 now').toBe(true);
  await force(page, [lane]);
  await page.keyboard.press('ArrowUp');
  await advance(page, 0.05);
  expect(await state(page)).toMatchObject({deathCause: 'car', phase: 'dying', alive: false, row});
}

/** Plays a death out (it takes 0.9 s) until the Game Over card shows. The draw loop runs on real time, so a few frames before
 * the last step let the camera and the effects settle on the death scene for the evidence screenshot. */
export async function showCard(page: Page): Promise<void> {
  await advance(page, 0.6);
  await frames(page, 6);
  await advance(page, 0.5);
}

/** After a death (and its 0.9 s animation): the hook, the root's data attributes and the visible card all agree. */
export async function expectDeathCard(page: Page, cause: DeathCause, text: string): Promise<void> {
  const s = await state(page);
  expect(s.deathCause).toBe(cause);
  expect(s.phase).toBe('over');
  expect(s.alive).toBe(false);
  const root = page.locator('.crossy-road'), card = page.locator('.hw-over');
  await expect(root).toHaveAttribute('data-phase', 'over');
  await expect(root).toHaveAttribute('data-cause', cause);
  await expect(card).toBeVisible();
  await expect(card.locator('.hw-cause')).toHaveText(text);
  await expect(card.locator('.hw-score')).toHaveText(String(s.score));
  await expect(page.getByRole('button', {name: 'Play again', exact: true})).toBeFocused();
}

/** Writes external evidence. Only Chromium writes the common set. */
export async function shot(page: Page, name: string): Promise<void> {
  if (test.info().project.name === 'chromium') await page.screenshot({path: `${EVIDENCE}/${name}.png`});
}

/** `shot` for a screen with a card. The card fades and scales in over 240 ms on real time, and software WebGL can delay the
 * transition's first frame, so no fixed delay is safe: wait (polling) until the card's computed opacity is 1 and its transform
 * has settled to none, then let two frames pass before the screenshot. */
export async function cardShot(page: Page, name: string): Promise<void> {
  const card = page.locator('.hw-card:not([hidden])');
  await expect(card).toHaveCSS('opacity', '1');
  await expect(card).toHaveCSS('transform', 'none');
  await frames(page, 2);
  await shot(page, name);
}
