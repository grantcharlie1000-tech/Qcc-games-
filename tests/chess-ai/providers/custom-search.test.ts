import {describe,it,expect} from 'vitest';
import {Chess} from '../../../src/chess-ai/providers/beginner/vendor/chess.js';
import {computeMove} from '../../../src/chess-ai/providers/beginner/engine';

describe('custom search work',()=>{
  it.each(['elo-300','elo-500','elo-700','elo-900'])('keeps normal work and decisions stable when given extra time at %s',opponentId=>{
    const chess=new Chess('r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 4 7');
    const input={fen:chess.fen(),moveHistoryUci:[],legalMovesUci:chess.moves({verbose:true}).map(move=>move.lan),opponentId};
    const short=computeMove({...input,thinkingTimeMs:75},1234);
    const long=computeMove({...input,thinkingTimeMs:200},1234);
    expect({move:short.moveUci,nodes:short.nodes,depth:short.depth}).toEqual({move:long.moveUci,nodes:long.nodes,depth:long.depth});
  });
});
