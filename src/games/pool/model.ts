/** Deterministic, equal-mass 2-D billiards. Units are table pixels and seconds. */
export const R=9.5, DT=1/240, FRICTION=105, MAX_SPEED=900;
export const FIELD={left:40,right:400,top:60,bottom:780};
export const POCKETS=[{x:40,y:60,label:'Top left'},{x:400,y:60,label:'Top right'},{x:40,y:420,label:'Middle left'},{x:400,y:420,label:'Middle right'},{x:40,y:780,label:'Bottom left'},{x:400,y:780,label:'Bottom right'}] as const;
// One geometry definition drives collision, aim preview and the painted table.
// Reference proportions: corner openings are about 2.3 ball diameters;
// the two middle openings are smaller, about 1.8 ball diameters.
export const POCKET_RADIUS=22, MIDDLE_POCKET_RADIUS=17, POCKET_MOUTH=30, MIDDLE_POCKET_MOUTH=26;
export const pocketRadius=(p:{readonly y:number})=>p.y===420?MIDDLE_POCKET_RADIUS:POCKET_RADIUS;
export interface Rail {ax:number;ay:number;bx:number;by:number;nx:number;ny:number}
export const RAILS:readonly Rail[]=[
 ...[FIELD.left,FIELD.right].flatMap(x=>[
  {ax:x,ay:FIELD.top+POCKET_MOUTH,bx:x,by:420-MIDDLE_POCKET_MOUTH,nx:x===FIELD.left?1:-1,ny:0},
  {ax:x,ay:420+MIDDLE_POCKET_MOUTH,bx:x,by:FIELD.bottom-POCKET_MOUTH,nx:x===FIELD.left?1:-1,ny:0}
 ]),
 ...[FIELD.top,FIELD.bottom].map(y=>({ax:FIELD.left+POCKET_MOUTH,ay:y,bx:FIELD.right-POCKET_MOUTH,by:y,nx:0,ny:y===FIELD.top?1:-1}))
];
export type Group='solids'|'stripes';
export interface Ball {id:number;x:number;y:number;vx:number;vy:number;pocketed:boolean}
export interface Shot {first:number|null;pots:{id:number;pocket:number}[];cushions:number[];scratch:boolean;eligible8:boolean;break:boolean}
export type Difficulty='easy'|'medium'|'hard';
export interface PoolState {version:1;difficulty:Difficulty;mode:'ai'|'two';balls:Ball[];turn:0|1;groups:[Group|null,Group|null];phase:'aim'|'moving'|'over';break:boolean;ballInHand:boolean;calledPocket:number;shot:Shot|null;winner:0|1|null;shots:number;message:string;angle:number;power:number;aiWait:number}
export const groupOf=(id:number):Group|null=>id>0&&id<8?'solids':id>8&&id<=15?'stripes':null;
export function createGame(mode:PoolState['mode']='ai',difficulty:Difficulty='medium'):PoolState {
 const balls:Ball[]=Array.from({length:16},(_,id)=>({id,x:220,y:615,vx:0,vy:0,pocketed:false}));
 // Apex faces the cue. Centre eight; opposite groups in the back corners.
 const ids=[1,10,2,3,8,11,12,4,13,5,6,14,7,15,9];let k=0;
 for(let row=0;row<5;row++)for(let col=0;col<=row;col++){const b=balls[ids[k++]];b.x=220+(col-row/2)*(2*R+.03);b.y=270-row*(Math.sqrt(3)*(R+.015));}
 return {version:1,difficulty,mode,balls,turn:0,groups:[null,null],phase:'aim',break:true,ballInHand:false,calledPocket:0,shot:null,winner:null,shots:0,message:'Break the rack · aim, set power, then shoot.',angle:-Math.PI/2,power:.95,aiWait:0};
}
export function legalTargets(s:PoolState):Ball[]{const g=s.groups[s.turn];const own=s.balls.filter(b=>!b.pocketed&&groupOf(b.id)===g&&b.id!==0&&b.id!==8);return g?(own.length?own:s.balls.filter(b=>b.id===8&&!b.pocketed)):s.balls.filter(b=>!b.pocketed&&b.id!==0&&b.id!==8);}
export function shoot(s:PoolState,angle:number,power:number,calledPocket:number):boolean{
 if(s.phase!=='aim'||s.ballInHand||!Number.isFinite(angle)||!Number.isFinite(power)||power<.05||power>1||!Number.isInteger(calledPocket)||calledPocket<0||calledPocket>5)return false;
 const cue=s.balls.find(b=>b.id===0);if(!cue||cue.pocketed)return false;
 s.angle=Math.atan2(Math.sin(angle),Math.cos(angle));s.power=power;s.calledPocket=calledPocket;
 s.shot={first:null,pots:[],cushions:[],scratch:false,eligible8:legalTargets(s).some(b=>b.id===8),break:s.break};
 cue.vx=Math.cos(angle)*MAX_SPEED*power;cue.vy=Math.sin(angle)*MAX_SPEED*power;s.phase='moving';s.shots++;s.aiWait=0;s.message='Balls rolling…';return true;
}
/** Resolve only approaching normal velocities; tangential velocity is unchanged. */
export function collide(a:Ball,b:Ball,restitution=.97):boolean{
 let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d>2*R+.001)return false;
 if(d<1e-9){dx=1;dy=0;d=1;}const nx=dx/d,ny=dy/d;
 const overlap=Math.max(0,2*R-d);a.x-=nx*overlap/2;a.y-=ny*overlap/2;b.x+=nx*overlap/2;b.y+=ny*overlap/2;
 const closing=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;if(closing<=0)return false;
 const impulse=closing*(1+restitution)/2;a.vx-=impulse*nx;a.vy-=impulse*ny;b.vx+=impulse*nx;b.vy+=impulse*ny;return true;
}
export function segmentDistance(px:number,py:number,ax:number,ay:number,bx:number,by:number):number {const dx=bx-ax,dy=by-ay;const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(px-ax-dx*t,py-ay-dy*t);}
function recordRail(s:PoolState,id:number){if(s.shot?.first!==null&&s.shot&&!s.shot.cushions.includes(id))s.shot.cushions.push(id);}
function cushion(s:PoolState,b:Ball){
 for(const rail of RAILS){
  const dx=rail.bx-rail.ax,dy=rail.by-rail.ay;
  const t=((b.x-rail.ax)*dx+(b.y-rail.ay)*dy)/(dx*dx+dy*dy);
  let nx=rail.nx,ny=rail.ny,d:number;
  if(t>=0&&t<=1)d=(b.x-rail.ax)*nx+(b.y-rail.ay)*ny;
  else{
   const x=t<0?rail.ax:rail.bx,y=t<0?rail.ay:rail.by;
   d=Math.hypot(b.x-x,b.y-y);if(d<1e-9)continue;
   nx=(b.x-x)/d;ny=(b.y-y)/d;
  }
  if(d>=R)continue;
  b.x+=nx*(R-d);b.y+=ny*(R-d);
  const normalSpeed=b.vx*nx+b.vy*ny;
  if(normalSpeed<0){b.vx-=1.88*normalSpeed*nx;b.vy-=1.88*normalSpeed*ny;recordRail(s,b.id);}
 }
}
/** A fixed 240 Hz step limits max travel to 3.75 units (< half a radius). */
export function step(s:PoolState):void{
 if(s.phase!=='moving'||!s.shot)return;
 for(const b of s.balls){if(b.pocketed)continue;const oldX=b.x,oldY=b.y;b.x+=b.vx*DT;b.y+=b.vy*DT;
  const p=POCKETS.findIndex(p=>segmentDistance(p.x,p.y,oldX,oldY,b.x,b.y)<=pocketRadius(p));
  if(p!==-1){b.pocketed=true;b.vx=b.vy=0;s.shot.pots.push({id:b.id,pocket:p});if(b.id===0)s.shot.scratch=true;}
 }
 for(let pass=0;pass<4;pass++){
  for(let i=0;i<s.balls.length;i++){const a=s.balls[i];if(a.pocketed)continue;
   for(let j=i+1;j<s.balls.length;j++){const b=s.balls[j];if(b.pocketed)continue;if(collide(a,b)&&s.shot.first===null&&(a.id===0||b.id===0))s.shot.first=a.id===0?b.id:a.id;}
  }
  for(const b of s.balls)if(!b.pocketed)cushion(s,b);
 }
 let moving=false;for(const b of s.balls){if(b.pocketed)continue;const speed=Math.hypot(b.vx,b.vy),next=Math.max(0,speed-FRICTION*DT);if(next<2){b.vx=b.vy=0;}else{b.vx*=next/speed;b.vy*=next/speed;moving=true;}}
 if(!moving)resolveShot(s);
}
export function validCuePosition(s:PoolState,x:number,y:number):boolean{return Number.isFinite(x)&&Number.isFinite(y)&&x>=FIELD.left+R&&x<=FIELD.right-R&&y>=FIELD.top+R&&y<=FIELD.bottom-R&&!POCKETS.some(p=>Math.hypot(p.x-x,p.y-y)<pocketRadius(p)+R)&&!s.balls.some(b=>b.id!==0&&!b.pocketed&&Math.hypot(b.x-x,b.y-y)<2*R+.5);}
export function placeCue(s:PoolState,x:number,y:number):boolean{if(s.phase!=='aim'||!s.ballInHand||!validCuePosition(s,x,y))return false;const cue=s.balls.find(b=>b.id===0)!;Object.assign(cue,{x,y,vx:0,vy:0,pocketed:false});s.ballInHand=false;s.message='Cue placed · aim and shoot.';return true;}
function freeSpot(s:PoolState,ball:Ball,x:number,y:number){ball.pocketed=true;const clear=(xx:number,yy:number)=>validCuePosition(s,xx,yy)&&!s.balls.some(b=>b.id!==ball.id&&!b.pocketed&&Math.hypot(b.x-xx,b.y-yy)<2*R+.5);for(let d=0;d<700;d+=2){for(const sign of [-1,1]){const yy=y+sign*d;if(clear(x,yy)){Object.assign(ball,{x,y:yy,vx:0,vy:0,pocketed:false});return;}}}for(let yy=100;yy<760;yy+=25)for(let xx=65;xx<385;xx+=25)if(clear(xx,yy)){Object.assign(ball,{x:xx,y:yy,vx:0,vy:0,pocketed:false});return;}}
export function resolveShot(s:PoolState):void{
 const shot=s.shot;if(!shot||s.phase!=='moving')return;const player=s.turn,opponent=(1-player) as 0|1,g=s.groups[player];const first=shot.first;
 const correct=first!==null&&(shot.break||(!g?first!==8:shot.eligible8?first===8:groupOf(first)===g));
 let foul=shot.scratch?'Scratch':!correct?'Wrong first ball':shot.pots.length===0&&shot.cushions.length===0?'No cushion after contact':'';
 if(shot.break&&!shot.pots.some(p=>p.id!==0)&&shot.cushions.filter(id=>id!==0).length<4)foul=foul||'Illegal break (four object balls must reach cushions)';
 const eight=shot.pots.find(p=>p.id===8);
 if(eight&&!shot.break){s.winner=!foul&&shot.eligible8&&eight.pocket===s.calledPocket?player:opponent;s.phase='over';s.message=s.winner===player?'The called 8 is down. Rack won!':foul?`${foul} with the 8. Rack lost.`:!shot.eligible8?'Early 8. Rack lost.':'8 in the wrong pocket. Rack lost.';s.shot=null;return;}
 if(eight&&shot.break){const b=s.balls.find(b=>b.id===8);if(b)freeSpot(s,b,220,270);}
 const colored=shot.pots.filter(p=>groupOf(p.id));
 if(!foul&&!shot.break&&!g&&colored.length){const assigned=groupOf(colored[0].id)!;s.groups[player]=assigned;s.groups[opponent]=assigned==='solids'?'stripes':'solids';}
 const ownPot=shot.break?shot.pots.some(p=>p.id!==0):colored.some(p=>groupOf(p.id)===s.groups[player]);
 if(foul||!ownPot)s.turn=opponent;s.ballInHand=!!foul;s.phase='aim';s.break=false;s.shot=null;s.aiWait=0;
 const cue=s.balls.find(b=>b.id===0);if(cue&&(cue.pocketed||foul))freeSpot(s,cue,220,615);
 s.message=foul?`${foul} · opponent has ball-in-hand.`:ownPot?'Good pot · keep shooting.':'Legal miss · turn passes.';
}
/** First intersection with a circle along a unit ray. */
function rayCircle(x:number,y:number,dx:number,dy:number,cx:number,cy:number,r:number):number{
 const ox=x-cx,oy=y-cy,c=ox*ox+oy*oy-r*r;
 if(c<=0)return 0;
 const along=ox*dx+oy*dy,discriminant=along*along-c;
 if(discriminant<0)return Infinity;
 const t=-along-Math.sqrt(discriminant);return t>=0?t:Infinity;
}
/** The same pocket openings, rail faces and rounded jaws used by the simulation. */
export function preview(s:PoolState,angle:number):{x:number;y:number;hit:number|null;pocket:number|null;normal:{x:number;y:number}|null}{
 const cue=s.balls.find(b=>b.id===0)!,dx=Math.cos(angle),dy=Math.sin(angle);
 let distance=2000,hit:number|null=null,pocket:number|null=null,normal:{x:number;y:number}|null=null;
 for(const rail of RAILS){
  const direction=dx*rail.nx+dy*rail.ny;
  if(direction< -1e-8){
   const t=(R-(cue.x-rail.ax)*rail.nx-(cue.y-rail.ay)*rail.ny)/direction;
   const x=cue.x+dx*t,y=cue.y+dy*t;
   const along=(x-rail.ax)*(rail.bx-rail.ax)+(y-rail.ay)*(rail.by-rail.ay);
   const length2=(rail.bx-rail.ax)**2+(rail.by-rail.ay)**2;
   if(t>=0&&t<distance&&along>=0&&along<=length2){distance=t;normal={x:rail.nx,y:rail.ny};}
  }
  for(const [x,y] of [[rail.ax,rail.ay],[rail.bx,rail.by]]){
   const t=rayCircle(cue.x,cue.y,dx,dy,x,y,R);
   if(t<distance){distance=t;normal={x:(cue.x+dx*t-x)/R,y:(cue.y+dy*t-y)/R};}
  }
 }
 for(let i=0;i<POCKETS.length;i++){
  const p=POCKETS[i],t=rayCircle(cue.x,cue.y,dx,dy,p.x,p.y,pocketRadius(p));
  if(t<distance){distance=t;pocket=i;normal=null;}
 }
 for(const b of s.balls){
  if(b.id===0||b.pocketed)continue;
  const t=rayCircle(cue.x,cue.y,dx,dy,b.x,b.y,2*R);
  if(t<distance){distance=t;hit=b.id;pocket=null;normal=null;}
 }
 return {x:cue.x+dx*distance,y:cue.y+dy*distance,hit,pocket,normal};
}
const clearPath=(s:PoolState,ax:number,ay:number,bx:number,by:number,ignore:number[],radius=2*R+.2)=>!s.balls.some(b=>!b.pocketed&&!ignore.includes(b.id)&&segmentDistance(b.x,b.y,ax,ay,bx,by)<radius);
export interface AIShot {angle:number;power:number;target:number;pocket:number;quality:number}
function chooseMediumAI(s:PoolState):AIShot{
 const cue=s.balls.find(b=>b.id===0)!,targets=legalTargets(s);let best:AIShot|null=null;
 if(s.break)return {angle:Math.atan2(270-cue.y,220-cue.x),power:1,target:1,pocket:0,quality:1};
 for(const b of targets)for(let pocket=0;pocket<6;pocket++){const p=POCKETS[pocket],dx=p.x-b.x,dy=p.y-b.y,travel=Math.hypot(dx,dy),nx=dx/travel,ny=dy/travel,gx=b.x-nx*2*R,gy=b.y-ny*2*R;
  if(gx<FIELD.left+R||gx>FIELD.right-R||gy<FIELD.top+R||gy>FIELD.bottom-R)continue;
  const d=Math.hypot(gx-cue.x,gy-cue.y),cut=((gx-cue.x)*nx+(gy-cue.y)*ny)/d;
  if(cut<.28||!clearPath(s,cue.x,cue.y,gx,gy,[0,b.id])||!clearPath(s,b.x,b.y,p.x,p.y,[0,b.id]))continue;
  const angle=Math.atan2(gy-cue.y,gx-cue.x);if(preview(s,angle).hit!==b.id)continue;
  const quality=cut*2.5-d/900-travel/1100;
  const speed=Math.sqrt(2*FRICTION*(d+travel/(cut*cut)))*1.13;
  const candidate={angle,power:Math.min(1,Math.max(.24,speed/MAX_SPEED)),target:b.id,pocket,quality};if(!best||quality>best.quality)best=candidate;
 }
 if(best)return best;
 // A legal first contact is preferred to a speculative pot through another ball.
 for(const b of targets){for(const offset of [0,-.12,.12,-.25,.25]){const angle=Math.atan2(b.y-cue.y,b.x-cue.x)+offset;if(preview(s,angle).hit!==b.id)continue;const d=Math.hypot(b.x-cue.x,b.y-cue.y),quality=-d/1000-2;const candidate={angle,power:Math.min(.8,Math.max(.4,Math.sqrt(2*FRICTION*(d+200))/MAX_SPEED)),target:b.id,pocket:0,quality};if(!best||quality>best.quality)best=candidate;}}
 if(best)return best;
 // Search deterministic one-cushion kicks when every direct legal target is hidden.
 for(let i=0;i<360;i++){const angle=i*Math.PI/180,ray=preview(s,angle);if(ray.hit!==null||!ray.normal)continue;const dot=Math.cos(angle)*ray.normal.x+Math.sin(angle)*ray.normal.y;const reflected=Math.atan2(Math.sin(angle)-2*dot*ray.normal.y,Math.cos(angle)-2*dot*ray.normal.x);const copy={...s,balls:s.balls.map(b=>b.id===0?{...b,x:ray.x+Math.cos(reflected)*.1,y:ray.y+Math.sin(reflected)*.1}:b)};const hit=preview(copy,reflected).hit;if(targets.some(b=>b.id===hit))return {angle,power:.8,target:hit!,pocket:0,quality:-4};}
 const b=targets[0];return {angle:b?Math.atan2(b.y-cue.y,b.x-cue.x):-Math.PI/2,power:.65,target:b?.id??8,pocket:0,quality:-9};
}
/** Medium preserves the original planner; hard verifies aim and power in the real physics. */
export function chooseAI(s:PoolState):AIShot{
 const base=chooseMediumAI(s);
 if(s.difficulty==='easy'){
  const error=(s.shots%2===0?1:-1)*(.18+(s.shots%5)*.045);
  return {...base,angle:Math.atan2(Math.sin(base.angle+error),Math.cos(base.angle+error)),power:Math.max(.12,base.power*.65)};
 }
 if(s.difficulty!=='hard'||s.break)return base;
 const targets=legalTargets(s),player=s.turn;
 const score=(plan:AIShot)=>{
  const copy=JSON.parse(JSON.stringify(s)) as PoolState;
  shoot(copy,plan.angle,plan.power,plan.pocket);
  let ticks=0;while(copy.phase==='moving'&&ticks++<3000)step(copy);
  if(copy.phase==='moving')return -1000;
  if(copy.winner!==null)return copy.winner===player?1000:-1000;
  if(copy.ballInHand)return -100;
  const pots=targets.filter(b=>copy.balls.find(c=>c.id===b.id)?.pocketed).length;
  return pots*20+(copy.turn===player?5:0);
 };
 let best=base,bestScore=score(base);
 for(const offset of [-.012,0,.012])for(const factor of [.8,1,1.2]){
  if(offset===0&&factor===1)continue;
  const angle=base.angle+offset;
  const plan={...base,angle:Math.atan2(Math.sin(angle),Math.cos(angle)),power:Math.max(.05,Math.min(1,base.power*factor))};
  const value=score(plan);if(value>bestScore){best=plan;bestScore=value;}
 }
 return best;
}
export function placeAICue(s:PoolState):void{if(!s.ballInHand)return;const cue=s.balls.find(b=>b.id===0)!;let best={x:cue.x,y:cue.y,quality:-Infinity};for(let y=130;y<=710;y+=116)for(let x=85;x<=355;x+=54){if(!validCuePosition(s,x,y))continue;cue.x=x;cue.y=y;const ai=chooseMediumAI(s);if(ai.quality>best.quality)best={x,y,quality:ai.quality};}placeCue(s,best.x,best.y);}
/** Snapshots are untrusted. Explicit bounds, unique IDs, state coherence and shot validation. */
export function restoreGame(data:unknown):PoolState|null{
 if(!data||typeof data!=='object')return null;const s=data as PoolState;
 if(s.difficulty!==undefined&&!['easy','medium','hard'].includes(s.difficulty))return null;
 if(s.version!==1||!['ai','two'].includes(s.mode)||![0,1].includes(s.turn)||!['aim','moving','over'].includes(s.phase)||!Array.isArray(s.balls)||s.balls.length!==16||!Array.isArray(s.groups)||s.groups.length!==2)return null;
 if(!s.groups.every(g=>g===null||g==='solids'||g==='stripes')||((s.groups[0]===null)!==(s.groups[1]===null))||(s.groups[0]!==null&&s.groups[0]===s.groups[1]))return null;
 const finite=(n:unknown,min:number,max:number)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
 if(!finite(s.shots,0,1000000)||!Number.isInteger(s.shots)||!finite(s.angle,-Math.PI,Math.PI)||!finite(s.power,.05,1)||!finite(s.aiWait,0,10)||!Number.isInteger(s.calledPocket)||!finite(s.calledPocket,0,5)||typeof s.break!=='boolean'||typeof s.ballInHand!=='boolean'||typeof s.message!=='string'||s.message.length>300||![null,0,1].includes(s.winner))return null;
 const ids=new Set<number>();for(const b of s.balls){if(!b||!Number.isInteger(b.id)||b.id<0||b.id>15||ids.has(b.id)||!finite(b.x,FIELD.left-1,FIELD.right+1)||!finite(b.y,FIELD.top-1,FIELD.bottom+1)||!finite(b.vx,-MAX_SPEED,MAX_SPEED)||!finite(b.vy,-MAX_SPEED,MAX_SPEED)||typeof b.pocketed!=='boolean')return null;ids.add(b.id);if((b.pocketed||s.phase!=='moving')&&(b.vx!==0||b.vy!==0))return null;}
 if(s.phase==='over'&&!s.balls.find(b=>b.id===8)!.pocketed)return null;
 if(s.phase!=='moving')for(let i=0;i<s.balls.length;i++)for(let j=i+1;j<s.balls.length;j++){const a=s.balls[i],b=s.balls[j];if(!a.pocketed&&!b.pocketed&&Math.hypot(a.x-b.x,a.y-b.y)<2*R-.1)return null;}
 if((s.phase==='over')!==(s.winner!==null)||s.phase!=='over'&&s.balls.find(b=>b.id===8)!.pocketed&&!(s.phase==='moving'&&s.shot))return null;
 if(s.phase==='moving'){const sh=s.shot;if(s.ballInHand||!sh||![null,...Array.from({length:15},(_,i)=>i+1)].includes(sh.first)||typeof sh.scratch!=='boolean'||typeof sh.eligible8!=='boolean'||typeof sh.break!=='boolean'||!Array.isArray(sh.pots)||sh.pots.length>16||!Array.isArray(sh.cushions)||sh.cushions.length>16)return null;const pots=new Set<number>();for(const p of sh.pots){if(!p||!Number.isInteger(p.id)||p.id<0||p.id>15||pots.has(p.id)||!Number.isInteger(p.pocket)||p.pocket<0||p.pocket>5||!s.balls.find(b=>b.id===p.id)!.pocketed)return null;pots.add(p.id);}if(sh.cushions.some(id=>!Number.isInteger(id)||id<0||id>15)||new Set(sh.cushions).size!==sh.cushions.length||sh.scratch!==pots.has(0))return null;}else if(s.shot!==null||(s.phase!=='over'&&s.balls.find(b=>b.id===0)!.pocketed))return null;
 return {...JSON.parse(JSON.stringify(s)),difficulty:s.difficulty??'medium'} as PoolState;
}
