import type { GameModule } from '../../core/types';
import { bindGamePauseSheet, createGameSheet } from '../../ui/game-sheet';
import { advanceArena, BOT_COUNT, createArena, MIN_MASS, ranking, restoreArena, snapshot, STEP, type Arena } from './model';
import { createRenderer } from './render';
import { skinFor } from './skin';
import {compactMass,mountDockRanking} from './dock-ranking';
import {notifyGlassFrame,registerGlassFrameSource} from '../../ui/glass-frame-source';
import './style.css';

const module: GameModule = {
  id: 'neon-coil', title: 'Slither.io', cover: 'game-art/neon-coil/cover.svg',
  rules: 'Independent browser adaptation. A continuous arena against 18 named LOCAL BOTS. Move your mouse or trackpad pointer to steer; no click is needed. On touchscreens, drag anywhere on the arena. Arrows or WASD also steer. You always move forward and turn in a curve.\n\nEat glowing pellets to gain mass and grow your real following body. Keep eating to grow beyond 600; very large coils gain length more gradually. Hold Space or the Boost button for 1.7× speed, spending 6 mass per second and leaving collectible food behind. Boost stops at 20 mass.\n\nYour head touching another snake’s body or the glowing arena rim ends your run. Head-on collisions defeat both snakes, regardless of size. Crossing your own body is safe. Defeated snakes leave their mass as collectible pellet trails. Bots eat, grow, avoid hazards, die and respawn away from you. Ranking uses actual current mass.\n\nP pauses. Escape opens your study chapter through the arcade. Pause freezes the whole arena. Saved runs wait for Play. Restart begins a fresh run; your best mass stays on this device. No networking or online players.',
  mount(container, context) {
    const root = document.createElement('div'); root.className = 'nc-game';
    root.innerHTML = `<canvas class="nc-canvas" tabindex="0" role="img" aria-label="Slither.io arena. Move the pointer without clicking, drag on touch, or use arrows and WASD to steer. Hold Space to boost. P pauses."></canvas>
      <div class="nc-score" aria-label="Current mass in Classic mode"><span class="nc-difficulty">CLASSIC</span><strong class="nc-mass">30</strong></div>
      <aside class="nc-ranking" aria-label="Live arena ranking"><h2>LIVE RANKING</h2><ol></ol><div class="nc-you" hidden></div></aside>
      <div class="nc-bottom"><button class="nc-boost" aria-label="Hold to boost" aria-pressed="false"><span class="nc-chevrons" aria-hidden="true"><i></i><i></i><i></i></span><small class="nc-boost-note">Hold to boost · spends mass</small></button></div>`;
    container.append(root);
    const canvas = root.querySelector<HTMLCanvasElement>('canvas')!, renderer = createRenderer(canvas);
    const controlsCopy = { touch: 'Drag steers · Hold Boost', keyboard: 'Pointer steers · Space boosts' };
    const pauseSheet = bindGamePauseSheet(container, { title: 'Slither.io', controls: controlsCopy });
    const sheet = createGameSheet(root, { title: 'Slither.io', controls: controlsCopy, onPlay: begin, buttonClass: 'nc-start' });
    const start = sheet.button;
    const mass = root.querySelector<HTMLElement>('.nc-mass')!, board = root.querySelector<HTMLOListElement>('.nc-ranking ol')!;
    const rankPanel = root.querySelector<HTMLElement>('.nc-ranking')!;
    const rankingLayout=mountDockRanking(root,container,rankPanel);
    const you = root.querySelector<HTMLElement>('.nc-you')!, boost = root.querySelector<HTMLButtonElement>('.nc-boost')!;
    const boostNote = root.querySelector<HTMLElement>('.nc-boost-note')!;
    const touchInput = matchMedia('(pointer: coarse)').matches;
    boost.hidden=!(navigator.maxTouchPoints>0||matchMedia('(any-pointer: coarse)').matches);
    const events = new AbortController(), signal = events.signal;
    let state = createArena(), paused = false, disposed = false, savedRun = false, frame = 0, last: number | null = null;
    let uiAt = -Infinity, lastScore = -1, lastPhase = '', seed = state.seed, keyBoost = false, buttonBoost = false;
    let steering: 'pointer' | 'keyboard' = 'keyboard', pointer: { x: number; y: number } | null = null, touchId: number | null = null;
    let boostId: number | null = null;
    let best = context.highScore, keyboardAngle: number | undefined;
    const keys = new Set<string>(), frameCosts: number[] = [];
    const directions: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
    function keyboardTarget() {
      let x = 0, y = 0; for (const key of keys) { const d = directions[key]; if (d) { x += d[0]; y += d[1]; } }
      if (x || y) keyboardAngle = Math.atan2(y, x);
    }
    function clearInput() {
      if (touchId !== null && canvas.hasPointerCapture(touchId)) canvas.releasePointerCapture(touchId);
      if (boostId !== null && boost.hasPointerCapture(boostId)) boost.releasePointerCapture(boostId);
      boostId = null; keys.clear(); keyBoost = buttonBoost = false; touchId = null; pointer = null; keyboardAngle = undefined; state.snakes[0].boosting = false; }
    function resize() {
      const rect = root.getBoundingClientRect(); renderer.resize(rect.width, rect.height);
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
      root.dataset.boosting = String(player.boosting); root.dataset.trails = String(state.food.filter(food => food.trail).length);
      root.dataset.rank = String(place); root.dataset.eaten = String(state.eaten); root.dataset.defeated = String(state.defeated);
      boost.disabled = paused || state.phase !== 'running'; boost.setAttribute('aria-pressed', String(player.boosting));
      boostNote.textContent = player.mass <= MIN_MASS + 1e-6 ? 'Eat more glow to boost' : player.boosting ? '1.7× SPEED · −6 MASS / SEC' : touchInput ? 'Hold here · spends mass' : 'Hold SPACE · spends mass';
      start.disabled = paused;
      if (lastPhase !== state.phase || force) {
        lastPhase = state.phase;
        if (state.phase === 'running') sheet.hide();
        else sheet.show(state.phase === 'dead' ? 'game-over' : 'start', { score: savedRun || state.phase === 'dead' ? score : undefined, best: Math.floor(best) });
        if (state.phase === 'dead') context.announce(`${state.cause} ${score} mass. Play again when ready.`);
      }
      context.setStatus(paused ? 'Arena paused.' : state.phase === 'dead' ? `${state.cause} Play again to start a fresh arena.` : state.phase === 'ready' ? 'Local bots only. Move your pointer to steer, Space to boost.' : `${score} mass. Rank ${place}. Local bots only. Avoid other bodies and the rim.`);
    }
    function reset() { seed = (seed + 0x9e3779b9) >>> 0; state = createArena(seed); savedRun = false; last = null; clearInput(); update(0, true); renderer.draw(state, 1, context.settings.reducedMotion); persist(); }
    function begin() {
      if (paused || disposed) return;
      if (state.phase === 'dead') reset();
      state.phase = 'running'; savedRun = false; last = null; clearInput(); update(0, true); persist(); context.sound('tap'); canvas.focus({ preventScroll: true });
    }
    function setPointer(event: PointerEvent) { const rect = canvas.getBoundingClientRect(); pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top }; steering = 'pointer'; }
    canvas.addEventListener('pointermove', event => {
      if (paused || state.phase !== 'running') return;
      if ((event.pointerType === 'mouse' && touchId === null) || event.pointerId === touchId) { setPointer(event); if (event.pointerType !== 'mouse') event.preventDefault(); }
    }, { signal });
    canvas.addEventListener('pointerdown', event => {
      if (paused || state.phase !== 'running' || event.button !== 0) return;
      // Touch primary status belongs to the whole device, including a held Boost finger.
      if (touchId !== null || (event.pointerType === 'mouse' && !event.isPrimary)) return;
      canvas.focus({ preventScroll: true }); setPointer(event);
      if (event.pointerType !== 'mouse') { touchId = event.pointerId; canvas.setPointerCapture(event.pointerId); event.preventDefault(); }
    }, { signal });
    const releaseTouch = (event: PointerEvent) => { if (event.pointerId === touchId) { touchId = null; pointer = null; } };
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
      if (directions[key]) { event.preventDefault(); keys.add(key); keyboardTarget(); steering = 'keyboard'; }
      else if (key === ' ' && !(event.target instanceof HTMLElement && event.target.closest('button,a'))) { event.preventDefault(); keyBoost = true; }
    }, { signal });
    window.addEventListener('keyup', event => { const key = event.key.length === 1 ? event.key.toLowerCase() : event.key; keys.delete(key); keyboardTarget(); if (key === ' ') { if (keyBoost) event.preventDefault(); keyBoost = false; } }, { signal });
    window.addEventListener('blur', clearInput, { signal });
    // Publish each finished frame to the shared glass lens; repaint redraws the current state only.
    const drawArena = renderer.draw; let drawnAlpha = 1;
    renderer.draw = (s, alpha = 1, reduced = false) => { drawnAlpha = alpha; drawArena(s, alpha, reduced); notifyGlassFrame(canvas); };
    const releaseGlass = registerGlassFrameSource(canvas, () => { if (!disposed) renderer.draw(state, drawnAlpha, context.settings.reducedMotion); });
    function controls() {
      let angle: number | undefined;
      if (steering === 'pointer' && pointer) {
        const dx = pointer.x - renderer.view.width / 2, dy = pointer.y - renderer.view.height / 2;
        if (Math.hypot(dx, dy) > 20) angle = Math.atan2(dy, dx);
      } else {
        keyboardTarget();
        angle = keyboardAngle;
      }
      return { angle, boost: keyBoost || buttonBoost };
    }
    function loop(now: number) {
      if (disposed) return;
      const began = performance.now(), oldPhase = state.phase;
      if (!paused && state.phase === 'running') { if (last !== null) advanceArena(state, now - last, controls()); last = now; }
      else last = null;
      if (state.phase !== oldPhase && state.phase === 'dead') { clearInput(); context.sound('lose'); persist(); }
      if (!paused && (state.phase === 'running' || oldPhase !== state.phase)) renderer.draw(state, state.phase !== 'running' ? 1 : state.accumulator / STEP, context.settings.reducedMotion);
      if (!paused && state.phase === 'running') update(now);
      else if (oldPhase !== state.phase) update(now, true);
      frameCosts.push(performance.now() - began); if (frameCosts.length > 180) frameCosts.shift();
      if (state.ticks % 60 === 0 && frameCosts.length) { const sorted = [...frameCosts].sort((a, b) => a - b); root.dataset.cpuP95 = sorted[Math.floor(sorted.length * .95)].toFixed(2); }
      frame = requestAnimationFrame(loop);
    }
    resize(); update(0, true); frame = requestAnimationFrame(loop);
    return {
      pause() { paused = true; last = null; clearInput(); update(0, true); renderer.draw(state, 1, context.settings.reducedMotion); },
      resume() { paused = false; last = null; clearInput(); update(0, true); },
      restart() { reset(); },
      serialize() { return snapshot(state); },
      restore(data) {
        const restored = restoreArena(data); if (!restored) return;
        state = restored; seed = state.seed; savedRun = state.phase === 'running' || (state.phase === 'ready' && state.ticks > 0);
        if (savedRun) state.phase = 'ready'; last = null; clearInput(); update(0, true); renderer.draw(state, 1, context.settings.reducedMotion);
      },
      dispose() { disposed = true; releaseGlass(); clearInput(); events.abort(); observer.disconnect(); rankingLayout.dispose(); sheet.dispose(); pauseSheet.dispose(); cancelAnimationFrame(frame); root.remove(); }
    };
  }
};
export default module;
