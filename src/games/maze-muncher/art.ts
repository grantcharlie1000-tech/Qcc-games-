import {COLS, ROWS, MAZE, FRUIT, GHOSTS, DEATH_FREEZE, DEATH_TICKS, fruitFor, levelSpec, type Dir, type Fruit, type GhostName, type State} from './model';

/** Board units: one tile is 8 units; the maze is 224 × 248 with an 18-unit tray for lives and fruit below. */
export const TILE = 8, WIDTH = COLS * TILE, MAZE_HEIGHT = ROWS * TILE, HEIGHT = MAZE_HEIGHT + 18;
const NS = 'http://www.w3.org/2000/svg';
export const GHOST_COLORS: Record<GhostName, string> = {rook: '#ff4d5e', vex: '#ff7ad9', drift: '#39d5ff', mope: '#ffab3d'};

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number> = {}, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.appendChild(node);
  return node;
}
const f = (n: number) => Math.round(n * 100) / 100;

/**
 * Traces the wall outline. Walls are inset 3/8 of a tile from every lane on an
 * 8-per-tile subgrid, the region boundary is followed as closed loops, and each
 * corner is rounded with a quadratic curve.
 */
export function wallPath(): string {
  const K = 8, INSET = 3, PAD = 1;
  const wall = (c: number, r: number) => {
    if (r < 0 || r >= ROWS) return true;
    if (c < 0 || c >= COLS) return r !== 14;
    return MAZE[r][c] === '#';
  };
  const W = (COLS + PAD * 2) * K, H = (ROWS + PAD * 2) * K;
  const solid = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const c = Math.floor(i / K) - PAD, r = Math.floor(j / K) - PAD, a = i % K, b = j % K;
    if (!wall(c, r)) continue;
    const L = a < INSET, R = a >= K - INSET, T = b < INSET, B = b >= K - INSET;
    if ((L && !wall(c - 1, r)) || (R && !wall(c + 1, r)) || (T && !wall(c, r - 1)) || (B && !wall(c, r + 1))) continue;
    if ((L && T && !wall(c - 1, r - 1)) || (R && T && !wall(c + 1, r - 1)) || (L && B && !wall(c - 1, r + 1)) || (R && B && !wall(c + 1, r + 1))) continue;
    solid[j * W + i] = 1;
  }
  const at = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < H && solid[j * W + i] === 1;
  // Directed boundary edges keep solid on the right-hand side, so loops never cross.
  const edges = new Map<number, number[]>();
  const key = (x: number, y: number) => y * (W + 1) + x;
  const add = (x1: number, y1: number, x2: number, y2: number) => {const k = key(x1, y1); const list = edges.get(k); if (list) list.push(key(x2, y2)); else edges.set(k, [key(x2, y2)]);};
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (!at(i, j)) continue;
    if (!at(i, j - 1)) add(i, j, i + 1, j);
    if (!at(i + 1, j)) add(i + 1, j, i + 1, j + 1);
    if (!at(i, j + 1)) add(i + 1, j + 1, i, j + 1);
    if (!at(i - 1, j)) add(i, j + 1, i, j);
  }
  const parts: string[] = [];
  for (const [startKey] of edges) {
    while (edges.get(startKey)?.length) {
      const loop: [number, number][] = [];
      let k = startKey;
      do {
        const list = edges.get(k)!;
        const next = list.pop()!;
        if (!list.length) edges.delete(k);
        loop.push([k % (W + 1), Math.floor(k / (W + 1))]);
        k = next;
      } while (k !== startKey && edges.has(k));
      // Keep only the corners.
      const pts = loop.filter((p, i) => {
        const a = loop[(i + loop.length - 1) % loop.length], b = loop[(i + 1) % loop.length];
        return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
      });
      if (pts.length < 3) continue;
      const toBoard = (p: number[]) => [(p[0] - PAD * K) * TILE / K, (p[1] - PAD * K) * TILE / K];
      const corners = pts.map(toBoard);
      let d = '';
      corners.forEach((p, i) => {
        const a = corners[(i + corners.length - 1) % corners.length], b = corners[(i + 1) % corners.length];
        const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
        const r = Math.min(2.6, la / 2, lb / 2);
        const s = [p[0] + (a[0] - p[0]) / la * r, p[1] + (a[1] - p[1]) / la * r], e = [p[0] + (b[0] - p[0]) / lb * r, p[1] + (b[1] - p[1]) / lb * r];
        d += `${i ? 'L' : 'M'}${f(s[0])} ${f(s[1])}Q${f(p[0])} ${f(p[1])} ${f(e[0])} ${f(e[1])}`;
      });
      parts.push(d + 'Z');
    }
  }
  return parts.join('');
}

