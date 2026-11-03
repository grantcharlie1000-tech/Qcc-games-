/** Crossy Road's game module: the shell contract, the fixed-step loop, the DOM overlays (start hint, Continue,
 * game over) and the wiring between the pure rules over the seeded World and the Three.js scene.
 * All gameplay lives in rules.ts; this file decides when to step, draw, report and announce. */
import type { GameContext, GameInstance, GameModule } from '../../core/types';
import { AHEAD_ROWS, BEHIND_ROWS, DEATH_TIME, STEP, type DeathCause, type Dir, type CrossyRoadScene, type Quality, type RunState, type SceneFrame, type StepEvents } from './config';
import { railWarning, trainEntry } from './lanes';
import { createRun, input as hop, pose, restore as restoreRun, serialize, step, ufoWarning } from './rules';
import { World } from './world';
import { createScene } from './scene';
import { attachInput } from './input';
import { createSfx } from './audio';
import { installTestHook } from './test-hook';
import { notifyGlassFrame, registerGlassFrameSource } from '../../ui/glass-frame-source';
import {AdaptiveResolution} from './quality';
import './style.css';

const ID = 'crossy-road';
const TITLES: Record<DeathCause, string> = { car: 'Bonk!', train: 'Whoosh!', water: 'Splash!', swept: 'Drifted off!', 'ufo-idle': 'Beamed up!', 'ufo-behind': 'Beamed up!' };
const START_STATUS = 'Tap, swipe or press an arrow key to start hopping.';
const RUN_STATUS = 'Keep hopping forward. Wait too long and a UFO beams you up.';
/** Seconds between signal bell rings while a nearby light flashes. */
const BELL_GAP = 0.45;
/** Interval for reporting the observed frame rate to the development hook. */
const FPS_WINDOW = 2;

const seedFor = (run: number) => ((Date.now() ^ run) >>> 0) || 1;
/** `#/game/crossy-road?seed=123` picks the first run's seed, in development builds only. */
function devSeed(): number | null {
  if (!import.meta.env.DEV) return null;
  const match = location.hash.match(/[?&]seed=(\d+)/);
  return match ? Number(match[1]) >>> 0 : null;
}

const TEMPLATE = `<canvas class="hw-canvas" tabindex="0" aria-label="Crossy Road playfield. Arrow keys or W A S D hop one tile. Tap to hop forward, or swipe to hop that way."></canvas>
<p class="hw-hint"></p>
<div class="hw-layer" hidden>
  <section class="hw-card ui-glass-sheet hw-over" aria-labelledby="hw-over-title" hidden>
    <h2 class="hw-title" id="hw-over-title">Game over</h2>
    <p class="hw-cause"></p>
    <dl class="hw-stats"><div><dt>Score</dt><dd class="hw-score">0</dd></div><div><dt>Best</dt><dd class="hw-best">0</dd></div></dl>
    <p class="hw-new" hidden>New best!</p>
    <div class="hw-actions"><button type="button" class="game-button hw-again">Play again</button></div>
  </section>
  <section class="hw-card ui-glass-sheet hw-continue" aria-labelledby="hw-continue-title" hidden>
    <h2 class="hw-title" id="hw-continue-title">Your run is waiting</h2>
    <p class="hw-cause">Row <span class="hw-continue-row">0</span>. Continue when you are ready.</p>
    <div class="hw-actions"><button type="button" class="game-button hw-resume">Continue</button></div>
  </section>
  <section class="hw-card ui-glass-sheet hw-lost" aria-labelledby="hw-lost-title" hidden>
    <h2 class="hw-title" id="hw-lost-title" tabindex="-1">Graphics interrupted</h2>
    <p class="hw-cause">Your run is saved. Leave and reopen Crossy Road to restore the graphics.</p>
  </section>
</div>`;

type Layer = 'over' | 'continue' | 'lost' | null;

