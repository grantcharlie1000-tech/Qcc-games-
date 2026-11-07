import {COLS, ROWS, MAZE, type GhostName} from './model';
import {XMAS, hash} from '../../festive/art';

/**
 * Christmas SVG markup for the maze. Everything is decoration around the
 * original geometry: snow is clipped inside the wall outline, the baubles use
 * the original power-berry circles (their caps sit outside the circle), and the
 * snowmen keep the chasers' footprint, classes and per-chaser markings.
 */
const f = (n: number) => Math.round(n * 100) / 100;

/** SVG Santa hat with the brim centred on (x,y), `w` wide; mirrors festive/art.ts drawSantaHat. */
export function hatMarkup(x: number, y: number, w: number, tilt = 0, lean = -0.6): string {
  const h = w * .95, brimH = w * .3, tipX = lean * w * .55, tipY = -h;
  const cone = `M${f(-w * .44)} ${f(-brimH * .4)}C${f(-w * .38)} ${f(-h * .62)} ${f(tipX - w * .12)} ${f(tipY + h * .18)} ${f(tipX)} ${f(tipY)}C${f(tipX + w * .12)} ${f(tipY + h * .28)} ${f(w * .32)} ${f(-h * .5)} ${f(w * .44)} ${f(-brimH * .4)}Z`;
  const sw = f(Math.max(.3, w * .05));
  return `<g class="xm-hat" transform="translate(${f(x)} ${f(y)}) rotate(${f(tilt * 180 / Math.PI)})"><path d="${cone}" fill="${XMAS.red}" stroke="${XMAS.redDark}" stroke-width="${sw}" stroke-linejoin="round"/>`
    + `<path d="${cone}" fill="${XMAS.redDeep}" opacity=".45" transform="translate(${f(w * .12)} 0) scale(.72 1)"/>`
    + `<rect x="${f(-w * .52)}" y="${f(-brimH * .62)}" width="${f(w * 1.04)}" height="${f(brimH)}" rx="${f(brimH * .5)}" fill="${XMAS.fur}" stroke="${XMAS.furShade}" stroke-width="${sw}"/>`
    + `<circle cx="${f(tipX)}" cy="${f(tipY)}" r="${f(w * .16)}" fill="${XMAS.fur}" stroke="${XMAS.furShade}" stroke-width="${sw}"/></g>`;
}

/**
 * Snow lying on every upward-facing wall edge, as one path. It is drawn under
 * a clip of the wall outline, so it can never reach into a lane.
 */
export function snowPath(): string {
  const wall = (c: number, r: number) => {
    if (r < 0 || r >= ROWS) return true;
    if (c < 0 || c >= COLS) return r !== 14;
    return MAZE[r][c] === '#';
  };
  let d = '';
  for (let r = 0; r < ROWS; r++) {
    let c = 0;
    while (c < COLS) {
      if (!(wall(c, r) && !wall(c, r - 1))) {c++; continue;}
      const c0 = c;
      while (c < COLS && wall(c, r) && !wall(c, r - 1)) c++;
      const x0 = c0 * 8 + (wall(c0 - 1, r) ? 0 : 3), x1 = c * 8 - (wall(c, r) ? 0 : 3), top = r * 8 + 3;
      const span = x1 - x0, steps = Math.max(1, Math.round(span / 3));
      d += `M${f(x0)} ${f(top - 1)}H${f(x1)}V${f(top + 1.4)}`;
      for (let i = steps - 1; i >= 0; i--) {
        const px = x0 + span * i / steps, dip = 1.3 + 1.1 * hash(r * 131 + c0 * 7 + i);
        d += `Q${f(px + span / steps / 2)} ${f(top + dip + .9)} ${f(px)} ${f(top + 1.2)}`;
      }
      d += 'Z';
    }
  }
  return d;
}

export const BAUBLE_COLORS = [XMAS.red, '#2f8fe0', XMAS.gold, XMAS.green] as const;