/** Original bonus pickups, drawn around (0,0) at about 12 units. */
export function fruitMarkup(kind: Fruit): string {
  switch (kind) {
    case 'cherry': return '<path d="M-1-5Q1-1-3 1M-1-5Q2-3 3 2" fill="none" stroke="#5ec46a" stroke-width="1.1" stroke-linecap="round"/><circle cx="-3" cy="2.5" r="2.6" fill="#ff3d57"/><circle cx="3" cy="3" r="2.6" fill="#e8213f"/><circle cx="-3.8" cy="1.6" r=".7" fill="#ffd0d6"/>';
    case 'berry': return '<path d="M-5-1Q-5 5 0 6Q5 5 5-1Q0-3-5-1Z" fill="#ff4466"/><path d="M-4-2 0-5 4-2 0-1Z" fill="#41c35f"/><g fill="#ffe9a8"><circle cx="-2" cy="1" r=".5"/><circle cx="2" cy="1" r=".5"/><circle cx="0" cy="3.5" r=".5"/><circle cx="-2.5" cy="3.5" r=".4"/><circle cx="2.5" cy="3.5" r=".4"/></g>';
    case 'orange': return '<circle cy="1" r="5" fill="#ff9a2e"/><path d="M0-4Q3-6 4-4Q2-3 0-4Z" fill="#41c35f"/><circle cx="-2" cy="-1" r="1" fill="#ffd08f"/>';
    case 'apple': return '<path d="M0-2Q-6-5-5 2Q-4 7 0 5Q4 7 5 2Q6-5 0-2Z" fill="#e8313d"/><path d="M0-2 1-5" stroke="#7a4a22" stroke-width="1" stroke-linecap="round"/><path d="M1-4Q4-6 4-3Q2-3 1-4Z" fill="#5ec46a"/><circle cx="-2.5" cy="0" r=".9" fill="#ffc2c6"/>';
    case 'grape': return '<g fill="#9a5cff"><circle cx="-2.5" cy="-1" r="2"/><circle cx="2.5" cy="-1" r="2"/><circle cy="1.5" r="2"/><circle cx="-2" cy="4" r="2"/><circle cx="2" cy="4" r="2"/><circle cy="-3.5" r="2"/></g><path d="M0-5 1-7" stroke="#5ec46a" stroke-width="1.2" stroke-linecap="round"/>';
    case 'melon': return '<ellipse cy="1" rx="5.5" ry="5" fill="#3fbf55"/><path d="M-3-3Q-4 1-2 5M0-4V6M3-3Q4 1 2 5" stroke="#1d7c32" stroke-width=".9" fill="none"/><path d="M0-4 1-6" stroke="#7a4a22" stroke-width="1" stroke-linecap="round"/>';
    case 'star': return '<path d="M0-6 1.8-1.8 6.2-1.6 2.8 1.2 4 5.6 0 3.1-4 5.6-2.8 1.2-6.2-1.6-1.8-1.8Z" fill="#ffe14d" stroke="#ff9f1c" stroke-width=".8" stroke-linejoin="round"/>';
    case 'gem': return '<path d="M-5-1-2.5-4.5H2.5L5-1 0 5.5Z" fill="#55e6ff"/><path d="M-5-1H5M-2.5-4.5-1-1 0 5.5 1-1 2.5-4.5" stroke="#e8fdff" stroke-width=".6" fill="none" stroke-linejoin="round"/>';
  }
}

