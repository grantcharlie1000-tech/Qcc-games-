import { Chess, type Color, type Move, type PieceSymbol, type Square } from './vendor/chess.js';

export interface BeginnerSearchInput {
  readonly fen: string;
  readonly startFen?: string;
  readonly moveHistoryUci: readonly string[];
  readonly legalMovesUci: readonly string[];
  readonly opponentId: string;
  readonly thinkingTimeMs: number;
}
export interface BeginnerSearchResult { moveUci: string; nodes: number; elapsedMs: number }

interface Profile {
  captureNotice: number;
  dangerNotice: number;
  mateNotice: number;
  temperature: number;
  development: number;
  replyWeight: number;
  replyLimit: number;
}
// Intentional perceptual errors, rather than random legal moves or weaker Stockfish.
const PROFILES: Record<string, Profile> = {
  'elo-300': {captureNotice:.38,dangerNotice:.24,mateNotice:.20,temperature:100,development:.85,replyWeight:0,replyLimit:0},
  'elo-500': {captureNotice:.60,dangerNotice:.50,mateNotice:.44,temperature:76,development:1,replyWeight:0,replyLimit:0},
  'elo-700': {captureNotice:.72,dangerNotice:.64,mateNotice:.60,temperature:64,development:1.15,replyWeight:.15,replyLimit:3},
  'elo-900': {captureNotice:.79,dangerNotice:.73,mateNotice:.71,temperature:56,development:1.225,replyWeight:.25,replyLimit:4},
};
const VALUE: Record<PieceSymbol, number> = {p:100,n:310,b:330,r:500,q:900,k:0};
const opposite=(side:Color):Color=>side==='w'?'b':'w';

/** Mulberry32. All perceptual choices are repeatable with the same seed and position. */
export function seededRandom(seed:number):()=>number {
  let state=seed>>>0;
  return ()=>{state+=0x6d2b79f5;let z=state;z=Math.imul(z^(z>>>15),z|1);z^=z+Math.imul(z^(z>>>7),z|61);return ((z^(z>>>14))>>>0)/4294967296;};
}