/** Gradient defs for the baubles (ids scoped by the board prefix). */
export function festiveDefs(prefix: string): string {
  return BAUBLE_COLORS.map((c, i) => `<radialGradient id="${prefix}-bauble-${i}" cx="35%" cy="32%" r="75%"><stop offset="0" stop-color="#ffffff" stop-opacity=".85"/><stop offset=".25" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity="1"/></radialGradient>`).join('');
}

const SNOWMAN = 'M3.5 -3.2A3.5 3.5 0 1 0 -3.5 -3.2A3.5 3.5 0 1 0 3.5 -3.2ZM5 2.4A5 5 0 1 0 -5 2.4A5 5 0 1 0 5 2.4Z';

/**
 * A chaser as a snowman with a beanie and scarf in its own colour, keeping the
 * original classes (body, face, scared face, eaten eyes) so every state reads.
 */
export function snowmanMarkup(name: GhostName): string {
  const ink = '#1b1d24';
  const mark = {
    rook: `<path d="M-2.3-5-.6-4.3M2.3-5 .6-4.3" stroke="${ink}" stroke-width=".7" stroke-linecap="round"/>`,
    vex: '<circle cx="-2.1" cy="-2.1" r=".6" fill="#c2338f"/><circle cx="2.1" cy="-2.1" r=".6" fill="#c2338f"/>',
    drift: `<path d="M-1.7-1.5Q0-.5 1.7-1.5" stroke="${ink}" stroke-width=".6" fill="none" stroke-linecap="round"/>`,
    mope: `<path d="M-1.9-4.5Q0-5.4 1.9-4.5" stroke="${ink}" stroke-width=".6" fill="none" stroke-linecap="round"/>`
  }[name];
  const pupil = (x: number) => `<g transform="translate(${x} -3.5) scale(.4)"><circle class="mm-wisp-pupil" r="2" fill="${ink}"/></g>`;
  return `<g class="mm-wisp-body"><path class="mm-wisp-flame" d="${SNOWMAN}"/>
<circle class="mm-spark mm-spark-a" cx="-3.4" cy="7.6" r="1"/><circle class="mm-spark mm-spark-b" cx="3.2" cy="7.8" r=".8"/>
<g class="xm-buttons"><circle cx="0" cy="2.6" r=".55"/><circle cx="0" cy="4.6" r=".55"/></g>
<path class="xm-accent" d="M-3.4-4.9Q-3.3-7.3 0-7.4Q3.3-7.3 3.4-4.9Q0-5.6-3.4-4.9Z"/><circle class="xm-accent" cx="0" cy="-7.6" r=".95"/>
<path class="xm-accent" d="M-3.6-.7Q0 1 3.6-.7L3.3 .8Q0 2.4-3.3 .8Z"/><path class="xm-accent xm-scarf-tail" d="M1.5 .9 3.1 4.4 1.6 4.7.5 1.3Z"/>
<g class="mm-wisp-face">${pupil(-1.3)}${pupil(1.3)}<path d="M-.1-2.7 2.6-2.1-.1-1.8Z" fill="#f07f2b"/>${mark}</g>
<g class="mm-wisp-scared"><circle cx="-1.3" cy="-3.6" r=".7" fill="#ffd0b0"/><circle cx="1.3" cy="-3.6" r=".7" fill="#ffd0b0"/><path d="M-2.4-1.6-1.6-2.2-.8-1.6 0-2.2.8-1.6 1.6-2.2 2.4-1.6" stroke="#ffd0b0" stroke-width=".6" fill="none" stroke-linejoin="round"/></g></g>
<g class="mm-wisp-eyes"><ellipse cx="0" cy=".2" rx="3.2" ry="3.4" fill="#fff" stroke="#9fb6ff" stroke-width=".6"/><circle class="mm-wisp-pupil" cx="0" cy=".2" r="1.6" fill="#2140ff"/></g>`;
}