/** Nib, the muncher: a round critter with antennae and a hinged jaw. Drawn facing right. */
function nibMarkup(prefix: string) {
  return `<g class="mm-nib-feet"><ellipse class="mm-foot-a" cx="-2.6" cy="5.6" rx="2.1" ry="1.3" fill="#0f7f6a"/><ellipse class="mm-foot-b" cx="2" cy="5.6" rx="2.1" ry="1.3" fill="#0f7f6a"/></g>
<path class="mm-antenna" d="M0-5.5Q.5-8.5 2.6-9.2M-2.4-5Q-3-8.5-1-9.6" fill="none" stroke="#0f7f6a" stroke-width=".9" stroke-linecap="round"/>
<circle cx="2.6" cy="-9.2" r="1.15" fill="#ffe14d"/><circle cx="-1" cy="-9.6" r="1.15" fill="#ffe14d"/>
<path class="mm-nib-head" d="" fill="url(#${prefix}-nib)"/>
<path class="mm-nib-jaw" d="" fill="#14a487"/>
<path class="mm-nib-mouth" d="" fill="#0b2a33"/>
<path class="mm-nib-tooth" d="" fill="#fffbe8"/>
<ellipse cx="1.4" cy="-2.6" rx="2.2" ry="2.4" fill="#fff"/><circle class="mm-nib-pupil" cx="2.3" cy="-2.4" r="1.15" fill="#0b2a33"/><circle cx="1.9" cy="-3.1" r=".4" fill="#fff"/>
<ellipse cx="-3.4" cy="-.4" rx="1.3" ry=".8" fill="#ff8fb0" opacity=".7"/>`;
}

/** The mouth opens by rotating the lower jaw about a hinge behind the eye. */
function setNibMouth(root: SVGGElement, open: number) {
  const angle = open * .95, R = 6.4;
  const hx = -1.2, hy = .9;
  const upperEnd = [R * Math.cos(-.08), R * Math.sin(-.08) + .2];
  const head = `M${f(upperEnd[0])} ${f(upperEnd[1])}A${R} ${R} 0 1 0 ${f(-R * .2)} ${f(R * .98)}L${hx} ${hy}Z`;
  const rot = (x: number, y: number) => [hx + (x - hx) * Math.cos(angle) - (y - hy) * Math.sin(angle), hy + (x - hx) * Math.sin(angle) + (y - hy) * Math.cos(angle)];
  const j1 = rot(6.2, 1.2), j2 = rot(4.6, 4.6), j3 = rot(1, 6.3), t1 = rot(4.4, 1.4), t2 = rot(5.2, 1.4), t3 = rot(4.8, .4);
  root.querySelector('.mm-nib-head')!.setAttribute('d', head);
  root.querySelector('.mm-nib-jaw')!.setAttribute('d', `M${hx} ${hy}L${f(j1[0])} ${f(j1[1])}Q${f(j2[0])} ${f(j2[1])} ${f(j3[0])} ${f(j3[1])}Q-1.6 5.6 ${hx} ${hy}Z`);
  root.querySelector('.mm-nib-mouth')!.setAttribute('d', `M${hx} ${hy}L${f(upperEnd[0])} ${f(upperEnd[1])}L${f(j1[0])} ${f(j1[1])}Z`);
  root.querySelector('.mm-nib-tooth')!.setAttribute('d', open > .15 ? `M${f(t1[0])} ${f(t1[1])}L${f(t2[0])} ${f(t2[1])}L${f(t3[0])} ${f(t3[1])}Z` : '');
}

