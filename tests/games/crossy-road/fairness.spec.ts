import {test, expect} from '../../fixtures';
import {COLS, HOP_TIME, RAIL_PERIOD_MIN, START_COL, STEP, riverGapMax, roadGapMin} from '../../../src/games/crossy-road/config';
import type {Lane, RiverLane, RoadLane} from '../../../src/games/crossy-road/config';
import {platformAt, trainHit, vehicleHit} from '../../../src/games/crossy-road/lanes';
import {World} from '../../../src/games/crossy-road/world';
import {advance, grass, hook, lily, openGame, river, road, state} from './helpers';
import type {HookState} from './helpers';

// "Generation fairness in the browser": the lanes the in-browser World generates (fetched through hook.lanes, which makes it
// generate them) satisfy the fairness rules, judged by a flood fill written here from the rules alone, and they are the same
// lanes the unit-tested Node-side World makes for that seed. A last test plays: a bot hops through the first 25 rows.

const SEEDS = [11, 2024, 777];
const LAST_ROW = 205;
const EPS = 1e-9;

/** Columns the player can stand on after each row, and what is wrong with the rows. Start: column 4 only. A grass row's entry
 * columns are the open columns that were reachable before it, flooded sideways through open cells. A lily row is entered from a
 * river row and offers its pads. Road, rail and river rows are crossed from anywhere, so every column is reachable. */
function walk(lanes: readonly Lane[]): {reach: boolean[][]; problems: string[]} {
  const problems: string[] = [];
  const reach: boolean[][] = [];
  let before = Array.from({length: COLS}, (_, c) => c === START_COL);
  lanes.forEach((lane, r) => {
    let after: boolean[];
    if (lane.kind === 'grass') {
      after = new Array<boolean>(COLS).fill(false);
      const open = (c: number) => !lane.blocked[c];
      const stack: number[] = [];
      for (let c = 0; c < COLS; c++) if (before[c] && open(c)) { after[c] = true; stack.push(c); }
      while (stack.length > 0) {
        const c = stack.pop()!;
        for (const n of [c - 1, c + 1]) if (n >= 0 && n < COLS && open(n) && !after[n]) { after[n] = true; stack.push(n); }
      }
      if (!after.some((on, c) => on && open(c))) problems.push(`row ${r}: no reachable open grass column`);
    } else if (lane.kind === 'lily') {
      if (lanes[r - 1]?.kind !== 'river') problems.push(`row ${r}: a lily row follows ${lanes[r - 1]?.kind ?? 'nothing'}, not a river`);
      after = lane.pads.map(pad => pad && before.some(Boolean));
    } else {
      after = new Array<boolean>(COLS).fill(before.some(Boolean));
    }
    if (!after.some(Boolean)) problems.push(`row ${r}: no reachable column on a ${lane.kind} row`);
    reach.push(after);
    before = after;
  });
  return {reach, problems};
}

/** The gaps in a road or river lane's repeating pattern, back of one mover to the front of the next, wrap-around included. */
function gaps(lane: RoadLane | RiverLane): number[] {
  const movers = [...lane.movers].sort((a, b) => a.offset - b.offset);
  return movers.map((mover, i) => {
    const next = movers[(i + 1) % movers.length];
    return (i + 1 < movers.length ? next.offset : next.offset + lane.cycle) - (mover.offset + mover.len);
  });
}

