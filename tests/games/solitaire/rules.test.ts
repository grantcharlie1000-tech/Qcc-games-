import { describe, it, expect } from 'vitest';
import { foundationWithdrawalState, productiveWithdrawalState } from './fixtures';
import { deal, move, draw, validState, won, hint, act, undo, restore, score, type State } from '../../../src/games/solitaire/model';
const ids=(s:State)=>[...s.stock,...s.waste,...s.foundations.flat(),...s.tableau.flat().map(c=>c.id)];
function fixture(columns:number[][], foundations:number[][]=[[],[],[],[]], waste:number[]=[]):State {
 const used=[...columns.flat(),...foundations.flat(),...waste];
 return {seed:42,moves:0,recycles:0,stock:Array.from({length:52},(_,i)=>i).filter(i=>!used.includes(i)),waste,foundations,tableau:Array.from({length:7},(_,i)=>(columns[i]||[]).map(id=>({id,up:true})))};
}
describe('Klondike rules',()=>{
 it('deals a seeded standard 52-card deck with only seven exposed cards',()=>{const s=deal(123);expect(s).toEqual(deal(123));expect(deal(124)).not.toEqual(s);expect(s.tableau.map(c=>c.length)).toEqual([1,2,3,4,5,6,7]);expect(s.tableau.flat().filter(c=>c.up)).toHaveLength(7);expect(s.stock).toHaveLength(24);expect(new Set(ids(s)).size).toBe(52);expect(validState(s)).toBe(true);});
 it('requires descending alternating colours and permits only Kings in empty columns',()=>{const s=fixture([[6],[18],[30],[12]]);expect(move(s,{kind:'tableau',pile:1,index:0},{kind:'tableau',pile:0})).not.toBeNull();expect(move(s,{kind:'tableau',pile:2,index:0},{kind:'tableau',pile:0})).toBeNull();expect(move(s,{kind:'tableau',pile:0,index:0},{kind:'tableau',pile:4})).toBeNull();expect(move(s,{kind:'tableau',pile:3,index:0},{kind:'tableau',pile:4})).not.toBeNull();});
 it('moves a complete valid sequence and reveals the next card',()=>{const s=fixture([[10,19,5],[7]]);s.tableau[0][0].up=false;const next=move(s,{kind:'tableau',pile:0,index:1},{kind:'tableau',pile:1})!;expect(next.tableau[1].map(c=>c.id)).toEqual([7,19,5]);expect(next.tableau[0][0].up).toBe(true);expect(new Set(ids(next)).size).toBe(52);expect(s.tableau[0]).toHaveLength(3);});
 it('rejects hidden cards, malformed sequences, moving a foundation stack and self moves',()=>{const s=fixture([[10,19,4],[7]]);s.tableau[0][0].up=false;expect(move(s,{kind:'tableau',pile:0,index:0},{kind:'tableau',pile:1})).toBeNull();expect(move(s,{kind:'tableau',pile:0,index:1},{kind:'tableau',pile:1})).toBeNull();expect(move(s,{kind:'tableau',pile:1,index:0},{kind:'tableau',pile:1})).toBeNull();});
 it('builds fixed-suit foundations Ace to King using single exposed cards',()=>{let s=fixture([[0],[1],[13],[14,26]]);expect(move(s,{kind:'tableau',pile:1,index:0},{kind:'foundation',pile:0})).toBeNull();s=move(s,{kind:'tableau',pile:0,index:0},{kind:'foundation',pile:0})!;expect(move(s,{kind:'tableau',pile:1,index:0},{kind:'foundation',pile:0})!.foundations[0]).toEqual([0,1]);expect(move(s,{kind:'tableau',pile:2,index:0},{kind:'foundation',pile:0})).toBeNull();expect(move(s,{kind:'tableau',pile:3,index:0},{kind:'foundation',pile:1})).toBeNull();});
 it('draws one and recycles without changing the waste order or losing cards',()=>{let s=deal(7);const first=s.stock.at(-1);for(let i=0;i<24;i++)s=draw(s)!;expect(s.waste[0]).toBe(first);expect(s.stock).toHaveLength(0);s=draw(s)!;expect(s.waste).toHaveLength(0);expect(s.recycles).toBe(1);s=draw(s)!;expect(s.waste).toEqual([first]);expect(new Set(ids(s)).size).toBe(52);});
 it('undo restores exact cards and rejects malformed restored snapshots',()=>{const original={version:1 as const,state:deal(71),history:[]};const next=act(original,{kind:'draw'})!;expect(undo(next)).toEqual({...original,undos:1});expect(restore(JSON.parse(JSON.stringify(next)))).toEqual(next);const bad=structuredClone(next);bad.state.stock[0]=bad.state.stock[1];expect(restore(bad)).toBeNull();expect(restore({version:1,state:{},history:[]})).toBeNull();expect(restore(null)).toBeNull();});
 it('validates all piles and recognizes only a complete legitimate win',()=>{const s=fixture([],Array.from({length:4},(_,suit)=>Array.from({length:13},(_,r)=>suit*13+r)));expect(validState(s)).toBe(true);expect(won(s)).toBe(true);s.foundations[0].reverse();expect(validState(s)).toBe(false);expect(won(s)).toBe(false);expect(won(deal(2))).toBe(false);});
 it('returns a legal actionable hint and maintains card conservation over many actions',()=>{let session={version:1 as const,state:deal(11),history:[] as State[]};expect(hint(session.state)).not.toBeNull();for(let i=0;i<250;i++){const h=hint(session.state,session.history);if(!h)break;const next=act(session,h);expect(next).not.toBeNull();session=next!;expect(validState(session.state)).toBe(true);expect(new Set(ids(session.state)).size).toBe(52);}});
 it('permits only the exposed waste/foundation top and can return a foundation card',()=>{const s=fixture([[14]],[[0,1],[],[],[]],[26,39]);expect(move(s,{kind:'waste',pile:0,index:0},{kind:'foundation',pile:2})).toBeNull();expect(move(s,{kind:'foundation',pile:0,index:0},{kind:'tableau',pile:0})).toBeNull();const next=move(s,{kind:'foundation',pile:0,index:1},{kind:'tableau',pile:0});expect(next).toBeNull();const dest=fixture([[15]],[[0,1],[],[],[]]);const legal=move(dest,{kind:'foundation',pile:0,index:1},{kind:'tableau',pile:0})!;expect(legal.tableau[0].map(c=>c.id)).toEqual([15,1]);expect(legal.foundations[0]).toEqual([0]);});
 it('undoes a reveal and recycle as indivisible actions',()=>{const s=fixture([[10,19,5],[7]]);s.tableau[0][0].up=false;const session={version:1 as const,state:s,history:[]};const next=act(session,{kind:'move',from:{kind:'tableau',pile:0,index:1},to:{kind:'tableau',pile:1}})!;expect(undo(next)).toEqual({...session,undos:1});let cycle={version:1 as const,state:deal(7),history:[] as State[]};for(let i=0;i<24;i++)cycle=act(cycle,{kind:'draw'})!;expect(undo(act(cycle,{kind:'draw'})!)).toEqual({...cycle,undos:1});});
 it('rejects incompatible histories, illegal foundations, hidden tops and invalid counters',()=>{const s=deal(22);const envelope={version:1,state:s,history:[]};expect(restore({...envelope,version:2})).toBeNull();expect(restore({...envelope,history:[deal(23)]})).toBeNull();const top=structuredClone(s);top.tableau[0][0].up=false;expect(validState(top)).toBe(false);expect(validState({...s,moves:-1})).toBe(false);expect(validState({...s,seed:Infinity})).toBe(false);const f=fixture([],[[1],[],[],[]]);expect(validState(f)).toBe(false);expect(draw(fixture([],Array.from({length:4},(_,i)=>Array.from({length:13},(_,j)=>i*13+j))))).toBeNull();});

 it('does not hint a pointless foundation withdrawal whose only continuation undoes it',()=>{
  const s=foundationWithdrawalState();expect(validState(s)).toBe(true);
  expect(hint(s)).toBeNull();
 });
 it('prefers tableau progress and stock draws before withdrawing a foundation',()=>{
  const drawState=foundationWithdrawalState();drawState.stock.push(drawState.tableau[0].shift()!.id);expect(validState(drawState)).toBe(true);expect(hint(drawState)).toEqual({kind:'draw'});
  const tableauState=foundationWithdrawalState();const hiddenSix=tableauState.tableau.flat().find(c=>c.id===18)!;hiddenSix.id=19;tableauState.tableau[2].at(-1)!.id=18;expect(validState(tableauState)).toBe(true);expect(hint(tableauState)).toEqual({kind:'move',from:{kind:'tableau',pile:1,index:3},to:{kind:'tableau',pile:2}});
 });

});

