import type { Color, PieceType } from './rules';

/**
 * Original QCC piece silhouettes on a 100×100 grid, drawn for this game.
 * Colours come from CSS variables so piece styles are a class change.
 */
const BASE = '<rect x="22" y="80" width="56" height="11" rx="5"/><rect x="29" y="72" width="42" height="10" rx="4"/>';
const SHAPES: Record<PieceType, string> = {
  p: `<circle cx="50" cy="30" r="12"/><path d="M42 42 Q50 47 58 42 L62 56 Q66 66 68 73 H32 Q34 66 38 56 Z"/>`,
  r: `<path d="M27 16 H38 V24 H45 V16 H55 V24 H62 V16 H73 V36 L66 40 H34 L27 36 Z"/><path d="M35 40 H65 L67 73 H33 Z"/>`,
  n: `<path d="M33 73 C32 62 39 55 43 47 C37 50 30 52 25 48 C20 43 25 37 31 33 C38 27 40 21 45 16 L46 9 L52 15 C66 19 75 32 75 50 C75 60 71 67 69 73 Z"/>`,
  b: `<circle cx="50" cy="11" r="5"/><path d="M50 16 C63 26 67 39 61 50 H39 C33 39 37 26 50 16 Z"/><rect x="38" y="50" width="24" height="7" rx="3"/><path d="M41 57 H59 L65 73 H35 Z"/>`,
  q: `<circle cx="22" cy="27" r="5"/><circle cx="36" cy="20" r="5"/><circle cx="50" cy="16" r="5"/><circle cx="64" cy="20" r="5"/><circle cx="78" cy="27" r="5"/><path d="M23 31 L34 53 L37 25 L50 49 L63 25 L66 53 L77 31 L70 62 H30 Z"/><path d="M30 62 H70 L67 73 H33 Z"/>`,
  k: `<path d="M46 6 H54 V13 H61 V21 H54 V29 H46 V21 H39 V13 H46 Z"/><path d="M50 30 C65 30 74 38 71 49 L65 62 H35 L29 49 C26 38 35 30 50 30 Z"/><path d="M33 62 H67 L65 73 H35 Z"/>`,
};
/** Inner detail lines, drawn in the outline colour. */
const DETAILS: Partial<Record<PieceType, string>> = {
  n: `<circle cx="53" cy="28" r="3.2" class="ch-ink"/><path d="M58 18 C66 28 68 40 66 52" class="ch-line"/><path d="M27 45 L33 43" class="ch-line"/>`,
  b: `<path d="M54 26 L46 39" class="ch-line"/>`,
  r: `<path d="M35 40 H65" class="ch-line"/>`,
  q: `<path d="M30 62 H70" class="ch-line"/>`,
  k: `<path d="M35 62 H65" class="ch-line"/><path d="M50 36 V54 M42 44 H58" class="ch-line"/>`,
  p: `<path d="M38 56 H62" class="ch-line"/>`,
};

export const PIECE_NAMES: Record<PieceType, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

/** One hidden sprite per page holds every piece; pieces reference it with <use>. */
export function pieceSprite(): string {
  const defs = (['w', 'b'] as Color[]).flatMap((c) => (Object.keys(SHAPES) as PieceType[]).map((t) =>
    `<symbol id="ch-${c}${t}" viewBox="0 0 100 100"><g class="ch-body ch-${c}">${SHAPES[t]}${t === 'p' || t === 'n' ? BASE.replace('x="22"', 'x="24"').replace('width="56"', 'width="52"') : BASE}</g><g class="ch-detail ch-${c}">${DETAILS[t] ?? ''}</g></symbol>`)).join('');
  return `<svg class="ch-sprite" aria-hidden="true" width="0" height="0" focusable="false"><defs>
<linearGradient id="ch-grad-w" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--ch-w-hi)"/><stop offset="1" stop-color="var(--ch-w-fill)"/></linearGradient>
<linearGradient id="ch-grad-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--ch-b-hi)"/><stop offset="1" stop-color="var(--ch-b-fill)"/></linearGradient>
</defs>${defs}</svg>`;
}

export function pieceSvg(color: Color, type: PieceType): string {
  return `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><use href="#ch-${color}${type}"/></svg>`;
}
