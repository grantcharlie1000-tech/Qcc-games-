/** Ball Run's game module: DOM panels and HUD, input, the fixed-step loop and the shell
 * contract around the pure simulation (model.ts) and the Three.js renderer (scene.ts). */
import type { GameContext, GameInstance, GameModule } from '../../core/types';
import { CONFIG, DIFFICULTIES, STEP, speedAt, type Difficulty, type Run } from './config';
import { getCourse } from './course';
import { createRun, restoreSnapshot, step, type Snapshot } from './model';
import { commitScore, emptyRecords, nextTarget, viewRecords, type RecordView, type Records } from './records';
import { createScene, type BallRunScene } from './scene';
import './style.css';

type Panel = 'setup' | 'continue' | 'over' | 'lost' | null;
type Scope = 'today' | 'week' | 'allTime';

const INK = '#141418';
const SCOPES: readonly Scope[] = ['today', 'week', 'allTime'];
const ROWS: Record<Scope, string> = { today: 'Today’s best', week: 'Week’s best', allTime: 'All-time best' };
const EYES: Record<Difficulty, string> = {
  easy: `<circle cx="25" cy="32" r="5.6" fill="${INK}"/><circle cx="39" cy="32" r="5.6" fill="${INK}"/><circle cx="26.8" cy="30.2" r="2" fill="#fff"/><circle cx="40.8" cy="30.2" r="2" fill="#fff"/><path d="M27.5 41.5q4.5 3.6 9 0" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>`,
  medium: `<path d="M19 31h12a6 6 0 0 1-12 0zM33 31h12a6 6 0 0 1-12 0z" fill="${INK}"/><path d="M18.5 28.5h13M32.5 28.5h13" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><circle cx="27" cy="33" r="1.5" fill="#fff"/><circle cx="41" cy="33" r="1.5" fill="#fff"/><path d="M28 43h8" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>`,
  hard: `<circle cx="25" cy="34" r="5" fill="${INK}"/><circle cx="39" cy="34" r="5" fill="${INK}"/><circle cx="26.5" cy="33" r="1.6" fill="#fff"/><circle cx="40.5" cy="33" r="1.6" fill="#fff"/><path d="M18.5 27.5 30 31.5M45.5 27.5 34 31.5" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/><path d="M27 45.5q5-3.6 10 0" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>`,
};
const HORNS = `<path d="M15 22C6 16 5 7 9.5 1.5 11 8 15.5 11.5 23 12zM49 22c9-6 10-15 5.5-20.5C53 8 48.5 11.5 41 12z" fill="${INK}"/>`;
/** Difficulty badge: a face with fixed fills, always shown next to the difficulty's name. */
const face = (d: Difficulty) => `<svg class="br-face" data-face="${d}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">${d === 'hard' ? HORNS : ''}<circle cx="32" cy="34" r="29" fill="#2c2c33"/><circle cx="32" cy="34" r="26" fill="${INK}"/><circle cx="32" cy="34" r="20.5" fill="${CONFIG[d].color}"/>${EYES[d]}</svg>`;
const TROPHY = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M6 3h12v2h3v2.5c0 2.6-1.9 4.6-4.4 4.9A6 6 0 0 1 13 15.8V18h3.5v3h-9v-3H11v-2.2a6 6 0 0 1-3.6-3.4C4.9 12.1 3 10.1 3 7.5V5h3zm0 4H5v.5c0 1.3.8 2.4 1.9 2.8Q6 9.6 6 9zm12 0v2q0 .7-.1 1.3A3 3 0 0 0 19 7.5V7z"/></svg>';
const HOUSE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2.5 1.5 11.5h3V21h5.8v-6h3.4v6h5.8v-9.5h3z"/></svg>';
const CROWN = '<svg class="br-crown" viewBox="0 0 28 12" aria-hidden="true" focusable="false"><path d="m2 11-1-9 7 4 6-6 6 6 7-4-1 9z" fill="#ffe0a4"/></svg>';

const STEER_COPY = 'Drag left and right, or hold A / D or ← →, to steer.';
const nextSeed = (seed: number) => (seed + 1664525) >>> 0 || 1;
function randomSeed(): number {
  try { return crypto.getRandomValues(new Uint32Array(1))[0] || 1; } catch { return Math.floor(Math.random() * 0xffffffff) + 1; }
}

