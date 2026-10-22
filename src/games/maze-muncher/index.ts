import type {GameModule} from '../../core/types';
import {createState, restoreState, start, steer, step, tileOf, TICKS_PER_SECOND, type Dir, type GameEvent} from './model';
import {createBoard} from './art';
import './style.css';

const TICK_MS = 1000 / TICKS_PER_SECOND;
const module: GameModule = {
  id: 'maze-muncher', title: 'Maze Muncher', cover: 'game-art/maze-muncher/cover.svg',
  rules: 'Steer Nib through the maze with the arrow keys, WASD, a swipe on the board or the direction buttons. A turn you press early is saved and taken at the next opening. Eat every dot (10 points) to clear the maze. The four glowing power berries (50 points) frighten the chasers for a few seconds: they turn blue, slow down and can be eaten for 200, 400, 800 and 1,600 points. They flash just before they recover. Rook chases you directly, Vex aims ahead of you, Drift works with Rook to cut you off, and Mope gives up when it gets close. Every so often they all scatter to their own corners and turn around. A bonus treat appears under the house twice per maze. The side tunnel wraps around and slows the chasers. You start with three lives and earn one more at 10,000 points. Each new maze is faster and frightens the chasers for less time.',
  mount(container, context) {
    container.innerHTML = `<div class="mm-game"><div class="mm-frame"><div class="mm-card"><strong>Maze Muncher</strong><p>Clear every dot. Power berries turn the tables.</p><button class="game-button mm-start">Start game</button></div></div><div class="mm-controls"><p class="mm-help"><span>Arrows / WASD</span><span>Swipe to steer</span></p><div class="mm-pad" role="group" aria-label="Directions"><button data-dir="up" aria-label="Go up">↑</button><button data-dir="left" aria-label="Go left">←</button><button data-dir="down" aria-label="Go down">↓</button><button data-dir="right" aria-label="Go right">→</button></div></div></div>`;
    const root = container.querySelector<HTMLElement>('.mm-game')!, frame = root.querySelector<HTMLElement>('.mm-frame')!, controls = root.querySelector<HTMLElement>('.mm-controls')!;
    const card = root.querySelector<HTMLElement>('.mm-card')!, heading = card.querySelector('strong')!, message = card.querySelector('p')!, startButton = card.querySelector('button')!;
    const pad = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-dir]'));
    const board = createBoard();
    board.svg.setAttribute('tabindex', '0');
    frame.prepend(board.svg);
    const available = container.parentElement!;
    const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
    const events = new AbortController();
    let state = createState(Date.now() | 0), paused = false, disposed = false, frameId: number | null = null, last: number | null = null, carry = 0;
    let gesture: {x: number; y: number; id: number} | null = null, label = '';
    const reduced = () => context.settings.reducedMotion || motionQuery.matches;

    function resize() {
      if (disposed) return;
      const width = available.clientWidth, height = available.clientHeight, ratio = 266 / 224, pad = 12;
      root.classList.remove('mm-sideways');
      const below = Math.min(width - pad, (height - controls.offsetHeight - 10) / ratio - pad);
      const beside = Math.min(width - 204 - pad, height / ratio - pad);
      const sideways = width >= 520 && beside > below + 24;
      root.classList.toggle('mm-sideways', sideways);
      root.style.setProperty('--mm-w', `${Math.max(120, Math.floor(Math.min(560, sideways ? beside : below)))}px`);
    }
    const observer = new ResizeObserver(resize);
    observer.observe(available); observer.observe(controls);

    function describe() {
      const p = tileOf(state.player);
      const text = `Maze Muncher. Level ${state.level}. ${state.dotsLeft} dots left. Nib at column ${p.x + 1}, row ${p.y + 1}, heading ${state.player.dir}. ${state.lives} spare ${state.lives === 1 ? 'life' : 'lives'}.${state.fright > 0 ? ' Chasers are frightened.' : ''}`;
      if (text !== label) {board.svg.setAttribute('aria-label', text); label = text;}
    }
    function render() {
      board.svg.classList.toggle('mm-paused', paused);
      board.render(state, reduced(), context.settings.colorBlind);
      describe();
    }
    function update() {
      context.setScore(state.score);
      context.setLevel(`Level ${state.level}`);
      const showCard = state.phase === 'ready' || state.phase === 'over';
      card.hidden = !showCard;
      if (state.phase === 'over') {heading.textContent = 'Game over'; message.textContent = `${state.score.toLocaleString()} points, reached level ${state.level}.`; startButton.textContent = 'Play again';}
      else if (state.phase === 'ready') {heading.textContent = 'Maze Muncher'; message.textContent = 'Clear every dot. Power berries turn the tables.'; startButton.textContent = 'Start game';}
      startButton.disabled = paused;
      pad.forEach(b => b.disabled = paused || state.phase === 'over');
      context.setStatus(paused ? 'Paused' : state.phase === 'over' ? 'Game over. Play again for a new run.' : state.phase === 'ready' ? 'Press Start or any direction to begin.' : state.fright > 0 ? 'Power berry! Eat the blue chasers.' : 'Eat every dot and dodge the chasers.');
    }
    const persist = () => context.save(JSON.parse(JSON.stringify(state)));
    function react(list: GameEvent[]) {
      for (const e of list) {
        if (e === 'power') {context.sound('tap'); update();}
        else if (e === 'ghost') {context.sound('success'); context.announce(`Chaser eaten for ${state.popup?.value ?? 200} points.`);}
        else if (e === 'fruit') {context.sound('success'); context.announce(`Bonus treat: ${state.popup?.value ?? 100} points.`);}
        else if (e === 'life') {context.sound('success'); context.announce('Extra life!');}
        else if (e === 'death') {context.sound('lose'); context.announce(state.lives ? `Caught! ${state.lives} ${state.lives === 1 ? 'life' : 'lives'} left.` : 'Caught! Last life lost.');}
        else if (e === 'clear') {context.sound('success'); context.announce(`Level ${state.level} cleared!`); persist();}
        else if (e === 'over') {context.announce(`Game over with ${state.score} points.`); persist(); update();}
        else if (e === 'go') update();
      }
    }
    function advance(now: number) {
      if (paused || disposed) {last = null; return;}
      if (last === null) {last = now; return;}
      carry = Math.min(carry + now - last, TICK_MS * 10);
      last = now;
      const score = state.score, fright = state.fright > 0, level = state.level;
      while (carry >= TICK_MS) {carry -= TICK_MS; react(step(state));}
      if (state.score !== score || (state.fright > 0) !== fright || state.level !== level) update();
    }
    function loop(now: number) {
      if (disposed) return;
      advance(now);
      render();
      frameId = requestAnimationFrame(loop);
    }
    function begin() {
      if (paused || disposed) return;
      if (start(state)) {context.sound('tap'); update(); render();}
    }
    function action(dir: Dir) {
      if (paused || disposed || state.phase === 'over') return;
      if (state.phase === 'ready') begin();
      steer(state, dir);
    }
    const keys: Record<string, Dir> = {ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', a: 'left', s: 'down', d: 'right'};
    window.addEventListener('keydown', event => {
      if (paused || event.ctrlKey || event.altKey || event.metaKey || document.querySelector('dialog[open]') || (event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable=true]'))) return;
      const dir = keys[event.key] ?? keys[event.key.toLowerCase()];
      if (dir) {event.preventDefault(); action(dir);}
    }, {signal: events.signal});
    pad.forEach(button => {
      button.addEventListener('pointerdown', event => {if (event.isPrimary && event.button === 0) {event.preventDefault(); action(button.dataset.dir as Dir);}}, {signal: events.signal});
      button.addEventListener('click', event => {if (event.detail === 0) action(button.dataset.dir as Dir);}, {signal: events.signal});
    });
    startButton.addEventListener('click', () => {begin(); board.svg.focus({preventScroll: true});}, {signal: events.signal});
    board.svg.addEventListener('pointerdown', event => {
      if (paused || !event.isPrimary) return;
      gesture = {x: event.clientX, y: event.clientY, id: event.pointerId};
      board.svg.setPointerCapture(event.pointerId);
    }, {signal: events.signal});
    board.svg.addEventListener('pointermove', event => {
      // Steer as soon as the swipe is clear, so a held finger can chain turns.
      if (!gesture || gesture.id !== event.pointerId) return;
      const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 16) return;
      action(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
      gesture = {x: event.clientX, y: event.clientY, id: event.pointerId};
    }, {signal: events.signal});
    const endGesture = () => {gesture = null;};
    board.svg.addEventListener('pointerup', endGesture, {signal: events.signal});
    board.svg.addEventListener('pointercancel', endGesture, {signal: events.signal});
    board.svg.addEventListener('lostpointercapture', endGesture, {signal: events.signal});

    update(); resize(); render();
    frameId = requestAnimationFrame(loop);
    return {
      pause() {paused = true; last = null; gesture = null; update(); render();},
      resume() {paused = false; last = null; update();},
      restart() {state = createState(Date.now() | 0); last = null; carry = 0; update(); render(); persist();},
      serialize() {return JSON.parse(JSON.stringify(state)) as unknown;},
      restore(data) {
        const valid = restoreState(data);
        if (!valid) return;
        // A run saved mid-maze resumes with a fresh "READY!" countdown so nobody is caught off guard.
        if (valid.phase === 'playing') {valid.phase = 'intro'; valid.timer = 120;}
        state = valid; last = null; carry = 0; update(); render();
      },
      dispose() {disposed = true; events.abort(); observer.disconnect(); if (frameId !== null) cancelAnimationFrame(frameId); container.replaceChildren();}
    };
  }
};
export default module;
