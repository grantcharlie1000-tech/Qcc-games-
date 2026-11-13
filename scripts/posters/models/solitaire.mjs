// Solitaire: four big cards standing in a fan on a felt table, with a tableau, the stock deck and chips in front.
export default function build(s, {C, island, speckle, hash, shift}) {
  const RED = '#e23a44', INK = '#221d33', PAPER = '#fbf4e4', PAPER2 = '#efe3c8', BACK = '#3f6fe0', BACK2 = '#7fa6f5';
  const W = 44, D = 40;
  const felt = speckle(['#2f9a63', '#35a56b', '#2a8f5b'], 1, [5, 3, 2]);
  island(s, 0, 0, W, D, felt, (x, y, z) => (z % 3 === 0 ? C.dkwood : hash(x, y, z) < .2 ? '#a06e3c' : C.wood), 5, 0, 1);
  // Wooden rail around the felt, one voxel proud, with brass corner caps.
  const rail = (x, y, z) => ((x + y) % 7 === 0 ? C.dkwood : C.wood);
  for (let x = 0; x < W; x++) for (let y = 0; y < D; y++) if (x < 2 || y < 2 || x >= W - 2 || y >= D - 2) { s.set(x, y, 0, rail); s.set(x, y, 1, rail); }
  for (const [x, y] of [[0, 0], [W - 2, 0], [0, D - 2], [W - 2, D - 2]]) s.box(x, y, 0, 2, 2, 3, C.gold);

  const RANK = {
    A: ['.####.', '######', '##..##', '##..##', '######', '######', '##..##', '##..##'],
    K: ['##..##', '##.##.', '####..', '###...', '####..', '##.##.', '##..##', '##..##'],
    Q: ['.####.', '##..##', '##..##', '##..##', '##..##', '##.###', '.####.', '....##'],
    J: ['..####', '..####', '....##', '....##', '....##', '##..##', '######', '.####.'],
  };
  const SUIT = {
    spade: ['....#....', '...###...', '..#####..', '.#######.', '#########', '#########', '.##.#.##.', '....#....', '...###...'],
    heart: ['.##...##.', '####.####', '#########', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....'],
    diamond: ['....#....', '...###...', '..#####..', '.#######.', '#########', '.#######.', '..#####..', '...###...', '....#....'],
    club: ['...###...', '..#####..', '..#####..', '.##.#.##.', '#########', '#########', '.##.#.##.', '....#....', '...###...'],
  };
  const SMALL = {
    spade: ['...#...', '..###..', '.#####.', '#######', '#######', '...#...', '..###..'],
    heart: ['.##.##.', '#######', '#######', '#######', '.#####.', '..###..', '...#...'],
    diamond: ['...#...', '..###..', '.#####.', '#######', '.#####.', '..###..', '...#...'],
    club: ['..###..', '..###..', '.#.#.#.', '#######', '.#.#.#.', '...#...', '..###..'],
  };
  // An upright card, 15 wide and 21 tall, face towards +y, patterned back towards -y.
  const card = (x0, y0, z0, rank, suit) => {
    const ink = suit === 'heart' || suit === 'diamond' ? RED : INK, cw = 15, ch = 22;
    for (let i = 0; i < cw; i++) for (let k = 0; k < ch; k++) {
      if ((i === 0 || i === cw - 1) && (k === 0 || k === ch - 1)) continue;
      s.set(x0 + i, y0, z0 + k, hash(i, k, 11) < .05 ? PAPER2 : PAPER);
      s.set(x0 + i, y0 - 1, z0 + k, (i + k) % 2 ? BACK : BACK2);
    }
    s.sprite(RANK[rank], {'#': ink}, [x0 + 2, y0, z0 + ch - 10]);
    s.sprite(SUIT[suit], {'#': ink}, [x0 + 4, y0, z0 + 2]);
  };
  card(26, 3, 1, 'J', 'diamond');
  card(18, 11, 1, 'Q', 'club');
  card(10, 19, 1, 'K', 'heart');
  card(2, 27, 1, 'A', 'spade');

  // Flat cards: a short tableau cascade lying on the felt.
  const flat = (x0, y0, z, suit, faceUp = true) => {
    const ink = suit === 'heart' || suit === 'diamond' ? RED : INK;
    for (let i = 0; i < 9; i++) for (let j = 0; j < 12; j++) {
      if ((i === 0 || i === 8) && (j === 0 || j === 11)) continue;
      s.set(x0 + i, y0 + j, z, faceUp ? PAPER : (i === 0 || i === 8 || j === 0 || j === 11) ? PAPER : (i + j) % 2 ? BACK : BACK2);
    }
    if (faceUp) s.sprite(SMALL[suit], {'#': ink}, [x0 + 1, y0 + 3, z], 'xy');
  };
  flat(19, 20, 1, 'spade', false);
  flat(19, 23, 2, 'heart', true);

  // The stock: a thick face-down deck with a patterned back.
  s.box(31, 24, 1, 9, 12, 6, (x, y, z) => z % 2 ? PAPER : PAPER2);
  s.box(31, 24, 7, 9, 12, 1, (x, y) => (x === 31 || x === 39 || y === 24 || y === 35) ? PAPER : (x + y) % 2 ? BACK : BACK2);
  s.box(34, 28, 7, 3, 4, 1, C.gold);

  // Chip stacks with striped edges.
  const chips = (cx, cy, n, a, b) => {
    const stripe = (x, y) => Math.floor((Math.atan2(y - cy + .5, x - cx + .5) + Math.PI) / (Math.PI / 6) + .5) % 3 === 0;
    for (let k = 0; k < n; k++) s.cyl(cx, cy, 1 + k, 3.6, 1, (x, y) => (stripe(x, y) ? b : k % 2 ? a : shift(a, -6)));
    s.cyl(cx, cy, n, 2.6, 1, shift(a, 5));
  };
  chips(36, 15, 4, C.red, C.white);
  chips(7, 35, 3, C.blue, C.white);
  chips(15, 35, 1, C.gold, C.white);
}