function mount(container: HTMLElement, context: GameContext): GameInstance {
  const root = document.createElement('div');
  root.className = 'crossy-road';
  root.dataset.renderVersion = 'fidelity-8';
  root.innerHTML = TEMPLATE;
  container.append(root);
  const canvas = root.querySelector<HTMLCanvasElement>('.hw-canvas')!;
  let scene: CrossyRoadScene;
  try { scene = createScene(canvas, { quality: 'high' }); }
  catch {
    root.innerHTML = '<div class="hw-fallback" role="status"><h2>3D graphics unavailable</h2><p>Crossy Road needs WebGL. Turn on hardware acceleration in the browser settings, or try a recent browser.</p><a class="game-button" href="#/collection">Choose another game</a></div>';
    context.setStatus('This browser could not start the 3D graphics Crossy Road needs.');
    // Nothing of its own to save: an existing save is left as it was.
    return { pause() {}, resume() {}, restart() {}, serialize: () => undefined, restore() {}, dispose() { root.remove(); } };
  }

  const q = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const hint = q('.hw-hint'), layer = q('.hw-layer');
  // Only the current device's controls.
  hint.textContent = matchMedia('(pointer: coarse)').matches ? 'Tap or swipe to hop' : 'Arrow keys or WASD to hop';
  const cards: Record<Exclude<Layer, null>, HTMLElement> = { over: q('.hw-over'), continue: q('.hw-continue'), lost: q('.hw-lost') };
  const overTitle = q('.hw-over .hw-title'), overCause = q('.hw-over .hw-cause'), overScore = q('.hw-score'), overBest = q('.hw-best'), overNew = q('.hw-new');
  const again = q<HTMLButtonElement>('.hw-again'), resumeButton = q<HTMLButtonElement>('.hw-resume');
  const continueRow = q('.hw-continue-row'), lostTitle = q('.hw-lost .hw-title');

  // One query object for the visit: reduced() runs every simulation step.
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => context.settings.reducedMotion || motionQuery.matches;
  const sfx = createSfx(() => context.settings.sound);
  const abort = new AbortController(), signal = abort.signal;

  let runs = 1;
  let world = new World(devSeed() ?? seedFor(runs));
  let run: RunState = createRun(world.seed);
  /** paused: by the shell. held: a restored run waits for Continue. frozen: the dev test hook steps time itself. */
  let paused = false, held = false, frozen = false, disposed = false, lost = false;
  let frameId = 0, last = 0, acc = 0, frames = 0, shown: Layer = null;
  let resetInput = () => {};
  let best = Math.max(0, Math.floor(context.highScore) || 0), bestAtStart = best, announcedBest = false, warned = false;
  let reportedScore = -1, reportedRow = -1, nextBell = 0;
  let quality: Quality = 'high', fpsTime = 0, fpsFrames = 0, fps = 0;
  const resolution = new AdaptiveResolution();
  let appliedResolution = 3;
  let landedThisFrame = false;
  /** Development builds only: a moving average of the main-thread milliseconds one frame takes (simulation plus render submission). */
  let cpuMs = 0;
  /** Train passes already rumbled, by rail row. */
  const rumbled = new Map<number, number>();
  const stepEvents: StepEvents = {landed:false,newMax:false,chime:false,died:null,over:false,ufoWarn:false};
  const frame: SceneFrame = { state: run, pose: pose(run), world, dt: 0, reducedMotion: false, colorBlind: false, ufoWarn: false };
  const data: Record<string, string> = {};
  const setData = (key: string, value: string) => { if (data[key] !== value) { data[key] = value; root.dataset[key] = value; } };

  const active = () => !paused && !disposed && !lost && !held;
  function schedule() { if (!frameId && active() && run.phase !== 'over') { last = 0; frameId = requestAnimationFrame(loop); } }
  function cancel() { if (frameId) cancelAnimationFrame(frameId); frameId = 0; frame.pressed=false; resetInput(); }

  function loop(now: number) {
    frameId = 0;
    if (!active()) return;
    // The simulation catches up at most 0.1 s per frame; the frame-rate check sees the real interval.
    const interval = last ? (now - last) / 1000 : 0, dt = Math.min(interval, 0.1);
    last = now;
    frames++;
    const begun = import.meta.env.DEV ? performance.now() : 0;
    if (import.meta.env.DEV) (window as unknown as { __crossyRoadFrames?: number }).__crossyRoadFrames = ((window as unknown as { __crossyRoadFrames?: number }).__crossyRoadFrames ?? 0) + 1;
    measure(interval);
    landedThisFrame=false;
    if (!frozen) advance(dt);
    if(landedThisFrame) applyResolution();
    draw(dt);
    if (import.meta.env.DEV) { const spent = performance.now() - begun; cpuMs = cpuMs ? cpuMs * 0.95 + spent * 0.05 : spent; }
    if (run.phase !== 'over' && active()) frameId = requestAnimationFrame(loop);
  }

  /** Runs whole fixed steps; the remainder carries to the next frame. */
  function advance(seconds: number) {
    acc += seconds;
    while (acc >= STEP - 1e-9 && run.phase !== 'over') { acc -= STEP; tick(STEP); }
    if (run.phase === 'over') acc = 0;
  }

  function tick(dt: number) {
    const before = run.maxRow;
    const events = step(run, dt, world, reduced(), stepEvents);
    if(events.landed) landedThisFrame=true;
    if (run.maxRow !== before) progressed(before);
    if (events.died) died(events.died);
    if (events.ufoWarn && !warned) {
      warned = true;
      sfx.ufoWarn();
      context.announce('Keep hopping forward. A UFO is coming.');
    }
    signals();
    if (events.over) ended();
  }

  /** The signal bell rings while a light near the player flashes; a passing train rumbles once. */
  function signals() {
    if (run.phase !== 'running' && run.phase !== 'ready') return;
    let ringing = false;
    for (let r = run.row - 2; r <= run.row + 6; r++) {
      const lane = world.lane(r);
      if (lane.kind !== 'rail') continue;
      if (railWarning(lane, run.t)) ringing = true;
      const entry = trainEntry(lane, run.t);
      if (run.t >= entry && run.t - entry < 0.3 && rumbled.get(r) !== entry) {
        rumbled.set(r, entry);
        if (Math.abs(r - run.row) <= 3) sfx.rumble();
      }
    }
    if (rumbled.size > 64) rumbled.clear();
    if (ringing && run.t >= nextBell) { sfx.bell(); nextBell = run.t + BELL_GAP; }
  }

  function progressed(before: number) {
    world.ensure(run.maxRow + AHEAD_ROWS);
    world.prune(run.maxRow - BEHIND_ROWS);
    warned = false;
    if (run.maxRow > best) {
      best = run.maxRow;
      if (!announcedBest && bestAtStart > 0) { announcedBest = true; context.announce('New best!'); }
    }
    if (Math.floor(run.maxRow / 25) > Math.floor(before / 25)) sfx.chime();
    report();
  }

  /** Every new best row goes to the shell at once, so a pause, restart or leave can never drop one. A hop takes 120 ms,
   * so this is at most about eight small storage writes a second (three to five in normal play). */
  function report() {
    if (run.maxRow === reportedScore) return;
    reportedScore = run.maxRow;
    context.setScore(run.maxRow);
  }

  function causeText(cause: DeathCause, row: number): string {
    if (cause === 'car') { const lane = world.lane(row); return lane.kind === 'road' && lane.vehicle === 'truck' ? 'Hit by a truck' : 'Hit by a car'; }
    return { train: 'Hit by a train', water: 'Fell in the river', swept: 'Carried away on a log', 'ufo-idle': 'Beamed up by a UFO for waiting too long', 'ufo-behind': 'Beamed up by a UFO for falling behind' }[cause];
  }

  function died(cause: DeathCause) {
    report();
    if (cause === 'car' || cause === 'train') sfx.hit();
    else if (cause === 'water' || cause === 'swept') sfx.splash();
    else sfx.beam();
    context.announce(`${causeText(cause, run.death?.row ?? run.row)}. Score ${run.maxRow}.`);
  }

  function fillCard() {
    const death = run.death;
    const cause = death ? causeText(death.cause, death.row) : 'Run over';
    overTitle.textContent = death ? TITLES[death.cause] : 'Game over';
    overCause.textContent = cause;
    overScore.textContent = String(run.maxRow);
    overBest.textContent = String(Math.max(best, run.maxRow));
    overNew.hidden = !(run.maxRow > bestAtStart && run.maxRow > 0);
    root.dataset.cause = death?.cause ?? '';
    return cause;
  }

  function ended() {
    cancel();
    const cause = fillCard();
    show('over');
    context.setStatus(`Game over: ${cause}. Score ${run.maxRow}. Press Space or Play again.`);
    again.focus({ preventScroll: true });
  }

  function show(next: Layer) {
    shown = next;
    layer.hidden = next === null;
    for (const [name, card] of Object.entries(cards)) card.hidden = name !== next;
    // The playfield is a Tab stop only while it takes input.
    canvas.tabIndex = next === null ? 0 : -1;
  }
  function setHint(on: boolean) { hint.dataset.gone = String(!on); }

  function draw(dt: number) {
    if (disposed || lost) return;
    frame.state = run;
    frame.pose = pose(run, frame.pose);
    frame.world = world;
    frame.dt = dt;
    frame.reducedMotion = reduced();
    frame.colorBlind = context.settings.colorBlind;
    frame.ufoWarn = ufoWarning(run);
    scene.render(frame);
    // Same task as the render: the glass lens copies the non-preserved WebGL buffer before it is cleared.
    notifyGlassFrame(canvas);
    if (run.row !== reportedRow) { reportedRow = run.row; context.setLevel(`Row ${run.row}`); }
    setData('phase', run.phase);
    setData('row', String(run.row));
    setData('score', String(run.maxRow));
    setData('warn', String(frame.ufoWarn));
    setData('held', String(held));
    setData('pressed', String(Boolean(frame.pressed)));
  }

  /** Resolution changes require sustained pressure and recover with hysteresis.
   * Model detail and shadows stay intact; explicit High starts at native DPR. */
  function measure(dt: number) {
    if(!frozen&&quality==='high'){
      resolution.observe(dt);
      // Reallocate a drawing buffer between hops, never in the middle of one.
      if(run.hop<0) applyResolution();
    }
    if (dt <= 0 || dt >= 1) return;
    fpsTime += dt;
    fpsFrames++;
    if (fpsTime < FPS_WINDOW) return;
    fps = fpsFrames / fpsTime;
    fpsTime = 0;
    fpsFrames = 0;
  }
  function applyResolution() {
    // A queued hop starts in the very step that lands the previous one. The
    // landing is still a safe boundary even when no grounded frame is exposed.
    if(!frozen&&quality==='high'&&run.phase!=='dying'&&resolution.cap!==appliedResolution){
      appliedResolution=resolution.cap;
      scene.setResolutionCap(appliedResolution);
      scene.setQuality(resolution.low?'low':'high');
      setData('quality',scene.stats.quality);
    }
  }
  function setQuality(next: Quality) {
    quality = next;
    resolution.reset();appliedResolution=3;
    scene.setResolutionCap(3);
    scene.setQuality(next);
    setData('quality', next);
    if (!frameId) draw(0);
  }

  function move(dir: Dir) {
    if (!active() || (run.phase !== 'ready' && run.phase !== 'running')) return;
    frame.pressed=false;
    const before = run.maxRow, phase = run.phase;
    const result = hop(run, dir, world);
    if (result === 'hop') {
      sfx.hop(dir === 'up');
      if (phase === 'ready') { setHint(false); context.setStatus(RUN_STATUS); }
    } else if (result === 'blocked') sfx.bonk();
    if (run.maxRow !== before) progressed(before);
    if (!frameId) draw(0);
  }

  /** A restored run waits behind Continue; any arrow, tap or the button carries on (without hopping). */
  function proceed() {
    if (!held || paused || disposed || lost) return;
    held = false;
    show(null);
    context.setStatus(RUN_STATUS);
    canvas.focus({ preventScroll: true });
    schedule();
  }

  /** A new run on a fresh seed (or the test hook's). */
  function fresh(seed?: number) {
    cancel();
    runs = runs >= 1e9 ? 1 : runs + 1;
    world = new World(seed ?? seedFor(runs));
    run = createRun(world.seed);
    held = false;
    acc = 0;
    warned = false;
    announcedBest = false;
    bestAtStart = best;
    nextBell = 0;
    rumbled.clear();
    root.dataset.cause = '';
    scene.reset();
    show(null);
    setHint(true);
    reportedScore = 0;
    context.setScore(0);
    reportedRow = -1;
    context.setStatus(START_STATUS);
    draw(0);
    schedule();
  }

  const playAgain = () => {
    if (paused || lost || run.phase !== 'over') return false;
    fresh();
    canvas.focus({ preventScroll: true });
    return true;
  };
  again.addEventListener('click', playAgain, { signal });
  resumeButton.addEventListener('click', proceed, { signal });
  resetInput = attachInput({
    target: canvas,
    signal,
    enabled: () => !paused && !disposed && !lost && (held || run.phase === 'ready' || run.phase === 'running'),
    onDir: dir => { if (held) proceed(); else move(dir); },
    onPress: pressed => {
      frame.pressed=pressed && active() && !held && (run.phase==='ready'||run.phase==='running');
      // Begin the squash in this task; the pending frame presents it. Forcing
      // another full GL render here would hold up the subsequent touch events.
      if(frame.pressed&&!frameId) draw(0);
    },
    // P toggles the shell's own pause (its button, overlay and save), exactly like the toolbar's pause button.
    onPause: () => { if (context.setPaused) context.setPaused(!paused); else document.querySelector<HTMLButtonElement>('#pause-game')?.click(); },
    onAgain: playAgain,
  });

  canvas.addEventListener('webglcontextlost', event => {
    // scene.dispose() forces a context loss of its own; disposed is set before it.
    if (disposed) return;
    event.preventDefault();
    const focused = root.contains(document.activeElement);
    lost = true;
    cancel();
    show('lost');
    context.save(serialize(run));
    if (focused) lostTitle.focus({ preventScroll: true });
    context.setStatus('Graphics interrupted. Your run is saved. Leave and reopen Crossy Road.');
  }, { signal });

  const resizeCanvas = () => {
    if (disposed || lost) return;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (width < 1 || height < 1) return;
    scene.resize(width, height);
    if (!frameId) draw(0);
  };
  const resize = new ResizeObserver(resizeCanvas);
  resize.observe(canvas);
  window.addEventListener('resize', resizeCanvas, {signal});
  window.addEventListener('orientationchange', resizeCanvas, {signal});
  // A display-density change may leave CSS dimensions unchanged.
  let densityQuery: MediaQueryList | undefined;
  function densityChanged() { watchDensity(); resizeCanvas(); }
  function watchDensity() {
    densityQuery?.removeEventListener('change', densityChanged);
    densityQuery = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    densityQuery.addEventListener('change', densityChanged, {signal});
  }
  watchDensity();

  /** The shell focuses its stage synchronously right after restore(), so a restored card's button takes focus back in a
   * microtask (unless the card has gone, or the player has already moved focus somewhere else). */
  function refocus(button: HTMLButtonElement) {
    button.focus({ preventScroll: true });
    queueMicrotask(() => {
      const focused = document.activeElement;
      if (disposed || button.closest('[hidden]') || !(focused === container || focused === document.body || root.contains(focused))) return;
      button.focus({ preventScroll: true });
    });
  }

  let removeHook: (() => void) | undefined;
  if (import.meta.env.DEV) removeHook = installTestHook({
    run: () => run,
    world: () => world,
    scene: () => scene,
    setSeed: seed => fresh(seed >>> 0),
    restore: snapshot => instance.restore(snapshot),
    freeze: on => { frozen = on; acc = 0; if (!on) schedule(); },
    advance: seconds => { if (disposed) return; advance(seconds); draw(0); },
    redraw: () => draw(0),
    move,
    quality: () => scene.stats.quality,
    setQuality,
    fps: () => fps,
    cpuMs: () => cpuMs,
    frames: () => frames,
    looping: () => frameId !== 0,
  });

  world.ensure(AHEAD_ROWS);
  show(null);
  setHint(true);
  setData('quality', quality);
  context.setLevel('Row 0');
  context.setStatus(START_STATUS);
  const releaseGlass = registerGlassFrameSource(canvas, () => draw(0));
  draw(0);
  schedule();

  const instance: GameInstance = {
    pause() {
      if (disposed || paused) return;
      paused = true;
      cancel();
      if (run.phase === 'running') context.announce('Crossy Road paused');
    },
    resume() {
      if (disposed || lost || !paused) return;
      paused = false;
      if (run.phase === 'running' && !held) context.announce('Crossy Road resumed');
      schedule();
    },
    restart() {
      if (lost || disposed) return;
      fresh();
    },
    serialize: () => serialize(run),
    restore(value) {
      const restored = restoreRun(value);
      if (!restored || disposed) return;
      cancel();
      world = new World(restored.seed, restored.worldVersion ?? 1);
      // Rows far behind are never kept, however far the saved run went (restore caps it at MAX_ROW).
      world.prune(restored.maxRow - BEHIND_ROWS);
      world.ensure(restored.maxRow + AHEAD_ROWS);
      // A run saved part-way through its death animation shows the animation's last frame under the card.
      if (restored.phase === 'over' && restored.death) restored.t = Math.max(restored.t, restored.death.t + DEATH_TIME);
      run = restored;
      acc = 0;
      warned = false;
      announcedBest = false;
      best = Math.max(best, run.maxRow);
      bestAtStart = best;
      nextBell = 0;
      rumbled.clear();
      scene.reset();
      held = run.phase === 'running';
      reportedScore = run.maxRow;
      if (run.maxRow > 0) context.setScore(run.maxRow);
      reportedRow = -1;
      setHint(run.phase === 'ready');
      if (run.phase === 'over') {
        const cause = fillCard();
        show('over');
        context.setStatus(`Game over: ${cause}. Score ${run.maxRow}. Press Space or Play again.`);
        refocus(again);
      } else if (held) {
        continueRow.textContent = String(run.row);
        show('continue');
        context.setStatus(`Saved run at row ${run.row}. Press Continue or any arrow key.`);
        refocus(resumeButton);
      } else {
        root.dataset.cause = '';
        show(null);
        context.setStatus(START_STATUS);
      }
      draw(0);
      schedule();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      releaseGlass();
      cancel();
      abort.abort();
      resize.disconnect();
      removeHook?.();
      scene.dispose();
      sfx.dispose();
      root.remove();
    },
  };
  return instance;
}

const game: GameModule = Object.freeze({
  id: ID,
  title: 'Crossy Road',
  cover: 'game-art/crossy-road/cover.svg',
  rules: 'Hop across roads, rivers and railway lines as far as you can. The arrow keys or W A S D hop one tile; tap the playfield to hop forward, or swipe up, down, left or right. Trees and rocks block the way. Cars, trucks and trains end the run, and so do falling in the water and drifting off the edge on a log. Ride logs and lily pads across rivers. A railway signal flashes and rings before every train. Keep making progress: wait too long without reaching a new row, or step three rows back, and a UFO beams you up. Your score is the furthest row you reach. P pauses; Space, Enter or R plays again after a run ends.',
  mount,
});
export default game;
