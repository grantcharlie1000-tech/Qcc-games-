import {describe,it,expect} from 'vitest';
import {Chess} from '../../../src/chess-ai/providers/beginner/vendor/chess.js';
import {boardOf,hasLegalMove,tacticalMoves,uci} from '../../../src/chess-ai/providers/beginner/search-rules';

describe('search tactical move generation',()=>{
  it.each([
    ['7k/8/8/3pP3/8/8/8/7K w - d6 0 1',['e5d6']],
    ['1r5k/P7/8/8/8/8/8/7K w - - 0 1',['a7a8b','a7a8n','a7a8q','a7a8r','a7b8b','a7b8n','a7b8q','a7b8r']],
    ['4r2k/8/8/8/8/3q4/4P3/4K3 w - - 0 1',[]],
    ['7k/8/8/8/8/2p5/8/1N5K w - - 0 1',['b1c3']],
  ])('keeps special captures, promotions and pins legal in %s',(fen,expected)=>{
    const chess=new Chess(fen),board=boardOf(chess),before=chess.fen(),hash=chess.hash();
    const legal=tacticalMoves(board).filter(move=>{
      board._makeMove(move);try{return !board._isKingAttacked(move.color);}finally{board._undoMove();}
    }).map(uci).sort();
    expect(legal).toEqual(expected);
    expect(chess.fen()).toBe(before);expect(chess.hash()).toBe(hash);
  });
  it.each([
    ['7k/5Q2/6K1/8/8/8/8/8 b - - 0 1',false],
    ['7k/6Q1/6K1/8/8/8/8/8 b - - 0 1',false],
    ['7k/8/8/3pP3/8/8/8/7K w - d6 0 1',true],
  ])('detects terminal positions without changing rules state in %s',(fen,expected)=>{
    const chess=new Chess(fen),before=chess.fen(),hash=chess.hash();
    expect(hasLegalMove(boardOf(chess))).toBe(expected);
    expect(chess.fen()).toBe(before);expect(chess.hash()).toBe(hash);
    expect(chess.history()).toEqual([]);
  });
});
