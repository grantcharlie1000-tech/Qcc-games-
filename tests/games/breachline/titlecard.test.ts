import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateCover } from '../../../scripts/breachline-assets/titlecard/svg.ts';
import { generateTitle } from '../../../scripts/breachline-assets/titlecard/title.ts';
import { luminance } from '../../../scripts/breachline-assets/titlecard/voxel.ts';

const file = (name: string) => readFileSync(new URL(`../../../public/game-art/breachline/${name}.svg`, import.meta.url), 'utf8');

describe('Breachline title card', () => {
  const cover = file('cover'), title = file('title');

  it('committed files match the generator, which is deterministic', () => {
    expect(generateCover().svg).toBe(cover);
    expect(generateCover().svg).toBe(generateCover().svg);
    expect(generateTitle().svg).toBe(title);
  });

  it('has the expected viewBoxes and accessible names', () => {
    expect(cover).toContain('viewBox="0 0 320 410"');
    expect(title).toContain('viewBox="0 0 190 130"');
    for (const svg of [cover, title]) expect(svg).toMatch(/<title[^>]*>[^<]+<\/title><desc[^>]*>[^<]+<\/desc>/);
  });

  it('is self-contained vector art: no text, raster, script, font or external reference', () => {
    for (const svg of [cover, title]) {
      expect(svg).not.toMatch(/<(text|image|script|foreignObject|style|use)\b/);
      expect(svg).not.toMatch(/href|url\(|@import|font-family|on[a-z]+=/i);
    }
  });

  it('keeps the title band calm: nothing bright above y = 95', () => {
    const paths = [...cover.matchAll(/<path fill="(#[0-9a-f]{6})"[^>]* d="([^"]+)"/g)];
    expect(paths.length).toBeGreaterThan(20);
    for (const [, fill, d] of paths) {
      if (luminance(fill) < 0.25) continue;
      const ys = [...d.matchAll(/[ML]?(-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[2]));
      expect(Math.min(...ys), `${fill} reaches into the title band`).toBeGreaterThanOrEqual(95);
    }
  });

  it('fills the card background with the registry colour and stays within budget', () => {
    expect(cover).toContain('<path fill="#1f2a33" d="M0 0h320v410H0Z"/>');
    expect(cover.length).toBeLessThanOrEqual(150 * 1024);
    expect(title.length).toBeLessThanOrEqual(250 * 1024);
  });
});
