/** Pure, seeded grid rules. No DOM, wall clock, random global or rendering state. */
export const SIZE=16;
export const TICK_MS=160;
export type Direction='up'|'right'|'down'|'left';
export interface Cell {x:number;y:number}
export interface SnakeState {version:1;seed:number;body:Cell[];food:Cell|null;direction:Direction;queue:Direction[];phase:'ready'|'running'|'lost'|'won';score:number;elapsed:number;ticks:number}
const vector:Record<Direction,Cell>={up:{x:0,y:-1},right:{x:1,y:0},down:{x:0,y:1},left:{x:-1,y:0}};
const opposite:Record<Direction,Direction>={up:'down',down:'up',left:'right',right:'left'};
const same=(a:Cell,b:Cell)=>a.x===b.x&&a.y===b.y;
export function createState(seed=0x51a4e):SnakeState{return {version:1,seed:seed>>>0,body:[{x:5,y:6},{x:4,y:6},{x:3,y:6}],food:{x:9,y:6},direction:'right',queue:[],phase:'ready',score:0,elapsed:0,ticks:0};}
export function enqueue(s:SnakeState,d:Direction):boolean{
 if(s.phase==='lost'||s.phase==='won'||s.queue.length>=2)return false;
 const previous=s.queue.at(-1)??s.direction;
 if(d===opposite[previous]||d===previous)return false;
 s.queue.push(d);return true;
}
function food(s:SnakeState):Cell|null{
 const free:Cell[]=[];for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(!s.body.some(p=>p.x===x&&p.y===y))free.push({x,y});
 s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;
 return free.length?free[s.seed%free.length]:null;
}
export function step(s:SnakeState):void{
 if(s.phase!=='running')return;
 s.direction=s.queue.shift()??s.direction;
 const v=vector[s.direction],head={x:s.body[0].x+v.x,y:s.body[0].y+v.y};
 const eating=s.food!==null&&same(head,s.food);
 // The last segment disappears during this move unless food is eaten.
 const solid=eating?s.body:s.body.slice(0,-1);
 s.ticks++;
 if(head.x<0||head.y<0||head.x>=SIZE||head.y>=SIZE||solid.some(p=>same(p,head))){s.phase='lost';s.queue=[];s.elapsed=0;return;}
 s.body.unshift(head);if(!eating)s.body.pop();
 else {s.score+=10;s.food=food(s);if(!s.food){s.phase='won';s.queue=[];s.elapsed=0;}}
}
export function advance(s:SnakeState,ms:number):void{
 if(s.phase!=='running'||!Number.isFinite(ms)||ms<0)return;
 s.elapsed+=ms;
 while(s.elapsed+1e-8>=TICK_MS&&s.phase==='running'){s.elapsed=Math.max(0,s.elapsed-TICK_MS);step(s);}
}
export function restoreState(value:unknown):SnakeState|null{
 if(!value||typeof value!=='object')return null;
 const s=value as SnakeState;
 const direction=(d:unknown):d is Direction=>typeof d==='string'&&Object.hasOwn(vector,d);
 const cell=(p:unknown):p is Cell=>!!p&&typeof p==='object'&&Number.isInteger((p as Cell).x)&&Number.isInteger((p as Cell).y)&&(p as Cell).x>=0&&(p as Cell).x<SIZE&&(p as Cell).y>=0&&(p as Cell).y<SIZE;
 if(s.version!==1||!Number.isInteger(s.seed)||s.seed<0||s.seed>0xffffffff||!direction(s.direction)||!['ready','running','lost','won'].includes(s.phase)||!Array.isArray(s.body)||s.body.length<3||s.body.length>SIZE*SIZE||!s.body.every(cell)||!Array.isArray(s.queue)||s.queue.length>2||!s.queue.every(direction)||!Number.isFinite(s.elapsed)||s.elapsed<0||s.elapsed>=TICK_MS||!Number.isSafeInteger(s.ticks)||s.ticks<0||s.score!==(s.body.length-3)*10)return null;
 if(new Set(s.body.map(p=>p.x+SIZE*p.y)).size!==s.body.length)return null;
 for(let i=1;i<s.body.length;i++)if(Math.abs(s.body[i].x-s.body[i-1].x)+Math.abs(s.body[i].y-s.body[i-1].y)!==1)return null;
 if(s.phase==='won'){if(s.body.length!==SIZE*SIZE||s.food!==null)return null;}
 else if(!cell(s.food)||s.body.some(p=>same(p,s.food!)))return null;
 let prev=s.direction;for(const d of s.queue){if(d===prev||d===opposite[prev])return null;prev=d;}
 return {version:1,seed:s.seed,body:s.body.map(p=>({x:p.x,y:p.y})),food:s.food?{x:s.food.x,y:s.food.y}:null,direction:s.direction,queue:[...s.queue],phase:s.phase,score:s.score,elapsed:s.elapsed,ticks:s.ticks};
}