describe('hints make progress without repeating positions',()=>{
 const position=(s:State)=>JSON.stringify([s.stock,s.waste,s.foundations,s.tableau.map(p=>p.map(c=>[c.id,c.up])).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]);
 it('stops after a stock pass with no useful move, including after restore',()=>{
  const s=foundationWithdrawalState();const pile=s.tableau.find(p=>p.some(c=>c.id===3))!;pile.splice(pile.findIndex(c=>c.id===3),1);s.stock.push(3);
  let session={version:1 as const,state:s,history:[] as State[]};
  expect(validState(s)).toBe(true);expect(hint(session.state,session.history)).toEqual({kind:'draw'});session=act(session,{kind:'draw'})!;
  const loaded=restore(session)!;expect(loaded).not.toBeNull();
  expect(hint(loaded.state,loaded.history)).toBeNull();
 });
 it('moves an exposed stack to free space for a King that reveals a covered card',()=>{
  const s=fixture([[6,18],[20],[40,12]]);s.tableau[2][0].up=false;
  // Other empty columns would make freeing the first column unnecessary.
  for(let pile=3;pile<7;pile++){const id=[4,8,10,21][pile-3];s.stock.splice(s.stock.indexOf(id),1);s.tableau[pile]=[{id,up:true}];}
  expect(validState(s)).toBe(true);
  expect(hint(s)).toEqual({kind:'move',from:{kind:'tableau',pile:0,index:0},to:{kind:'tableau',pile:1}});
 });
 it('uses a foundation withdrawal when it sets up a covered-card reveal',()=>{
  const s=productiveWithdrawalState();expect(validState(s)).toBe(true);
  const h=hint(s);expect(h).toEqual({kind:'move',from:{kind:'foundation',pile:2,index:11},to:{kind:'tableau',pile:6}});
  const next=act({version:1,state:s,history:[]},h!)!;
  expect(hint(next.state,next.history)).toEqual({kind:'move',from:{kind:'tableau',pile:4,index:3},to:{kind:'tableau',pile:6}});
 });
 it('never revisits a position while following hints on seeded deals',()=>{
  for(const seed of [1,7,11,71,123]){
   let session={version:1 as const,state:deal(seed),history:[] as State[]};const seen=new Set([position(session.state)]);
   for(let i=0;i<180;i++){
    const h=hint(session.state,session.history);if(!h)break;
    const next=act(session,h)!;expect(next).not.toBeNull();
    const key=position(next.state);expect(seen.has(key),`seed ${seed}, hint ${i}`).toBe(false);
    seen.add(key);session=next;expect(validState(session.state)).toBe(true);
   }
  }
 });
});
describe('score',()=>{
 const full=()=>{const s=deal(1);s.tableau=[[],[],[],[],[],[],[]];s.stock=[];s.waste=[];s.foundations=Array.from({length:4},(_,suit)=>Array.from({length:13},(_,r)=>suit*13+r));return s;};
 const win=(moves:number,recycles=0,undos?:number)=>score({version:1,state:{...full(),moves,recycles},history:[],undos});
 it('counts home cards before a win, up to 520',()=>{const s=full();s.foundations[0].pop();s.waste=[12];expect(score({version:1,state:s,history:[]})).toBe(510);expect(score({version:1,state:deal(5),history:[]})).toBe(0);});
 it('ranks every win above any non-win, fewer moves, recycles and undos first',()=>{
  expect(win(150)).toBe(2850);expect(win(100)).toBeGreaterThan(win(200));expect(win(150,1)).toBeLessThan(win(150));expect(win(150,0,2)).toBe(2840);
  expect(win(150,0,0)).toBe(win(150));expect(win(1e6,1e5,1e5)).toBe(1001);
 });
 it('undo counts persist through actions and restore, and legacy sessions restore',()=>{
  const s=undo(act({version:1,state:deal(3),history:[]},{kind:'draw'})!)!;expect(act(s,{kind:'draw'})!.undos).toBe(1);
  expect(restore(JSON.parse(JSON.stringify(s)))!.undos).toBe(1);expect(restore({version:1,state:deal(3),history:[]})).not.toBeNull();
  for(const undos of [-1,1.5,'2'])expect(restore({...s,undos})).toBeNull();
 });
});
