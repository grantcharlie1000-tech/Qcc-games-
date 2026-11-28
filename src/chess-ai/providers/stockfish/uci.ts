// SPDX-License-Identifier: GPL-3.0-only
import type { ChessAIPosition } from '../../types';

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

export function validFen(fen: string): boolean {
  const fields = fen.split(' ');
  if (fields.length !== 6 || !/^[wb]$/.test(fields[1]) || !/^(?:-|K?Q?k?q?)$/.test(fields[2])
    || !/^(?:-|[a-h][36])$/.test(fields[3]) || !/^\d+$/.test(fields[4])
    || !/^[1-9]\d*$/.test(fields[5])) return false;
  const ranks = fields[0].split('/');
  return ranks.length === 8 && (fields[0].match(/K/g) ?? []).length === 1
    && (fields[0].match(/k/g) ?? []).length === 1
    && ranks.every((rank) => /^[prnbqkPRNBQK1-8]+$/.test(rank)
      && [...rank].reduce((n, p) => n + (/[1-8]/.test(p) ? Number(p) : 1), 0) === 8)
    && !/[pP]/.test(ranks[0] + ranks[7]);
}

export function positionCommand(position: ChessAIPosition): string {
  if (!validFen(position.fen) || !validFen(position.startFen)
    || position.moveHistoryUci.some((move) => !UCI.test(move))) throw new Error('Invalid chess position.');
  return position.moveHistoryUci.length
    ? `position fen ${position.startFen} moves ${position.moveHistoryUci.join(' ')}`
    : `position fen ${position.fen}`;
}

export function stockfishSettings(opponentId: string): string[] {
  const elo = { 'elo-2200': 2200, 'elo-2600': 2600, 'elo-3000': 3000 }[opponentId];
  if (!elo && opponentId !== 'max') throw new Error(`Unsupported Stockfish opponent: ${opponentId}`);
  return ['setoption name Skill Level value 20',
    `setoption name UCI_LimitStrength value ${elo ? 'true' : 'false'}`,
    ...(elo ? [`setoption name UCI_Elo value ${elo}`] : [])];
}

export function searchBudget(request: { thinkingTimeMs: number; clock?: { remainingMs: number; incrementMs: number } }): number {
  let budget = Number.isFinite(request.thinkingTimeMs) ? request.thinkingTimeMs : 1;
  if (request.clock) {
    const { remainingMs, incrementMs } = request.clock;
    budget = Math.min(budget, remainingMs * 0.08 + incrementMs * 0.7, remainingMs - 15);
  }
  return Math.max(1, Math.floor(Math.min(30_000, budget)));
}

export interface UciInfo {
  depth: number;
  multiPv: number;
  pvUci: string[];
  evaluationCp?: number;
  mateIn?: number;
}

export function parseInfo(line: string, whiteToMove: boolean): UciInfo | undefined {
  if (!line.startsWith('info ') || /\b(?:upperbound|lowerbound)\b/.test(line)) return;
  const depth = /\bdepth (\d+)(?=\s|$)/.exec(line);
  const score = /\bscore (cp|mate) (-?\d+)(?=\s|$)/.exec(line);
  const pv = /\bpv (.+)$/.exec(line);
  if (!depth || !score || !pv) return;
  const pvUci = pv[1].trim().split(/\s+/);
  if (!pvUci.length || pvUci.some((move) => !UCI.test(move))) return;
  const value = Number(score[2]) * (whiteToMove ? 1 : -1);
  if (!Number.isSafeInteger(value) || !Number.isSafeInteger(Number(depth[1]))) return;
  return { depth: Number(depth[1]), multiPv: Number(/\bmultipv (\d+)\b/.exec(line)?.[1] ?? 1), pvUci,
    ...(score[1] === 'cp' ? { evaluationCp: value } : { mateIn: value }) };
}
