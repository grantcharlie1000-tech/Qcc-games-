import { test, expect } from "@playwright/test";
import { displacement } from "./pixels";
test("grid correspondence measures CSS offsets and rejects excessive bending", () => {
  const build = (maximum: number) => {
    const flat = [],
      bent = [];
    const width = 240,
      height = 64;
    for (let phase = 0; phase < 32; phase += 4) {
      const a = Buffer.alloc(width * height * 3),
        b = Buffer.alloc(a.length);
      const wave = (x: number, y: number) =>
        160 +
        30 * Math.cos(((x + phase) * Math.PI) / 16) +
        25 * Math.sin(((y + phase) * Math.PI) / 16);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const depth = Math.min(x, y, width - 1 - x, height - 1 - y),
            shift = maximum * Math.max(0, 1 - depth / 12);
          const dx = x === depth ? shift : width - 1 - x === depth ? -shift : 0,
            dy = y === depth ? shift : height - 1 - y === depth ? -shift : 0;
          for (let c = 0; c < 3; c++) {
            a[(y * width + x) * 3 + c] = Math.round(wave(x, y));
            b[(y * width + x) * 3 + c] = Math.round(wave(x + dx, y + dy));
          }
        }
      flat.push({ data: a, width, height });
      bent.push({ data: b, width, height });
    }
    return displacement(flat, bent);
  };
  const accepted = build(3);
  expect(accepted.reliable).toBe(true);
  expect(accepted.max).toBeGreaterThanOrEqual(2);
  expect(accepted.max).toBeLessThanOrEqual(4);
  expect(accepted.band).toBeGreaterThanOrEqual(8);
  expect(accepted.band).toBeLessThanOrEqual(14);
  expect(accepted.center).toBeLessThanOrEqual(0.5);
  expect(build(7).max).toBeGreaterThan(4);
  expect(build(0).max).toBeLessThan(2);
});

test("quantized flat pixels cannot manufacture a displacement offset", () => {
  const width = 240,
    height = 64;
  const flat = Array.from({ length: 8 }, (_, phase) => {
    const data = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        for (let c = 0; c < 3; c++)
          data[(y * width + x) * 3 + c] =
            128 + phase * 4 + Math.floor(x / 8) + Math.floor(y / 8);
    return { data, width, height };
  });
  expect(displacement(flat, flat).max).toBe(0);
});
