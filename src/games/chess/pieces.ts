import type { Color, PieceType } from './rules';

/**
 * Original QCC piece silhouettes on a 100×100 grid: chunky rounded shapes with a
 * heavy outline, flat fills and a soft offset shadow. Each piece is drawn in
 * layers (shadow, outline, body, details) so overlapping parts share one outline.
 * Colours come from CSS variables, so piece styles are a class change.
 */
const SHAPES: Record<PieceType, string> = {
  p: `<circle cx="50" cy="29" r="13"/><path d="M42 39 C45 48 43 58 33 69 H67 C57 58 55 48 58 39 Z"/><rect x="27" y="68" width="46" height="15" rx="6"/>`,
  r: `<path d="M27 17 H39 V25 H45 V17 H55 V25 H61 V17 H73 V38 H27 Z"/><path d="M33 38 H67 L64 68 H36 Z"/><rect x="24" y="67" width="52" height="16" rx="6"/>`,
  n: `<path d="M71 69 C74 51 71 33 59 22 C55 18 49 16 44 13 L42 21 C34 24 26 31 23 40 C21 47 27 51 34 49 C38 48 42 45 46 45 C44 53 36 59 34 69 Z"/><rect x="26" y="67" width="50" height="16" rx="6"/>`,
  b: `<circle cx="50" cy="13" r="6"/><path d="M50 19 C65 29 69 44 61 56 H39 C31 44 35 29 50 19 Z"/><path d="M39 55 H61 L65 68 H35 Z"/><rect x="27" y="67" width="46" height="16" rx="6"/>`,
  q: `<circle cx="21" cy="29" r="6"/><circle cx="35.5" cy="20" r="6"/><circle cx="50" cy="16" r="6"/><circle cx="64.5" cy="20" r="6"/><circle cx="79" cy="29" r="6"/><path d="M22 32 L32 56 L36 25 L50 50 L64 25 L68 56 L78 32 L72 64 H28 Z"/><rect x="23" y="63" width="54" height="20" rx="7"/>`,
  k: `<path d="M46 5 H54 V12 H61 V20 H54 V27 H46 V20 H39 V12 H46 Z"/><path d="M50 29 C40 22 21 23 17 36 C14 47 23 56 30 63 H70 C77 56 86 47 83 36 C79 23 60 22 50 29 Z"/><rect x="23" y="62" width="54" height="21" rx="7"/>`,
};
/** Inner lines in the detail colour (dark on light pieces, light on dark pieces). */
const DETAILS: Record<PieceType, string> = {
  p: `<path d="M35 76 H65"/>`,
  r: `<path d="M33 38 H67"/><path d="M32 75 H68"/>`,
  n: `<circle cx="40" cy="30" r="3.4" class="ch-ink"/><path d="M58 33 L66 31 M60 42 L69 41 M60 51 L70 51"/><path d="M34 75 H68"/>`,
  b: `<path d="M57 29 L48 40"/><path d="M35 75 H65"/>`,
  q: `<path d="M31 72 H69"/>`,
  k: `<path d="M38 50 C42 41 46 41 50 49 C54 41 58 41 62 50"/><path d="M31 72 H69"/>`,
};

export const PIECE_NAMES: Record<PieceType, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

/** One hidden sprite per page holds every piece; pieces reference it with <use>. */
export function pieceSprite(): string {
  const defs = (['w', 'b'] as Color[]).flatMap((c) => (Object.keys(SHAPES) as PieceType[]).map((t) =>
    `<symbol id="ch-${c}${t}" viewBox="4 1 92 92"><g class="ch-shadow" transform="translate(4.5 4)">${SHAPES[t]}</g><g class="ch-outline ch-${c}">${SHAPES[t]}</g><g class="ch-body ch-${c}">${SHAPES[t]}</g><g class="ch-detail ch-${c}">${DETAILS[t]}</g></symbol>`)).join('');
  return `<svg class="ch-sprite" aria-hidden="true" width="0" height="0" focusable="false"><defs>
<linearGradient id="ch-grad-w" x1="0" y1="0" x2="1" y2="0"><stop offset=".55" stop-color="var(--ch-w-hi)"/><stop offset="1" stop-color="var(--ch-w-fill)"/></linearGradient>
<linearGradient id="ch-grad-b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="var(--ch-b-hi)"/><stop offset=".45" stop-color="var(--ch-b-fill)"/></linearGradient>
</defs>${defs}</svg>`;
}

export function pieceSvg(color: Color, type: PieceType): string {
  return `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><use href="#ch-${color}${type}"/></svg>`;
}
