/** Discrete grid Snake: fixed ticks, a buffered turn queue, a late-turn grace window and a one-tick bonk hold. Pure, no DOM. */
export const SIZE=16, TICK_MS=135, START_LEN=4, POINTS=10, QUEUE_MAX=3, GRACE_MS=50, MAX_FRAME_MS=250, MAX_STEPS=4;
export type Direction='up'|'right'|'down'|'left';
export interface Cell{x:number;y:number}
interface Undo{body:Cell[];dir:Direction;growth:number;food:Cell|null;score:number;seed:number;prevTail:Cell|null;lastTurned:boolean;ticks:number;eaten:Cell|null}
export interface SnakeState{
 version:3;seed:number;phase:'ready'|'running'|'lost'|'won';
 body:Cell[];dir:Direction;queue:Direction[];growth:number;food:Cell|null;score:number;
 /** Milliseconds since the last step, 0..TICK_MS. */
 elapsed:number;
 /** Cell vacated by the most recent step (null if the snake grew or has not moved). */
 prevTail:Cell|null;lastTurned:boolean;
 /** 1 while the head is held for one tick against an obstacle. */
 bonk:0|1;ticks:number;eaten:Cell|null;
 /** One-step snapshot for the late-turn grace window; never persisted. */
 undo:Undo|null;
}
export const vector:Record<Direction,Cell>={up:{x:0,y:-1},right:{x:1,y:0},down:{x:0,y:1},left:{x:-1,y:0}};
export const opposite:Record<Direction,Direction>={up:'down',down:'up',left:'right',right:'left'};
const copy=(p:Cell):Cell=>({x:p.x,y:p.y});
const same=(a:Cell|null,b:Cell|null)=>!!a&&!!b&&a.x===b.x&&a.y===b.y;
export const length=(s:SnakeState)=>s.body.length+s.growth;

export function createState(seed=0x51a4e):SnakeState{
 return {version:3,seed:seed>>>0,phase:'ready',body:[{x:4,y:7},{x:3,y:7},{x:2,y:7},{x:1,y:7}],dir:'right',queue:[],growth:0,food:{x:11,y:7},score:0,
  elapsed:0,prevTail:null,lastTurned:false,bonk:0,ticks:0,eaten:null,undo:null};
}
/** mulberry32, advanced once per spawn. */
function random(s:SnakeState):number{
 s.seed=(s.seed+0x6d2b79f5)>>>0;let t=s.seed;
 t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;
}
function spawnFood(s:SnakeState):Cell|null{
 const taken=new Set(s.body.map(p=>p.x+p.y*SIZE)),free:Cell[]=[];
 for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(!taken.has(x+y*SIZE))free.push({x,y});
 const r=random(s);return free.length?free[Math.floor(r*free.length)]:null;
}
/** A cell is blocked by walls or body; the tail is free when it vacates this step (no pending growth). */
export function blocked(s:SnakeState,p:Cell):boolean{
 if(p.x<0||p.y<0||p.x>=SIZE||p.y>=SIZE)return true;
 const end=s.growth>0?s.body.length:s.body.length-1;
 for(let i=0;i<end;i++)if(s.body[i].x===p.x&&s.body[i].y===p.y)return true;
 return false;
}
function snapshot(s:SnakeState):Undo{return {body:s.body.map(copy),dir:s.dir,growth:s.growth,food:s.food&&copy(s.food),score:s.score,seed:s.seed,prevTail:s.prevTail&&copy(s.prevTail),lastTurned:s.lastTurned,ticks:s.ticks,eaten:s.eaten&&copy(s.eaten)};}
function move(s:SnakeState,next:Cell):void{
 s.bonk=0;s.body.unshift(next);s.ticks++;
 if(s.growth>0){s.growth--;s.prevTail=null;}else s.prevTail=s.body.pop()!;
 if(same(next,s.food)){
  s.score+=POINTS;s.growth++;s.eaten=copy(next);
  if(length(s)>=SIZE*SIZE){s.food=null;s.phase='won';s.queue=[];return;}
  s.food=spawnFood(s);if(!s.food){s.phase='won';s.queue=[];}
 }
}
/** One tick: consume one queued turn, then move, hold (bonk) or lose. */
export function step(s:SnakeState):void{
 if(s.phase!=='running')return;
 const undo=snapshot(s);
 // `dir` stays the travel direction (head minus neck) until the move succeeds; a blocked turn stays queued.
 const nd=s.queue[0]??s.dir,h=s.body[0],v=vector[nd],next={x:h.x+v.x,y:h.y+v.y};
 if(blocked(s,next)){
  s.undo=null;s.prevTail=null;
  if(s.bonk===0){s.bonk=1;return;}
  s.phase='lost';return;
 }
 const turned=s.queue.length>0;if(turned)s.queue.shift();
 s.dir=nd;s.lastTurned=turned;
 move(s,next);s.undo=s.phase==='running'?undo:null;
}
export function advance(s:SnakeState,ms:number):void{
 if(s.phase!=='running'||!Number.isFinite(ms)||ms<=0)return;
 s.elapsed+=Math.min(ms,MAX_FRAME_MS);
 let n=0;
 while(s.elapsed>=TICK_MS&&s.phase==='running'){
  s.elapsed-=TICK_MS;step(s);
  if(++n>=MAX_STEPS){s.elapsed=Math.min(s.elapsed,TICK_MS-1);break;}
 }
}
function legal(s:SnakeState,d:Direction):boolean{
 if(!Object.hasOwn(vector,d))return false;
 const ref=s.queue.at(-1)??s.dir;return d!==ref&&d!==opposite[ref];
}
/**
 * Buffer a turn. Inside the first GRACE_MS of a straight step that did not eat, the turn is applied
 * retroactively at the cell centre the head just passed, provided that corner is safe.
 * During a bonk hold a safe turn escapes immediately.
 */
