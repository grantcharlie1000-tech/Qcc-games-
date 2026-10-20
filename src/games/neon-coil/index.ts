import type { GameModule } from '../../core/types';
import { advanceArena, BOT_COUNT, createArena, MIN_MASS, ranking, restoreArena, snapshot, STEP, type Arena } from './model';
import { createRenderer } from './render';
import './style.css';

const module: GameModule = {
  id: 'neon-coil', title: 'Neon Coil', cover: 'game-art/neon-coil/cover.svg',
  rules: 'A continuous arena against 18 named LOCAL BOTS. Move your mouse or trackpad pointer to steer; no click is needed. On touchscreens, drag anywhere on the arena. Arrows or WASD also steer. You always move forward and turn in a curve.\n\nEat glowing pellets to gain mass and grow your real following body. Mass caps at 600; boost spends it to make room. Hold Space or the Boost button for 1.7× speed, spending 6 mass per second and leaving collectible food behind. Boost stops at 20 mass.\n\nYour head touching another snake’s body or the glowing arena rim ends your run. Head-on collisions defeat both snakes, regardless of size. Crossing your own body is safe. Defeated snakes leave their mass as collectible pellet trails. Bots eat, grow, avoid hazards, die and respawn away from you. Ranking uses actual current mass.\n\nP pauses. Escape opens your study chapter through the arcade. Pause freezes the whole arena. Saved runs wait for Continue arena. Restart begins a fresh run; your best mass stays on this device. No networking or online players.',
  mount(container, context) {
    const root = document.createElement('div'); root.className = 'nc-game';
    root.innerHTML = `<canvas class="nc-canvas" tabindex="0" role="img" aria-label="Neon Coil arena. Move the pointer without clicking, drag on touch, or use arrows and WASD to steer. Hold Space to boost. P pauses."></canvas>
      <div class="nc-score"><span>NEON COIL</span><strong class="nc-mass">30</strong><small>MASS <b>·</b> <span class="nc-difficulty">CLASSIC</span></small><em>18 local bots · offline arena</em></div>
      <aside class="nc-ranking" aria-label="Live arena ranking"><h2>LIVE RANKING <span>LOCAL BOTS</span></h2><ol></ol><div class="nc-you" hidden></div></aside>
      <div class="nc-bottom"><p class="nc-hint">Move pointer to steer <span>·</span> Arrows / WASD <span>·</span> P pause</p><button class="nc-boost" aria-label="Hold to boost" aria-pressed="false"><span>BOOST</span><small class="nc-boost-note">Hold SPACE · spends mass</small></button></div>
      <div class="nc-overlay"><section class="nc-card" aria-labelledby="nc-heading"><p class="nc-eyebrow">A LITTLE LIGHT. A LONG WAY.</p><h2 id="nc-heading">Neon Coil<span>Find your flow.</span></h2><p class="nc-copy">Follow your pointer. Gather the glow.<br>Outmaneuver 18 local bots in a living arena.</p><div class="nc-guide"><span><b>01</b> Move pointer or drag to steer</span><span><b>02</b> Eat pellets to grow</span><span><b>03</b> Hold Space to boost · costs mass</span></div><p class="nc-result" hidden></p><button class="game-button nc-start">Enter arena <span aria-hidden="true">↗</span></button><p class="nc-footnote">Arrows / WASD also steer · P pause · Esc study<br>Heads hit other bodies. Your own coils are safe.</p></section></div>`;
    container.append(root);
    const canvas = root.querySelector<HTMLCanvasElement>('canvas')!, renderer = createRenderer(canvas);
    const overlay = root.querySelector<HTMLElement>('.nc-overlay')!, heading = root.querySelector<HTMLElement>('#nc-heading')!;
    const copy = root.querySelector<HTMLElement>('.nc-copy')!, guide = root.querySelector<HTMLElement>('.nc-guide')!;
    const result = root.querySelector<HTMLElement>('.nc-result')!, start = root.querySelector<HTMLButtonElement>('.nc-start')!;
    const mass = root.querySelector<HTMLElement>('.nc-mass')!, board = root.querySelector<HTMLOListElement>('.nc-ranking ol')!;
    const you = root.querySelector<HTMLElement>('.nc-you')!, boost = root.querySelector<HTMLButtonElement>('.nc-boost')!;
    const boostNote = root.querySelector<HTMLElement>('.nc-boost-note')!;
    const touchInput = matchMedia('(pointer: coarse)').matches;
    if (touchInput) root.querySelector<HTMLElement>('.nc-hint')!.textContent = 'Drag anywhere to steer · Hold BOOST with a second finger';
    const events = new AbortController(), signal = events.signal;
    let state = createArena(), paused = false, disposed = false, savedRun = false, frame = 0, last: number | null = null;
    let uiAt = -Infinity, lastScore = -1, lastPhase = '', seed = state.seed, keyBoost = false, buttonBoost = false;
    let steering: 'pointer' | 'keyboard' = 'keyboard', pointer: { x: number; y: number } | null = null, touchId: number | null = null;
    let best = context.highScore, keyboardAngle: number | undefined;
    const keys = new Set<string>(), frameCosts: number[] = [];
    const directions: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
    function keyboardTarget() {
      let x = 0, y = 0; for (const key of keys) { const d = directions[key]; if (d) { x += d[0]; y += d[1]; } }
      if (x || y) keyboardAngle = Math.atan2(y, x);
    }
    function clearInput() { keys.clear(); keyBoost = buttonBoost = false; touchId = null; pointer = null; keyboardAngle = undefined; state.snakes[0].boosting = false; }
    function resize() { const rect = root.getBoundingClientRect(); renderer.resize(rect.width, rect.height); renderer.draw(state, 1, context.settings.reducedMotion); }
    const observer = new ResizeObserver(resize); observer.observe(root);
    window.addEventListener('resize', resize, { signal });
    function persist() { context.save(snapshot(state)); }
    function update(now = 0, force = false) {
      if (!force && now - uiAt < 100) return; uiAt = now;
      const player = state.snakes[0], score = Math.floor(player.mass + 1e-6), ranks = ranking(state), place = ranks.findIndex(snake => snake.id === 0) + 1;
      best = Math.max(best, score); mass.textContent = String(score);
      if (score !== lastScore) { context.setScore(score); lastScore = score; }
      context.setLevel(`Classic · #${place} · ${BOT_COUNT} local bots`);
      const limit = renderer.view.width < 600 ? 5 : 10;
      const entries = ranks.slice(0, limit);
      const row = (name: string, value: number, rank: number, color: string) => `<span class="nc-place">${rank}</span><i style="background:${color}" aria-hidden="true"></i><span class="nc-name">${name}</span><strong>${Math.floor(value)}</strong>`;
      // Names and colors are fixed local constants, never data from storage or the network.
      board.innerHTML = entries.map((snake, i) => `<li${snake.id === 0 ? ' class="is-you"' : ''}>${row(snake.name, snake.mass, i + 1, snake.color)}</li>`).join('');
      you.hidden = place <= limit; you.innerHTML = row('YOU', player.mass, place, player.color);
      root.dataset.phase = state.phase; root.dataset.tick = String(state.ticks); root.dataset.mass = player.mass.toFixed(3);
      root.dataset.x = player.x.toFixed(3); root.dataset.y = player.y.toFixed(3); root.dataset.angle = player.angle.toFixed(4);
      root.dataset.boosting = String(player.boosting); root.dataset.trails = String(state.food.filter(food => food.trail).length);
      root.dataset.rank = String(place); root.dataset.eaten = String(state.eaten); root.dataset.defeated = String(state.defeated);
      boost.disabled = paused || state.phase !== 'running'; boost.setAttribute('aria-pressed', String(player.boosting));
      boostNote.textContent = player.mass <= MIN_MASS + 1e-6 ? 'Eat more glow to boost' : player.boosting ? '1.7× SPEED · −6 MASS / SEC' : touchInput ? 'Hold here · spends mass' : 'Hold SPACE · spends mass';
      overlay.hidden = state.phase === 'running'; start.disabled = paused;
      if (lastPhase !== state.phase || force) {
        lastPhase = state.phase;
        guide.hidden = state.phase === 'dead' || savedRun; result.hidden = state.phase !== 'dead';
        if (state.phase === 'dead') {
          heading.innerHTML = 'A bright run.<span>Another little light?</span>';
          copy.textContent = state.cause;
          result.textContent = `${score} mass · ${Math.floor(state.ticks * STEP)}s survived · ${player.kills} outmaneuvered · Best ${Math.floor(best)}`;
          start.textContent = 'Play again';
          context.announce(`${state.cause} ${score} mass. Play again when ready.`);
        } else {
          heading.innerHTML = savedRun ? 'Welcome back.<span>Your glow is waiting.</span>' : 'Neon Coil<span>Find your flow.</span>';
          copy.innerHTML = savedRun ? `${score} mass · ${Math.floor(state.ticks * STEP)}s survived.<br>Continue your saved local arena.` : 'Follow your pointer. Gather the glow.<br>Outmaneuver 18 local bots in a living arena.';
          start.textContent = savedRun ? 'Continue arena' : 'Enter arena';
        }
      }
      context.setStatus(paused ? 'Arena paused.' : state.phase === 'dead' ? `${state.cause} Play again to start a fresh arena.` : state.phase === 'ready' ? 'Local bots only. Move your pointer to steer, Space to boost.' : `${score} mass. Rank ${place}. Local bots only. Avoid other bodies and the rim.`);
    }
    function reset() { seed = (seed + 0x9e3779b9) >>> 0; state = createArena(seed); savedRun = false; last = null; clearInput(); update(0, true); renderer.draw(state, 1, context.settings.reducedMotion); persist(); }
    function begin() {
      if (paused || disposed) return;
      if (state.phase === 'dead') reset();
      state.phase = 'running'; savedRun = false; last = null; clearInput(); update(0, true); persist(); context.sound('tap'); canvas.focus({ preventScroll: true });
    }
    start.addEventListener('click', begin, { signal });
    function setPointer(event: PointerEvent) { const rect = canvas.getBoundingClientRect(); pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top }; steering = 'pointer'; }
    canvas.addEventListener('pointermove', event => {
      if (paused || state.phase !== 'running') return;
      if (event.pointerType === 'mouse' || event.pointerId === touchId) { setPointer(event); if (event.pointerType !== 'mouse') event.preventDefault(); }
    }, { signal });
    canvas.addEventListener('pointerdown', event => {
      if (paused || state.phase !== 'running' || !event.isPrimary || event.button !== 0) return;
      canvas.focus({ preventScroll: true }); setPointer(event);
      if (event.pointerType !== 'mouse') { touchId = event.pointerId; canvas.setPointerCapture(event.pointerId); event.preventDefault(); }
    }, { signal });
    const releaseTouch = (event: PointerEvent) => { if (event.pointerId === touchId) { touchId = null; pointer = null; } };
    canvas.addEventListener('pointerup', releaseTouch, { signal }); canvas.addEventListener('pointercancel', releaseTouch, { signal }); canvas.addEventListener('lostpointercapture', releaseTouch, { signal });
    boost.addEventListener('pointerdown', event => { if (boost.disabled || event.button !== 0) return; event.preventDefault(); buttonBoost = true; boost.setPointerCapture(event.pointerId); }, { signal });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) boost.addEventListener(name, () => { buttonBoost = false; }, { signal });
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
      dispose() { disposed = true; events.abort(); observer.disconnect(); cancelAnimationFrame(frame); root.remove(); }
    };
  }
};
export default module;