for (const seed of SEEDS) {
  test(`generation fairness in the browser: seed ${seed}`, async ({page}) => {
    test.setTimeout(60000);
    const errors = await openGame(page, {seed});
    const lanes = await hook(page).lanes(0, LAST_ROW);
    expect(lanes).toHaveLength(LAST_ROW + 1);
    expect(lanes.filter((lane, i) => lane.row !== i), 'every lane sits at its own row').toEqual([]);

    // The world a browser run plays on is the world the Node-side unit tests check.
    const world = new World(seed);
    world.ensure(LAST_ROW);
    expect(lanes).toEqual(Array.from({length: LAST_ROW + 1}, (_, r) => JSON.parse(JSON.stringify(world.lane(r)))));

    // A green run must not be vacuous: every kind of hazard shows up.
    const count = (kind: Lane['kind']) => lanes.filter(lane => lane.kind === kind).length;
    for (const kind of ['grass', 'road', 'river', 'rail'] as const) expect(count(kind), `${kind} rows in ${lanes.length}`).toBeGreaterThanOrEqual(5);

    const problems: string[] = [];
    // The safe start: rows 0-4 are grass with columns 2-6 open.
    for (let r = 0; r < 5; r++) {
      const lane = lanes[r];
      if (lane.kind !== 'grass' || [2, 3, 4, 5, 6].some(c => lane.blocked[c])) problems.push(`row ${r}: not safe start grass`);
    }
    // Every row has a reachable column, and every grass row a reachable open one.
    problems.push(...walk(lanes).problems);
    // Every road lane's gaps leave a standing player room: at least roadGapMin(speed), and at least 3 tiles.
    for (const lane of lanes) {
      if (lane.kind === 'road') {
        gaps(lane).forEach((gap, i) => {
          if (gap < roadGapMin(lane.speed) - EPS) problems.push(`row ${lane.row}: road gap ${i} is ${gap.toFixed(3)}, below roadGapMin(${lane.speed.toFixed(3)}) = ${roadGapMin(lane.speed).toFixed(3)}`);
          if (gap < 3 - EPS) problems.push(`row ${lane.row}: road gap ${i} is ${gap.toFixed(3)}, below 3 tiles`);
        });
      } else if (lane.kind === 'river') {
        gaps(lane).forEach((gap, i) => {
          if (gap > riverGapMax(lane.speed) + EPS) problems.push(`row ${lane.row}: river gap ${i} is ${gap.toFixed(3)}, above riverGapMax(${lane.speed.toFixed(3)}) = ${riverGapMax(lane.speed).toFixed(3)}`);
        });
      } else if (lane.kind === 'rail') {
        if (lane.period < RAIL_PERIOD_MIN - EPS) problems.push(`row ${lane.row}: rail period ${lane.period.toFixed(3)} is below ${RAIL_PERIOD_MIN}`);
      }
    }
    expect(problems).toEqual([]);
    expect(errors).toEqual([]);
  });
}

// The checkers above are only worth something if they can fail: feed them rows that break each rule.
test('the flood fill and the gap measure catch rows that break the rules', () => {
  const start = [grass(0), grass(1), grass(2)];
  expect(walk(start).problems, 'open grass is fine').toEqual([]);
  // A tree on the only column the player can be on: nothing is reachable.
  expect(walk([grass(0, [4])]).problems.join('\n')).toContain('row 0: no reachable');
  // Trees on both sides pen the player into column 4 of row 0; a tree above it then leaves row 1 unreachable.
  const penned = walk([grass(0, [3, 5]), grass(1, [4])]);
  expect(penned.reach[0].map(Number)).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0]);
  expect(penned.problems.join('\n')).toContain('row 1: no reachable');
  // Trees split row 1: from column 4 the flood fill reaches columns 3 to 5 and stops at the trees on 2 and 6.
  const split = walk([grass(0, [3, 5]), grass(1, [2, 6]), grass(2)]);
  expect(split.reach[1].map(Number)).toEqual([0, 0, 0, 1, 1, 1, 0, 0, 0]);
  expect(split.problems).toEqual([]);
  // A lily row after a grass row, and a row that follows a river, are told apart.
  expect(walk([grass(0), lily(1, [3])]).problems.join('\n')).toContain('row 1: a lily row follows grass');
  expect(walk([grass(0), river(1), lily(2, [3])]).problems).toEqual([]);
  // Gaps include the wrap-around gap.
  expect(gaps(road(1, {cycle: 10, movers: [{offset: 0, len: 2, color: 0}, {offset: 5, len: 1, color: 0}]}))).toEqual([3, 4]);
  expect(gaps(road(1, {cycle: 10, movers: [{offset: 0, len: 2, color: 0}]}))).toEqual([8]);
});

