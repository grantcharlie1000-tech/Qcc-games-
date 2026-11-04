/** Eight-ball rules and game state. Pure and deterministic: no DOM, no clocks. */
import {R,L,W,HEAD_X,FOOT_X,POCKETS,POCKET_NAMES,MAX_SPEED,emptyLog,strike,step,type Ball,type ShotLog,type Impact} from './physics';

export type Group='solids'|'stripes';
export type Difficulty='easy'|'medium'|'hard';
export type Mode='ai'|'two';
/** Where ball-in-hand may be placed: behind the head string after a break scratch, otherwise anywhere. */
export type Hand=null|'kitchen'|'table';
export interface Aim{angle:number;power:number;spinX:number;spinY:number}
export interface PoolState{
  version:2;
  mode:Mode;difficulty:Difficulty;
  balls:Ball[];
  turn:0|1;
  groups:[Group|null,Group|null];
  phase:'aim'|'moving'|'over';
  breakShot:boolean;
  hand:Hand;
  /** Pocket called for the 8 (index into POCKETS), when the shooter is on the 8. */
  called:number|null;
  aim:Aim;
  shots:number;rack:number;seed:number;
  /** Who broke this rack. Racks alternate. */
  breaker:0|1;
  winner:0|1|null;
  wins:[number,number];
  /** Ball ids in the order they dropped this rack (cue excluded). */
  potted:number[];
  foul:string|null;
  message:string;
  log:ShotLog|null;
  /** Who shot the shot in `log`, whether they were on the 8 at the time and what was legal. */
  shooter:0|1;onEight:boolean;
}

export const groupOf=(id:number):Group|null=>id>=1&&id<=7?'solids':id>=9&&id<=15?'stripes':null;
export const groupLabel=(g:Group)=>g==='solids'?'Solids':'Stripes';
export const other=(t:0|1)=>(1-t) as 0|1;
export const ballOf=(s:PoolState,id:number)=>s.balls[id];
export const cueBall=(s:PoolState)=>s.balls[0];