/** A chaser: a flame-shaped wisp with one eye and a marking that tells each apart without colour. */
function wispMarkup(name: GhostName) {
  const mark = {
    rook: '<path d="M-3.2-4.6-.6-3.3M3.2-4.6.6-3.3" stroke="#3a0710" stroke-width="1.1" stroke-linecap="round"/>',
    vex: '<circle cx="-3.3" cy="3.4" r=".8" fill="#5a0d45"/><circle cx="3.3" cy="3.4" r=".8" fill="#5a0d45"/>',
    drift: '<path d="M-5.4 4.4Q0 6.2 5.4 4.4" stroke="#0b4f66" stroke-width="1.2" fill="none" stroke-linecap="round"/>',
    mope: '<path d="M-2.9-2.1Q0-3.9 2.9-2.1" stroke="#6b3b00" stroke-width="1.1" fill="none" stroke-linecap="round"/>'
  }[name];
  return `<g class="mm-wisp-body"><path class="mm-wisp-flame" d=""/>
<circle class="mm-spark mm-spark-a" cx="-3.4" cy="7.8" r="1"/><circle class="mm-spark mm-spark-b" cx="3.2" cy="8.2" r=".8"/>
<g class="mm-wisp-face"><ellipse cx="0" cy=".2" rx="3.2" ry="3.4" fill="#fff"/><circle class="mm-wisp-pupil" cx="0" cy=".2" r="1.6" fill="#141d4a"/>${mark}</g>
<g class="mm-wisp-scared"><circle cx="-2.2" cy="-1" r="1" fill="#ffd0b0"/><circle cx="2.2" cy="-1" r="1" fill="#ffd0b0"/><path d="M-4 3.4-2.7 2.3-1.3 3.4 0 2.3 1.3 3.4 2.7 2.3 4 3.4" stroke="#ffd0b0" stroke-width=".9" fill="none" stroke-linejoin="round"/></g></g>
<g class="mm-wisp-eyes"><ellipse cx="0" cy=".2" rx="3.2" ry="3.4" fill="#fff" stroke="#9fb6ff" stroke-width=".6"/><circle class="mm-wisp-pupil" cx="0" cy=".2" r="1.6" fill="#2140ff"/></g>`;
}
function flamePath(sway: number) {
  return `M${f(sway)} -8C${f(2 + sway * .5)} -5 6.4 -2.4 6.4 1.8C6.4 5.6 3.6 7 0 7C-3.6 7 -6.4 5.6 -6.4 1.8C-6.4 -2.4 ${f(-2 + sway * .5)} -5 ${f(sway)} -8Z`;
}

export interface Board {
  svg: SVGSVGElement;
  render(state: State, reducedMotion: boolean, highlightColorBlind: boolean): void;
}

const ROTATE: Record<Dir, string> = {right: '', left: ' scale(-1 1)', up: ' rotate(-90)', down: ' rotate(90)'};

