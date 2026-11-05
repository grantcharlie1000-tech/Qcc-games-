import type { GameModule } from '../../core/types';
import { advance, createWorld, percent, ranking, restoreWorld, snapshot, start as startWorld } from './model';
import { formatShare, leaderboardScore } from './score';
import { createInput } from './input';
import { createRenderer, markSvg } from './render';
import { HUMAN, PLAYER_COUNT, STEP, type World } from './types';
import './style.css';
import './christmas.css';

const RULES = [
  'Claimline is a territory-capture game against six named LOCAL BOTS. Everyone starts on a small disc of their own land inside a circular arena. Nothing is online and no bot ever appears on any leaderboard.',
  'Leave your land and you lay a glowing trail behind you. Steer back onto your own land to claim: the trail and everything it encloses become yours, including land that belonged to other players. Land that touches the arena edge works too, because you slide along the edge instead of stopping.',
  'While your trail is out, it is exposed. If another player crosses it, you are eliminated and they take all of your land. Crossing your own trail is safe. You are also eliminated if all of your land is taken. Bots that lose come back after a few seconds on free ground.',
  'Score is your peak share of the circular arena, shown as a percentage: the share counts only land inside the circle, never open trails. Captures can steal land, so your current share can fall, but your peak stays. Your best peak is kept as your record. The run ends when you are eliminated or when you own the whole arena.',
  'Controls: move the mouse to steer toward the pointer; arrow keys or WASD steer in eight directions; on a touchscreen drag anywhere to use a floating thumbstick, and your heading is kept when you let go. P pauses. Escape opens your study chapter. Restart begins a fresh match.',
].join('\n\n');

