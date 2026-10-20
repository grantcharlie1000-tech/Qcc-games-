/** Authoritative continuous travel on grid-aligned legs. No DOM or wall-clock dependency. */
export const SIZE=16, TICK_MS=160;
export const HEAD_RADIUS=.4, BODY_RADIUS=.4, FOOD_RADIUS=.33, NECK_CLEARANCE=1.2;
export const EPS=1e-9;
// Millisecond roundoff only: far below genuine 1e-8ms pre-junction input windows.
const JUNCTION_TIME_EPS=1e-11;
export type Direction='up'|'right'|'down'|'left';
export interface Cell{x:number;y:number}
export interface SnakeState {
 version:2;seed:number;body:Cell[];food:Cell|null;direction:Direction;queue:Direction[];
 phase:'ready'|'running'|'lost'|'won';score:number;segments:number;elapsed:number;ticks:number;
 legStart:Cell;growth:number;time:number;foodAt:number|null;ateAt:number|null;eaten:Cell|null;
 migration:{elapsed:number;held:boolean}|null;
}
export const vector:Record<Direction,Cell>={up:{x:0,y:-1},right:{x:1,y:0},down:{x:0,y:1},left:{x:-1,y:0}};
const opposite:Record<Direction,Direction>={up:'down',down:'up',left:'right',right:'left'};
const copy=(p:Cell):Cell=>({...p});
export const distance=(a:Cell,b:Cell)=>Math.hypot(a.x-b.x,a.y-b.y);
export function pathLength(path:Cell[]):number{return path.slice(1).reduce((n,p,i)=>n+distance(path[i],p),0);}
export function createState(seed=0x51a4e):SnakeState{return {version:2,seed:seed>>>0,body:[{x:5,y:6},{x:4,y:6},{x:3,y:6}],food:{x:9,y:6},direction:'right',queue:[],phase:'ready',score:0,segments:3,elapsed:0,ticks:0,legStart:{x:5,y:6},growth:0,time:0,foodAt:null,ateAt:null,eaten:null,migration:null};}
export function enqueue(s:SnakeState,d:Direction):boolean{
 if(s.phase==='lost'||s.phase==='won'||s.queue.length>=2||!Object.hasOwn(vector,d))return false;
 const previous=s.queue.at(-1)??s.direction;
 if(d===opposite[previous]||d===previous)return false;
 s.queue.push(d);return true;
}
/** Initial input can choose the first leg; migrated queued turns retain priority at the held junction. */
export function start(s:SnakeState,d?:Direction):boolean{
 if(s.phase==='lost'||s.phase==='won')return false;
 if(s.phase==='running'&&!s.migration?.held){if(d)enqueue(s,d);return true;}
 if(d&&s.queue.length===0&&d===opposite[s.direction])return false;
 if(d)enqueue(s,d);
 s.direction=s.queue.shift()??s.direction;s.phase='running';if(s.migration)s.migration.held=false;
 return true;
}
export function pointSegment(p:Cell,a:Cell,b:Cell):number{
 const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
 const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;
 return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);
}
function arcs(path:Cell[]):number[]{const out=[0];for(let i=1;i<path.length;i++)out.push(out[i-1]+distance(path[i-1],path[i]));return out;}
function along(a:Cell,b:Cell,t:number):Cell{return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}
function onEdge(path:Cell[],arc:number[],i:number,n:number):Cell{return along(path[i],path[i+1],Math.max(0,Math.min(1,(n-arc[i])/(arc[i+1]-arc[i]))));}
/** First approaching disk contact. Tangency while moving away is not a new collision. */
export function diskContact(p:Cell,v:Cell,a:Cell,av:Cell,r:number,limit:number):number{
 const x=p.x-a.x,y=p.y-a.y,vx=v.x-av.x,vy=v.y-av.y;
 const A=vx*vx+vy*vy,B=2*(x*vx+y*vy),C=x*x+y*y-r*r;
 if(C < -EPS)return 0;
 if(A<EPS)return Infinity;
 const discriminant=B*B-4*A*C;if(discriminant < -EPS)return Infinity;
 const root=(-B-Math.sqrt(Math.max(0,discriminant)))/(2*A);
 if(root < -EPS||root>limit+EPS)return Infinity;
 if(root<=EPS&&B>=-EPS)return Infinity;
 return Math.max(0,Math.min(limit,root));
}
/** Analytic sweep against fixed edges with linearly moving tail/neck trim endcaps. */
function selfContact(s:SnakeState,limit:number):number{
 const path=s.body,arc=arcs(path),L=arc.at(-1)!,p=path[0],v=vector[s.direction],r=HEAD_RADIUS+BODY_RADIUS;
 let earliest=Infinity;
 for(let i=0;i<path.length-1;i++){
  const lo0=Math.max(arc[i],NECK_CLEARANCE),hi0=Math.min(arc[i+1],L);
  const lo1=Math.max(arc[i],NECK_CLEARANCE-limit),hi1=Math.min(arc[i+1],L-Math.max(0,limit-s.growth));
  if(lo0>hi0+EPS)continue;
  const a=onEdge(path,arc,i,lo0),b=onEdge(path,arc,i,hi0),a1=onEdge(path,arc,i,lo1),b1=onEdge(path,arc,i,hi1);
  const av={x:(a1.x-a.x)/limit,y:(a1.y-a.y)/limit},bv={x:(b1.x-b.x)/limit,y:(b1.y-b.y)/limit};
  if(lo0<=hi0+EPS&&pointSegment(p,a,b)<r-EPS)return 0;
  earliest=Math.min(earliest,diskContact(p,v,a,av,r,limit),diskContact(p,v,b,bv,r,limit));
  const horizontal=Math.abs(path[i+1].y-path[i].y)<EPS;
  const perp=horizontal?p.y-a.y:p.x-a.x,speed=horizontal?v.y:v.x;
  if(Math.abs(speed)>EPS)for(const sign of [-1,1]){
   const t=(sign*r-perp)/speed;if(t< -EPS||t>limit+EPS||sign*speed>=0)continue;
   const q=horizontal?p.x+v.x*t:p.y+v.y*t;
   const aa=horizontal?a.x+av.x*t:a.y+av.y*t,bb=horizontal?b.x+bv.x*t:b.y+bv.y*t;
   if(q>=Math.min(aa,bb)-EPS&&q<=Math.max(aa,bb)+EPS)earliest=Math.min(earliest,Math.max(0,t));
  }
 }
 return earliest;
}
function move(s:SnakeState,n:number):void{
 if(n<=0)return;
 // Preserve time/budget at floating-point residuals without inserting an unresolvable corner edge.
 if(n<EPS){s.elapsed+=n*TICK_MS;s.time+=n*TICK_MS;s.growth=Math.max(0,s.growth-n);return;}
 const v=vector[s.direction],old=s.body[0],head={x:old.x+v.x*n,y:old.y+v.y*n};
 const next=s.body[1];
 if((Math.abs(old.x-next.x)<EPS&&Math.abs(v.x)<EPS)||(Math.abs(old.y-next.y)<EPS&&Math.abs(v.y)<EPS))s.body[0]=head;
 else s.body.unshift(head);
 let trim=Math.max(0,n-s.growth);s.growth=Math.max(0,s.growth-n);
 while(trim>EPS&&s.body.length>1){const last=s.body.length-1,a=s.body[last],b=s.body[last-1],len=distance(a,b);
  if(trim>=len-EPS){trim=Math.max(0,trim-len);s.body.pop();}else{s.body[last]=along(a,b,trim/len);trim=0;}
 }
 s.elapsed+=n*TICK_MS;s.time+=n*TICK_MS;
}
export function foodIsFree(s:SnakeState,p:Cell):boolean{
 if(distance(p,s.body[0])<=HEAD_RADIUS+FOOD_RADIUS+EPS)return false;
 // Exact tangent fruit/body boundaries may touch but do not overlap; the head is stricter above.
 return s.body.slice(1).every((b,i)=>pointSegment(p,s.body[i],b)>=BODY_RADIUS+FOOD_RADIUS-EPS);
}
function spawnFood(s:SnakeState):Cell|null{
 const free:Cell[]=[];for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(foodIsFree(s,{x,y}))free.push({x,y});
 s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;
 return free.length?free[s.seed%free.length]:null;
}
export function advance(s:SnakeState,ms:number):void{
 if(s.phase!=='running'||s.migration?.held||!Number.isFinite(ms)||ms<=0)return;
 let remaining=ms/TICK_MS,iterations=0;
 while(remaining>0&&s.phase==='running'){
  if(++iterations>100000)throw new Error('Snake event budget exceeded');
  const arc=arcs(s.body),L=arc.at(-1)!;
  const beforeTicks=s.ticks,beforeScore=s.score,legRemaining=1-s.elapsed/TICK_MS;
  let limit=Math.min(remaining,legRemaining);
  // Keep each clipped edge/endcap linear over this event interval.
  for(const a of arc){for(const boundary of [NECK_CLEARANCE-a,s.growth+L-a])if(boundary>EPS)limit=Math.min(limit,boundary);}
  if(s.growth>EPS)limit=Math.min(limit,s.growth);
  const p=s.body[0],v=vector[s.direction],low=-.5+HEAD_RADIUS,high=SIZE-.5-HEAD_RADIUS;
  const wall=v.x>0?high-p.x:v.x<0?p.x-low:v.y>0?high-p.y:p.y-low;
  const collision=Math.min(wall<=limit+EPS?Math.max(0,wall):Infinity,selfContact(s,limit));
  const eating=s.food?diskContact(p,v,s.food,{x:0,y:0},HEAD_RADIUS+FOOD_RADIUS,limit):Infinity;
  const n=Math.min(limit,collision,eating);move(s,n);remaining=Math.max(0,remaining-n);
  if(collision<=n+EPS){s.phase='lost';s.queue=[];break;}
  if(eating<=n+EPS){
   s.eaten=s.food&&copy(s.food);s.ateAt=s.foodAt=s.time;s.score+=10;s.segments++;s.growth+=1;
   if(s.segments===SIZE*SIZE){s.food=null;s.phase='won';s.queue=[];break;}
   s.food=spawnFood(s);if(!s.food)throw new Error('No fruit position before the earned-length goal');
  }
  if(n===legRemaining||TICK_MS-s.elapsed<=JUNCTION_TIME_EPS){
   s.ticks++;s.elapsed=0;s.body[0]={x:Math.round(s.body[0].x),y:Math.round(s.body[0].y)};s.legStart=copy(s.body[0]);
   s.direction=s.queue.shift()??s.direction;
  }
  if(n===0&&s.ticks===beforeTicks&&s.score===beforeScore&&eating===Infinity&&collision===Infinity)throw new Error('Snake event made no progress');
 }
}
/** Compatibility helper: advance one leg's remaining time, not a hidden discrete movement. */
export function step(s:SnakeState):void{advance(s,TICK_MS-s.elapsed);}

