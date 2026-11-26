// Blockcraft: a floating island of chunky blocks with an oak tree, a pond spilling over the edge, flowers and a sheep.
export default function build(s, {C, hash, shift}) {
  const U = 4, NB = 8; // voxels per block, blocks per side
  const grassTop = (x, y) => hash(x, y, 0, 1) < .16 ? C.ltgrass : hash(x >> 1, y >> 1, 0, 2) < .14 ? C.dkgrass : C.grass;
  const dirt = (x, y, z) => hash(x, y, z, 3) < .14 ? C.dkdirt : hash(x, y, z, 4) < .12 ? '#a56d43' : C.dirt;
  const stone = (x, y, z) => hash(x, y, z, 5) < .16 ? C.dkstone : hash(x, y, z, 6) < .14 ? C.ltstone : C.stone;

  // Block heightmap: top level (in blocks) and how deep the underside hangs.
  const skip = (bx, by) => (bx === NB - 1 && by === 0) || (bx === 0 && by === NB - 1);
  const level = (bx, by) => (bx <= 2 && by <= 2 ? 1 : 0) + (bx <= 1 && by <= 1 ? 1 : 0);
  const depth = (bx, by) => {
    const d = Math.hypot(bx - 3.5, by - 3.5);
    return Math.max(1, Math.round(5.4 - d * 1.0 + hash(bx, by, 0, 7) * 1.3));
  };
  const pond = (x, y) => ((x - 24) / 6.5) ** 2 + ((y - 25) / 5.5) ** 2 < 1 || (x >= 22 && x < 26 && y >= 28);
  for (let bx = 0; bx < NB; bx++) for (let by = 0; by < NB; by++) {
    if (skip(bx, by)) continue;
    const top = level(bx, by) * U, dep = depth(bx, by) * U;
    for (let i = 0; i < U; i++) for (let j = 0; j < U; j++) {
      const x = bx * U + i, y = by * U + j;
      for (let z = top; z > -dep; z--) {
        const k = top - z; // voxels below the surface
        let c;
        if (k === 0) c = grassTop(x, y);
        else if (k === 1 || (k === 2 && hash(x, y, 0, 8) < .45)) c = hash(x, y, 0, 9) < .3 ? C.dkgrass : C.grass;
        else if (z > -U * 1.5 - hash(bx, by, 0, 10) * U) c = dirt(x, y, z);
        else c = stone(x, y, z);
        s.set(x, y, z, c);
      }
      // ragged tip under each block column
      if (hash(x >> 1, y >> 1, 0, 11) < .5) s.set(x, y, -dep, stone(x, y, -dep));
    }
    // Ore flecks on the lit and shaded faces of deep blocks.
    if (depth(bx, by) >= 3) {
      const ore = [C.gold, C.sky, C.red][Math.floor(hash(bx, by, 1, 12) * 3)];
      const z = -dep + 2 + Math.floor(hash(bx, by, 2, 12) * 3);
      for (const [i, k] of [[0, 0], [1, 0], [1, 1], [2, -1]]) {
        if (s.has(bx * U + i, by * U + U - 1, z + k)) s.set(bx * U + i, by * U + U - 1, z + k, ore);
        if (s.has(bx * U + U - 1, by * U + i, z + k)) s.set(bx * U + U - 1, by * U + i, z + k, ore);
      }
    }
  }
  const N = NB * U;
  // Pond: carve one voxel and fill with water, then a waterfall off the lit edge.
  const water = (x, y, z) => hash(x >> 1, y, z, 13) < .16 ? C.ltblue : hash(x, y >> 1, z, 14) < .2 ? '#3d93d0' : C.water;
  for (let x = 0; x < N; x++) for (let y = 14; y < N; y++) if (pond(x, y) && s.has(x, y, 0)) {
    s.set(x, y, 0, water); s.set(x, y, -1, '#2f7fc0');
  }
  for (let x = 22; x < 26; x++) for (let z = 0; z > -15; z--) s.set(x, N, z, (px, py, pz) => hash(px, 0, pz, 15) < .25 ? C.white : (pz + px) % 3 === 0 ? C.ltblue : C.water);
  s.box(21, N, -16, 6, 1, 2, C.white).box(22, N + 1, -15, 4, 1, 1, C.snow).box(22, N + 1, 0, 4, 1, 1, C.white);
  // Sandy rim round the pond.
  for (let x = 0; x < N; x++) for (let y = 14; y < N; y++) if (!pond(x, y) && s.has(x, y, 0) && (pond(x + 1, y) || pond(x - 1, y) || pond(x, y + 1) || pond(x, y - 1)) && hash(x, y, 0, 16) < .7) s.set(x, y, 0, C.sand);

  // Stone outcrop on the back hill and a stair of stone on the right hill.
  s.box(1, 1, 9, 4, 3, 3, stone).box(2, 1, 12, 2, 2, 1, stone).box(29, 12, 1, 2, 3, 2, stone);

  // ---------- oak tree ----------
  const tx = 20, ty = 7;
  const bark = (x, y, z) => (x * 3 + y + z * 2) % 5 === 0 ? C.brown : hash(x, y, z, 17) < .2 ? C.wood : C.dkwood;
  s.box(tx, ty, 1, 4, 4, 18, bark);
  s.box(tx - 1, ty + 1, 1, 1, 2, 2, bark).box(tx + 4, ty + 1, 1, 1, 2, 3, bark).box(tx + 1, ty + 4, 1, 2, 1, 3, bark); // roots
  const leaf = (x, y, z) => hash(x, y, z, 18) < .1 ? C.ltgrass : hash(x >> 1, y >> 1, z >> 1, 19) < .16 ? C.dkgreen : C.leaf;
  const clump = (x0, y0, z0, dx, dy, dz) => {
    for (let x = x0; x < x0 + dx; x++) for (let y = y0; y < y0 + dy; y++) for (let z = z0; z < z0 + dz; z++) {
      const corner = (x === x0 || x === x0 + dx - 1) + (y === y0 || y === y0 + dy - 1) + (z === z0 || z === z0 + dz - 1);
      if (corner === 3 || (corner === 2 && hash(x, y, z, 20) < .3)) continue; // nibble the block edges
      s.set(x, y, z, leaf);
    }
  };
  clump(tx - 6, ty - 6, 15, 16, 16, 8);
  clump(tx - 2, ty - 2, 23, 8, 8, 4);
  clump(tx - 8, ty - 2, 17, 2, 8, 4); clump(tx - 3, ty + 10, 16, 9, 2, 5);
  // Red apples on the lit face and top.
  for (const [x, y, z] of [[tx - 4, ty + 9, 16], [tx + 7, ty + 9, 19], [tx + 2, ty + 11, 18], [tx - 8, ty + 3, 19], [tx - 1, ty + 5, 24]]) s.box(x, y, z, 2, 1, 2, C.red).set(x, y, z + 1, '#ff8a8a');

  // ---------- flowers and grass tufts ----------
  const flower = (x, y, c, h = 2) => {
    const z = s.has(x, y, 4) ? (s.has(x, y, 8) ? 9 : 5) : 1;
    s.box(x, y, z, 1, 1, h, C.dkgreen);
    s.box(x - 1, y, z + h, 3, 1, 1, c).box(x, y - 1, z + h, 1, 3, 1, c).set(x, y, z + h, C.yellow).set(x, y, z + h + 1, c);
  };
  flower(18, 18, C.red, 3); flower(29, 18, '#ff6fae'); flower(14, 3, C.white, 3); flower(19, 30, C.red, 2);
  flower(1, 20, '#ffd84a', 3); flower(16, 23, C.purple, 2); flower(10, 9, '#ffd84a', 2); flower(6, 6, '#ff6fae', 3); flower(30, 16, '#ffd84a', 2);
  for (let i = 0; i < 26; i++) {
    const x = 1 + Math.floor(hash(i, 1, 0, 21) * 30), y = 1 + Math.floor(hash(i, 2, 0, 21) * 30);
    if (s.has(x, y, 1) || !s.has(x, y, 0) || pond(x, y) || s.get(x, y, 0).c === C.sand) continue;
    s.set(x, y, 1, C.ltgrass); if (hash(i, 3, 0, 21) < .5) s.set(x, y, 2, C.grass);
  }

  // ---------- sheep, facing the viewer (+y) ----------
  const sx = 5, sy = 14, sz = 1;
  const wool = '#ffffff';
  const legc = '#4a4458';
  for (const [lx, ly] of [[sx + 1, sy + 1], [sx + 6, sy + 1], [sx + 1, sy + 9], [sx + 6, sy + 9]]) s.box(lx, ly, sz, 2, 2, 4, legc).box(lx, ly, sz, 2, 2, 1, C.ink);
  s.box(sx, sy, sz + 3, 9, 12, 7, wool);
  // Fluffy tufts one voxel proud, and softened corners.
  for (let i = 0; i < 9; i++) for (let j = 0; j < 12; j++) if (hash(i >> 1, j >> 1, 0, 23) < .45 && i > 0 && i < 8 && j > 0 && j < 11) s.set(sx + i, sy + j, sz + 10, wool);
  s.box(sx - 1, sy + 2, sz + 5, 1, 8, 3, wool).box(sx + 9, sy + 2, sz + 5, 1, 8, 3, wool);
  for (const x of [sx, sx + 8]) for (const y of [sy, sy + 11]) s.box(x, y, sz + 9, 1, 1, 1, null).box(x, y, sz + 3, 1, 1, 1, null);
  s.box(sx + 3, sy - 1, sz + 6, 3, 1, 3, wool); // tail
  // Head: pale face with a wool tuft, ears, big eyes and a pink nose.
  const face = '#f1d4c2', hx = sx + 1, hy = sy + 11, hz = sz + 5;
  s.box(hx, hy, hz, 7, 5, 7, face);
  s.box(hx, hy - 1, hz + 7, 7, 5, 2, wool).box(hx + 1, hy, hz + 9, 5, 3, 1, wool).box(hx + 2, hy + 4, hz + 6, 3, 1, 2, wool);
  s.box(hx - 2, hy + 1, hz + 4, 2, 2, 2, face).box(hx + 7, hy + 1, hz + 4, 2, 2, 2, face); // ears
  s.box(hx + 1, hy + 4, hz + 3, 1, 1, 2, C.ink).box(hx + 5, hy + 4, hz + 3, 1, 1, 2, C.ink); // eyes
  s.set(hx + 1, hy + 4, hz + 5, C.white).set(hx + 5, hy + 4, hz + 5, C.white);
  s.box(hx + 2, hy + 5, hz + 1, 3, 1, 2, '#f7e1d3').set(hx + 3, hy + 5, hz + 2, C.rose); // muzzle and nose

  // A crafted crate and a glowing torch on the right hill.
  const cxr = 14, cyr = 26;
  s.box(cxr, cyr, 1, 4, 4, 4, C.ltwood);
  for (let k = 0; k < 4; k++) s.set(cxr + k, cyr + 3, 1 + k, C.dkwood).set(cxr + 3, cyr + k, 1 + (3 - k), C.dkwood);
  s.box(cxr, cyr + 3, 1, 4, 1, 1, C.wood).box(cxr, cyr + 3, 4, 4, 1, 1, C.wood).box(cxr, cyr, 4, 4, 4, 1, (x, y) => (x === cxr || x === cxr + 3 || y === cyr || y === cyr + 3) ? C.wood : C.ltwood);
  s.box(1, 6, 9, 1, 1, 4, C.dkwood).set(1, 6, 13, C.yellow, {glow: true}).set(1, 6, 14, C.orange, {glow: true});
  // A blocky cloud drifting past the back corner.
  s.box(-4, 15, 20, 5, 11, 2, C.white, {noshadow: true}).box(-3, 17, 22, 3, 6, 1, C.white, {noshadow: true}).box(-5, 18, 19, 7, 5, 1, C.snow, {noshadow: true});
}