function centrality(square:Square):number {
  return 7-Math.abs(square.charCodeAt(0)-100.5)-Math.abs(Number(square[1])-4.5);
}
function quietScore(chess:Chess,move:Move,history:readonly string[],profile:Profile):number {
  let score=0;
  const ply=history.length;
  const fromRank=Number(move.from[1]);
  const toRank=Number(move.to[1]);
  const advance=(move.color==='w'?1:-1)*(toRank-fromRank);
  if(move.piece==='p') score+=advance*8+centrality(move.to)*3;
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

/** Static capture risk includes elementary defended captures, not only attacked squares. */
function captureRisk(chess:Chess,square:Square,color:Color):number {
  const piece=chess.get(square);
  if(!piece) return 0;
  const attackers=chess.attackers(square,opposite(color));
  if(!attackers.length) return 0;
  const defenders=chess.attackers(square,color);
  const cheapest=Math.min(...attackers.map(s=>VALUE[chess.get(s)!.type] || 20_000));
  return defenders.length ? Math.max(0,VALUE[piece.type]-cheapest) : VALUE[piece.type];
}

function material(chess:Chess,color:Color):number {
  let score=0;
  for(const rank of chess.board()) for(const piece of rank) if(piece) score+=VALUE[piece.type]*(piece.color===color?1:-1);
  return score;
}

/** The engine only uses a private rules instance and never changes the caller's game. */
export function computeMove(input:BeginnerSearchInput,seed:number):BeginnerSearchResult {
  const started=performance.now();
  if(!Number.isFinite(input.thinkingTimeMs)||input.thinkingTimeMs<=0)throw new Error('Thinking budget must be positive.');
  const profile=PROFILES[input.opponentId];
  if(!profile) throw new Error(`Unsupported beginner opponent: ${input.opponentId}`);
  const chess=new Chess(input.fen);
  if(!input.legalMovesUci.length) throw new Error('No legal moves in this position.');
  const offered=new Set(input.legalMovesUci);
  const moves=chess.moves({verbose:true}).filter(m=>offered.has(m.lan));
  if(moves.length!==offered.size) throw new Error('Legal move list does not match FEN.');
  const random=seededRandom(seed);
  // With only a few milliseconds on the clock, score legal candidates without lookahead.
  // This remains weighted beginner play and never returns an arbitrary list element.
  if(input.thinkingTimeMs<=10) {
    const ranked=moves.map(move=>({move:move.lan,score:
      quietScore(chess,move,input.moveHistoryUci,profile)+
      VALUE[move.captured ?? 'k']*(random()<profile.captureNotice?1:.08)+
      -Math.log(-Math.log(Math.max(.000001,random())))*profile.temperature}));
    ranked.sort((a,b)=>b.score-a.score);
    return {moveUci:ranked[0].move,nodes:moves.length,elapsedMs:performance.now()-started};
  }
  // Randomizing root order removes square-order bias if the time guard truncates work.
  for(let i=moves.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[moves[i],moves[j]]=[moves[j],moves[i]];}
  const deadline=started+Math.min(100,input.thinkingTimeMs);
  const color=chess.turn();
  const noticesDanger=random()<profile.dangerNotice;
  const noticesMate=random()<profile.mateNotice;
  // Shared awareness for each captured piece prevents repeated sampling until a blunder is chosen.
  const noticed=new Map<string,boolean>();
  let nodes=0;
  const baseline=material(chess,color);
  const candidates:{move:string;score:number}[]=[];
  for(const move of moves) {
    const captureKey=move.to;
    if(!noticed.has(captureKey)) noticed.set(captureKey,random()<profile.captureNotice);
    chess.move(move.lan); nodes++;
    let score=quietScore(chess,move,input.moveHistoryUci,profile);
    if(move.captured) score+=VALUE[move.captured]*(noticed.get(captureKey)?1:.08);
    if(chess.isCheck()) score+=10;
    if(noticesDanger) {
      score-=captureRisk(chess,move.to,color)*.95;
      // Saving a threatened queen/rook is a distinct beginner skill.
      let mostThreatened=0;
      for(const rank of chess.board()) for(const piece of rank) {
        if(piece?.color===color && piece.type!=='k') mostThreatened=Math.max(mostThreatened,captureRisk(chess,piece.square,color));
      }
      score-=mostThreatened*.55;
    }
    // An unaware turn must not secretly regain perfect threat awareness through lookahead.
    const inspectReplies=profile.replyLimit>0 && noticesDanger;
    const replies=(inspectReplies || noticesMate) ? chess.moves({verbose:true}) : undefined;
    if(replies?.length===0 && chess.isCheck() && noticesMate) score+=100_000;
    else if(replies?.length===0) score-=Math.max(0,baseline)*.5;
    if(inspectReplies && replies) {
      replies.sort((a,b)=>(VALUE[b.captured ?? 'k']-VALUE[a.captured ?? 'k']));
      let loss=0;
      for(const reply of replies.slice(0,profile.replyLimit)) {
        nodes++;
        let replyGain=VALUE[reply.captured ?? 'k']-VALUE[move.captured ?? 'k'];
        // Estimate an elementary exchange using the current attack map.
        if(reply.captured && chess.isAttacked(reply.to,color)) replyGain-=VALUE[reply.piece];
        if(reply.san.endsWith('#')) replyGain=100_000;
        loss=Math.max(loss,replyGain);
      }
      score-=loss*profile.replyWeight;
    }
    chess.undo();
    // Gumbel-max samples a softmax distribution without needing large exponentials.
    score+=-Math.log(-Math.log(Math.max(.000001,random())))*profile.temperature;
    candidates.push({move:move.lan,score});
    if(performance.now()>=deadline)break;
  }
  candidates.sort((a,b)=>b.score-a.score);
  return {moveUci:candidates[0].move,nodes,elapsedMs:performance.now()-started};
}
