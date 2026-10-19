import type { State } from '../../../src/games/solitaire/model';

/** All 52 cards once; only 2 clubs → 3 hearts is playable, from a foundation. */
export function foundationWithdrawalState():State {
 const foundations=[
  [0,1], // Clubs Ace–2.
  [],
  Array.from({length:13},(_,i)=>26+i), // Spades Ace–King.
  Array.from({length:9},(_,i)=>39+i), // Diamonds Ace–9.
 ];
 const tops=[15,4,19,8,23,12,25]; // Hearts 3, Clubs 5, Hearts 7, Clubs 9, Hearts J, Clubs K, Hearts K.
 const occupied=new Set([...foundations.flat(),...tops]);
 const covered=Array.from({length:52},(_,id)=>id).filter(id=>!occupied.has(id));
 return {
  seed:42,moves:100,recycles:0,stock:[],waste:[],foundations,
  tableau:tops.map((id,pile)=>[...covered.slice(pile*3,pile*3+3).map(id=>({id,up:false})),{id,up:true}]),
 };
}
