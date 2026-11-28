import type {Chess} from './vendor/chess.js';
import type {BeginnerSearchInput,BeginnerSearchResult,Profile} from './engine';
import {boardOf,hasLegalMove,quietMove,tacticalMoves,uci,VALUE,type QuietMove} from './search-rules';

/** The introductory tier retains perceptual mistakes, without SAN or FEN per candidate. */
export function searchPerception(chess:Chess,input:BeginnerSearchInput,started:number,random:()=>number,profile:Profile,quiet:(move:QuietMove)=>number):BeginnerSearchResult {
  const board=boardOf(chess),offered=new Set(input.legalMovesUci);
  const moves=board._moves().filter(move=>offered.has(uci(move)));
  if(!moves.length||moves.length!==offered.size)throw Error('Legal move list does not match FEN.');
  for(let i=moves.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[moves[i],moves[j]]=[moves[j],moves[i]];}
  const danger=random()<profile.dangerNotice,mate=random()<profile.mateNotice,noticed=new Map<number,boolean>();
  const color=chess.turn();let nodes=0,best=-Infinity,choice=uci(moves[0]);
  let baseline=0;for(const piece of board._board)if(piece)baseline+=VALUE[piece.type]*(piece.color===color?1:-1);
  for(const move of moves) {
    if(!noticed.has(move.to))noticed.set(move.to,random()<profile.captureNotice);
    board._makeMove(move);nodes++;
    let score:number;
    try {
      score=quiet(quietMove(move));
      if(move.captured && noticed.get(move.to))score+=VALUE[move.captured];
      if(chess.isCheck())score+=10;
      const captures=danger?tacticalMoves(board):[];
      if(danger) {
        const risks=new Map<number,number>();
        for(const reply of captures) {
          if(!reply.captured)continue;
          const target=reply.flags&8?reply.to+(reply.color==='w'?16:-16):reply.to;
          const risk=board._attacked(color,target)?Math.max(0,VALUE[reply.captured]-(VALUE[reply.piece]||20000)):VALUE[reply.captured];
          risks.set(target,Math.max(risks.get(target)||0,risk));
        }
        score-=(risks.get(move.to)||0)*.95+Math.max(0,...risks.values())*.55;
      }
      if(mate && !hasLegalMove(board))score+=chess.isCheck()?100000:-Math.max(0,baseline)*.5;
    }finally{board._undoMove();}
    score+=-Math.log(-Math.log(Math.max(.000001,random())))*profile.temperature;
    if(score>best){best=score;choice=uci(move);}
    if(input.thinkingTimeMs<40 && performance.now()-started>=input.thinkingTimeMs)break;
  }
  return {moveUci:choice,nodes,elapsedMs:performance.now()-started};
}
