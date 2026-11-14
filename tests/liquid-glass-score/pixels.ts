import sharp from "sharp";
export async function pixels(buffer: Buffer) {
  const { data, info } = await sharp(buffer)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}
export type Pixels = Awaited<ReturnType<typeof pixels>>;
export const rgb = (p: Pixels, x: number, y: number) => {
  const i = (Math.floor(y) * p.width + Math.floor(x)) * 3;
  return [...p.data.subarray(i, i + 3)];
};
export const luminance = (c: number[]) =>
  c.reduce(
    (sum, v, i) =>
      sum +
      [0.2126, 0.7152, 0.0722][i] *
        (v / 255 <= 0.04045
          ? v / 255 / 12.92
          : ((v / 255 + 0.055) / 1.055) ** 2.4),
    0,
  );
export const ratio = (a: number[], b: number[]) => {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
export function difference(a: Pixels, b: Pixels) {
  if (a.width !== b.width || a.height !== b.height) return Infinity;
  return (
    a.data.reduce((s, v, i) => s + Math.abs(v - b.data[i]), 0) / a.data.length
  );
}
// Sample the flat top, bottom and side silhouette, on both adjacent sides.
// The strongest pixel in the 3px rim can establish a boundary, but every
// sampled section must separate from both its inside and outside neighbours.
export function boundary(
  p: Pixels,
  b: { x: number; y: number; width: number; height: number },
) {
  const at = (x: number, y: number) =>
    rgb(
      p,
      Math.max(0, Math.min(p.width - 1, x)),
      Math.max(0, Math.min(p.height - 1, y)),
    );
  const scores: number[] = [];
  const r = Math.min(b.width / 2, b.height / 2),
    cx = b.x + b.width / 2,
    cy = b.y + b.height / 2;
  const points = [];
  for (const t of [0.3, 0.4, 0.5, 0.6, 0.7])
    points.push(
      { x: b.x + b.width * t, y: b.y, dx: 0, dy: 1 },
      { x: b.x + b.width * t, y: b.y + b.height - 1, dx: 0, dy: -1 },
    );
  for (const angle of [0, 45, 135, 180, 225, 315]) {
    const theta = (angle * Math.PI) / 180,
      nx = Math.cos(theta),
      ny = Math.sin(theta),
      arc = cx + Math.sign(nx) * (b.width / 2 - r);
    points.push({
      x: arc + nx * (r - 0.5),
      y: cy + ny * (r - 0.5),
      dx: -nx,
      dy: -ny,
    });
  }
  for (const { x, y, dx, dy } of points) {
    const outside = at(x - dx * 3, y - dy * 3),
      inside = at(x + dx * 5, y + dy * 5);
    let best = 0;
    for (let d = 0; d <= 2; d++) {
      const edge = at(x + dx * d, y + dy * d);
      best = Math.max(
        best,
        Math.min(ratio(edge, outside), ratio(edge, inside)),
      );
    }
    // A contrasting solid fill is also a valid boundary.
    scores.push(Math.max(best, ratio(inside, outside)));
  }
  return Math.min(...scores);
}
export function textContrast(
  bg: Pixels,
  mask: Pixels,
  boxes: { x: number; y: number; w: number; h: number; color: string }[],
  bounds: { width: number; height: number },
) {
  const sx = bg.width / bounds.width,
    sy = bg.height / bounds.height;
  let worst = Infinity,
    count = 0;
  for (const b of boxes) {
    const color = b.color.match(/[\d.]+/g)!.map(Number);
    let peak = 0;
    const coords: number[][] = [];
    for (
      let y = Math.max(0, Math.ceil(b.y * sy));
      y < Math.min(bg.height, (b.y + b.h) * sy);
      y++
    )
      for (
        let x = Math.max(0, Math.ceil(b.x * sx));
        x < Math.min(bg.width, (b.x + b.w) * sx);
        x++
      ) {
        coords.push([x, y]);
        peak = Math.max(peak, rgb(mask, x, y)[0]);
      }
    if (!peak) return { worst: 0, count: 0 };
    for (const [x, y] of coords)
      if (rgb(mask, x, y)[0] >= peak * 0.96) {
        const back = rgb(bg, x, y),
          alpha = color[3] ?? 1;
        // Bound the 1% gray hidden fill perturbation conservatively in WebKit.
        for (const nudge of [-2.56, 0, 2.56]) {
          const c = back.map((v) => Math.max(0, Math.min(255, v + nudge)));
          const ink = c.map((v, i) => color[i] * alpha + v * (1 - alpha));
          worst = Math.min(worst, ratio(ink, c));
        }
        count++;
      }
  }
  return { worst: count ? worst : 0, count };
}
// Phase-shifted 1px grid correspondence, measured along each edge normal.
// Every offset fits actual enabled pixels to the same flat material across
// eight source phases. The periodic grid is 32px, beyond the +/-8px search.
export function displacement(flat: Pixels[], bent: Pixels[]) {
  const w = flat[0].width,
    h = flat[0].height;
  const interp = (p: Pixels, x: number, y: number) => {
    const x0 = Math.floor(x),
      y0 = Math.floor(y),
      fx = x - x0,
      fy = y - y0;
    if (x0 < 0 || x0 + 1 >= w || y0 < 0 || y0 + 1 >= h) return NaN;
    return rgb(p, x0, y0).reduce(
      (v, c, i) =>
        v +
        (c * (1 - fx) * (1 - fy) +
          rgb(p, x0 + 1, y0)[i] * fx * (1 - fy) +
          rgb(p, x0, y0 + 1)[i] * (1 - fx) * fy +
          rgb(p, x0 + 1, y0 + 1)[i] * fx * fy) /
          3,
      0,
    );
  };
  const match = (x: number, y: number, dx: number, dy: number) => {
    const actual = bent.map((p) => interp(p, x, y));
    const mean = actual.reduce((a, b) => a + b, 0) / actual.length;
    const signal = Math.max(...actual) - Math.min(...actual);
    if (!Number.isFinite(mean) || signal < 0.25)
      return { offset: NaN, signed: NaN, error: Infinity, signal };
    let best = { offset: NaN, signed: NaN, error: Infinity, signal };
    for (let shift = -8; shift <= 8; shift += 0.25) {
      const reference = flat.map((p) =>
        interp(p, x + dx * shift, y + dy * shift),
      );
      const error = Math.sqrt(
        reference.reduce((sum, v, i) => sum + (v - actual[i]) ** 2, 0) /
          reference.length,
      );
      if (
        error < best.error ||
        (Math.abs(error - best.error) < 1e-9 && Math.abs(shift) < best.offset)
      )
        best = { offset: Math.abs(shift), signed: shift, error, signal };
    }
    return best;
  };
  const sides: Record<
    string,
    { offset: number; signed: number; error: number; signal: number }[]
  > = {};
  for (const side of ["top", "bottom", "left", "right"]) {
    sides[side] = [];
    for (let d = 1; d <= 24; d++) {
      const x = side === "left" ? d : side === "right" ? w - 1 - d : w / 2;
      const y = side === "top" ? d : side === "bottom" ? h - 1 - d : h / 2;
      sides[side].push(
        match(
          x,
          y,
          side === "left" ? 1 : side === "right" ? -1 : 0,
          side === "top" ? 1 : side === "bottom" ? -1 : 0,
        ),
      );
    }
  }
  const offsets = Array.from({ length: 24 }, (_, i) =>
    Math.max(...Object.values(sides).map((side) => side[i].offset)),
  );
  const max = Math.max(...offsets);
  const active = offsets.flatMap((v, i) => (v > 0.5 ? [i + 1] : []));
  const center = match(w / 2, h / 2, 0, 1);
  const reliable =
    Object.values(sides)
      .flat()
      .every(
        (p) => Number.isFinite(p.offset) && p.error <= 2 && p.signal >= 0.25,
      ) &&
    Number.isFinite(center.offset) &&
    center.error <= 2 &&
    center.signal >= 0.25;
  return {
    offsets,
    sides,
    max,
    band: active.length ? Math.max(...active) : 0,
    center: center.offset,
    reliable,
  };
}
