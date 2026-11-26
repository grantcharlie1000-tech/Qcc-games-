import { Chess, type PieceSymbol, type Square } from './vendor/chess.js';
import { searchBrook } from './brook';
import { searchPerception } from './perception';
import {boardOf,quietMove,uci,type QuietMove} from './search-rules';

export interface BeginnerSearchInput {
  readonly fen: string;
  readonly startFen?: string;
  readonly moveHistoryUci: readonly string[];
  readonly legalMovesUci: readonly string[];
  readonly opponentId: string;
  readonly thinkingTimeMs: number;
}
export interface BeginnerSearchResult { moveUci: string; nodes: number; elapsedMs: number; depth?: number }

export interface Profile {
  captureNotice: number;
  dangerNotice: number;
  mateNotice: number;
  temperature: number;
  development: number;
  pawnAdvance: number;
}
// Custom style, perception and seeded variation for the four local opponents.
const PROFILES: Record<string, Profile> = {
  'elo-300': {captureNotice:.95,dangerNotice:1,mateNotice:.20,temperature:8,development:.85,pawnAdvance:8},
  'elo-500': {captureNotice:.93,dangerNotice:.98,mateNotice:.44,temperature:15,development:1,pawnAdvance:4},
  'elo-700': {captureNotice:.99,dangerNotice:.98,mateNotice:.60,temperature:6,development:1.15,pawnAdvance:4},
  'elo-900': {captureNotice:.79,dangerNotice:.73,mateNotice:.71,temperature:6,development:1.225,pawnAdvance:4},
};
const VALUE: Record<PieceSymbol, number> = {p:100,n:310,b:330,r:500,q:900,k:0};

/** Mulberry32. All perceptual choices are repeatable with the same seed and position. */
export function seededRandom(seed:number):()=>number {
  let state=seed>>>0;
  return ()=>{state+=0x6d2b79f5;let z=state;z=Math.imul(z^(z>>>15),z|1);z^=z+Math.imul(z^(z>>>7),z|61);return ((z^(z>>>14))>>>0)/4294967296;};
}

function centrality(square:Square):number {
  return 7-Math.abs(square.charCodeAt(0)-100.5)-Math.abs(Number(square[1])-4.5);
}
function quietScore(chess:Chess,move:QuietMove,history:readonly string[],profile:Profile):number {
  let score=0;
  const ply=history.length;
  const fromRank=Number(move.from[1]);
  const toRank=Number(move.to[1]);
  const advance=(move.color==='w'?1:-1)*(toRank-fromRank);
  if(move.piece==='p') score+=advance*profile.pawnAdvance+centrality(move.to)*3;
  if(move.piece==='n'||move.piece==='b') {
    score+=(centrality(move.to)-centrality(move.from))*7;
    if(ply<20 && fromRank===(move.color==='w'?1:8)) score+=30;
  }
  if(move.piece==='q' && ply<12) score-=28;
  if(move.piece==='k') {
    score-=ply<28?45:4;
    if(move.isKingsideCastle()||move.isQueensideCastle()) score+=95;
  }
  // Do not repeatedly retreat a developed piece or oscillate the king.
  if(history.slice(-8).includes(move.to+move.from)) score-=50;
  if(history.slice(-8).includes(move.lan)) score-=38;
  if(move.promotion) score+=VALUE[move.promotion]-VALUE.p;
  const king=chess.findPiece({color:move.color,type:'k'})[0];
  if(king && ply<40 && (king[0]==='g'||king[0]==='c')) {
    const shieldRank=Number(king[1])+(move.color==='w'?1:-1);
    for(const dx of [-1,0,1]) {
      const file=String.fromCharCode(king.charCodeAt(0)+dx);
      const shield=chess.get(`${file}${shieldRank}` as Square);
      if(shield?.type==='p' && shield.color===move.color)score+=7;
    }
  }
  return score*profile.development;
}

/** The engine only uses a private rules instance and never changes the caller's game. */
export function computeMove(input:BeginnerSearchInput,seed:number):BeginnerSearchResult {
  const started=performance.now();
  if(!Number.isFinite(input.thinkingTimeMs)||input.thinkingTimeMs<=0)throw new Error('Thinking budget must be positive.');
  const profile=PROFILES[input.opponentId];
  if(!profile) throw new Error(`Unsupported beginner opponent: ${input.opponentId}`);
  const chess=new Chess(input.fen);
  if(!input.legalMovesUci.length) throw new Error('No legal moves in this position.');
  const tactical=input.opponentId!=='elo-300';
  if(!tactical && input.thinkingTimeMs>10) {
    return searchPerception(chess,input,started,seededRandom(seed),profile,
      move=>quietScore(chess,move,input.moveHistoryUci,profile));
  }
  const offered=new Set(input.legalMovesUci);
  const moves=boardOf(chess)._moves().filter(m=>offered.has(uci(m)));
  if(moves.length!==offered.size) throw new Error('Legal move list does not match FEN.');
  const random=seededRandom(seed);
  if(tactical && input.thinkingTimeMs>10) {
    // Sprout notices the next quiet reply on half its turns, consistently by seed.
    const missesReply=input.opponentId==='elo-500'&&random()<.5;
    const depth=input.opponentId==='elo-900'?3:missesReply?1:2;
    const nodeLimit=input.opponentId==='elo-900'?1200:900;
    return searchBrook(chess,moves,started,input.thinkingTimeMs,random,profile.temperature,
      move=>quietScore(chess,move,input.moveHistoryUci,profile),depth,nodeLimit);
  }
  // With only a few milliseconds on the clock, score legal candidates without lookahead.
  // This remains weighted beginner play and never returns an arbitrary list element.
  if(input.thinkingTimeMs<=10) {
    const ranked=moves.map(move=>({move:uci(move),score:
      quietScore(chess,quietMove(move),input.moveHistoryUci,profile)+
      VALUE[move.captured ?? 'k']*(random()<profile.captureNotice?1:.08)+
      -Math.log(-Math.log(Math.max(.000001,random())))*profile.temperature}));
    ranked.sort((a,b)=>b.score-a.score);
    return {moveUci:ranked[0].move,nodes:moves.length,elapsedMs:performance.now()-started};
  }
  throw new Error('Unsupported search path.');
}