export function enqueue(s:SnakeState,d:Direction):boolean{
 if(s.phase!=='running'||!Object.hasOwn(vector,d))return false;
 // During a bonk hold any safe direction except back into the neck escapes at once.
 if(s.bonk===1){
  const v=vector[d],h=s.body[0],next={x:h.x+v.x,y:h.y+v.y};
  if(d===opposite[s.dir]||blocked(s,next))return false;
  const undo=snapshot(s);s.queue=[];s.lastTurned=d!==s.dir;s.dir=d;s.elapsed=0;move(s,next);s.undo=s.phase==='running'?undo:null;return true;
 }
 if(!legal(s,d))return false;
 const perpendicular=s.queue.length===0;
 const u=s.undo;
 if(perpendicular&&u&&s.bonk===0&&s.elapsed<GRACE_MS&&!s.lastTurned&&u.score===s.score&&d!==u.dir&&d!==opposite[u.dir]){
  const trial:SnakeState={...s,...u,body:u.body.map(copy),queue:[d],phase:'running',bonk:0,undo:null};
  step(trial);
  if(trial.bonk===0&&trial.phase!=='lost'){Object.assign(s,trial,{elapsed:s.elapsed});return true;}
 }
 if(s.queue.length>=QUEUE_MAX)return false;
 s.queue.push(d);return true;
}
/** Begin a run. A legal first direction steers immediately; the first step happens at once. */
export function start(s:SnakeState,d?:Direction):boolean{
 if(s.phase==='running'){if(d)enqueue(s,d);return true;}
 if(s.phase!=='ready')return false;
 if(d&&d===opposite[s.dir])return false;
 if(d)s.dir=d;
 s.phase='running';s.elapsed=0;s.queue=[];step(s);s.undo=null;
 return true;
}

function direction(d:unknown):d is Direction{return typeof d==='string'&&Object.hasOwn(vector,d);}
function grid(p:unknown):p is Cell{return !!p&&typeof p==='object'&&Number.isInteger((p as Cell).x)&&Number.isInteger((p as Cell).y)&&(p as Cell).x>=0&&(p as Cell).y>=0&&(p as Cell).x<SIZE&&(p as Cell).y<SIZE;}
/** Validates an unknown snapshot; older (v1/v2) formats are not compatible and are rejected. */
export function restoreState(value:unknown):SnakeState|null{
 if(!value||typeof value!=='object')return null;
 const s=value as SnakeState;
 if(s.version!==3||!['ready','running','lost','won'].includes(s.phase)||!direction(s.dir))return null;
 if(!Number.isInteger(s.seed)||s.seed<0||s.seed>0xffffffff||!Number.isSafeInteger(s.ticks)||s.ticks<0)return null;
 if(!Array.isArray(s.body)||s.body.length<2||s.body.length>SIZE*SIZE||!s.body.every(grid))return null;
 if(new Set(s.body.map(p=>p.x+p.y*SIZE)).size!==s.body.length)return null;
 if(s.body.slice(1).some((p,i)=>Math.abs(p.x-s.body[i].x)+Math.abs(p.y-s.body[i].y)!==1))return null;
 const v=vector[s.dir],h=s.body[0],n=s.body[1];
 if(h.x-n.x!==v.x||h.y-n.y!==v.y)return null;
 if(!Array.isArray(s.queue)||s.queue.length>QUEUE_MAX||!s.queue.every(direction))return null;
 let ref=s.dir;for(const d of s.queue){if(d===ref||d===opposite[ref])return null;ref=d;}
 if(!Number.isInteger(s.growth)||s.growth<0||s.growth>3)return null;
 if(length(s)<START_LEN||!Number.isInteger(s.score)||s.score!==(length(s)-START_LEN)*POINTS)return null;
 if(typeof s.elapsed!=='number'||!Number.isFinite(s.elapsed)||s.elapsed<0||s.elapsed>=TICK_MS)return null;
 if(s.bonk!==0&&s.bonk!==1||typeof s.lastTurned!=='boolean')return null;
 if(s.prevTail!==null){
  const t=s.body.at(-1)!;
  if(!grid(s.prevTail)||Math.abs(s.prevTail.x-t.x)+Math.abs(s.prevTail.y-t.y)!==1||s.body.some(p=>same(p,s.prevTail))||s.bonk===1||s.phase==='ready'||s.phase==='lost')return null;
 }
 if(s.eaten!==null&&!grid(s.eaten))return null;
 if(s.phase==='won'){if(s.food!==null||length(s)<SIZE*SIZE)return null;}
 else if(!grid(s.food)||s.body.some(p=>same(p,s.food)))return null;
 const out=JSON.parse(JSON.stringify(s)) as SnakeState;out.undo=null;return out;
}
