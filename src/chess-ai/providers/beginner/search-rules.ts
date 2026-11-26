import type {Chess,Color,Move,PieceSymbol} from './vendor/chess.js';
export interface SearchMove {
  color:Color;from:number;to:number;piece:PieceSymbol;captured?:PieceSymbol;promotion?:PieceSymbol;flags:number;
}
export interface SearchBoard {
  _board:({color:Color;type:PieceSymbol}|undefined)[];
  _epSquare:number;
  _turn:Color;
  _moves(options?:{legal:boolean}):SearchMove[];
  _isKingAttacked(color:Color):boolean;
  _attacked(color:Color,square:number):boolean;
  _makeMove(move:SearchMove):void;
  _undoMove():SearchMove|null;
}
export const VALUE:Record<PieceSymbol,number>={p:100,n:310,b:330,r:500,q:900,k:0};
export const square=(index:number):string=>String.fromCharCode(97+(index&7))+(8-(index>>4));
export const uci=(move:SearchMove):string=>square(move.from)+square(move.to)+(move.promotion||'');
export const gain=(move:SearchMove):number=>VALUE[move.captured??'k']+(move.promotion?VALUE[move.promotion]-100:0);
export const boardOf=(chess:Chess):SearchBoard=>chess as unknown as SearchBoard;
export function hasLegalMove(board:SearchBoard,moves=board._moves({legal:false})):boolean {
  for(const move of moves) {
    board._makeMove(move);
    try { if(!board._isKingAttacked(move.color))return true; }
    finally { board._undoMove(); }
  }
  return false;
}
export type QuietMove=Pick<Move,'from'|'to'|'color'|'piece'|'captured'|'promotion'|'lan'|'isKingsideCastle'|'isQueensideCastle'>;
export const quietMove=(move:SearchMove):QuietMove=>({
  ...move,from:square(move.from) as Move['from'],to:square(move.to) as Move['to'],lan:uci(move),
  isKingsideCastle:()=>!!(move.flags&64),isQueensideCastle:()=>!!(move.flags&128),
});

/** Pseudo-legal captures and all promotions. Callers must check mover king safety. */
const OFFSETS:Record<Exclude<PieceSymbol,'p'>,readonly number[]>={
  n:[-18,-33,-31,-14,18,33,31,14],b:[-17,-15,17,15],r:[-16,1,16,-1],q:[-17,-16,-15,1,17,16,15,-1],k:[-17,-16,-15,1,17,16,15,-1],
};
export function tacticalMoves(board:SearchBoard):SearchMove[] {
  const moves:SearchMove[]=[];
  // The side is supplied by chess.js's turn field through the same pinned adapter.
  const color=board._turn;
  const add=(from:number,to:number,piece:PieceSymbol,captured?:PieceSymbol,flags=2)=>{
    if(piece==='p' && (to>>4===(color==='w'?0:7))) {
      for(const promotion of ['q','r','b','n'] as const)moves.push({color,from,to,piece,captured,promotion,flags:flags|16});
    }else moves.push({color,from,to,piece,captured,flags});
  };
  for(let from=0;from<128;from++) {
    if(from&0x88){from+=7;continue;}
    const piece=board._board[from];if(!piece||piece.color!==color)continue;
    if(piece.type==='p') {
      const forward=color==='w'?-16:16;
      if(from>>4===(color==='w'?1:6) && !board._board[from+forward])add(from,from+forward,'p',undefined,1);
      for(const to of [from+forward-1,from+forward+1]) {
        if(to&0x88)continue;
        const victim=board._board[to];
        if(victim && victim.color!==color)add(from,to,'p',victim.type);
        else if(to===board._epSquare)add(from,to,'p','p',8);
      }
    }else for(const offset of OFFSETS[piece.type]) {
      for(let to=from+offset;!(to&0x88);to+=offset) {
        const victim=board._board[to];
        if(victim){if(victim.color!==color)add(from,to,piece.type,victim.type);break;}
        if(piece.type==='k'||piece.type==='n')break;
      }
    }
  }
  return moves;
}
