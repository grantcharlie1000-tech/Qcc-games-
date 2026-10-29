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
export interface State {version:1;board:number[];tray:(number|null)[];bag:number[];rng:number;score:number;combo:number;moves:number;lines:number}
export const colorOf=(shape:number)=>shape%7+1;
function random(s:State):number{let x=s.rng;x^=x<<13;x^=x>>>17;x^=x<<5;s.rng=x>>>0;return s.rng/4294967296;}
function refillBag(s:State){s.bag=SHAPES.map((_,i)=>i);for(let i=s.bag.length-1;i>0;i--){const j=Math.floor(random(s)*(i+1));[s.bag[i],s.bag[j]]=[s.bag[j],s.bag[i]];}}
export function canPlace(board:readonly number[],shape:number,x:number,y:number):boolean{
 const cells=SHAPES[shape];return !!cells&&Number.isInteger(x)&&Number.isInteger(y)&&cells.every(([dx,dy])=>x+dx>=0&&x+dx<SIZE&&y+dy>=0&&y+dy<SIZE&&board[(y+dy)*SIZE+x+dx]===0);
}
export function fits(board:readonly number[],shape:number):boolean{for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(canPlace(board,shape,x,y))return true;return false;}
export function hasMove(s:Pick<State,'board'|'tray'>):boolean{return s.tray.some(shape=>shape!==null&&fits(s.board,shape));}
function anchors(board:readonly number[],shape:number):[number,number][]{
 const options:[number,number][]=[];for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(canPlace(board,shape,x,y))options.push([x,y]);return options;
}
export function deal(input:State):State{
 const s=structuredClone(input);if(s.tray.some(p=>p!==null))return s;
 // Construct a three-move witness on a private board. Each step scans at most
 // nineteen shapes and sixty-four anchors; there are no retry/search loops.
 let board=[...s.board];const hand:number[]=[];
 for(let slot=0;slot<3;slot++){
  if(!s.bag.length)refillBag(s);
  let shape=0,index=-1,options:[number,number][]=[];
  for(let i=0;i<s.bag.length;i++){
   options=anchors(board,s.bag[i]);if(options.length){shape=s.bag[i];index=i;break;}
  }
  // Preserve blocked bag entries for later. A dot is the bounded fallback,
  // accepted only with an actual legal anchor on this intermediate board.
  if(index<0)options=anchors(board,0);
  if(!options.length)return structuredClone(input);
  if(index>=0)s.bag.splice(index,1);
  const [x,y]=options[Math.floor(random(s)*options.length)];
  for(const [dx,dy] of SHAPES[shape])board[(y+dy)*SIZE+x+dx]=colorOf(shape);
  board=clearLines(board).board;hand.push(shape);
 }
 s.tray=hand;
 return s;
}
export function createGame(seed=0x43b10c):State{return deal({version:1,board:Array(SIZE*SIZE).fill(0),tray:[null,null,null],bag:[],rng:(seed>>>0)||1,score:0,combo:0,moves:0,lines:0});}
export function clearLines(input:readonly number[]):{board:number[];cleared:number[];lines:number}{
 const rows:number[]=[],cols:number[]=[];
 for(let i=0;i<SIZE;i++){if(Array.from({length:SIZE},(_,j)=>input[i*SIZE+j]).every(Boolean))rows.push(i);if(Array.from({length:SIZE},(_,j)=>input[j*SIZE+i]).every(Boolean))cols.push(i);}
 const cleared=Array.from({length:SIZE*SIZE},(_,i)=>i).filter(i=>rows.includes(Math.floor(i/SIZE))||cols.includes(i%SIZE));
 const board=[...input];for(const i of cleared)board[i]=0;return {board,cleared,lines:rows.length+cols.length};
}
export function place(input:State,slot:number,x:number,y:number):{state:State;cleared:number[];gained:number;lines:number}|null{
 const shape=input.tray[slot];if(shape===null||shape===undefined||!Number.isInteger(slot)||!canPlace(input.board,shape,x,y))return null;
 const s=structuredClone(input);for(const [dx,dy] of SHAPES[shape])s.board[(y+dy)*SIZE+x+dx]=colorOf(shape);
 const clear=clearLines(s.board);s.board=clear.board;s.tray[slot]=null;s.moves++;s.combo=clear.lines?s.combo+1:0;s.lines+=clear.lines;
 const gained=SHAPES[shape].length+clear.lines*20*s.combo;s.score+=gained;
 return {state:deal(s),cleared:clear.cleared,gained,lines:clear.lines};
}
const integer=(v:unknown,max=Number.MAX_SAFE_INTEGER):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max;
export function restoreGame(data:unknown):State|null{
 if(!data||typeof data!=='object')return null;const s=data as State;
 if(s.version!==1||!Array.isArray(s.board)||s.board.length!==SIZE*SIZE||!s.board.every(v=>integer(v,7))||!Array.isArray(s.tray)||s.tray.length!==3||!s.tray.every(v=>v===null||integer(v,SHAPES.length-1))||s.tray.every(v=>v===null)||!Array.isArray(s.bag)||s.bag.length>SHAPES.length||!s.bag.every(v=>integer(v,SHAPES.length-1))||new Set(s.bag).size!==s.bag.length||!integer(s.rng,4294967295)||s.rng===0||![s.score,s.combo,s.moves,s.lines].every(v=>integer(v))||s.combo>s.moves||clearLines(s.board).lines>0)return null;
 return {version:1,board:[...s.board],tray:[...s.tray],bag:[...s.bag],rng:s.rng,score:s.score,combo:s.combo,moves:s.moves,lines:s.lines};
}