/** Small seeded generator (mulberry32). */
export function rng(seed:number){
  let a=seed>>>0;
  return ()=>{a=a+0x6D2B79F5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
}

const newBall=(id:number,x:number,y:number):Ball=>({id,x,y,vx:0,vy:0,sx:0,sy:0,w:0,on:true});

/** Standard rack: 8 in the centre, a solid and a stripe in the back corners, the rest shuffled. */
export function rackBalls(seed:number):Ball[]{
  const random=rng(seed);
  const rest=[2,3,4,5,6,7,10,11,12,13,14,15];
  for(let i=rest.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[rest[i],rest[j]]=[rest[j],rest[i]];}
  const corners=random()<.5?[1,9]:[9,1];
  const order:number[]=[];
  // Row-major slots, apex first. Slot 4 is the centre of row 3; slots 10 and 14 are the back corners.
  for(let slot=0;slot<15;slot++){
    if(slot===4)order.push(8);
    else if(slot===10)order.push(corners[0]);
    else if(slot===14)order.push(corners[1]);
    else order.push(rest.pop()!);
  }
  const balls:Ball[]=Array.from({length:16},(_,id)=>newBall(id,0,0));
  balls[0]=newBall(0,HEAD_X,W/2);
  const gap=.0004,dx=Math.sqrt(3)*(R+gap/2);
  let k=0;
  for(let row=0;row<5;row++)for(let col=0;col<=row;col++){
    const id=order[k++];
    // Tiny seeded jitter: every break is a little different.
    const jx=(random()-.5)*.0002,jy=(random()-.5)*.0002;
    balls[id]=newBall(id,FOOT_X+row*dx+jx,W/2+(col-row/2)*(2*R+gap)+jy);
  }
  return balls;
}

export function createGame(mode:Mode='ai',difficulty:Difficulty='medium',seed=1,rack=1,wins:[number,number]=[0,0],breaker:0|1=0):PoolState{
  return {
    version:2,mode,difficulty,balls:rackBalls(seed),turn:breaker,groups:[null,null],phase:'aim',breakShot:true,hand:'kitchen',called:null,
    aim:{angle:0,power:.85,spinX:0,spinY:0},shots:0,rack,seed:seed>>>0,breaker,winner:null,wins:[...wins] as [number,number],potted:[],foul:null,
    message:'Break',log:null,shooter:breaker,onEight:false
  };
}
/** Next rack keeps players, difficulty and the match score; the break alternates. */
export function nextRack(s:PoolState):PoolState{
  return createGame(s.mode,s.difficulty,(Math.imul(s.seed,1664525)+1013904223)>>>0,s.rack+1,s.wins,other(s.breaker));
}

export const remaining=(s:PoolState,g:Group)=>s.balls.filter(b=>b.on&&groupOf(b.id)===g).length;
/** True when the player's group is cleared and the 8 is their object ball. */
export const isOnEight=(s:PoolState,player:0|1=s.turn)=>{const g=s.groups[player];return !!g&&remaining(s,g)===0;};
/** Balls the current shooter may legally contact first. */
export function legalFirst(s:PoolState,player:0|1=s.turn):number[]{
  if(s.breakShot)return s.balls.filter(b=>b.on&&b.id!==0).map(b=>b.id);
  const g=s.groups[player];
  if(!g)return s.balls.filter(b=>b.on&&b.id!==0&&b.id!==8).map(b=>b.id);
  if(isOnEight(s,player))return [8];
  return s.balls.filter(b=>b.on&&groupOf(b.id)===g).map(b=>b.id);
}

export function validPlacement(s:PoolState,x:number,y:number,hand:Hand=s.hand):boolean{
  if(!Number.isFinite(x)||!Number.isFinite(y))return false;
  if(x<R||x>L-R||y<R||y>W-R)return false;
  if(hand==='kitchen'&&x>HEAD_X)return false;
  if(POCKETS.some(p=>Math.hypot(p.x-x,p.y-y)<p.r+R*1.3))return false;
  return !s.balls.some(b=>b.id!==0&&b.on&&Math.hypot(b.x-x,b.y-y)<2*R+.0005);
}
/** Ball-in-hand: move the cue ball. It may be moved again until the shot. */
export function placeCue(s:PoolState,x:number,y:number):boolean{
  if(s.phase!=='aim'||!s.hand||!validPlacement(s,x,y))return false;
  Object.assign(s.balls[0],{x,y,vx:0,vy:0,sx:0,sy:0,w:0,on:true});
  return true;
}
/** Nearest clear spot to (x, y), searching outward; used for re-spotting and default cue placement. */
export function freeSpot(s:PoolState,x:number,y:number,ignore:number,hand:Hand='table',along=true):{x:number;y:number}{
  const clear=(px:number,py:number)=>validPlacement({...s,balls:s.balls.filter(b=>b.id!==ignore)} as PoolState,px,py,hand);
  if(along){
    // Spot along the long string, behind the spot first (as the rules require), then in front.
    for(let d=0;d<L;d+=.004)for(const sign of [1,-1]){const px=x+sign*d;if(clear(px,y))return {x:px,y};}
  }
  for(let r=.01;r<1.5;r+=.01)for(let a=0;a<Math.PI*2;a+=Math.PI/24){const px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;if(clear(px,py))return {x:px,y:py};}
  return {x,y};
}

export interface ShotInput{angle:number;power:number;spinX:number;spinY:number;called:number|null}
export function validShot(s:PoolState,i:ShotInput):boolean{
  if(s.phase!=='aim'||!s.balls[0].on)return false;
  if(![i.angle,i.power,i.spinX,i.spinY].every(Number.isFinite))return false;
  if(i.power<.02||i.power>1||Math.hypot(i.spinX,i.spinY)>1.0001)return false;
  if(i.called!==null&&(!Number.isInteger(i.called)||i.called<0||i.called>5))return false;
  if(!s.breakShot&&isOnEight(s)&&i.called===null)return false;
  return true;
}
export function shoot(s:PoolState,i:ShotInput):boolean{
  if(!validShot(s,i))return false;
  const angle=Math.atan2(Math.sin(i.angle),Math.cos(i.angle));
  s.aim={angle,power:i.power,spinX:i.spinX,spinY:i.spinY};
  s.called=!s.breakShot&&isOnEight(s)?i.called:null;
  s.shooter=s.turn;s.onEight=!s.breakShot&&isOnEight(s);
  s.log=emptyLog();s.phase='moving';s.hand=null;s.foul=null;s.shots++;
  strike(s.balls[0],angle,i.power,i.spinX,i.spinY);
  s.message='';
  return true;
}

/** Advance the shot by one physics step; resolves the rules when everything stops. */
export function advance(s:PoolState,impacts:Impact[]|null=null):boolean{
  if(s.phase!=='moving'||!s.log)return false;
  const still=step(s.balls,s.log,impacts);
  for(const p of s.log.pots)if(p.id!==0&&!s.potted.includes(p.id))s.potted.push(p.id);
  if(!still||s.log.time>45){
    for(const b of s.balls){b.vx=b.vy=b.sx=b.sy=b.w=0;}
    resolve(s);return true;
  }
  return false;
}

function respot(s:PoolState,id:number){
  const b=s.balls[id],spot=freeSpot(s,FOOT_X,W/2,id,'table');
  Object.assign(b,{x:spot.x,y:spot.y,vx:0,vy:0,sx:0,sy:0,w:0,on:true});
  s.potted=s.potted.filter(p=>p!==id);
}
function giveHand(s:PoolState,hand:'kitchen'|'table'){
  s.hand=hand;
  const c=s.balls[0];
  if(!c.on||!validPlacement(s,c.x,c.y,hand)){
    const spot=freeSpot(s,hand==='kitchen'?HEAD_X:c.on?c.x:HEAD_X,c.on&&hand==='table'?c.y:W/2,0,hand,false);
    Object.assign(c,{x:spot.x,y:spot.y,on:true});
  }
  Object.assign(c,{vx:0,vy:0,sx:0,sy:0,w:0,on:true});
}

/** Judge the finished shot under eight-ball rules. */
export function resolve(s:PoolState){
  const log=s.log!;const player=s.shooter,opp=other(player);
  const pots=log.pots.filter(p=>p.id!==0),eight=pots.find(p=>p.id===8);
  s.phase='aim';s.log=null;
  if(s.breakShot){
    s.breakShot=false;
    const legal=pots.length>0||log.railBalls.length>=4;
    if(eight)respot(s,8);
    if(log.scratch){
      s.turn=opp;s.foul='Scratch on the break';giveHand(s,'kitchen');
      s.message=`${s.foul}. Ball in hand behind the head string.`;return;
    }
    if(!legal){
      // Illegal break: the opponent breaks a fresh rack.
      const fresh=createGame(s.mode,s.difficulty,(s.seed^0x9e3779b9)>>>0,s.rack,s.wins,opp);
      Object.assign(s,fresh,{shots:s.shots});
      s.foul='Illegal break';s.message='Illegal break: four balls must reach a cushion. Opponent re-breaks.';return;
    }
    s.called=null;
    if(pots.some(p=>p.id!==8)){s.message='Ball down on the break. Table is open.';}
    else{s.turn=opp;s.message=eight?'8 re-spotted. Table is open.':'Nothing down. Table is open.';}
    return;
  }
  const group=s.groups[player],first=log.first;
  let foul:string|null=null;
  if(log.scratch)foul='Scratch';
  else if(first===null)foul='No ball hit';
  else if(!group&&first===8)foul='Hit the 8 first';
  else if(group&&s.onEight&&first!==8)foul='Must hit the 8 first';
  else if(group&&!s.onEight&&groupOf(first)!==group)foul=`Hit ${group==='solids'?'a stripe':'a solid'} first`;
  else if(!pots.length&&!log.railAfterContact)foul='No cushion after contact';
  if(eight){
    let reason='';
    if(!s.onEight)reason='8 potted early';
    else if(foul)reason=`${foul} on the 8`;
    else if(eight.pocket!==s.called)reason=`8 in the wrong pocket (called ${POCKET_NAMES[s.called??0]})`;
    s.phase='over';s.foul=reason||null;
    s.winner=reason?opp:player;s.wins[s.winner]++;
    s.message=reason?`${reason}.`:`8 in the ${POCKET_NAMES[eight.pocket]}.`;
    s.hand=null;
    if(!s.balls[0].on){Object.assign(s.balls[0],{on:true,...freeSpot(s,HEAD_X,W/2,0)});}
    return;
  }
  if(!foul&&!group){
    const firstPot=pots.find(p=>groupOf(p.id));
    if(firstPot){const g=groupOf(firstPot.id)!;s.groups[player]=g;s.groups[opp]=g==='solids'?'stripes':'solids';}
  }
  const mine=s.groups[player];
  const ownPot=!foul&&!!mine&&pots.some(p=>groupOf(p.id)===mine);
  s.called=null;
  if(foul){
    s.turn=opp;s.foul=foul;giveHand(s,'table');s.message=`${foul}. Ball in hand.`;
  }else if(ownPot){
    s.foul=null;
    s.message=!group&&mine?`${groupLabel(mine)} for this player.`:'Keep shooting.';
  }else{
    s.foul=null;s.turn=opp;s.message=pots.length?'No own ball down. Turn passes.':'Miss. Turn passes.';
  }
}

/** Estimated cue speed for a given power, for UI copy. */
export const speedFor=(power:number)=>power*MAX_SPEED;

/** Snapshots are untrusted: validate every field before use. */
export function restoreGame(data:unknown):PoolState|null{
  if(!data||typeof data!=='object')return null;
  const s=data as Record<string,unknown>;
  const num=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
  const int=(v:unknown,min:number,max:number)=>num(v,min,max)&&Number.isInteger(v);
  if(s.version!==2)return null;
  if(s.mode!=='ai'&&s.mode!=='two')return null;
  if(!['easy','medium','hard'].includes(s.difficulty as string))return null;
  if(!['aim','moving','over'].includes(s.phase as string))return null;
  if(s.turn!==0&&s.turn!==1||s.breaker!==0&&s.breaker!==1||s.shooter!==0&&s.shooter!==1)return null;
  if(typeof s.breakShot!=='boolean'||typeof s.onEight!=='boolean')return null;
  if(![null,'kitchen','table'].includes(s.hand as string|null))return null;
  if(!(s.called===null||int(s.called,0,5)))return null;
  if(!int(s.shots,0,1e7)||!int(s.rack,1,1e7)||!int(s.seed,0,2**32-1))return null;
  if(![null,0,1].includes(s.winner as number|null))return null;
  if(!Array.isArray(s.wins)||s.wins.length!==2||!s.wins.every(w=>int(w,0,1e7)))return null;
  if(!Array.isArray(s.groups)||s.groups.length!==2||!s.groups.every(g=>g===null||g==='solids'||g==='stripes'))return null;
  const [g0,g1]=s.groups as (Group|null)[];
  if((g0===null)!==(g1===null)||(g0!==null&&g0===g1))return null;
  if(!(s.foul===null||typeof s.foul==='string'&&s.foul.length<120)||typeof s.message!=='string'||s.message.length>300)return null;
  const aim=s.aim as Record<string,unknown>|null;
  if(!aim||!num(aim.angle,-4,4)||!num(aim.power,0,1)||!num(aim.spinX,-1,1)||!num(aim.spinY,-1,1))return null;
  if(!Array.isArray(s.balls)||s.balls.length!==16)return null;
  const balls:Ball[]=[];
  for(let i=0;i<16;i++){
    const b=s.balls[i] as Record<string,unknown>|null;
    if(!b||b.id!==i||typeof b.on!=='boolean')return null;
    if(!num(b.x,-.3,L+.3)||!num(b.y,-.3,W+.3))return null;
    for(const k of ['vx','vy','sx','sy'])if(!num(b[k],-20,20))return null;
    if(!num(b.w,-2000,2000))return null;
    if(s.phase!=='moving'&&(b.vx!==0||b.vy!==0||b.sx!==0||b.sy!==0))return null;
    balls.push({id:i,x:b.x as number,y:b.y as number,vx:b.vx as number,vy:b.vy as number,sx:b.sx as number,sy:b.sy as number,w:b.w as number,on:b.on as boolean});
  }
  if(!balls[0].on&&s.phase!=='moving')return null;
  if(s.phase==='over'&&s.winner===null||s.phase!=='over'&&s.winner!==null)return null;
  if(s.phase!=='moving'&&!balls[8].on&&s.phase!=='over')return null;
  if(!Array.isArray(s.potted)||s.potted.length>15||!s.potted.every(id=>int(id,1,15))||new Set(s.potted).size!==s.potted.length)return null;
  if((s.potted as number[]).some(id=>balls[id].on))return null;
  let log:ShotLog|null=null;
  if(s.phase==='moving'){
    const l=s.log as Record<string,unknown>|null;
    if(!l||!(l.first===null||int(l.first,1,15))||typeof l.railAfterContact!=='boolean'||typeof l.scratch!=='boolean'||!num(l.time,0,60))return null;
    if(!Array.isArray(l.railBalls)||l.railBalls.length>15||!l.railBalls.every(id=>int(id,1,15)))return null;
    if(!Array.isArray(l.pots)||l.pots.length>16)return null;
    for(const p of l.pots as Record<string,unknown>[])if(!p||!int(p.id,0,15)||!int(p.pocket,0,5)||balls[p.id as number].on)return null;
    log={first:l.first as number|null,railAfterContact:l.railAfterContact,railBalls:[...l.railBalls as number[]],pots:(l.pots as {id:number;pocket:number}[]).map(p=>({id:p.id,pocket:p.pocket})),scratch:l.scratch,time:l.time as number};
  }else if(s.log!==null)return null;
  return {
    version:2,mode:s.mode,difficulty:s.difficulty as Difficulty,balls,turn:s.turn as 0|1,groups:[g0,g1],phase:s.phase as PoolState['phase'],
    breakShot:s.breakShot,hand:s.hand as Hand,called:s.called as number|null,aim:{angle:aim.angle as number,power:aim.power as number,spinX:aim.spinX as number,spinY:aim.spinY as number},
    shots:s.shots as number,rack:s.rack as number,seed:s.seed as number,breaker:s.breaker as 0|1,winner:s.winner as 0|1|null,wins:[...s.wins] as [number,number],
    potted:[...s.potted as number[]],foul:s.foul as string|null,message:s.message,log,shooter:s.shooter as 0|1,onEight:s.onEight
  };
}
export const clone=(s:PoolState):PoolState=>restoreGame(JSON.parse(JSON.stringify(s)))??JSON.parse(JSON.stringify(s));