function validDirection(d:unknown):d is Direction{return typeof d==='string'&&Object.hasOwn(vector,d);}
function cell(p:unknown):p is Cell{return !!p&&typeof p==='object'&&Number.isFinite((p as Cell).x)&&Number.isFinite((p as Cell).y);}
function grid(p:unknown):p is Cell{return cell(p)&&Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.y>=0&&p.x<SIZE&&p.y<SIZE;}
function queueValid(s:{queue:Direction[];direction:Direction}):boolean{
 if(!Array.isArray(s.queue)||s.queue.length>2||!s.queue.every(validDirection))return false;
 let previous=s.direction;for(const d of s.queue){if(d===previous||d===opposite[previous])return false;previous=d;}return true;
}
function migrate(v:Record<string,unknown>):SnakeState|null{
 const old=v as unknown as {seed:number;body:Cell[];food:Cell|null;direction:Direction;queue:Direction[];phase:SnakeState['phase'];score:number;elapsed:number;ticks:number};
 if(!Array.isArray(old.body)||old.body.length<3||old.body.length>SIZE*SIZE||!old.body.every(grid)||!validDirection(old.direction)||!queueValid(old)||!['ready','running','lost','won'].includes(old.phase)||!Number.isInteger(old.seed)||old.seed<0||old.seed>0xffffffff||old.score!==(old.body.length-3)*10||!Number.isFinite(old.elapsed)||old.elapsed<0||old.elapsed>=TICK_MS||!Number.isSafeInteger(old.ticks)||old.ticks<0)return null;
 if(new Set(old.body.map(p=>p.x+SIZE*p.y)).size!==old.body.length||old.body.slice(1).some((p,i)=>distance(p,old.body[i])!==1))return null;
 // A live v1 heading cannot point back through its neck. Lost saves may retain the fatal attempted turn.
 const heading=vector[old.direction],head=old.body[0],neck=old.body[1];
 if((old.phase==='ready'||old.phase==='running')&&((head.x-neck.x)*heading.x+(head.y-neck.y)*heading.y)<0)return null;
 if(old.phase==='won'){if(old.body.length!==SIZE*SIZE||old.food!==null)return null;}
 else if(!grid(old.food)||old.body.some(p=>distance(p,old.food!)<EPS))return null;
 const s=createState(old.seed);Object.assign(s,{body:old.body.map(copy),food:old.food&&copy(old.food),direction:old.direction,queue:[...old.queue],phase:old.phase,score:old.score,segments:old.body.length,ticks:old.ticks,legStart:copy(old.body[0]),migration:{elapsed:old.elapsed,held:old.phase==='running'}});
 return s;
}
export function restoreState(value:unknown):SnakeState|null{
 if(!value||typeof value!=='object')return null;
 const raw=value as Record<string,unknown>;
 if(raw.version===1)return migrate(raw);
 if(raw.version!==2)return null;
 const s=raw as unknown as SnakeState;
 if(!Number.isInteger(s.seed)||s.seed<0||s.seed>0xffffffff||!validDirection(s.direction)||!queueValid(s)||!['ready','running','lost','won'].includes(s.phase)||!Number.isInteger(s.segments)||s.segments<3||s.segments>SIZE*SIZE||s.score!==(s.segments-3)*10||!Number.isFinite(s.elapsed)||s.elapsed<0||s.elapsed>=TICK_MS||!Number.isSafeInteger(s.ticks)||s.ticks<0||!Number.isFinite(s.time)||s.time<0||!Number.isFinite(s.growth)||s.growth<0||s.growth>s.segments-3+EPS||!grid(s.legStart))return null;
 if(!Array.isArray(s.body)||s.body.length<2||s.body.length>1024||!s.body.every(cell))return null;
 const low=-.5+HEAD_RADIUS,high=SIZE-.5-HEAD_RADIUS;
 if(s.body.some(p=>p.x<low-EPS||p.y<low-EPS||p.x>high+EPS||p.y>high+EPS)||s.body.slice(1).some((p,i)=>distance(p,s.body[i])<EPS||(Math.abs(p.x-s.body[i].x)>EPS&&Math.abs(p.y-s.body[i].y)>EPS)))return null;
 if(Math.abs(pathLength(s.body)+s.growth-(s.segments-1))>1e-6)return null;
 for(let i=1;i<s.body.length-1;i++){
  const a=s.body[i-1],p=s.body[i],b=s.body[i+1];
  if((p.x-a.x)*(b.x-p.x)+(p.y-a.y)*(b.y-p.y)<-EPS)return null;
  const bend=(Math.abs(a.x-p.x)<EPS)!==(Math.abs(p.x-b.x)<EPS);
  if(bend&&!grid(p))return null;
 }
 // A legitimate trail cannot cross itself behind the head.
 for(let i=0;i<s.body.length-1;i++)for(let j=i+2;j<s.body.length-1;j++){
  const a=s.body[i],b=s.body[i+1],c=s.body[j],d=s.body[j+1];
  const overlap=Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x))<=Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))+EPS&&Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y))<=Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y))+EPS;
  if(overlap)return null;
 }
 const h=s.body[0],v=vector[s.direction];
 const neck=s.body[1],dot=(h.x-neck.x)*v.x+(h.y-neck.y)*v.y;
 if(!(s.migration&&s.phase==='lost')&&(dot< -EPS||(s.elapsed/TICK_MS>EPS&&dot<=EPS)))return null;
 // Lost direction is the contacting leg; unlike v1, its fractional position is retained.
 if(distance(h,{x:s.legStart.x+v.x*s.elapsed/TICK_MS,y:s.legStart.y+v.y*s.elapsed/TICK_MS})>1e-6 && !(s.migration&&s.phase==='lost'))return null;
 if(s.phase==='won'){if(s.food!==null||s.segments!==SIZE*SIZE)return null;}else if(!grid(s.food))return null;
 for(const at of [s.foodAt,s.ateAt])if(at!==null&&(!Number.isFinite(at)||at< -200||at>s.time+EPS))return null;
 if(s.eaten!==null&&!grid(s.eaten))return null;
 if(s.migration!==null&&(!s.migration||typeof s.migration.held!=='boolean'||!Number.isFinite(s.migration.elapsed)||s.migration.elapsed<0||s.migration.elapsed>=TICK_MS))return null;
 if(s.migration?.held&&(s.phase!=='running'||s.elapsed!==0))return null;
 if(s.phase==='running'&&!s.migration?.held){
  if(s.food&&!foodIsFree(s,s.food))return null;
  // Existing tangent contact is valid only when not penetrating; approaching contact ends in advance().
  const a=arcs(s.body);for(let i=0;i<s.body.length-1;i++)if(a[i+1]>=NECK_CLEARANCE){const from=onEdge(s.body,a,i,Math.max(a[i],NECK_CLEARANCE));if(pointSegment(h,from,s.body[i+1])<HEAD_RADIUS+BODY_RADIUS-1e-7)return null;}
 }
 return JSON.parse(JSON.stringify(s)) as SnakeState;
}