const module: GameModule = {
  id: 'claimline', title: 'Claimline', cover: 'game-art/claimline/cover.svg', rules: RULES,
  mount(container, context) {
    const root = document.createElement('div'); root.className = 'cl-game';
    root.innerHTML = `<canvas class="cl-canvas" tabindex="0" role="img" aria-label="Claimline arena. Move the mouse, use arrow keys or WASD, or drag on a touchscreen to steer. Leave your land to lay a trail and return to claim. P pauses."></canvas>
      <div class="cl-share" aria-label="Your land"><span class="cl-share-label">Your land</span><strong class="cl-share-value">0.00%</strong><div class="cl-share-bar" aria-hidden="true"><i></i></div></div>
      <aside class="cl-ranking" aria-label="Match ranking"><ol></ol></aside>
      <div class="cl-stick" hidden aria-hidden="true"><i class="cl-stick-knob"></i></div>
      <div class="cl-overlay"><section class="cl-card" aria-labelledby="cl-heading"><p class="cl-eyebrow" hidden></p><h2 id="cl-heading">Claimline</h2><p class="cl-copy" hidden></p><p class="cl-result" hidden></p><button class="game-button cl-start" type="button">Play</button></section></div>`;
    container.append(root);
    const q = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
    const canvas = q<HTMLCanvasElement>('.cl-canvas');
    const shareValue = q<HTMLElement>('.cl-share-value'), shareBar = q<HTMLElement>('.cl-share-bar i');
    const board = q<HTMLOListElement>('.cl-ranking ol');
    const overlay = q<HTMLElement>('.cl-overlay'), heading = q<HTMLElement>('#cl-heading');
    const eyebrow = q<HTMLElement>('.cl-eyebrow'), copy = q<HTMLElement>('.cl-copy');
    const result = q<HTMLElement>('.cl-result'), startButton = q<HTMLButtonElement>('.cl-start');

    const renderer = createRenderer(canvas);
    const events = new AbortController(), signal = events.signal;
    const input = createInput(root, canvas, () => renderer.view.headScreen, signal);

    let world: World = createWorld((Math.random() * 0x100000000) >>> 0);
    let paused = false, disposed = false, savedRun = false, dirty = true;
    let frame = 0, last: number | null = null, uiAt = -Infinity, animateUntil = 0;
    let lastScore = -1, lastSound = -Infinity, milestone = 0;

    // Fixed local rows, built once and reordered, so no name or value ever comes from storage or the network.
    const rows = new Map<number, { li: HTMLLIElement; place: HTMLElement; name: HTMLElement; pct: HTMLElement }>();
    for (let id = 1; id <= PLAYER_COUNT; id++) {
      const li = document.createElement('li');
      li.dataset.id = String(id);
      li.innerHTML = `<span class="cl-place"></span>${markSvg(id)}<span class="cl-name"></span><strong class="cl-pct"></strong>`;
      rows.set(id, { li, place: li.querySelector('.cl-place')!, name: li.querySelector('.cl-name')!, pct: li.querySelector('.cl-pct')! });
      if (id === HUMAN) li.classList.add('is-you');
    }
    let rowOrder = '';

    const reduced = () => context.settings.reducedMotion;
    const humanRank = () => ranking(world).findIndex(r => r.id === HUMAN) + 1;
    const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

    function clearInput() { input.clear(); }
    function persist() { context.save(snapshot(world)); }

    function resize() {
      const rect = root.getBoundingClientRect();
      renderer.resize(rect.width, rect.height);
      dirty = true;
    }
    const observer = new ResizeObserver(resize); observer.observe(root);
    window.addEventListener('resize', resize, { signal });

    function renderOverlay() {
      const human = world.players[0];
      overlay.hidden = world.phase === 'running';
      startButton.disabled = paused;
      const over = world.phase === 'over';
      eyebrow.hidden = !over && !savedRun;
      result.hidden = !over;
      copy.hidden = !over && !savedRun;
      if (over && world.result) {
        const { reason, by } = world.result;
        const attacker = world.players[by - 1]?.name ?? 'Another player';
        const won = reason === 'won';
        eyebrow.textContent = won ? 'ARENA CLAIMED' : 'RUN ENDED';
        heading.textContent = won ? 'You won' : 'Run ended';
        copy.textContent = won ? 'You claimed the whole arena!' : reason === 'cut' ? `${attacker} cut your trail.` : 'Your land was taken.';
        const final = ranking(world).find(r => r.id === HUMAN)?.bp ?? 0;
        result.textContent = `Peak ${formatShare(human.peak)} · Final ${formatShare(final)} · Rank #${humanRank()} · ${clock(world.time)}`;
        startButton.textContent = 'Play again';
      } else if (savedRun) {
        eyebrow.textContent = 'MATCH SAVED';
        heading.textContent = 'Welcome back';
        copy.textContent = `Peak ${formatShare(human.peak)}`;
        startButton.textContent = 'Continue';
      } else {
        heading.textContent = 'Claimline';
        copy.textContent = '';
        startButton.textContent = 'Play';
      }
    }

    function update(now: number, force = false) {
      if (!force && now - uiAt < 100) return;
      uiAt = now;
      const human = world.players[0];
      const score = leaderboardScore(world);
      // No score is reported for a match that has not started, so a Best only comes from play.
      if (score !== lastScore && (world.phase !== 'ready' || world.tick > 0)) { lastScore = score; context.setScore(score); }
      const ranks = ranking(world), place = ranks.findIndex(r => r.id === HUMAN) + 1;
      const mine = ranks[place - 1]?.bp ?? 0;
      context.setLevel(`Rank #${place} of ${PLAYER_COUNT}`);
      shareValue.textContent = formatShare(mine);
      shareBar.style.width = `${Math.max(2, Math.min(100, mine / 100))}%`;

      const order = ranks.map(r => r.id).join(',');
      ranks.forEach((r, i) => {
        const row = rows.get(r.id)!;
        row.place.textContent = String(i + 1);
        row.name.textContent = r.id === HUMAN ? 'You' : r.name;
        row.pct.textContent = formatShare(r.bp);
        row.li.classList.toggle('is-out', !r.alive);
      });
      if (order !== rowOrder) { rowOrder = order; board.replaceChildren(...ranks.map(r => rows.get(r.id)!.li)); }

      const d = root.dataset;
      d.phase = world.phase; d.pct = percent(world, HUMAN).toFixed(2); d.peak = String(human.peak);
      d.tick = String(world.tick); d.x = human.x.toFixed(3); d.y = human.y.toFixed(3);
      d.angle = human.angle.toFixed(4); d.target = human.target.toFixed(3);
      d.input = input.state.source; d.stick = input.state.stick;
      d.bots = String(world.players.filter(p => p.isBot && p.alive).length); d.paused = String(paused);

      context.setStatus(paused ? 'Paused.'
        : world.phase === 'over' ? (world.result?.reason === 'won' ? 'You won the arena!' : `Run ended. Peak ${formatShare(human.peak)}.`)
        : world.phase === 'ready' ? 'Ready'
        : `${formatShare(mine)} claimed. Rank ${place} of ${PLAYER_COUNT}.`);
    }

    function onHumanEnded() {
      clearInput();
      context.sound(world.result?.reason === 'won' ? 'success' : 'lose');
      renderOverlay(); update(0, true); persist(); dirty = true;
      context.announce(`${copy.textContent} ${world.result?.reason === 'won' ? '' : `Peak ${formatShare(world.players[0].peak)}. `}Play again when ready.`);
    }

    function drain(now: number) {
      const batch = world.events.splice(0);
      if (!batch.length) return;
      if (!reduced()) renderer.push(batch);
      animateUntil = Math.max(animateUntil, now + 900);
      let captured = false;
      for (const e of batch) if (e.kind === 'capture' && e.id === HUMAN && e.cells.length) captured = true;
      if (captured) {
        if (now - lastSound > 350) { lastSound = now; context.sound('success'); }
        const mine = Math.floor(world.counts[HUMAN] * 10000 / world.playable);
        if (Math.floor(mine / 1000) > milestone) { milestone = Math.floor(mine / 1000); context.announce(`You hold ${formatShare(mine)} of the arena.`); }
        persist();
      }
    }

    function steer() {
      const human = world.players[0], t = input.target();
      if (t !== undefined && human.alive) human.target = t;
    }

    function loop(now: number) {
      if (disposed) return;
      frame = requestAnimationFrame(loop);
      const running = !paused && world.phase === 'running';
      if (running) {
        const before = world.phase;
        if (last !== null) { steer(); advance(world, (now - last) / 1000); }
        last = now;
        drain(now);
        if (before === 'running' && world.phase !== 'running') { animateUntil = Math.max(animateUntil, now + 900); onHumanEnded(); }
        renderer.draw(world, world.phase === 'running' ? Math.min(1, world.accumulator / STEP) : 1, reduced(), now);
        update(now);
      } else {
        last = null;
        if (!paused && (dirty || now < animateUntil)) {
          renderer.draw(world, 1, reduced(), now);
          if (dirty) update(now, true);
          dirty = false;
        } else if (dirty && paused) {
          renderer.draw(world, 1, reduced(), now);
          update(now, true);
          dirty = false;
        }
      }
    }

    function reset(newSeed = true) {
      const seed = newSeed ? (world.seed + 0x9e3779b9) >>> 0 : world.seed;
      world = createWorld(seed);
      savedRun = false; last = null; milestone = 0; lastScore = -1;
      clearInput(); renderOverlay(); update(0, true); dirty = true; persist();
    }

    function begin() {
      if (paused || disposed) return;
      if (world.phase === 'over') reset();
      if (world.phase === 'ready') startWorld(world);
      savedRun = false; last = null; clearInput();
      renderOverlay(); update(0, true); persist(); dirty = true;
      context.sound('tap'); canvas.focus({ preventScroll: true });
    }
    startButton.addEventListener('click', begin, { signal });

    // Leaving the window pauses a live run; coming back never resumes it by itself.
    function autoPause() {
      clearInput();
      if (world.phase === 'running' && !paused) context.setPaused?.(true);
    }
    window.addEventListener('blur', autoPause, { signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); }, { signal });

    resize(); renderOverlay(); update(0, true);
    frame = requestAnimationFrame(loop);

    return {
      pause() { paused = true; last = null; clearInput(); renderOverlay(); dirty = true; update(0, true); },
      resume() { paused = false; last = null; clearInput(); renderOverlay(); dirty = true; update(0, true); },
      restart() { reset(); },
      serialize() { return snapshot(world); },
      restore(data) {
        const restored = restoreWorld(data);
        if (!restored) return;
        world = restored;
        savedRun = world.phase === 'running' || (world.phase === 'ready' && world.tick > 0);
        if (savedRun) world.phase = 'ready';
        milestone = Math.floor(leaderboardScore(world) / 1000); lastScore = -1; last = null;
        clearInput(); renderOverlay(); update(0, true); dirty = true;
      },
      dispose() {
        disposed = true; clearInput(); events.abort(); observer.disconnect(); cancelAnimationFrame(frame); root.remove();
      },
    };
  },
};
export default module;