const template = () => `<div class="br-viewport">
  <canvas tabindex="0" aria-label="3D ball track. Drag left and right to steer, or hold the Left and Right arrows or A and D."></canvas>
  <div class="br-hud" hidden><p class="br-stat"><small class="br-mode-label">MEDIUM MODE</small><strong class="br-score">0</strong></p><p class="br-stat br-target" data-scope="new"><small class="br-target-label">NEW BEST</small><strong class="br-target-value">0</strong></p></div>
  <p class="br-speed" hidden></p>
  <p class="br-boost" hidden>Speed Up</p>
  <div class="br-layer" hidden>
    <section class="br-panel br-setup" aria-label="Ball Run setup" hidden>
      <div class="br-head"><h2 class="br-title">BALL RUN</h2><p class="br-copy">${STEER_COPY} Avoid the blocks and stay on the track. Survive as long as you can!</p></div>
      <div class="br-body">
        <div class="br-pick"><span class="br-face-slot"></span><p class="br-level">Medium</p><input class="br-slider" type="range" min="0" max="2" step="1" value="1" aria-label="Difficulty" aria-valuetext="Medium"></div>
        <ul class="br-help" hidden>
          <li>${STEER_COPY} A new drag starts from where the ball is.</li>
          <li>Hitting a block or rolling off the edge ends the run.</li>
          <li>Each cyan gate permanently raises your speed.</li>
          <li>Score is metres travelled. Your best today, this week and all time are kept for each difficulty.</li>
          <li>P pauses. R plays again after Game Over.</li>
        </ul>
        <p class="br-note" hidden></p>
        <div class="br-actions"><button type="button" class="br-button br-play">Play</button><button type="button" class="br-help-toggle" aria-label="How to play" aria-expanded="false">?</button></div>
      </div>
    </section>
    <section class="br-panel br-continue" aria-label="Saved run" hidden>
      <h2 class="br-title">Your run is waiting</h2><span class="br-face-slot"></span><p class="br-copy br-continue-info"></p>
      <div class="br-actions"><button type="button" class="br-button br-resume">Continue</button></div>
    </section>
    <section class="br-panel br-over" aria-label="Results" hidden>
      <div class="br-result"><h2 class="br-title">GAME OVER</h2><p class="br-reason"></p><p class="br-score-label">Score</p><p class="br-final">0</p></div>
      <div class="br-side">
        <div class="br-records"><p class="br-badge"><span class="br-badge-name">MEDIUM</span><span class="br-face-slot">${CROWN}</span><span>MODE</span></p>
          <ul class="br-rows">${SCOPES.map(s => `<li class="br-row" data-scope="${s}" data-new="false">${TROPHY}<span>${ROWS[s]}</span><em class="br-new">NEW</em><strong>0</strong></li>`).join('')}</ul></div>
        <div class="br-actions"><button type="button" class="br-home" aria-label="Home">${HOUSE}</button><button type="button" class="br-button br-again">Play again</button></div>
      </div>
    </section>
    <section class="br-panel br-lost" aria-label="Graphics interrupted" hidden><h2 class="br-title">Graphics interrupted</h2><p class="br-copy">Your run is saved. Leave and reopen Ball Run to restore the graphics.</p></section>
  </div>
</div>`;

