/** All positions are integer cells. Shapes have fixed orientation, never rotated by input. */
export const SIZE=8;
export const SHAPES:readonly (readonly (readonly [number,number])[])[]=[
 [[0,0]],[[0,0],[1,0]],[[0,0],[0,1]],[[0,0],[1,0],[2,0]],[[0,0],[0,1],[0,2]],
 [[0,0],[1,0],[0,1],[1,1]],[[0,0],[1,0],[2,0],[3,0]],[[0,0],[0,1],[0,2],[0,3]],
 [[0,0],[0,1],[1,1]],[[1,0],[0,1],[1,1]],[[0,0],[1,0],[0,1]],[[0,0],[1,0],[1,1]],
 [[0,0],[1,0],[2,0],[1,1]],[[1,0],[0,1],[1,1],[2,1]],
 [[0,0],[0,1],[0,2],[1,2]],[[0,0],[1,0],[1,1],[2,1]],
 [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]],[[0,0],[1,0],[0,1],[1,1],[0,2],[1,2]],
 [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2]],
];
export const NAMES=['Dot','Pair across','Pair down','Three across','Three down','Square','Four across','Four down','Corner right','Corner left','Corner up','Corner down','T down','T up','Long corner','Zigzag','Wide six','Tall six','Big square'];
export const COLOR_COUNT=7;
/** Generator and scoring versions are saved with every run so a result can be explained and replayed. */
export const GENERATOR_VERSION=1,SCORING_VERSION=1;
/** Proposed starting values from the reference pack. All are tuning parameters. */
export const TUNING={
 attempts:24,widenedAttempts:96,comboCap:10,setupMoves:2,recent:9,repeatPenalty:.55,
 lineBonus:20,comboBonus:10,colourBonus:40,allClearBonus:200,
 // Relative chance of each catalogue shape once it has a legal placement.
 weights:[3,6,6,7,7,8,5,5,6,6,6,6,6,6,5,5,4,4,4],
 band:[.35,.92] as const,
};
/** [slot, x, y]. A witness lists the moves in the order that proves the tray. */
export type Move=[number,number,number];
export interface State{
 version:2;generator:number;scoring:number;mode:'standard';
 /** Seed of the run, or 0 for a migrated save that cannot be replayed from its start. */
 seed:number;rng:number;
 board:number[];tray:(number|null)[];colors:(number|null)[];
 /** Deal-time proof that the current tray can be placed in full; shorter only for an unprovable board. */
 witness:Move[];recent:number[];history:Move[];
 score:number;combo:number;setup:number;moves:number;lines:number;maxCombo:number;maxLines:number;
}
export interface Breakdown{placement:number;lines:number;combo:number;colours:number;allClear:number}
export interface PlaceResult{state:State;cleared:number[];filled:number[];gained:number;lines:number;breakdown:Breakdown;colorsGone:number[];allClear:boolean;rainbow:boolean}
/** Legacy fixed colour; only used to migrate version-one saves. */
export const colorOf=(shape:number)=>shape%COLOR_COUNT+1;
function random(s:{rng:number}):number{let x=s.rng;x^=x<<13;x^=x>>>17;x^=x<<5;s.rng=x>>>0;return s.rng/4294967296;}
export function canPlace(board:readonly number[],shape:number,x:number,y:number):boolean{
 const cells=SHAPES[shape];return !!cells&&Number.isInteger(x)&&Number.isInteger(y)&&cells.every(([dx,dy])=>x+dx>=0&&x+dx<SIZE&&y+dy>=0&&y+dy<SIZE&&board[(y+dy)*SIZE+x+dx]===0);
}
export function anchors(board:readonly number[],shape:number):[number,number][]{
 const options:[number,number][]=[];for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(canPlace(board,shape,x,y))options.push([x,y]);return options;
}
export function fits(board:readonly number[],shape:number):boolean{for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(canPlace(board,shape,x,y))return true;return false;}
export function hasMove(s:Pick<State,'board'|'tray'>):boolean{return s.tray.some(shape=>shape!==null&&fits(s.board,shape));}
export function clearLines(input:readonly number[]):{board:number[];cleared:number[];lines:number}{
 const rows:number[]=[],cols:number[]=[];
 for(let i=0;i<SIZE;i++){if(Array.from({length:SIZE},(_,j)=>input[i*SIZE+j]).every(Boolean))rows.push(i);if(Array.from({length:SIZE},(_,j)=>input[j*SIZE+i]).every(Boolean))cols.push(i);}
 const cleared=Array.from({length:SIZE*SIZE},(_,i)=>i).filter(i=>rows.includes(Math.floor(i/SIZE))||cols.includes(i%SIZE));
 const board=[...input];for(const i of cleared)board[i]=0;return {board,cleared,lines:rows.length+cols.length};
}
function stamp(board:readonly number[],shape:number,x:number,y:number,color:number):number[]{const next=[...board];for(const [dx,dy] of SHAPES[shape])next[(y+dy)*SIZE+x+dx]=color;return next;}