export function createBoard(prefix = 'mm'): Board {
  const svg = el('svg', {viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'mm-svg', role: 'img', 'aria-label': 'Maze Muncher board'});
  svg.innerHTML = `<defs>
<radialGradient id="${prefix}-nib" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#8dffe0"/><stop offset=".55" stop-color="#3fe0bd"/><stop offset="1" stop-color="#14a487"/></radialGradient>
<filter id="${prefix}-glow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.1" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="${WIDTH}" height="${HEIGHT}" fill="#05071a"/>
<g class="mm-maze"><path class="mm-wall" d="${wallPath()}"/><rect class="mm-door" x="${13 * TILE}" y="${12 * TILE + 3}" width="${2 * TILE}" height="2" rx="1"/></g>
<g class="mm-dots"></g><g class="mm-fruit"></g><g class="mm-ghosts"></g><g class="mm-player"></g>
<text class="mm-banner" x="${WIDTH / 2}" y="${18 * TILE + 7}" text-anchor="middle"></text>
<text class="mm-popup" text-anchor="middle"></text>
<g class="mm-tray" transform="translate(0 ${MAZE_HEIGHT})"><g class="mm-lives"></g><g class="mm-levels"></g></g>`;
  const dotLayer = svg.querySelector('.mm-dots')!, fruitLayer = svg.querySelector<SVGGElement>('.mm-fruit')!;
  const dots: (SVGCircleElement | null)[] = [];
  const layout = MAZE.join('');
  for (let i = 0; i < layout.length; i++) {
    const k = layout[i];
    if (k !== '.' && k !== 'o') {dots.push(null); continue;}
    const x = (i % COLS) * TILE + TILE / 2, y = Math.floor(i / COLS) * TILE + TILE / 2;
    dots.push(el('circle', k === 'o' ? {cx: x, cy: y, r: 3.4, class: 'mm-berry'} : {cx: x, cy: y, r: 1.1, class: 'mm-dot'}, dotLayer));
  }
  const player = el('g', {class: 'mm-nib'}, svg.querySelector('.mm-player')!);
  const nibPose = el('g', {}, player);
  nibPose.innerHTML = nibMarkup(prefix);
  const burst = el('g', {class: 'mm-burst'}, player);
  for (let i = 0; i < 8; i++) el('line', {x1: 0, y1: -3, x2: 0, y2: -7, transform: `rotate(${i * 45})`}, burst);
  const ghostLayer = svg.querySelector('.mm-ghosts')!;
  const wisps = GHOSTS.map(name => {
    const g = el('g', {class: `mm-wisp mm-wisp-${name}`, style: `--mm-wisp:${GHOST_COLORS[name]}`}, ghostLayer);
    g.innerHTML = wispMarkup(name);
    return g;
  });
  const banner = svg.querySelector<SVGTextElement>('.mm-banner')!, popup = svg.querySelector<SVGTextElement>('.mm-popup')!;
  const lives = svg.querySelector<SVGGElement>('.mm-lives')!, levels = svg.querySelector<SVGGElement>('.mm-levels')!;
  let lastDots = '', lastFruit = '', lastLives = -1, lastLevel = -1;

  function render(s: State, reduced: boolean, colorBlind: boolean) {
    svg.classList.toggle('mm-reduced', reduced);
    svg.classList.toggle('mm-colorblind', colorBlind);
    if (s.dots !== lastDots) {
      for (let i = 0; i < s.dots.length; i++) {const d = dots[i]; if (d) d.style.display = s.dots[i] === ' ' ? 'none' : '';}
      lastDots = s.dots;
    }
    // Clearing a level: the walls blink white four times (one steady change with reduced motion).
    const clearing = s.phase === 'cleared' && s.timer >= 60;
    svg.classList.toggle('mm-flash', clearing && (reduced || Math.floor((s.timer - 60) / 15) % 2 === 0));
    svg.classList.toggle('mm-playing', s.phase === 'playing');

    // Bonus fruit
    const fruitKey = s.fruit > 0 ? fruitFor(s.level) : '';
    if (fruitKey !== lastFruit) {fruitLayer.innerHTML = fruitKey ? `<g transform="translate(${FRUIT.x * TILE} ${FRUIT.y * TILE})">${fruitMarkup(fruitKey)}</g>` : ''; lastFruit = fruitKey;}

    // Muncher
    const p = s.player, dying = s.phase === 'dying' && s.timer >= DEATH_FREEZE;
    const hidden = s.phase === 'over' || (s.freeze > 0 && !!s.popup);
    player.style.display = hidden ? 'none' : '';
    player.setAttribute('transform', `translate(${f(p.x * TILE)} ${f(p.y * TILE)})`);
    if (dying) {
      const t = Math.min(1, (s.timer - DEATH_FREEZE) / DEATH_TICKS);
      const squash = reduced ? 1 : Math.max(0, 1 - t * 1.25);
      nibPose.setAttribute('transform', `${ROTATE[p.dir]} scale(${f(1 + (1 - squash) * .25)} ${f(squash)})`.trim());
      nibPose.style.opacity = String(reduced ? f(1 - t) : t > .8 ? 0 : 1);
      setNibMouth(nibPose, Math.min(1, t * 2));
      burst.style.display = !reduced && t > .78 ? '' : 'none';
      burst.setAttribute('transform', `scale(${f(.6 + (t - .78) * 3)})`);
      burst.style.opacity = String(f(Math.max(0, 1 - (t - .78) * 4)));
    } else {
      burst.style.display = 'none';
      nibPose.style.opacity = '1';
      nibPose.setAttribute('transform', ROTATE[p.dir].trim());
      // One chomp per tile travelled; a stopped muncher keeps its mouth half open.
      const travel = p.x + p.y, chomp = s.phase === 'ready' || s.phase === 'intro' ? .35 : reduced ? .45 : Math.abs(Math.sin(travel * Math.PI * 1.5));
      setNibMouth(nibPose, chomp);
      nibPose.classList.toggle('mm-step', Math.floor(travel * 2) % 2 === 0);
    }

    // Chasers
    const spec = levelSpec(s.level);
    const flashing = s.fright > 0 && s.fright <= spec.flashes * 28 && Math.floor(s.fright / 14) % 2 === 0;
    s.ghosts.forEach((g, i) => {
      const node = wisps[i];
      const gone = s.phase === 'over' || dying || (s.phase === 'cleared' && s.timer >= 60);
      node.style.display = gone ? 'none' : '';
      if (gone) return;
      const bob = reduced ? 0 : Math.sin((s.tick + i * 13) / 9) * .6;
      node.setAttribute('transform', `translate(${f(g.x * TILE)} ${f(g.y * TILE + bob)})`);
      const eyes = g.mode === 'eaten' || g.mode === 'entering';
      node.classList.toggle('mm-eyes-only', eyes);
      node.classList.toggle('mm-scared', g.frightened && !eyes);
      node.classList.toggle('mm-ending', g.frightened && !eyes && flashing && !reduced);
      node.classList.toggle('mm-ending-calm', g.frightened && !eyes && s.fright <= spec.flashes * 28 && reduced);
      const sway = reduced ? 0 : Math.sin((s.tick + i * 7) / 6) * 1.2;
      node.querySelector('.mm-wisp-flame')!.setAttribute('d', flamePath(sway));
      const look = {up: [0, -1.4], down: [0, 1.4], left: [-1.4, 0], right: [1.4, 0]}[g.dir];
      node.querySelectorAll('.mm-wisp-pupil').forEach(pupil => pupil.setAttribute('transform', `translate(${look[0]} ${look[1]})`));
    });

    // Text
    banner.textContent = s.phase === 'intro' || s.phase === 'ready' ? 'READY!' : s.phase === 'over' ? 'GAME  OVER' : '';
    banner.classList.toggle('mm-over', s.phase === 'over');
    if (s.popup) {
      popup.textContent = String(s.popup.value);
      popup.setAttribute('x', f(s.popup.x * TILE).toString());
      popup.setAttribute('y', f(s.popup.y * TILE + 3).toString());
    } else popup.textContent = '';

    // Tray: spare lives on the left, recent bonus fruit on the right.
    if (s.lives !== lastLives) {
      lives.innerHTML = Array.from({length: Math.min(s.lives, 5)}, (_, i) => `<g transform="translate(${16 + i * 16} 9) scale(.78)"><circle r="6.2" fill="url(#${prefix}-nib)"/><path d="M-1.2 .9 6 -.3 5.6 2.6Z" fill="#0b2a33"/><circle cx="1.4" cy="-2.6" r="1.9" fill="#fff"/><circle cx="2.1" cy="-2.4" r="1" fill="#0b2a33"/></g>`).join('');
      lastLives = s.lives;
    }
    if (s.level !== lastLevel) {
      const first = Math.max(1, s.level - 6);
      levels.innerHTML = Array.from({length: s.level - first + 1}, (_, i) => `<g transform="translate(${WIDTH - 14 - i * 15} 9) scale(.9)">${fruitMarkup(fruitFor(s.level - i))}</g>`).join('');
      lastLevel = s.level;
    }
  }
  return {svg, render};
}

