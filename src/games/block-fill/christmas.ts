/**
 * Block Fill, Christmas: an icy board and a string of Christmas lights for the trail. Presentation
 * only: it draws the same cells, path and hint marker, at the same coordinates and with the same
 * data-cell groups and labels, as the original markup in index.ts.
 */
import { BULBS, XMAS } from '../../festive/art';
import type { Level } from './logic';

const ICE = { shadow: '#2b5680', open: ['#eef8fe', '#bcdff2'], openEdge: '#8cc0de', lit: ['#fff4d0', '#f2d58c'], litEdge: '#d6aa45', wall: '#13284a', wallStripe: '#21406a', wallEdge: '#0c1d38' };

export function festiveBoard(level: Level, path: readonly number[], selected: number | undefined): string {
  const head = path.at(-1)!, n = level.size;
  const xy = (c: number) => [12 + (c % n) * 64 + 32, 12 + Math.floor(c / n) * 64 + 32] as const;
  const trail = path.map(c => xy(c).join(',')).join(' ');
  const bulbGradients = BULBS.map((color, i) => `<radialGradient id="bfx-b${i}" cx=".38" cy=".32" r=".75"><stop stop-color="#ffffff" stop-opacity=".85"/><stop offset=".35" stop-color="${color}"/><stop offset="1" stop-color="${color}"/></radialGradient><radialGradient id="bfx-g${i}"><stop stop-color="${color}" stop-opacity=".5"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`).join('');
  const defs = `<defs><linearGradient id="bfx-open" x1="0" y1="0" x2=".4" y2="1"><stop stop-color="${ICE.open[0]}"/><stop offset="1" stop-color="${ICE.open[1]}"/></linearGradient><linearGradient id="bfx-lit" x1="0" y1="0" x2=".4" y2="1"><stop stop-color="${ICE.lit[0]}"/><stop offset="1" stop-color="${ICE.lit[1]}"/></linearGradient><radialGradient id="bfx-head" cx=".4" cy=".35" r=".75"><stop stop-color="#ffffff"/><stop offset=".55" stop-color="#fff6c9"/><stop offset="1" stop-color="${XMAS.goldLight}"/></radialGradient><radialGradient id="bfx-hglow"><stop stop-color="#fff3b0" stop-opacity=".75"/><stop offset="1" stop-color="#fff3b0" stop-opacity="0"/></radialGradient>${bulbGradients}<pattern id="bfx-wall" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="9" height="9" fill="${ICE.wall}"/><path d="M0 0V9" stroke="${ICE.wallStripe}" stroke-width="3"/></pattern></defs>`;
  const cells = Array.from({ length: n ** 2 }, (_, c) => {
    const x = 12 + c % n * 64, y = 12 + Math.floor(c / n) * 64, index = path.indexOf(c), open = level.cells.includes(c);
    const fill = open ? index >= 0 ? 'url(#bfx-lit)' : 'url(#bfx-open)' : 'url(#bfx-wall)';
    const edge = open ? index >= 0 ? ICE.litEdge : ICE.openEdge : ICE.wallEdge;
    // A frost sheen on open ice: a pale arc in the top-left corner.
    const sheen = open && index < 0 ? `<path d="M${x + 12} ${y + 30}q0-18 18-18" fill="none" stroke="#ffffff" stroke-opacity=".75" stroke-width="3" stroke-linecap="round"/>` : '';
    return `<g data-cell="${c}" aria-label="Row ${Math.floor(c / n) + 1} column ${c % n + 1}${open ? index >= 0 ? ', covered ' + (index + 1) : ', open' : ', wall'}"><rect x="${x + 4}" y="${y + 7}" width="56" height="56" rx="13" fill="${ICE.shadow}"/><rect x="${x + 4}" y="${y + 3}" width="56" height="56" rx="13" fill="${fill}" stroke="${edge}" stroke-width="2"/>${sheen}</g>`;
  }).join('');
  // The cable: a dark shadow, the green wire and a thin highlight.
  const cable = `<polyline points="${trail}" fill="none" stroke="#0b2a1b" stroke-opacity=".45" stroke-width="10" stroke-linejoin="round" stroke-linecap="round" transform="translate(0 3)"/><polyline points="${trail}" fill="none" stroke="#1d5537" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/><polyline points="${trail}" fill="none" stroke="#5fa77b" stroke-opacity=".75" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`;
  const glows = path.map((c, i) => { const [x, y] = xy(c); return c === head ? `<circle cx="${x}" cy="${y}" r="31" fill="url(#bfx-hglow)"/>` : `<circle cx="${x}" cy="${y + 2}" r="26" fill="url(#bfx-g${i === 0 ? 2 : i % BULBS.length})"/>`; }).join('');
  const bulbs = path.map((c, i) => {
    const [x, y] = xy(c), isHead = c === head, start = i === 0;
    const rx = isHead ? 19 : start ? 16 : 12.5, ry = isHead ? 21 : start ? 18 : 14.5, cy = y + 2;
    const fill = isHead ? 'url(#bfx-head)' : `url(#bfx-b${start ? 2 : i % BULBS.length})`;
    const cap = `<rect x="${x - rx * .42}" y="${cy - ry - 5}" width="${rx * .84}" height="7" rx="2" fill="#2d4a38" stroke="#14281c" stroke-width="1"/>`;
    const label = i === 0 ? 'S' : String(i + 1);
    const text = isHead
      ? `<text x="${x}" y="${cy + 6}" text-anchor="middle" fill="#3b361d" font-family="system-ui,sans-serif" font-weight="900" font-size="16">${label}</text>`
      : `<text x="${x}" y="${cy + 5}" text-anchor="middle" fill="#ffffff" stroke="#1b1712" stroke-width="3" stroke-linejoin="round" paint-order="stroke" font-family="system-ui,sans-serif" font-weight="900" font-size="${start ? 15 : 13}">${label}</text>`;
    return `${cap}<ellipse cx="${x}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${isHead ? XMAS.gold : '#00000055'}" stroke-width="${isHead ? 3 : 1}"/>${text}`;
  }).join('');
  const hint = selected !== undefined ? `<rect x="${16 + selected % n * 64}" y="${15 + Math.floor(selected / n) * 64}" width="56" height="56" rx="13" fill="none" stroke="${XMAS.red}" stroke-width="4" stroke-dasharray="6 4"/><text x="${44 + selected % n * 64}" y="${50 + Math.floor(selected / n) * 64}" text-anchor="middle" fill="${XMAS.red}" font-size="21" font-weight="900">★</text>` : '';
  return defs + cells + cable + glows + bulbs + hint;
}
