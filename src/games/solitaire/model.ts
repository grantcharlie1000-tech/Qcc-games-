export interface Card {id:number;up:boolean}
export interface State {seed:number;moves:number;recycles:number;stock:number[];waste:number[];foundations:number[][];tableau:Card[][]}
export interface Source {kind:'waste'|'tableau'|'foundation';pile:number;index:number}
export interface Target {kind:'tableau'|'foundation';pile:number}
export type Action={kind:'draw'}|{kind:'move';from:Source;to:Target};
export interface Session {version:1;state:State;history:State[];undos?:number}
export const suit=(id:number)=>Math.floor(id/13);
export const rank=(id:number)=>id%13+1;
export const red=(id:number)=>suit(id)===1||suit(id)===3;
const clone=(s:State):State=>structuredClone(s);
const integer=(n:unknown,max=Number.MAX_SAFE_INTEGER):n is number=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<=max;
export function deal(seed:number):State {
 let rng=seed>>>0;
 const random=()=>{rng=(rng+0x6D2B79F5)>>>0;let t=rng;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
 const deck=Array.from({length:52},(_,i)=>i);
 for(let i=51;i>0;i--){const j=Math.floor(random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
 const tableau:Card[][]=Array.from({length:7},()=>[]);
 for(let row=0;row<7;row++)for(let col=row;col<7;col++)tableau[col].push({id:deck.pop()!,up:row===col});
 return {seed:seed>>>0,moves:0,recycles:0,stock:deck,waste:[],foundations:[[],[],[],[]],tableau};
}
function sequence(cards:Card[]):boolean {
 return cards.length>0&&cards.every((c,i)=>c.up&&(i===0||(rank(cards[i-1].id)===rank(c.id)+1&&red(cards[i-1].id)!==red(c.id))));
}
export function movable(s:State,from:Source):number[]|null {
 if(!integer(from.pile,from.kind==='tableau'?6:3)||!integer(from.index,51))return null;
 if(from.kind==='waste')return s.waste.length&&from.index===s.waste.length-1?[s.waste.at(-1)!]:null;
 if(from.kind==='foundation'){const f=s.foundations[from.pile];return f.length&&from.index===f.length-1?[f.at(-1)!]:null;}
 const cards=s.tableau[from.pile].slice(from.index);
 return sequence(cards)?cards.map(c=>c.id):null;
}
export function move(s:State,from:Source,to:Target):State|null {
 if(!integer(to.pile,to.kind==='tableau'?6:3)||(from.kind===to.kind&&from.pile===to.pile))return null;
 const cards=movable(s,from);if(!cards)return null;
 if(to.kind==='foundation'){
  const target=s.foundations[to.pile];if(cards.length!==1||suit(cards[0])!==to.pile||rank(cards[0])!==target.length+1)return null;
 }else{
  const target=s.tableau[to.pile],top=target.at(-1);
  if(top?(!top.up||rank(top.id)!==rank(cards[0])+1||red(top.id)===red(cards[0])):rank(cards[0])!==13)return null;
 }
 const next=clone(s);
 if(from.kind==='tableau'){next.tableau[from.pile].splice(from.index);const top=next.tableau[from.pile].at(-1);if(top)top.up=true;}
 else if(from.kind==='waste')next.waste.pop();else next.foundations[from.pile].pop();
 if(to.kind==='foundation')next.foundations[to.pile].push(...cards);else next.tableau[to.pile].push(...cards.map(id=>({id,up:true})));
 next.moves++;return next;
}
export function draw(s:State):State|null {
 if(!s.stock.length&&!s.waste.length)return null;
 const next=clone(s);if(next.stock.length)next.waste.push(next.stock.pop()!);else{next.stock=next.waste.reverse();next.waste=[];next.recycles++;}next.moves++;return next;
}
export function validState(value:unknown):value is State {
 if(!value||typeof value!=='object')return false;const s=value as State;
 if(!integer(s.seed,4294967295)||!integer(s.moves)||!integer(s.recycles)||s.recycles>s.moves)return false;
 if(!Array.isArray(s.stock)||!Array.isArray(s.waste)||!Array.isArray(s.foundations)||s.foundations.length!==4||!Array.isArray(s.tableau)||s.tableau.length!==7)return false;
 const all:unknown[]=[...s.stock,...s.waste];
 for(let i=0;i<4;i++){const pile=s.foundations[i];if(!Array.isArray(pile)||pile.length>13||pile.some((id,r)=>id!==i*13+r))return false;all.push(...pile);}
 for(const pile of s.tableau){
  if(!Array.isArray(pile)||pile.length>52)return false;let visible=false;const face:Card[]=[];
  for(const c of pile){if(!c||typeof c!=='object'||!integer(c.id,51)||typeof c.up!=='boolean'||(visible&&!c.up))return false;all.push(c.id);if(c.up){visible=true;face.push(c);}}
  if(pile.length&&(!visible||!sequence(face)))return false;
 }
 return all.length===52&&all.every(id=>integer(id,51))&&new Set(all).size===52;
}
export function won(s:State):boolean {return validState(s)&&s.foundations.every(p=>p.length===13);}
/** Ignore counters and interchangeable column locations when detecting a loop. */
function hintPosition(s:State):string {
 const columns=s.tableau.map(p=>p.map(c=>`${c.id}:${Number(c.up)}`).join(',')).sort();
 return JSON.stringify([s.stock,s.waste,s.foundations,columns]);
}
const coveredCount=(s:State)=>s.tableau.reduce((n,p)=>n+p.filter(c=>!c.up).length,0);
const homeCount=(s:State)=>s.foundations.reduce((n,p)=>n+p.length,0);
function hintMoves(s:State):{action:Action;state:State;priority:number}[]{
 const sources:Source[]=[],options:{action:Action;state:State;priority:number}[]=[];
 if(s.waste.length)sources.push({kind:'waste',pile:0,index:s.waste.length-1});
 s.tableau.forEach((p,pile)=>p.forEach((c,index)=>{if(c.up)sources.push({kind:'tableau',pile,index});}));
 s.foundations.forEach((p,pile)=>{if(p.length)sources.push({kind:'foundation',pile,index:p.length-1});});
 for(const from of sources)for(const kind of ['foundation','tableau'] as const){
  for(let pile=0;pile<(kind==='foundation'?4:7);pile++){
   // Moving a whole King-led column to another empty column changes nothing.
   if(kind==='tableau'&&!s.tableau[pile].length&&from.kind==='tableau'&&from.index===0)continue;
   const to:Target={kind,pile},next=move(s,from,to);if(!next)continue;
   const reveals=from.kind==='tableau'&&from.index>0&&!s.tableau[from.pile][from.index-1].up;
   const priority=reveals?4:kind==='foundation'?3:from.kind==='waste'?2:from.kind==='foundation'?0:1;
   options.push({action:{kind:'move',from,to},state:next,priority});
  }
 }
 return options.sort((a,b)=>b.priority-a.priority);
}
/**
 * Find a short route to a reveal or a net foundation gain, without returning to
 * a recent position. Foundation withdrawals are setup moves, never an end goal.
 * The bounded search stops before exploring beyond a newly uncovered card.
 */
export function hint(s:State,history:readonly State[]=[]):Action|null {
 const home=homeCount(s),covered=coveredCount(s);if(home===52)return null;
 const seen=new Set(history.map(hintPosition));seen.add(hintPosition(s));
 const queue:{state:State;first:Action|null;depth:number}[]=[{state:s,first:null,depth:0}];
 for(let cursor=0;cursor<queue.length&&cursor<300;cursor++){
  const node=queue[cursor];
  for(const option of hintMoves(node.state)){
   const key=hintPosition(option.state);if(seen.has(key))continue;seen.add(key);
   const first=node.first??option.action;
   if(coveredCount(option.state)<covered||homeCount(option.state)>home)return first;
   if(node.depth<2)queue.push({state:option.state,first,depth:node.depth+1});
  }
 }
 // Draw-one can inspect every stock card. Stop once recycling would repeat a
 // position already tried; manual draws and unlimited recycling remain legal.
 const next=draw(s);
 return next&&!history.some(p=>hintPosition(p)===hintPosition(next))&&hintPosition(next)!==hintPosition(s)?{kind:'draw'}:null;
}
export function act(session:Session,action:Action):Session|null {
 const state=action.kind==='draw'?draw(session.state):move(session.state,action.from,action.to);
 return state?{...session,state,history:[...session.history,session.state].slice(-200)}:null;
}
export function undo(session:Session):Session|null {const state=session.history.at(-1);return state?{...session,state:clone(state),history:session.history.slice(0,-1),undos:(session.undos??0)+1}:null;}
/** 10 per home card; a win is 1000 plus a positive bonus that falls with moves, recycles and undos. */
export function score(session:Session):number {
 const s=session.state;if(!won(s))return homeCount(s)*10;
 return 1000+Math.max(1,2000-s.moves-10*s.recycles-5*(session.undos??0));
}
export function restore(value:unknown):Session|null {
 if(!value||typeof value!=='object')return null;const s=value as Session;
 if(s.version!==1||(s.undos!==undefined&&!integer(s.undos))||!validState(s.state)||!Array.isArray(s.history)||s.history.length>200||!s.history.every(p=>validState(p)&&p.seed===s.state.seed))return null;
 return structuredClone(s);
}
