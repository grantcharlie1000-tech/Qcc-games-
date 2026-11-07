import type { GameModule } from '../../core/types';
import { inJoystickZone, KeyboardSteering, pointerAngle } from './input';
import { createJoystick } from './joystick';
import { bindGamePauseSheet, createGameSheet } from '../../ui/game-sheet';
import { advanceArena, BOT_COUNT, createArena, MIN_MASS, ranking, restoreArena, snapshot, STEP } from './model';
import { createRenderer } from './render';
import { skinFor } from './skin';
import {compactMass,mountDockRanking} from './dock-ranking';
import {notifyGlassFrame,registerGlassFrameSource} from '../../ui/glass-frame-source';
import {bindGlass} from '../../ui/glass';
import './style.css';
import './christmas.css';

const module: GameModule = {
  id: 'neon-coil', title: 'Slither.io', cover: 'game-art/neon-coil/cover.svg',
  rules: 'Independent browser adaptation. A continuous arena against 18 named LOCAL BOTS. Move your mouse or trackpad pointer to steer; no click is needed. On touchscreens, put your thumb anywhere in the lower-left area: the thumb stick appears under it and steers in any direction. Hold arrows or WASD (diagonals too) to turn toward that direction; tap for small nudges, release to hold your heading. You always move forward and turn in a smooth curve.\n\nEvery new snake, including you at the start, is protected for 3 seconds and looks pale while it lasts: it cannot be defeated by bodies or head-on contact, and its own body cannot defeat anyone. The rim still counts.\n\nGlowing pellets near your head are drawn into it and count when they arrive. Eat to gain mass and grow your real following body. Keep eating to grow beyond 600; very large coils gain length more gradually. Hold Space or the Boost button (right thumb on touchscreens) for 1.7× speed, spending 6 mass per second and leaving collectible food behind. Boost stops at 20 mass.\n\nYour head touching another snake’s body or the glowing arena rim ends your run. Head-on collisions defeat both snakes, regardless of size. Crossing your own body is safe. Defeated snakes leave their mass as collectible pellet trails. Bots eat, grow, avoid hazards, die and respawn away from you. Ranking uses actual current mass.\n\nP pauses. Escape opens your study chapter through the arcade. Pause freezes the whole arena. Saved runs wait for Continue arena. Restart begins a fresh run; your best mass stays on this device. No networking or online players.',
  mount(container, context) {
    const root = document.createElement('div'); root.className = 'nc-game';
    root.innerHTML = `<canvas class="nc-canvas" tabindex="0" role="img" aria-label="Slither.io arena. Move the pointer without clicking, use the thumb stick on touch, or hold arrows and WASD to steer. Hold Space to boost. P pauses."></canvas>
      <div class="nc-score" aria-label="Current mass in Classic mode"><span class="nc-difficulty">CLASSIC</span><strong class="nc-mass">30</strong></div>
      <aside class="nc-ranking" aria-label="Live arena ranking"><h2>LIVE RANKING</h2><ol></ol><div class="nc-you" hidden></div></aside>
      <div class="nc-bottom"><button class="nc-boost arcade-glass game-glass" aria-label="Hold to boost" aria-pressed="false"><span class="nc-chevrons glass-ink" aria-hidden="true"><i></i><i></i><i></i></span><small class="nc-boost-note"></small></button></div>`;
    container.append(root);
    const canvas = root.querySelector<HTMLCanvasElement>('canvas')!, renderer = createRenderer(canvas);
    const controlsCopy = { touch: '', keyboard: '' };
    const pauseSheet = bindGamePauseSheet(container, { title: 'Slither.io', controls: controlsCopy });
    const sheet = createGameSheet(root, { title: 'Slither.io', controls: controlsCopy, onPlay: begin, buttonClass: 'nc-start' });
    const start = sheet.button;
    const mass = root.querySelector<HTMLElement>('.nc-mass')!, board = root.querySelector<HTMLOListElement>('.nc-ranking ol')!;
    const rankPanel = root.querySelector<HTMLElement>('.nc-ranking')!;
    const rankingLayout=mountDockRanking(root,container,rankPanel);
    const you = root.querySelector<HTMLElement>('.nc-you')!, boost = root.querySelector<HTMLButtonElement>('.nc-boost')!;
    const boostNote = root.querySelector<HTMLElement>('.nc-boost-note')!;
    // Boost wears the same clear glass as the dock; the binding only paints, so pointer capture stays with Boost.
    const boostGlass = bindGlass(boost);
    const stick = createJoystick(root);
    root.querySelector('.nc-bottom')!.prepend(stick.element);
    let touchInput = false;
    // Touch layout: thumb stick bottom-left, Boost for the right thumb. Also adopted on the first real touch (hybrid devices).
    function useTouchLayout() {
      if (touchInput) return; touchInput = true; root.dataset.touch = 'true';
      uiAt = -Infinity;
    }
    const events = new AbortController(), signal = events.signal;
    let state = createArena(), paused = false, disposed = false, savedRun = false, frame: number | null = null, last: number | null = null;
    let uiAt = -Infinity, cpuReportAt = -Infinity, lastScore = -1, lastPhase = '', seed = state.seed, keyBoost = false, buttonBoost = false;
    // Every source only proposes a target heading; the model's shared turn law does the rest.
    let steering: 'pointer' | 'keyboard' | 'stick' = 'keyboard', pointer: { x: number; y: number } | null = null, touchId: number | null = null;
    let boostId: number | null = null, stickHold: number | undefined;
    let best = context.highScore;
    const keyboard = new KeyboardSteering(), frameCosts: number[] = [];
    if (matchMedia('(pointer: coarse)').matches) useTouchLayout();
    function clearInput() {
      if (touchId !== null && canvas.hasPointerCapture(touchId)) canvas.releasePointerCapture(touchId);
      if (boostId !== null && boost.hasPointerCapture(boostId)) boost.releasePointerCapture(boostId);
      boostId = null; keyboard.clear(); keyBoost = buttonBoost = false; touchId = null; pointer = null; stick.end(); stickHold = undefined; state.snakes[0].boosting = false; }
    function resize() {
      const rect = root.getBoundingClientRect(); renderer.resize(rect.width, rect.height);
      // On touch layouts the minimap sits just above the resting thumb stick.
      if (touchInput && !stick.element.hidden) renderer.setMinimapLift(rect.height - stick.restTop() + 46);
      else renderer.setMinimapLift();
      placeRanking();
      // Layout-dependent HUD must follow the canvas even when simulation is stopped.
      uiAt = -Infinity; update(performance.now());
      renderer.draw(state, 1, context.settings.reducedMotion);
    }
    function placeRanking() {
      rankingLayout.fit();
    }
    const observer = new ResizeObserver(resize); observer.observe(root);
    const dock = container.closest('.game-view')?.querySelector<HTMLElement>('.game-dock');
    if (dock) observer.observe(dock);
    if (rankingLayout.hud) observer.observe(rankingLayout.hud);
    window.addEventListener('resize', resize, { signal });
    function persist() { context.save(snapshot(state)); }
    function update(now = 0, force = false) {
      if (!force && now - uiAt < 100) return; uiAt = now;
      const player = state.snakes[0], score = Math.floor(player.mass + 1e-6), ranks = ranking(state), place = ranks.findIndex(snake => snake.id === 0) + 1;
      best = Math.max(best, score); mass.textContent = String(score);rankingLayout.setMass(score);
      if (score !== lastScore) { context.setScore(score); lastScore = score; }
      context.setLevel(`Classic · #${place} · ${BOT_COUNT} local bots`);
      const limit = renderer.view.width < 600 || renderer.view.height < 600 ? 5 : 10;
      rankPanel.hidden=state.phase!=='running';
      const entries = ranks.slice(0, limit);
      const row = (name: string, value: number, rank: number, color: string) => `<span class="nc-place">${rank}</span><i style="background:${color}" aria-hidden="true"></i><span class="nc-name">${name}</span><strong aria-label="${Math.floor(value)}" title="${Math.floor(value)}">${compactMass(value)}</strong>`;
      // Names and colors are fixed local constants, never data from storage or the network.
      board.innerHTML = entries.map((snake, i) => `<li style="color:${skinFor(snake.id,snake.color).primary}"${snake.id === 0 ? ' class="is-you"' : ''}>${row(snake.name, snake.mass, i + 1, skinFor(snake.id,snake.color).primary)}</li>`).join('');
      you.hidden = place <= limit; you.innerHTML = row('YOU', player.mass, place, skinFor(0,player.color).primary);
      root.dataset.phase = state.phase; root.dataset.tick = String(state.ticks); root.dataset.mass = player.mass.toFixed(3);
      root.dataset.x = player.x.toFixed(3); root.dataset.y = player.y.toFixed(3); root.dataset.angle = player.angle.toFixed(4);
      root.dataset.reducedMotion = String(!!context.settings.reducedMotion);
      root.dataset.immune = String(player.immune); root.dataset.stick = stick.active ? 'active' : stick.element.hidden ? 'hidden' : 'idle';
      root.dataset.boosting = String(player.boosting); root.dataset.trails = String(state.food.filter(food => food.trail).length);
      root.dataset.rank = String(place); root.dataset.eaten = String(state.eaten); root.dataset.defeated = String(state.defeated);
      boost.disabled = paused || state.phase !== 'running'; boost.setAttribute('aria-pressed', String(player.boosting));
      boostNote.textContent = player.mass <= MIN_MASS + 1e-6 ? 'Low mass' : player.boosting ? '1.7× SPEED · −6 MASS / SEC' : '';
      start.disabled = paused;
      const hideStick = !touchInput || state.phase !== 'running';
      if (stick.element.hidden !== hideStick) { stick.element.hidden = hideStick; queueMicrotask(resize); }
      if (lastPhase !== state.phase || force) {
        lastPhase = state.phase;
        if (state.phase === 'running') sheet.hide();
        else sheet.show(state.phase === 'dead' ? 'game-over' : 'start', { score: savedRun || state.phase === 'dead' ? score : undefined, best: Math.floor(best) });
        if (state.phase === 'dead') context.announce(`${state.cause} ${score} mass. Play again when ready.`);
      }
      context.setStatus(paused ? 'Arena paused.' : state.phase === 'dead' ? state.cause : state.phase === 'ready' ? 'Ready' : `${score} mass. Rank ${place}.`);
    }
    function reset() { cancelFrame(); seed = (seed + 0x9e3779b9) >>> 0; state = createArena(seed); savedRun = false; last = null; clearInput(); update(0, true); renderer.draw(state, 1, context.settings.reducedMotion); persist(); }
    function begin() {
      if (paused || disposed) return;
      if (state.phase === 'dead') reset();
      state.phase = 'running'; savedRun = false; last = null; clearInput(); update(0, true); persist(); context.sound('tap'); canvas.focus({ preventScroll: true }); scheduleFrame();
    }
    const local = (event: PointerEvent) => { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
    function setPointer(event: PointerEvent) { pointer = local(event); steering = 'pointer'; }
    canvas.addEventListener('pointermove', event => {
      if (paused || state.phase !== 'running') return;
      if (event.pointerType === 'mouse' && touchId === null) setPointer(event);
      else if (event.pointerId === touchId) { const p = local(event); stick.move(p.x, p.y); stickHold = stick.angle() ?? stickHold; event.preventDefault(); }
    }, { signal });
    canvas.addEventListener('pointerdown', event => {
      if (paused || state.phase !== 'running' || event.button !== 0) return;
      if (event.pointerType === 'mouse') { if (event.isPrimary && touchId === null) { canvas.focus({ preventScroll: true }); setPointer(event); } return; }
      useTouchLayout();
      // The first thumb in the lower-left zone owns steering until it lifts; a held Boost finger is separate.
      const p = local(event);
      if (touchId !== null || !inJoystickZone(p.x, p.y, renderer.view.width, renderer.view.height)) return;
      canvas.focus({ preventScroll: true }); touchId = event.pointerId; canvas.setPointerCapture(event.pointerId); event.preventDefault();
      steering = 'stick'; stick.start(p.x, p.y); stickHold = undefined;
    }, { signal });
    const releaseTouch = (event: PointerEvent) => {
      if (event.pointerId !== touchId) return;
      // Letting go keeps the last direction the stick gave (so a quick flick completes), or the current heading.
      touchId = null; stick.end(); stickHold ??= state.snakes[0].angle;
    };
    canvas.addEventListener('pointerup', releaseTouch, { signal }); canvas.addEventListener('pointercancel', releaseTouch, { signal }); canvas.addEventListener('lostpointercapture', releaseTouch, { signal });
    boost.addEventListener('pointerdown', event => { if (boost.disabled || event.button !== 0 || boostId !== null) return; event.preventDefault(); boostId = event.pointerId; buttonBoost = true; boost.setPointerCapture(event.pointerId); }, { signal });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) boost.addEventListener(name, event => { if (event.pointerId === boostId) { boostId = null; buttonBoost = false; } }, { signal });
    boost.addEventListener('keydown', event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); buttonBoost = !boost.disabled; } }, { signal });
    boost.addEventListener('keyup', event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); buttonBoost = false; } }, { signal });
    boost.addEventListener('blur', () => { buttonBoost = false; }, { signal });
    const dialogOpen = () => !!document.querySelector('dialog[open]');
    window.addEventListener('keydown', event => {
      if (event.ctrlKey || event.altKey || event.metaKey || dialogOpen() || (event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable=true]'))) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (key === 'p') { event.preventDefault(); if (!event.repeat) document.querySelector<HTMLButtonElement>('#pause-game')?.click(); return; }
      if (paused || state.phase !== 'running') return;
      if (keyboard.press(key)) { event.preventDefault(); steering = 'keyboard'; }
      else if (key === ' ' && !(event.target instanceof HTMLElement && event.target.closest('button,a'))) { event.preventDefault(); keyBoost = true; }
    }, { signal });
    window.addEventListener('keyup', event => { const key = event.key.length === 1 ? event.key.toLowerCase() : event.key; keyboard.release(key, state.snakes[0].angle); if (key === ' ') { if (keyBoost) event.preventDefault(); keyBoost = false; } }, { signal });
    window.addEventListener('blur', clearInput, { signal });
    // Publish each finished frame to the shared glass lens; repaint redraws the current state only.
    const drawArena = renderer.draw; let drawnAlpha = 1;
    renderer.draw = (s, alpha = 1, reduced = false, repaint = false) => { drawnAlpha = alpha; drawArena(s, alpha, reduced, repaint); notifyGlassFrame(canvas); };
    const releaseGlass = registerGlassFrameSource(canvas, () => { if (!disposed) renderer.draw(state, drawnAlpha, context.settings.reducedMotion, true); });
    function controls() {
      let angle: number | undefined;
      if (steering === 'stick') angle = stick.angle() ?? stickHold;
      else if (steering === 'pointer' && pointer) angle = pointerAngle(pointer.x - renderer.view.width / 2, pointer.y - renderer.view.height / 2);
      else if (steering === 'keyboard') angle = keyboard.target();
      return { angle, boost: keyBoost || buttonBoost };
    }
    function cancelFrame() { if (frame !== null) cancelAnimationFrame(frame); frame = null; }
    function scheduleFrame() { if (frame === null && !disposed && !paused && state.phase === 'running') frame = requestAnimationFrame(loop); }
    function loop(now: number) {
      frame = null;
      if (disposed) return;
      const began = performance.now(), oldPhase = state.phase;
      if (!paused && state.phase === 'running') { if (last !== null) advanceArena(state, now - last, controls()); last = now; }
      else last = null;
      if (state.phase !== oldPhase && state.phase === 'dead') { clearInput(); context.sound('lose'); persist(); }
      if (!paused && (state.phase === 'running' || oldPhase !== state.phase)) renderer.draw(state, state.phase !== 'running' ? 1 : state.accumulator / STEP, context.settings.reducedMotion);
      if (!paused && state.phase === 'running') update(now);
      else if (oldPhase !== state.phase) update(now, true);
      frameCosts.push(performance.now() - began); if (frameCosts.length > 180) frameCosts.shift();
      if (now - cpuReportAt >= 1000) { cpuReportAt = now; const sorted = [...frameCosts].sort((a, b) => a - b); root.dataset.cpuP95 = sorted[Math.floor(sorted.length * .95)].toFixed(2); }
      scheduleFrame();
    }
    resize(); update(0, true);
    return {
      pause() { paused = true; cancelFrame(); last = null; clearInput(); update(0, true); renderer.draw(state, 1, context.settings.reducedMotion); },
      resume() { paused = false; last = null; clearInput(); update(0, true); scheduleFrame(); },
      restart() { reset(); },
      serialize() { return snapshot(state); },
      restore(data) {
        const restored = restoreArena(data); if (!restored) return;
        cancelFrame(); state = restored; seed = state.seed; savedRun = state.phase === 'running' || (state.phase === 'ready' && state.ticks > 0);
        if (savedRun) state.phase = 'ready'; last = null; clearInput(); update(0, true); renderer.draw(state, 1, context.settings.reducedMotion);
      },
      dispose() { disposed = true; cancelFrame(); releaseGlass(); boostGlass.dispose(); clearInput(); events.abort(); observer.disconnect(); rankingLayout.dispose(); sheet.dispose(); pauseSheet.dispose(); root.remove(); }
    };
  }
};
export default module;
