export const COLUMNS=10,ROWS=22,HIDDEN_ROWS=2,VISIBLE_ROWS=ROWS-HIDDEN_ROWS;
export const IDS=['I','O','T','S','Z','J','L'] as const;
export type Piece=typeof IDS[number];
export interface Active{id:Piece;x:number;y:number;r:number}
export type Spin='none'|'mini'|'full';
// Result of the most recent lock: what was cleared and how many points it earned.
export interface Clear{id:Piece;lines:number;spin:Spin;b2b:boolean;combo:number;perfect:boolean;points:number}
export interface State{version:1;seed:number;board:(Piece|null)[][];active:Active;queue:Piece[];bag:Piece[];held:Piece|null;holdUsed:boolean;score:number;lines:number;phase:'ready'|'running'|'lost';fall:number;lock:number;resets:number;locks:number;lowest:number;b2b:boolean;combo:number;spin:number;last:Clear|null}
const shapes:Record<Piece,number[][]>={I:[[0,1],[1,1],[2,1],[3,1]],O:[[1,0],[2,0],[1,1],[2,1]],T:[[1,0],[0,1],[1,1],[2,1]],S:[[1,0],[2,0],[0,1],[1,1]],Z:[[0,0],[1,0],[1,1],[2,1]],J:[[0,0],[0,1],[1,1],[2,1]],L:[[2,0],[0,1],[1,1],[2,1]]};
export function cells(a:Active):[number,number][]{return shapes[a.id].map(([x,y])=>{if(a.id==='O')return [a.x+x,a.y+y];for(let i=0;i<a.r;i++){const n=a.id==='I'?3:2;[x,y]=[n-y,x];}return [a.x+x,a.y+y];});}
const blank=()=>Array.from({length:ROWS},()=>Array<Piece|null>(COLUMNS).fill(null));
function draw(s:State):Piece{if(!s.bag.length){s.bag=[...IDS];for(let i=6;i>0;i--){s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;const j=s.seed%(i+1);[s.bag[i],s.bag[j]]=[s.bag[j],s.bag[i]];}}return s.bag.pop()!;}
function replenish(s:State){while(s.queue.length<6)s.queue.push(draw(s));}
function spawn(s:State,id?:Piece){replenish(s);s.active={id:id??s.queue.shift()!,x:3,y:HIDDEN_ROWS,r:0};replenish(s);s.fall=0;s.lock=0;s.resets=0;s.spin=0;while(s.active.y>0&&!fits(s,s.active))s.active.y--;s.lowest=Math.max(...cells(s.active).map(([,y])=>y));if(!fits(s,s.active))s.phase='lost';}
export function createState(seed=Date.now()):State{const s:State={version:1,seed:seed>>>0,board:blank(),active:{id:'I',x:3,y:0,r:0},queue:[],bag:[],held:null,holdUsed:false,score:0,lines:0,phase:'ready',fall:0,lock:0,resets:0,locks:0,lowest:0,b2b:false,combo:-1,spin:0,last:null};spawn(s);return s;}
export const level=(s:State)=>1+Math.floor(s.lines/10);
// Each level reduces the interval exponentially, capped at 50 ms.
export const gravity=(n:number)=>Math.max(50,1000*Math.pow(.82,n-1));
export function fits(s:State,a:Active):boolean{return cells(a).every(([x,y])=>x>=0&&x<COLUMNS&&y>=0&&y<ROWS&&!s.board[y][x]);}
function grounded(s:State){return !fits(s,{...s.active,y:s.active.y+1});}
function progress(s:State){const bottom=Math.max(...cells(s.active).map(([,y])=>y));if(bottom>s.lowest){s.lowest=bottom;s.lock=0;s.resets=0;}}
function resetLock(s:State,was:boolean){if(was&&s.resets<15){s.lock=0;s.resets++;}}
export function move(s:State,dx:number):boolean{if(s.phase==='lost')return false;const was=grounded(s),a={...s.active,x:s.active.x+dx};if(!fits(s,a))return false;s.active=a;s.spin=0;resetLock(s,was);return true;}
const normal:Record<string,number[][]>={'0>1':[[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],'1>0':[[0,0],[1,0],[1,1],[0,-2],[1,-2]],'1>2':[[0,0],[1,0],[1,1],[0,-2],[1,-2]],'2>1':[[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],'2>3':[[0,0],[1,0],[1,-1],[0,2],[1,2]],'3>2':[[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],'3>0':[[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],'0>3':[[0,0],[1,0],[1,-1],[0,2],[1,2]]};
const line:Record<string,number[][]>={'0>1':[[0,0],[-2,0],[1,0],[-2,1],[1,-2]],'1>0':[[0,0],[2,0],[-1,0],[2,-1],[-1,2]],'1>2':[[0,0],[-1,0],[2,0],[-1,-2],[2,1]],'2>1':[[0,0],[1,0],[-2,0],[1,2],[-2,-1]],'2>3':[[0,0],[2,0],[-1,0],[2,-1],[-1,2]],'3>2':[[0,0],[-2,0],[1,0],[-2,1],[1,-2]],'3>0':[[0,0],[1,0],[-2,0],[1,2],[-2,-1]],'0>3':[[0,0],[-1,0],[2,0],[-1,-2],[2,1]]};
export function rotate(s:State,d:1|-1):boolean{if(s.phase==='lost')return false;const a=s.active,r=(a.r+d+4)%4,was=grounded(s);const kicks=a.id==='O'?[[0,0]]:(a.id==='I'?line:normal)[`${a.r}>${r}`];for(let i=0;i<kicks.length;i++){const [x,y]=kicks[i],b={...a,r,x:a.x+x,y:a.y+y};if(fits(s,b)){s.active=b;s.spin=i+1;resetLock(s,was);progress(s);return true;}}return false;}
export function softDrop(s:State):boolean{const a={...s.active,y:s.active.y+1};if(s.phase==='lost'||!fits(s,a))return false;s.active=a;s.spin=0;progress(s);s.score++;s.fall=0;return true;}
export function ghost(s:State):number{let y=s.active.y;while(fits(s,{...s.active,y:y+1}))y++;return y;}
const occupied=(s:State,x:number,y:number)=>x<0||x>=COLUMNS||y>=ROWS||(y>=0&&!!s.board[y][x]);
// Three-corner rule: a T piece whose last successful action was a rotation, with three of the four
// diagonal corners around its centre blocked. Both front corners blocked, or the final kick, makes it full.
export function spinKind(s:State):Spin{const a=s.active;if(a.id!=='T'||!s.spin)return 'none';const filled=[[0,0],[2,0],[2,2],[0,2]].map(([x,y])=>occupied(s,a.x+x,a.y+y));if(filled.filter(Boolean).length<3)return 'none';const [f,g]=[[0,1],[1,2],[2,3],[3,0]][a.r];return (filled[f]&&filled[g])||s.spin===5?'full':'mini';}
const LINE_POINTS=[0,100,300,500,800],FULL_POINTS=[400,800,1200,1600],MINI_POINTS=[100,200,400],PERFECT_POINTS=[0,800,1200,1800,2000];
function lockPiece(s:State){const cs=cells(s.active);if(cs.every(([,y])=>y<HIDDEN_ROWS)){s.phase='lost';return;}const spin=spinKind(s),id=s.active.id;for(const [x,y] of cs)s.board[y][x]=id;let count=0;for(let y=ROWS-1;y>=0;y--)if(s.board[y].every(Boolean)){s.board.splice(y,1);s.board.unshift(Array(COLUMNS).fill(null));count++;y++;}
 const base=(spin==='full'?FULL_POINTS:spin==='mini'?MINI_POINTS:LINE_POINTS)[count]??0,difficult=count===4||(count>0&&spin!=='none'),b2b=difficult&&s.b2b;
 if(count){s.combo++;s.b2b=difficult;}else s.combo=-1;
 const perfect=count>0&&s.board.every(row=>row.every(c=>!c)),combo=count&&s.combo>0?s.combo:0;
 const points=(Math.floor(base*(b2b?1.5:1))+50*combo+(perfect?PERFECT_POINTS[count]:0))*level(s);
 s.score+=points;s.lines+=count;s.locks++;s.holdUsed=false;s.last=count||spin!=='none'?{id,lines:count,spin,b2b,combo,perfect,points}:null;spawn(s);}
export function hardDrop(s:State){if(s.phase==='lost')return;const y=ghost(s);if(y>s.active.y)s.spin=0;s.score+=(y-s.active.y)*2;s.active.y=y;lockPiece(s);}
export function hold(s:State):boolean{if(s.holdUsed||s.phase==='lost')return false;const id=s.active.id,old=s.held;s.held=id;s.holdUsed=true;spawn(s,old??undefined);return true;}
export function advance(s:State,ms:number){if(s.phase!=='running'||!Number.isFinite(ms)||ms<=0)return;while(ms>0&&s.phase==='running'){if(grounded(s)){const dt=Math.min(ms,500-s.lock);s.lock+=dt;ms-=dt;if(s.lock>=500)lockPiece(s);}else{const dt=Math.min(ms,gravity(level(s))-s.fall);s.fall+=dt;ms-=dt;if(s.fall>=gravity(level(s))){s.fall=0;s.active.y++;s.spin=0;progress(s);}}}}
export function restoreState(v:unknown):State|null{if(!v||typeof v!=='object')return null;const s=v as State,valid=(p:unknown):p is Piece=>typeof p==='string'&&IDS.includes(p as Piece),num=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0; if(s.version!==1||!Number.isInteger(s.seed)||s.seed<0||s.seed>0xffffffff||!Array.isArray(s.board)||s.board.length!==ROWS||!s.board.every(row=>Array.isArray(row)&&row.length===COLUMNS&&row.every(c=>c===null||valid(c)))||!s.active||!valid(s.active.id)||![s.active.x,s.active.y,s.active.r].every(Number.isInteger)||s.active.r<0||s.active.r>3||!Array.isArray(s.queue)||s.queue.length<3||s.queue.length>13||!s.queue.every(valid)||!Array.isArray(s.bag)||s.bag.length>7||!s.bag.every(valid)||new Set(s.bag).size!==s.bag.length||!(s.held===null||valid(s.held))||typeof s.holdUsed!=='boolean'||!['ready','running','lost'].includes(s.phase)||![s.score,s.lines,s.fall,s.lock,s.resets,s.locks].every(num)||![s.score,s.lines,s.resets,s.locks].every(Number.isSafeInteger)||s.lock>500||s.resets>15||s.fall>=gravity(level(s)))return null;if(s.lowest!==undefined&&(!Number.isInteger(s.lowest)||s.lowest<0||s.lowest>ROWS-1))return null;if(s.b2b!==undefined&&typeof s.b2b!=='boolean')return null;if(s.combo!==undefined&&(!Number.isSafeInteger(s.combo)||s.combo< -1))return null;if(s.spin!==undefined&&(!Number.isInteger(s.spin)||s.spin<0||s.spin>5))return null;if(s.phase!=='lost'&&!fits(s,s.active))return null;const copy=JSON.parse(JSON.stringify(s)) as State;copy.lowest=s.lowest??Math.max(...cells(s.active).map(([,y])=>y));copy.b2b=s.b2b??false;copy.combo=s.combo??-1;copy.spin=s.spin??0;copy.last=null;return copy;}