function mount(container: HTMLElement, context: GameContext): GameInstance {
  const root = document.createElement('div');
  root.className = 'ball-run';
  root.innerHTML = template();
  container.append(root);
  const reducedMotion = () => context.settings.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = root.querySelector('canvas')!;
  let scene: BallRunScene;
  try { scene = createScene(canvas, { reducedMotion }); }
  catch {
    root.innerHTML = '<div class="br-fallback" role="status"><h2>3D graphics unavailable</h2><p>Ball Run needs WebGL 2. Enable browser hardware acceleration or try a recent browser.</p><a class="game-button" href="#/">Choose another game</a></div>';
    context.setStatus('This browser could not create a WebGL 2 renderer.');
    // Nothing of its own to save: an existing save is left exactly as it was.
    return { pause() {}, resume() {}, restart() {}, serialize: () => undefined, restore() {}, dispose() { root.remove(); } };
  }

  const q = <T extends Element = HTMLElement>(selector: string) => root.querySelector<T>(selector)! as T;
  const hud = q('.br-hud'), modeLabel = q('.br-mode-label'), scoreLabel = q('.br-score'), target = q('.br-target'), targetLabel = q('.br-target-label'), targetValue = q('.br-target-value');
  const speedLabel = q('.br-speed'), boostLabel = q('.br-boost'), layer = q('.br-layer');
  const panels: Record<Exclude<Panel, null>, HTMLElement> = { setup: q('.br-setup'), continue: q('.br-continue'), over: q('.br-over'), lost: q('.br-lost') };
  const copy = q('.br-head .br-copy'), pick = q('.br-pick'), level = q('.br-level'), slider = q<HTMLInputElement>('.br-slider'), help = q('.br-help'), note = q('.br-note');
  const play = q<HTMLButtonElement>('.br-play'), helpToggle = q<HTMLButtonElement>('.br-help-toggle'), resumeButton = q<HTMLButtonElement>('.br-resume'), continueInfo = q('.br-continue-info');
  const reason = q('.br-reason'), final = q('.br-final'), badgeName = q('.br-badge-name'), again = q<HTMLButtonElement>('.br-again'), home = q<HTMLButtonElement>('.br-home');
  const crown = q('.br-crown'), rows = SCOPES.map(s => q(`.br-row[data-scope="${s}"]`)), faceSlots = [...root.querySelectorAll<HTMLElement>('.br-face-slot')];

  let run: Run = createRun(randomSeed(), 1, 'medium'), course = getCourse(run.seed, run.difficulty), records: Records = emptyRecords();
  let paused = false, disposed = false, contextLost = false, waiting = false, committed = false;
  let frame = 0, last = 0, accumulator = 0, shown: Panel = null, entering = 0;
  let left = false, right = false, drag: number | null = null, pointerStart = 0, ballStart = 0, pointerTarget = 0;
  /** Records when the run started: the HUD's next target. */
  let view: RecordView = { today: 0, week: 0, allTime: 0 };
  let marks: Record<Scope, boolean> = { today: false, week: false, allTime: false };
  let shownScore = -1, reported = -1, reportedAt = -Infinity, shownSpeed = -1, boostText = 'Speed Up', boostWidth = 0;
  let viewWidth = canvas.clientWidth, viewHeight = canvas.clientHeight;
  const abort = new AbortController(), signal = abort.signal;

  const active = () => !paused && !disposed && !contextLost && !waiting && (run.phase === 'running' || run.phase === 'dying');
  const label = () => CONFIG[run.difficulty].label;
  const snapshot = (): Snapshot => ({ version: 4, difficulty: run.difficulty, records, run: { ...run } });
  const save = () => context.save(snapshot());
  function releasePointer() {
    const pointer = drag;
    drag = null;
    if (pointer !== null && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
  }
  function clearInput() { left = false; right = false; releasePointer(); pointerTarget = run.x; }
  function input(): number {
    return drag !== null ? Math.max(-1, Math.min(1, (pointerTarget - run.x) * 3)) : Number(right) - Number(left);
  }

  /** 'Top Speed' when the last gate added nothing because the course was already at its cap. */
  function gateText(): string {
    let start = NaN;
    course.forEachGate(run.distance - 200, run.distance, gate => { if (gate.index === run.gateIndex) start = gate.start; });
    return Number.isFinite(start) && speedAt(run.difficulty, start, run.gateIndex) >= CONFIG[run.difficulty].maxSpeed ? 'Top Speed' : 'Speed Up';
  }

  function theme() {
    const d = run.difficulty, c = CONFIG[d], index = DIFFICULTIES.indexOf(d);
    root.dataset.difficulty = d;
    root.style.setProperty('--br-accent', c.color);
    slider.value = String(index);
    slider.setAttribute('aria-valuetext', c.label);
    slider.style.setProperty('--fill', `${index * 50}%`);
    level.textContent = c.label;
    modeLabel.textContent = `${c.label.toUpperCase()} MODE`;
    badgeName.textContent = c.label.toUpperCase();
    continueInfo.textContent = `${c.label} mode · ${run.score} m`;
    for (const slot of faceSlots) {
      if (slot.dataset.face === d) continue;
      slot.dataset.face = d;
      slot.querySelector('.br-face')?.remove();
      slot.insertAdjacentHTML('beforeend', face(d));
    }
  }

  function fillResults() {
    const values: Record<Scope, number> = viewRecords(records, run.difficulty, new Date());
    reason.textContent = run.reason === 'fall' ? 'You fell off the track' : 'You hit a block';
    final.textContent = String(run.score);
    SCOPES.forEach((s, i) => { rows[i].querySelector('strong')!.textContent = String(values[s]); rows[i].dataset.new = String(marks[s]); });
    crown.toggleAttribute('hidden', !SCOPES.some(s => marks[s]));
  }

  function setHelp(open: boolean) {
    panels.setup.classList.toggle('br-helping', open);
    help.hidden = !open;
    pick.hidden = open;
    copy.hidden = open;
    helpToggle.setAttribute('aria-expanded', String(open));
  }

  /** Game Over enters with a 250 ms fade and settle from 0.96 (a strong ease-out); reduced motion fades
   * only. Driven by animation frames rather than CSS or WAAPI so it also runs under a test's virtual clock. */
  function enter(panel: HTMLElement) {
    settle();
    const start = performance.now(), scale = !reducedMotion();
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / 250)), k = 1 - (1 - t) ** 5;
      layer.style.opacity = String(k);
      if (scale) panel.style.transform = `scale(${.96 + .04 * k})`;
      entering = t < 1 ? requestAnimationFrame(tick) : 0;
      if (!entering) settle();
    };
    tick(start);
  }
  function settle() {
    cancelAnimationFrame(entering);
    entering = 0;
    layer.style.opacity = panels.over.style.transform = '';
  }

  function screen() {
    const panel: Panel = contextLost ? 'lost' : run.phase === 'ready' ? 'setup' : run.phase === 'over' ? 'over' : waiting ? 'continue' : null;
    theme();
    if (panel === 'over') fillResults();
    layer.hidden = !panel;
    for (const [name, element] of Object.entries(panels)) element.hidden = name !== panel;
    hud.hidden = speedLabel.hidden = panel === 'setup' || panel === 'lost';
    if (panel === 'over' && shown !== 'over') enter(panels.over);
    else if (panel !== 'over' && entering) settle();
    shown = panel;
    report(true);
    draw();
  }

  /** HUD text every frame it changes; the shell's score at most every 250 ms (storage writes). */
  function report(force = false) {
    const score = run.score;
    if (force || score !== shownScore) {
      shownScore = score;
      scoreLabel.textContent = String(score);
      const next = nextTarget(view, score);
      target.dataset.scope = next.scope;
      targetLabel.textContent = next.label;
      targetValue.textContent = String(next.value);
    }
    const speed = Math.round(course.speed(run.distance));
    if (force || speed !== shownSpeed) { shownSpeed = speed; speedLabel.textContent = `${speed} m/s`; }
    if (run.phase === 'running' && !waiting && score !== reported) {
      const now = performance.now();
      if (force || now - reportedAt >= 250) { reported = score; reportedAt = now; context.setScore(score); }
    }
  }

  function draw() {
    if (disposed || contextLost) return;
    const speed = course.speed(run.distance);
    scene.render({ run, course, speed });
    const stats = scene.stats, data = root.dataset, boosting = run.phase === 'running' && !waiting && run.speedUpTime > 0;
    data.phase = run.phase;
    data.x = run.x.toFixed(3);
    data.distance = run.distance.toFixed(3);
    data.grounded = String(run.grounded);
    data.ballScreenX = stats.ballScreenX.toFixed(5);
    data.ballScreenY = stats.ballScreenY.toFixed(5);
    data.aspect = stats.aspect.toFixed(5);
    data.drawCalls = String(stats.calls);
    data.geometries = String(stats.geometries);
    data.speed = speed.toFixed(2);
    data.boost = String(boosting);
    data.gates = String(run.gateIndex + 1);
    data.score = String(run.score);
    if (boostLabel.hidden === boosting) boostLabel.hidden = !boosting;
    if (boosting) {
      if (boostLabel.textContent !== boostText || !boostWidth) { boostLabel.textContent = boostText; boostWidth = boostLabel.offsetWidth; }
      // Beside the ball's lower left (its screen radius is about 8 % of the view height), kept on screen.
      const radius = .08 * viewHeight, x = stats.ballScreenX * viewWidth - radius - 6 - boostWidth;
      boostLabel.style.transform = `translate(${Math.max(8, Math.min(viewWidth - boostWidth - 8, x)).toFixed(1)}px,${(stats.ballScreenY * viewHeight + .45 * radius).toFixed(1)}px)`;
    }
  }

  // Records are committed once, when a run ends however it ends; the final score is reported unthrottled.
  function finish() {
    if (committed) return;
    committed = true;
    const now = new Date(), before = viewRecords(records, run.difficulty, now), score = run.score;
    records = commitScore(records, run.difficulty, score, now);
    marks = { today: score > before.today, week: score > before.week, allTime: score > before.allTime };
    reported = score;
    reportedAt = performance.now();
    context.setScore(score);
    save();
  }

  function died() {
    clearInput();
    finish();
    const text = run.reason === 'fall' ? 'You fell off the track' : 'You hit a block';
    context.sound('lose');
    context.setStatus(`${text}. ${run.score} metres. Press R or Play again for a new run.`);
    context.announce(`${text} at ${run.score} metres.`);
  }

  function ended() {
    clearInput();
    screen();
    save();
    again.focus({ preventScroll: true });
  }

  function loop(time: number) {
    frame = 0;
    if (!active()) return;
    const delta = last ? Math.min((time - last) / 1000, .1) : 0;
    last = time;
    accumulator += delta;
    while (accumulator >= STEP && active()) {
      const phase = run.phase, gate = run.gateIndex;
      step(run, input(), STEP);
      accumulator -= STEP;
      if (run.gateIndex !== gate) boostText = gateText();
      if (phase === 'running' && run.phase === 'dying') died();
    }
    if (run.phase === 'over') { ended(); return; }
    report();
    draw();
    frame = requestAnimationFrame(loop);
  }
  function schedule() { last = 0; accumulator = 0; if (!frame && active()) frame = requestAnimationFrame(loop); }
  function cancel() { cancelAnimationFrame(frame); frame = 0; }

  /** A fresh course: the setup panel, or straight into a run (Play again). */
  function fresh(start: boolean, difficulty: Difficulty = run.difficulty, seed = nextSeed(run.seed)) {
    cancel();
    clearInput();
    run = createRun(seed, run.run >= 1e8 ? 1 : run.run + 1, difficulty);
    course = getCourse(run.seed, run.difficulty);
    committed = waiting = false;
    marks = { today: false, week: false, allTime: false };
    boostText = 'Speed Up';
    scene.reset();
    if (start) begin();
    else { screen(); save(); }
  }

  function begin() {
    if (paused || disposed || contextLost) return;
    if (run.phase === 'ready') run.phase = 'running';
    if (run.phase !== 'running') return;
    waiting = false;
    note.hidden = true;
    setHelp(false);
    view = viewRecords(records, run.difficulty, new Date());
    context.setLevel(`${label()} mode`);
    context.setStatus(`${label()} mode. ${STEER_COPY} P pauses.`);
    context.announce(`${label()} mode. Rolling.`);
    context.sound('tap');
    screen();
    save();
    canvas.focus({ preventScroll: true });
    schedule();
  }

  const playAgain = () => { if (!paused && !contextLost && run.phase === 'over') fresh(true); };
  play.addEventListener('click', begin, { signal });
  resumeButton.addEventListener('click', begin, { signal });
  again.addEventListener('click', playAgain, { signal });
  home.addEventListener('click', () => {
    if (paused || contextLost || run.phase !== 'over') return;
    fresh(false);
    context.setStatus('Choose a difficulty, then press Play.');
    play.focus({ preventScroll: true });
  }, { signal });
  slider.addEventListener('input', () => {
    const difficulty = DIFFICULTIES[Number(slider.value)];
    if (run.phase !== 'ready' || !difficulty || difficulty === run.difficulty) return;
    // Same seed, new difficulty: a different course, built behind the panel.
    fresh(false, difficulty, run.seed);
  }, { signal });
  helpToggle.addEventListener('click', () => setHelp(help.hidden), { signal });

  // Input. Held keys follow Neon Coil's rules; P is the shell's pause button; Escape stays the shell's.
  const dialogOpen = () => !!document.querySelector('dialog[open]');
  const typing = (target: EventTarget | null) => target instanceof Element && !!target.closest('input:not([type=range]),textarea,select,[contenteditable=""],[contenteditable=true]');
  const direction = (key: string) => key === 'ArrowLeft' || key === 'a' ? 'left' : key === 'ArrowRight' || key === 'd' ? 'right' : null;
  window.addEventListener('keydown', event => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (event.ctrlKey || event.altKey || event.metaKey || dialogOpen() || typing(event.target)) return;
    if (key === 'p') { event.preventDefault(); if (!event.repeat) document.querySelector<HTMLButtonElement>('#pause-game')?.click(); return; }
    if (key === 'r') { if (!event.repeat && run.phase === 'over') { event.preventDefault(); playAgain(); } return; }
    const side = direction(key);
    if (!side || paused || contextLost || waiting || run.phase !== 'running') return;
    if (event.target instanceof HTMLInputElement) return;
    // A repeat never re-arms a key that was released by pause, death or restart.
    if (event.repeat && !(side === 'left' ? left : right)) return;
    event.preventDefault();
    if (side === 'left') left = true; else right = true;
  }, { signal });
  window.addEventListener('keyup', event => {
    const side = direction(event.key.length === 1 ? event.key.toLowerCase() : event.key);
    if (side === 'left') left = false; else if (side === 'right') right = false;
  }, { signal });
  window.addEventListener('blur', clearInput, { signal });
  canvas.addEventListener('pointerdown', event => {
    if (paused || contextLost || waiting || run.phase !== 'running' || drag !== null || event.button !== 0) return;
    event.preventDefault();
    drag = event.pointerId;
    pointerStart = event.clientX;
    ballStart = pointerTarget = run.x;
    try { canvas.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone */ }
    canvas.focus({ preventScroll: true });
  }, { signal });
  // Relative: a new drag starts from the ball, 6 m per canvas width.
  canvas.addEventListener('pointermove', event => {
    if (drag === event.pointerId && !paused) pointerTarget = ballStart + (event.clientX - pointerStart) / Math.max(1, canvas.clientWidth) * 6;
  }, { signal });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) canvas.addEventListener(name, event => { if (event.pointerId === drag) releasePointer(); }, { signal });

  canvas.addEventListener('webglcontextlost', event => {
    // scene.dispose() forces a context loss of its own; disposed is set before it.
    if (disposed) return;
    event.preventDefault();
    contextLost = true;
    cancel();
    clearInput();
    boostLabel.hidden = true;
    screen();
    save();
    context.setStatus('Graphics context lost. Your run is saved. Leave and reopen Ball Run.');
  }, { signal });
  const resize = new ResizeObserver(() => {
    if (disposed || contextLost) return;
    // A drag maps canvas pixels to metres, so it ends with the old size; held keys keep steering.
    releasePointer();
    pointerTarget = run.x;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (width < 1 || height < 1) return;
    viewWidth = width;
    viewHeight = height;
    boostWidth = 0;
    scene.resize(width, height);
    draw();
  });
  resize.observe(canvas);

  theme();
  screen();
  context.setStatus(`Choose Easy, Medium or Hard, then press Play. ${STEER_COPY}`);

  return {
    pause() { paused = true; clearInput(); cancel(); },
    resume() { if (disposed || contextLost) return; paused = false; schedule(); },
    restart() {
      if (contextLost) return;
      // Abandoning a run is an ending: its score counts, once.
      if (run.phase === 'running' && run.score > 0) finish();
      fresh(false);
      context.setStatus('Fresh course. Choose a difficulty, then press Play.');
    },
    serialize: snapshot,
    restore(value) {
      const restored = restoreSnapshot(value);
      if (!restored) return;
      cancel();
      clearInput();
      records = restored.records;
      run = restored.run ?? createRun(run.seed, run.run, restored.difficulty);
      course = getCourse(run.seed, run.difficulty);
      waiting = run.phase === 'running';
      committed = run.phase === 'over';
      marks = { today: false, week: false, allTime: false };
      view = viewRecords(records, run.difficulty, new Date());
      reported = run.score;
      boostText = run.gateIndex >= 0 ? gateText() : 'Speed Up';
      scene.reset();
      if (restored.migrated) {
        note.hidden = false;
        note.textContent = `Ball Run has a new course. Your best of ${records.medium.allTime} m is kept as Medium’s all-time record.`;
      }
      screen();
      if (waiting) context.setStatus(`Saved ${label()} run at ${run.score} metres. Press Continue to resume.`);
      else if (restored.migrated) context.setStatus(note.textContent!);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel();
      settle();
      clearInput();
      abort.abort();
      resize.disconnect();
      scene.dispose();
      root.remove();
    },
  };
}

const game: GameModule = Object.freeze({
  id: 'ball-run', title: 'Ball Run', cover: 'game-art/ball-run/cover.svg',
  rules: 'Choose Easy, Medium or Hard, then press Play. The ball rolls forward by itself and keeps getting faster. Drag left and right on the track, or hold A / D or the Left / Right arrows, to steer. Hitting a magenta block or rolling off the edge ends the run. Each cyan gate you pass through permanently raises your speed. Your score is the metres you travel; your best today, this week and all time are kept for each difficulty. P pauses and resumes; R plays again after Game Over.',
  mount,
});
export default game;
