// Flappy Bird: a round yellow bird, wing raised mid-flap, flying between two green pipes over a grassy strip.
export default function build(s, {C, island, speckle, hash, shift}) {
  const YEL = '#f9cf3a', YELD = '#e6a81f', BELLY = '#fff0c4', BEAK = '#f6862a', BEAKD = '#d95a1c';
  const WING = '#f0ac22', WINGL = '#f8c544', WINGK = '#b06f0c';
  const PIPE = '#5cc246', PIPEL = '#a5e86a', PIPED = '#2f8f3c', PIPEK = '#1f6a30';
  const NX = 34, NY = 30;

  // Ground: striped grass over a sandy band and dirt.
  const grass = (x, y) => ((x + y) >> 2) % 2 ? '#7fd058' : '#6fc74c';
  island(s, 0, 0, NX, NY, grass, speckle(['#a8693c', '#93603a', '#b97a48'], 2, [4, 2, 2]), 5, 0, 2);
  s.paint(0, 0, -3, NX, NY, 1, (x, y) => (x + y) % 6 < 3 ? '#e8cf9a' : '#d9ba7c'); // sandy stripe under the turf

  // Pipes: round shafts with a highlight band, a clean round lip and a dark mouth.
  const pipe = (cx, cy, h) => {
    const band = (x, y) => { const u = (x - cx) - (y - cy); return u <= -5 ? PIPE : u <= -2 ? PIPEL : u <= 3 ? PIPE : PIPED; };
    s.cyl(cx, cy, 1, 4.5, h, band);
    s.cyl(cx, cy, h, 4.5, 1, PIPEK); // shadow line under the lip
    s.cyl(cx, cy, h + 1, 5.5, 4, band);
    s.cyl(cx, cy, h + 4, 5.5, 1, '#8fe060'); // bright rim
    s.cyl(cx, cy, h + 4, 3.5, 1, PIPEK); // mouth
  };
  pipe(5, 24, 10);
  pipe(28, 5, 21);

  // Three small flowers.
  for (const [x, y, c] of [[15, 25, C.white], [24, 22, '#ff8fb8'], [13, 6, C.white]]) {
    s.set(x, y, 1, '#3f9a3a').box(x - 1, y, 2, 3, 1, 1, c).box(x, y - 1, 2, 1, 3, 1, c).set(x, y, 2, C.yellow);
  }

  // The bird: an egg-shaped body flying along +x with its flank to the light, fuller at the head end.
  const bx = 13, by = 17, bz = 25;
  const egg = (cx, cy, cz, rx, ry, rz) => {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let z = Math.floor(cz - rz); z <= cz + rz; z++) {
      // round in profile, a little fuller across so the flank can carry the eye
      if (((x + .5 - cx) / rx) ** 2 + Math.abs((y + .5 - cy) / ry) ** 3.5 + ((z + .5 - cz) / rz) ** 2 > 1) continue;
      s.set(x, y, z, z + .5 < bz - 2.8 + (x - bx) * .22 && x > bx - 6 ? BELLY : YEL);
    }
  };
  egg(bx, by, bz, 9, 6.5, 6.6);
  egg(bx + 2.5, by, bz + 1, 7, 6.5, 7.4);
  // Paint a sprite onto the +y surface of the body.
  const decal = (rows, pal, ox, oz) => rows.forEach((row, j) => [...row].forEach((ch, i) => {
    const c = pal[ch]; if (!c) return;
    const x = ox + i, z = oz + rows.length - 1 - j;
    for (let y = by + 8; y >= by; y--) if (s.has(x, y, z)) { s.set(x, y, z, c); return; }
  }));
  // Tail: a short fan at the rear.
  s.box(bx - 11, by - 2, bz, 3, 4, 2, YELD).box(bx - 12, by - 2, bz + 2, 3, 4, 2, YEL).box(bx - 13, by - 1, bz + 4, 3, 2, 2, YELD);
  // A small three-feather tuft.
  s.box(bx + 1, by - 1, bz + 8, 1, 2, 2, YELD).box(bx + 3, by - 1, bz + 8, 1, 2, 3, YELD).box(bx + 5, by - 1, bz + 8, 1, 2, 2, YELD);
  // Beak: a wedge pointing forward, clear of the body.
  s.box(bx + 8, by - 2, bz - 1, 6, 4, 2, BEAK).box(bx + 8, by - 2, bz + 1, 4, 4, 1, BEAK).box(bx + 8, by - 2, bz - 3, 4, 4, 2, BEAKD);
  // Round eye with one pupil and a highlight, and a cheek.
  decal([
    '.WWWW.',
    'WWWWWW',
    'WWKHKW',
    'WWKKKW',
    'WWKKKW',
    'WWWWWW',
    '.WWWW.',
  ], {W: C.white, K: C.ink, H: C.white}, bx + 1, bz - 2);
  decal(['PP', 'PP'], {P: '#ff9a7a'}, bx + 5, bz - 4);
  // Wing: one paddle raised mid-flap on the lit flank, with a dark outline.
  s.sprite([
    '.KKK....',
    'KWWWK...',
    'KLWWWK..',
    'KLWWWWK.',
    'KLLWWWWK',
    '.KLLWWWK',
    '..KLLWWK',
    '...KKLLK',
    '.....KK.',
  ], {W: WING, L: WINGL, K: WINGK}, [bx - 11, by + 6, bz - 2], 'xz', 1);
  // Little feet tucked under.
  s.box(bx - 1, by + 2, bz - 8, 2, 2, 2, BEAK).box(bx + 3, by - 2, bz - 8, 2, 2, 2, BEAK);
}
