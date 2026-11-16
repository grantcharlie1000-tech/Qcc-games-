/**
 * Maia3 encoding ported from CSSLab/maia-platform-frontend tensor.ts, commit
 * 0013cc8e6ec52c88f5b3d694781d4cc8427cb91a (GPL-3.0).
 * Copyright CSSLab and contributors. Notices and corresponding source are in
 * public/chess-engines/maia/. No chess evaluations are fabricated here.
 */
import vocabulary from './moves.json';

const PIECES = 'PNBRQKpnbrqk';
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const moves: Readonly<Record<string, number>> = vocabulary;

/** Official model input: a1-first [64,12], mover represented by white pieces. */
export function encodePosition(fen: string): Float32Array {
  const fields = fen.trim().split(/\s+/);
  if (fields.length !== 6 || !/^[wb]$/.test(fields[1]) || !/^(?:-|K?Q?k?q?)$/.test(fields[2])
    || !/^(?:-|[a-h][36])$/.test(fields[3]) || !/^\d+$/.test(fields[4]) || !/^[1-9]\d*$/.test(fields[5])) {
    throw new Error('Invalid FEN for Maia3.');
  }
  const rows = fields[0].split('/');
  if (rows.length !== 8 || (fields[0].match(/K/g)?.length ?? 0) !== 1 || (fields[0].match(/k/g)?.length ?? 0) !== 1) {
    throw new Error('Invalid FEN board for Maia3.');
  }
  const black = fields[1] === 'b';
  const tokens = new Float32Array(64 * 12);
  for (let row = 0; row < 8; row++) {
    let file = 0;
    for (const char of rows[row]) {
      if (/^[1-8]$/.test(char)) file += Number(char);
      else {
        let channel = PIECES.indexOf(char);
        if (channel < 0 || file > 7) throw new Error('Invalid FEN piece for Maia3.');
        if (black) channel = (channel + 6) % 12;
        const rank = black ? row : 7 - row;
        tokens[(rank * 8 + file) * 12 + channel] = 1;
        file++;
      }
      if (file > 8) throw new Error('Invalid FEN rank for Maia3.');
    }
    if (file !== 8) throw new Error('Invalid FEN rank for Maia3.');
  }
  return tokens;
}

/** Rank mirroring follows upstream mirrorMove; promotion suffix is retained. */
export function moveIndex(uci: string, black: boolean): number {
  if (!UCI.test(uci)) throw new Error(`Invalid UCI move for Maia3: ${uci}`);
  const canonical = black ? `${uci[0]}${9 - Number(uci[1])}${uci[2]}${9 - Number(uci[3])}${uci.slice(4)}` : uci;
  const index = moves[canonical];
  if (index === undefined) throw new Error(`Move absent from Maia3 vocabulary: ${uci}`);
  return index;
}

export interface PolicyMove { readonly moveUci: string; readonly probability: number }

/** Upstream masked softmax, using only the game's independently legal moves. */
export function policyDistribution(logits: Float32Array, black: boolean, legal: readonly string[]): PolicyMove[] {
  if (logits.length !== 4352 || legal.length === 0) throw new Error('Invalid Maia3 policy shape or terminal position.');
  const scores = legal.map((uci) => logits[moveIndex(uci, black)]);
  if (!scores.every(Number.isFinite)) throw new Error('Maia3 returned an invalid policy.');
  const max = Math.max(...scores);
  const weights = scores.map((score) => Math.exp(score - max));
  const sum = weights.reduce((a, b) => a + b, 0);
  return legal.map((moveUci, i) => ({ moveUci, probability: weights[i] / sum })).sort((a, b) => b.probability - a.probability);
}

/** Weighted sampling, not a strongest-move or Stockfish substitution. */
export function samplePolicy(policy: readonly PolicyMove[], random: number): string {
  if (!policy.length || !Number.isFinite(random) || random < 0 || random >= 1) throw new Error('Invalid Maia3 sample.');
  let cumulative = 0;
  for (const item of policy) {
    cumulative += item.probability;
    if (random < cumulative) return item.moveUci;
  }
  return policy[policy.length - 1].moveUci;
}
