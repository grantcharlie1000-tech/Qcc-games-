import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { encodePosition, moveIndex, policyDistribution, samplePolicy } from '../../../src/chess-ai/providers/maia/encoding';
import reference from './maia-fixtures/reference.json';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('official Maia3 input and output encoding', () => {
  it('matches independent Python reference tokens for white, black, castling and promotion', () => {
    for (const fixture of reference.fixtures) {
      const tokens = encodePosition(fixture.fen);
      expect(createHash('sha256').update(new Uint8Array(tokens.buffer)).digest('hex')).toBe(fixture.tokenSha256);
      for (const item of fixture.selectedLogits) expect(moveIndex(item.moveUci, fixture.fen.split(' ')[1] === 'b')).toBe(item.index);
    }
  });
  it('uses a1-first square tokens and official PNBRQKpnbrqk channels', () => {
    const data = encodePosition(START);
    expect(data).toHaveLength(768);
    expect(data[0 * 12 + 3]).toBe(1); // white rook a1
    expect(data[4 * 12 + 5]).toBe(1); // white king e1
    expect(data[8 * 12]).toBe(1); // white pawn a2
    expect(data[48 * 12 + 6]).toBe(1); // black pawn a7
    expect(data[60 * 12 + 11]).toBe(1); // black king e8
    expect(data.reduce((a, b) => a + b, 0)).toBe(32);
  });
  it('mirrors ranks and swaps piece colors for black to move', () => {
    const data = encodePosition('7k/8/8/8/4p3/8/8/K7 b - - 0 1');
    expect(data[35 * 12]).toBe(0);
    expect(data[36 * 12]).toBe(1); // e4 black pawn becomes e5 white pawn
    expect(data[7 * 12 + 5]).toBe(1); // h8 black king becomes h1 white king
    expect(data[56 * 12 + 11]).toBe(1); // a1 white king becomes a8 black king
  });
  it('uses the official 4352-entry move vocabulary including promotions and castling', () => {
    expect(moveIndex('e2e4', false)).toBe(796);
    expect(moveIndex('e7e5', true)).toBe(796);
    expect(moveIndex('e1g1', false)).toBe(262);
    expect(moveIndex('e1c1', false)).toBe(258);
    expect(moveIndex('e7e8q', false)).toBe(4240);
    expect(moveIndex('a7b8n', false)).toBe(4103);
    expect(moveIndex('a2b1n', true)).toBe(4103);
  });
  it('softmaxes only legal logits, mirrors black moves and samples genuine probabilities', () => {
    const logits = new Float32Array(4352).fill(100);
    logits[796] = 0;
    logits[moveIndex('d2d4', false)] = Math.log(3);
    const policy = policyDistribution(logits, true, ['e7e5', 'd7d5']);
    expect(policy[0].moveUci).toBe('d7d5');
    expect(policy[0].probability).toBeCloseTo(0.75);
    expect(policy[1].probability).toBeCloseTo(0.25);
    expect(samplePolicy(policy, 0.7)).toBe('d7d5');
    expect(samplePolicy(policy, 0.9)).toBe('e7e5');
  });
  it('rejects invalid FEN, missing moves and invalid network outputs', () => {
    expect(() => encodePosition('invalid')).toThrow();
    expect(() => encodePosition('8/8/8/8/8/8/8/K7 w - - 0 1')).toThrow();
    expect(() => moveIndex('nonsense', false)).toThrow();
    expect(() => policyDistribution(new Float32Array(4), false, ['e2e4'])).toThrow();
    expect(() => policyDistribution(new Float32Array(4352), false, [])).toThrow();
    const logits = new Float32Array(4352); logits[796] = Number.NaN;
    expect(() => policyDistribution(logits, false, ['e2e4'])).toThrow();
  });
});

it('reassembles the exact official Maia3 ONNX and verifies pinned runtime binaries', () => {
  const base = new URL('../../../public/chess-engines/maia/', import.meta.url);
  const model = createHash('sha256');
  for (let part = 1; part <= 3; part++) model.update(readFileSync(new URL(`model.part${part}`, base)));
  expect(model.digest('hex')).toBe('405bf76c15727dad8728b352c06a8f3c1b80fb2760e8d666b32485c63d75b856');
  for (const line of readFileSync(new URL('SHA256SUMS', base), 'utf8').trim().split('\n')) {
    const [expected, name] = line.split(/\s+/);
    expect(createHash('sha256').update(readFileSync(new URL(name, base))).digest('hex'), name).toBe(expected);
  }
});