/** Board-quality signals from the reference pack. Pure; used for generation and tests. */
export interface Signals{mobility:number;shapesFitting:number;fragmented:number;empty:number;bigFits:number;openings:number}
export function analyse(board:readonly number[]):Signals{
 let mobility=0,shapesFitting=0,bigFits=0;
 SHAPES.forEach((cells,shape)=>{const n=anchors(board,shape).length;mobility+=n;if(n)shapesFitting++;if(cells.length>=6)bigFits+=n;});
 // Empty cells in connected regions of one or two cells: space few shapes can use.
 const seen=new Set<number>();let fragmented=0,empty=0;
 for(let i=0;i<SIZE*SIZE;i++){
  if(board[i])continue;empty++;if(seen.has(i))continue;
  const region=[i];seen.add(i);
  for(let k=0;k<region.length;k++){const c=region[k],x=c%SIZE,y=Math.floor(c/SIZE);
   for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]])if(nx>=0&&nx<SIZE&&ny>=0&&ny<SIZE&&!board[ny*SIZE+nx]&&!seen.has(ny*SIZE+nx)){seen.add(ny*SIZE+nx);region.push(ny*SIZE+nx);}}
  if(region.length<=2)fragmented+=region.length;
 }
 // Rows and columns within three cells of completion.
 let openings=0;for(let i=0;i<SIZE;i++){const r=Array.from({length:SIZE},(_,j)=>board[i*SIZE+j]).filter(v=>!v).length,c=Array.from({length:SIZE},(_,j)=>board[j*SIZE+i]).filter(v=>!v).length;if(r>0&&r<=3)openings++;if(c>0&&c<=3)openings++;}
 return {mobility,shapesFitting,fragmented,empty,bigFits,openings};
}
/** 0 is hostile, 1 is wide open. */
export function ease(s:Signals):number{
 return .5*s.shapesFitting/SHAPES.length+.3*Math.min(1,s.bigFits/12)+.2*(s.empty?1-s.fragmented/s.empty:0);
}
interface Candidate{tray:number[];colors:number[];witness:Move[];ease:number;clears:boolean}
function weightedPick<T>(items:readonly T[],weight:(item:T)=>number,s:{rng:number}):T{
 const total=items.reduce((sum,item)=>sum+weight(item),0);let r=random(s)*total;
 for(const item of items){r-=weight(item);if(r<0)return item;}return items[items.length-1];
}
/** One constructive attempt: sample a shape, then a legal position, on a private board. */
function attempt(s:State):{tray:number[];colors:number[];witness:Move[];board:number[];clears:boolean}{
 let board=[...s.board],clears=false;const tray:number[]=[],colors:number[]=[],witness:Move[]=[];
 for(let step=0;step<3;step++){
  const allowed=SHAPES.map((_,i)=>i).filter(shape=>fits(board,shape));if(!allowed.length)break;
  const shape=weightedPick(allowed,i=>TUNING.weights[i]*(s.recent.includes(i)||tray.includes(i)?TUNING.repeatPenalty:1),s);
  const color=1+Math.floor(random(s)*COLOR_COUNT);
  const options=anchors(board,shape),[x,y]=options[Math.floor(random(s)*options.length)];
  const clear=clearLines(stamp(board,shape,x,y,color));board=clear.board;clears||=clear.lines>0;
  tray.push(shape);colors.push(color);witness.push([step,x,y]);
 }
 return {tray,colors,witness,board,clears};
}
/** Deal a fresh tray when the current one is used. Each dealt tray carries a replayable witness. */
export function deal(input:State):State{
 const s=structuredClone(input);if(s.tray.some(p=>p!==null))return s;
 const candidates:Candidate[]=[];let best:ReturnType<typeof attempt>|null=null;
 for(const budget of [TUNING.attempts,TUNING.widenedAttempts]){
  for(let i=0;i<budget;i++){
   const a=attempt(s);if(!best||a.tray.length>best.tray.length)best=a;
   if(a.tray.length===3)candidates.push({tray:a.tray,colors:a.colors,witness:a.witness,ease:ease(analyse(a.board)),clears:a.clears});
  }
  if(candidates.length)break; // otherwise NEED_MORE_SEARCH: widen once.
 }
 let chosen:Candidate;
 if(candidates.length){
  const eligible=candidates.filter(c=>c.ease>=TUNING.band[0]&&c.ease<=TUNING.band[1]);
  // A tactical opening is favoured mildly, never guaranteed.
  chosen=weightedPick(eligible.length?eligible:candidates,c=>c.clears?1.5:1,s);
 }else{
  // The bounded search found no complete path. This is not proof that none exists,
  // but the longest proven prefix is kept and dots fill the rest.
  if(!best||!best.tray.length)return structuredClone(input);
  chosen={tray:[...best.tray],colors:[...best.colors],witness:best.witness,ease:0,clears:best.clears};
  while(chosen.tray.length<3){chosen.tray.push(0);chosen.colors.push(1+Math.floor(random(s)*COLOR_COUNT));}
 }
 // Shuffle the offered order and remap the witness to the shuffled slots.
 const order=[0,1,2];for(let i=2;i>0;i--){const j=Math.floor(random(s)*(i+1));[order[i],order[j]]=[order[j],order[i]];}
 s.tray=order.map(i=>chosen.tray[i]);s.colors=order.map(i=>chosen.colors[i]);
 s.witness=chosen.witness.map(([slot,x,y])=>[order.indexOf(slot),x,y]);
 s.recent=[...s.recent,...chosen.tray].slice(-TUNING.recent);
 return s;
}
export function createGame(seed=0x43b10c):State{
 const start=(seed>>>0)||1;
 return deal({version:2,generator:GENERATOR_VERSION,scoring:SCORING_VERSION,mode:'standard',seed:start,rng:start,board:Array(SIZE*SIZE).fill(0),tray:[null,null,null],colors:[null,null,null],witness:[],recent:[],history:[],score:0,combo:0,setup:0,moves:0,lines:0,maxCombo:0,maxLines:0});
}
/** Points for one legal placement: N + 20L² + 10L(k − 1) + 40C + 200A. */
export function scoreMove(cells:number,lines:number,chain:number,colours:number,allClear:boolean):Breakdown{
 const k=Math.min(chain,TUNING.comboCap);
 return lines?{placement:cells,lines:TUNING.lineBonus*lines*lines,combo:TUNING.comboBonus*lines*(k-1),colours:TUNING.colourBonus*colours,allClear:allClear?TUNING.allClearBonus:0}:{placement:cells,lines:0,combo:0,colours:0,allClear:0};
}
export const total=(b:Breakdown)=>b.placement+b.lines+b.combo+b.colours+b.allClear;
export function place(input:State,slot:number,x:number,y:number):PlaceResult|null{
 const shape=input.tray[slot];if(shape===null||shape===undefined||!Number.isInteger(slot)||!canPlace(input.board,shape,x,y))return null;
 const s=structuredClone(input),color=s.colors[slot]??colorOf(shape);
 const filled=stamp(s.board,shape,x,y,color),clear=clearLines(filled);
 const before=new Set(filled.filter(Boolean)),after=new Set(clear.board.filter(Boolean));
 const colorsGone=clear.lines?[...before].filter(c=>!after.has(c)).sort((a,b)=>a-b):[];
 const allClear=clear.lines>0&&after.size===0;
 // A clear advances the chain and restores two setup moves; the third plain move resets it.
 if(clear.lines){s.combo++;s.setup=TUNING.setupMoves;}else if(s.combo){if(s.setup>0)s.setup--;else{s.combo=0;}}
 const breakdown=scoreMove(SHAPES[shape].length,clear.lines,s.combo,colorsGone.length,allClear),gained=total(breakdown);
 s.board=clear.board;s.tray[slot]=null;s.colors[slot]=null;s.moves++;s.lines+=clear.lines;s.score+=gained;s.history.push([slot,x,y]);
 s.maxCombo=Math.max(s.maxCombo,clear.lines?s.combo:0);s.maxLines=Math.max(s.maxLines,clear.lines);
 const rainbow=clear.lines>0&&(s.combo>=5||clear.lines>=3);
 return {state:deal(s),cleared:clear.cleared,filled,gained,lines:clear.lines,breakdown,colorsGone,allClear,rainbow};
}
/** Rebuild a run from its seed and placements. Returns null if any move is illegal. */
export function replay(seed:number,moves:readonly Move[]):State|null{
 let s=createGame(seed);for(const [slot,x,y] of moves){const r=place(s,slot,x,y);if(!r)return null;s=r.state;}return s;
}
const integer=(v:unknown,max=Number.MAX_SAFE_INTEGER):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max;
const move=(v:unknown):v is Move=>Array.isArray(v)&&v.length===3&&integer(v[0],2)&&integer(v[1],SIZE-1)&&integer(v[2],SIZE-1);
function migrate(s:Record<string,unknown>):Record<string,unknown>{
 // Version one: fixed shape colours, a shuffle bag and a streak that reset on any plain move.
 const tray=s.tray as unknown[],combo=s.combo as number;
 return {...s,version:2,generator:0,scoring:0,mode:'standard',seed:0,colors:Array.isArray(tray)?tray.map(p=>typeof p==='number'?colorOf(p):null):tray,witness:[],recent:[],history:[],setup:combo>0?TUNING.setupMoves:0,maxCombo:combo,maxLines:0};
}
export function restoreGame(data:unknown):State|null{
 if(!data||typeof data!=='object')return null;let raw=data as Record<string,unknown>;
 if(raw.version===1){if(!Array.isArray(raw.bag))return null;raw=migrate(raw);}
 const s=raw as unknown as State;
 if(s.version!==2||s.mode!=='standard'||!integer(s.generator,GENERATOR_VERSION)||!integer(s.scoring,SCORING_VERSION)||!Array.isArray(s.board)||s.board.length!==SIZE*SIZE||!s.board.every(v=>integer(v,COLOR_COUNT))
  ||!Array.isArray(s.tray)||s.tray.length!==3||!s.tray.every(v=>v===null||integer(v,SHAPES.length-1))||s.tray.every(v=>v===null)
  ||!Array.isArray(s.colors)||s.colors.length!==3||!s.tray.every((p,i)=>p===null||integer(s.colors[i],COLOR_COUNT)&&s.colors[i]!==0)
  ||!Array.isArray(s.witness)||s.witness.length>3||!s.witness.every(move)||!Array.isArray(s.recent)||s.recent.length>TUNING.recent||!s.recent.every(v=>integer(v,SHAPES.length-1))
  ||!Array.isArray(s.history)||!s.history.every(move)||!integer(s.seed,4294967295)||!integer(s.rng,4294967295)||s.rng===0
  ||![s.score,s.combo,s.moves,s.lines,s.maxCombo,s.maxLines].every(v=>integer(v))||!integer(s.setup,TUNING.setupMoves)||s.combo>s.moves||s.history.length>s.moves||clearLines(s.board).lines>0)return null;
 return {version:2,generator:s.generator,scoring:s.scoring,mode:'standard',seed:s.seed,rng:s.rng,board:[...s.board],tray:[...s.tray],colors:s.tray.map((p,i)=>p===null?null:s.colors[i]),witness:s.witness.map(m=>[...m] as Move),recent:[...s.recent],history:s.history.map(m=>[...m] as Move),score:s.score,combo:s.combo,setup:s.setup,moves:s.moves,lines:s.lines,maxCombo:s.maxCombo,maxLines:s.maxLines};
}