// ---------------------------------------------------------------------------------------------------------------------
// Playing it: a simple safe bot. It reads the hook's state (position, game time and the lanes around the player), plans on the
// Node side with lanes.ts, and acts only through real key presses and whole 1/60 s steps of game time, so a run is exactly
// repeatable. On grass it walks the shortest route of up, left and right hops around the trees. A block of hazard rows (road,
// rail, river, lily) is crossed in a straight line at one column by chaining hops: the second key press is buffered while the
// first hop flies, so every further hop starts at the exact landing time and a river's logs never get to carry the player.
// The bot waits on the grass below the block for the first start time at which lanes.ts says no vehicle or train touches the
// player in any row and a log or pad is under the player at each landing.
// ---------------------------------------------------------------------------------------------------------------------

type Key = 'ArrowUp' | 'ArrowLeft' | 'ArrowRight';
type Plan = {kind: 'hop'; key: Key} | {kind: 'cross'; hazards: number; wait: number};
const TARGET_ROW = 25;
const LOOKAHEAD = 8; // the hook reports lanes from row - 2 to row + 8
const MAX_WAIT = 6 * 60; // ticks: the longest the bot waits for a safe start (the UFO comes at 7 s without a new row)
const SAMPLE = 1 / 240; // s between the hazard checks inside a hop (the game checks at every 1/60 s step)
const PAD = [-0.1, 0, 0.1]; // columns around the player's centre that must be clear as well: a margin, not a rule

const laneAt = (view: HookState, row: number): Lane | undefined => view.lanes.find(lane => lane.row === row);
const isOpen = (lane: Lane, c: number): boolean => lane.kind !== 'grass' || !lane.blocked[c];

/** The shortest route of up, left and right hops from the player to the highest grass row in view. Hops sideways only happen on
 * grass, so a hazard block is always crossed straight. `banned` holds "row,column" cells where the bot may not step up into a
 * hazard block (the crossing found no safe start there). */
function route(view: HookState, banned: ReadonlySet<string>): Key[] | null {
  let top = view.row;
  for (let r = view.row + 1; r <= view.row + LOOKAHEAD; r++) if (laneAt(view, r)?.kind === 'grass') top = r;
  if (top === view.row) return null;
  const start = `${view.row},${view.col}`;
  const came = new Map<string, {from: string; key: Key}>();
  const seen = new Set<string>([start]);
  const queue: Array<[number, number]> = [[view.row, view.col]];
  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    if (r === top) {
      const keys: Key[] = [];
      for (let cell = `${r},${c}`; cell !== start; cell = came.get(cell)!.from) keys.unshift(came.get(cell)!.key);
      return keys;
    }
    const here = laneAt(view, r)!, above = laneAt(view, r + 1)!;
    const moves: Array<[number, number, Key]> = [];
    if (r < top && isOpen(above, c) && !(here.kind === 'grass' && above.kind !== 'grass' && banned.has(`${r},${c}`))) moves.push([r + 1, c, 'ArrowUp']);
    if (here.kind === 'grass') {
      if (c > 0 && isOpen(here, c - 1)) moves.push([r, c - 1, 'ArrowLeft']);
      if (c < COLS - 1 && isOpen(here, c + 1)) moves.push([r, c + 1, 'ArrowRight']);
    }
    for (const [nr, nc, key] of moves) {
      const cell = `${nr},${nc}`;
      if (!seen.has(cell)) { seen.add(cell); came.set(cell, {from: `${r},${c}`, key}); queue.push([nr, nc]); }
    }
  }
  return null;
}

/** Does a straight crossing of the `hazards` rows above the player at column c, whose first hop starts at game time `start`,
 * survive? Hop j starts at start + (j - 1) * HOP_TIME and lands HOP_TIME later; the player is in that row for the whole hop. */
function crossingSafe(view: HookState, hazards: number, c: number, start: number): boolean {
  for (let j = 1; j <= hazards; j++) {
    const lane = laneAt(view, view.row + j)!;
    const from = start + HOP_TIME * (j - 1), landing = from + HOP_TIME;
    if (lane.kind === 'road') {
      for (let t = from; t <= landing + 1e-9; t += SAMPLE) for (const pad of PAD) if (vehicleHit(lane, c + pad, t)) return false;
    } else if (lane.kind === 'rail') {
      for (let t = from; t <= landing + 1e-9; t += SAMPLE) for (const pad of PAD) if (trainHit(lane, c + pad, t)) return false;
    } else if (lane.kind === 'river' || lane.kind === 'lily') {
      for (const slack of [-0.03, 0, 0.03]) if (!platformAt(lane, c, landing + slack)) return false;
    }
  }
  return true;
}

/** The next thing to do: one hop on grass, or a crossing after `wait` ticks. null when nothing in view can be done safely. */
function decide(view: HookState, banned: Set<string>): Plan | null {
  for (let attempt = 0; attempt <= COLS; attempt++) {
    const keys = route(view, banned);
    if (!keys) return null;
    const above = laneAt(view, view.row + 1)!;
    if (keys[0] !== 'ArrowUp' || above.kind === 'grass') return {kind: 'hop', key: keys[0]};
    let hazards = 0;
    while (laneAt(view, view.row + 1 + hazards)!.kind !== 'grass') hazards++;
    for (let wait = 0; wait <= MAX_WAIT; wait++) if (crossingSafe(view, hazards, view.col, view.t + wait * STEP)) return {kind: 'cross', hazards, wait};
    banned.add(`${view.row},${view.col}`); // no safe start at this column: route round it
  }
  return null;
}

for (const seed of SEEDS) {
  test(`a safe bot hops through the first ${TARGET_ROW} rows of seed ${seed} with real keys`, async ({page}) => {
    test.setTimeout(90000);
    const errors = await openGame(page, {seed});
    const ticks = (n: number) => advance(page, n * STEP);
    const log: string[] = [];
    const banned = new Set<string>();
    let view = await state(page);
    for (let turn = 0; view.maxRow < TARGET_ROW && turn < 200; turn++) {
      const plan = decide(view, banned);
      expect(plan, `the bot found something to do at row ${view.row}, column ${view.col}, t = ${view.t.toFixed(2)}\n${log.join('\n')}`).not.toBeNull();
      const {row, col} = view;
      if (plan!.kind === 'hop') {
        const key = plan!.key;
        await page.keyboard.press(key);
        await ticks(8); // a hop lands after 0.12 s: 7.2 steps
        view = await state(page);
        const expected = {row: key === 'ArrowUp' ? row + 1 : row, col: key === 'ArrowLeft' ? col - 1 : key === 'ArrowRight' ? col + 1 : col};
        log.push(`${key} from row ${row} column ${col} -> row ${view.row} column ${view.col}, t = ${view.t.toFixed(2)}`);
        expect(view, log.join('\n')).toMatchObject({...expected, alive: true, hopping: false});
      } else {
        const {hazards, wait} = plan!;
        if (wait > 0) await ticks(wait);
        const startedAt = (await state(page)).t;
        // hazards + 1 hops: the rows of the block and the grass row above it. Keys 1 and 2 go in at once (the second is buffered).
        await page.keyboard.press('ArrowUp');
        await page.keyboard.press('ArrowUp');
        for (let hopNumber = 3; hopNumber <= hazards + 1; hopNumber++) { await ticks(8); await page.keyboard.press('ArrowUp'); }
        await ticks(18);
        view = await state(page);
        log.push(`cross ${hazards} hazard row(s) at column ${col} from row ${row}: waited ${(wait * STEP).toFixed(2)} s, started t = ${startedAt.toFixed(2)} -> row ${view.row}, t = ${view.t.toFixed(2)}`);
        expect(view, log.join('\n')).toMatchObject({row: row + hazards + 1, col, alive: true, hopping: false, queued: null, phase: 'running'});
      }
    }
    expect(view.maxRow, `reached row ${TARGET_ROW}\n${log.join('\n')}`).toBeGreaterThanOrEqual(TARGET_ROW);
    expect(view).toMatchObject({alive: true, deathCause: null});
    expect(view.t, 'the whole run took well under the UFO limit per row').toBeLessThan(40);
    await expect(page.locator('.crossy-road')).toHaveAttribute('data-score', String(view.maxRow));
    await expect(page.locator('#game-score strong')).toHaveText(String(view.maxRow));
    console.log(`CROSSY_ROAD_BOT seed ${seed}: row ${view.maxRow} in ${view.t.toFixed(2)} s of game time, ${log.length} moves`);
    expect(errors).toEqual([]);
  });
}
