// Shared mob steering (game.entities.ai). Every helper only sets moveX/moveZ/jump and yaw/headYaw/pitch; the entity
// service turns that intent into motion. Built on contracts and engine/physics only.
//  - wander: vanilla RandomStrollGoal (1/120 per tick by default) toward the best of ten random standable spots within 10
//    blocks horizontally and 7 vertically (animals prefer grass and light, monsters darkness: getWalkTargetValue).
//  - navigate: bounded A* (entity/ai-path.ts, ≤ 200 nodes) cached per entity, re-planned when the goal moves more than
//    2 blocks, the mob is stuck or the path runs out; at most a few searches per tick across all mobs.
//  - moveToward: straight steering that jumps 1-block steps and stops at cliffs (drops > 3), lava, fire and cacti.
//  - flee: vanilla PanicGoal / AvoidEntityGoal: a standable spot 5–12 blocks away from the threat, then navigate there.
//  - lookAt: head turns up to 30°/tick (pitch 40°), the body follows when the head is beyond 75°.
import {SOLID,isWater,AIR,blockId} from '../data/blocks';
import {raycast} from '../engine/physics';
import type {Entity,EntityAI,Game} from '../engine/contracts';
import {DANGER,MAX_PATH,cellTop,findPath,footprint,standableCell,type PathResult} from './ai-path';

/** Head turn speed (vanilla LookControl in melee goals) and pitch speed per tick. */
const LOOK_YAW=30*Math.PI/180,LOOK_PITCH=40*Math.PI/180,MAX_HEAD=75*Math.PI/180;
/** A* searches allowed per game tick across all mobs (the rest steer straight and retry next tick). */
export const SEARCHES_PER_TICK=4;
/** Ticks between re-plans of one mob's path toward the same goal. */
const REPLAN_TICKS=10;
const GRASS=blockId('grass_block');

interface AIState{
  path:Int32Array;len:number;index:number;
  goalX:number;goalY:number;goalZ:number;
  /** Tick of the last search, and whether it found nothing. */
  planned:number;failed:boolean;
  /** Progress watch: ticks without getting closer to the current waypoint. */
  stuck:number;best:number;
  wandering:boolean;wx:number;wy:number;wz:number;wanderTicks:number;
  fleeing:boolean;fx:number;fy:number;fz:number;fleeTicks:number;threatX:number;threatZ:number;
  /** Tick lookAt was last called (the service eases the head toward the body otherwise). */
  lookTick:number;
}
export const wrapAngle=(a:number)=>{a%=Math.PI*2;if(a>Math.PI)a-=Math.PI*2;else if(a<-Math.PI)a+=Math.PI*2;return a;};
/** Rotates `from` toward `to` by at most `max` radians (shortest way). */
export const rotateTowards=(from:number,to:number,max:number)=>{const d=wrapAngle(to-from);return from+Math.max(-max,Math.min(max,d));};
/** Line of sight passes air and non-colliding blocks (plants, water, torches); leaves, glass and every solid block stop it. */
const seeThrough=(id:number)=>id===AIR||!SOLID[id];

export interface EntityAIInternal extends EntityAI{
  /** Was lookAt called for this entity during the current tick? */
  lookedAt(e:Entity):boolean;
  /** Drops cached state (entity removed). */
  forget(e:Entity):void;
  reset():void;
  /** Searches run so far (tests and the debug overlay). */
  readonly searches:number;
}

export function createEntityAI(game:Game):EntityAIInternal{
  const states=new WeakMap<Entity,AIState>();
  const result:PathResult={length:0,complete:false,expanded:0};
  let budgetTick=-1,budget=0,searches=0;
  function state(e:Entity):AIState{
    let s=states.get(e);
    if(!s){
      s={path:new Int32Array(MAX_PATH*3),len:0,index:0,goalX:NaN,goalY:NaN,goalZ:NaN,planned:-1e9,failed:false,stuck:0,best:Infinity,
        wandering:false,wx:0,wy:0,wz:0,wanderTicks:0,fleeing:false,fx:0,fy:0,fz:0,fleeTicks:0,threatX:0,threatZ:0,lookTick:-1};
      states.set(e,s);
    }
    return s;
  }
  const now=()=>game.time.tick;
  const step=(e:Entity)=>{const k=game.entities.kind(e.kind),p=k&&k.physics!=='none'?k.physics?.stepHeight:undefined;return p??.6;};
  /** The cell the mob is about to enter holds lava, fire or a cactus, or is a cliff: no floor (or water) within 4 cells
   *  below, i.e. a drop of more than 3 blocks. Airborne and swimming mobs are not held back. */
  function hazardAhead(e:Entity,dx:number,dz:number):boolean{
    const reach=e.width/2+.35,x=Math.floor(e.x+dx*reach),z=Math.floor(e.z+dz*reach),y=Math.floor(e.y+.01),w=game.world;
    if(x===Math.floor(e.x)&&z===Math.floor(e.z))return false;
    for(let c=0;c<2;c++){const id=w.get(x,y+c,z);if(id>=0&&DANGER[id])return true;}
    if(!e.onGround||e.inWater||e.inLava)return false;
    const front=w.get(x,y,z);if(front<0||SOLID[front])return false;
    for(let k=1;k<=4;k++){
      const id=w.get(x,y-k,z);
      if(id<0)return false;
      if(DANGER[id])return true;
      if(isWater(id)||SOLID[id])return false;
    }
    return true;
  }
  /** A step in front of the feet that needs a jump: taller than the step height, with room above for the body. */
  function wantsJump(e:Entity,dx:number,dz:number):boolean{
    if(!e.onGround&&!e.inWater)return false;
    if(e.collidedH&&e.onGround)return true;
    const reach=e.width/2+.25,x=Math.floor(e.x+dx*reach),z=Math.floor(e.z+dz*reach),y=Math.floor(e.y+.01),w=game.world;
    if(x===Math.floor(e.x)&&z===Math.floor(e.z))return false;
    const id=w.get(x,y,z);if(id<=0||!SOLID[id])return false;
    if(y+cellTop(id)-e.y<=step(e)+1e-3)return false;
    const above=w.get(x,y+1,z),above2=w.get(x,y+2,z);
    return above>=0&&!SOLID[above]&&(e.height<=1||above2>=0&&!SOLID[above2]);
  }
  function steer(e:Entity,x:number,z:number,speed:number):boolean{
    const dx=x-e.x,dz=z-e.z,d=Math.hypot(dx,dz);
    if(d<.5){e.moveX=0;e.moveZ=0;return true;}
    const nx=dx/d,nz=dz/d;
    if(hazardAhead(e,nx,nz)){e.moveX=0;e.moveZ=0;return false;}
    e.moveX=nx*speed;e.moveZ=nz*speed;
    if(wantsJump(e,nx,nz))e.jump=true;
    return false;
  }
  function clearPath(s:AIState){s.len=0;s.index=0;s.stuck=0;s.best=Infinity;}
  /** Plans a path to the goal; returns false when none was found. */
  function plan(e:Entity,s:AIState,x:number,y:number,z:number):boolean{
    const cw=footprint(e.width),half=cw/2;
    const sx=Math.floor(e.x-half+.5),sy=Math.floor(e.y+.01),sz=Math.floor(e.z-half+.5);
    const tx=Math.floor(x-half+.5),ty=Math.floor(y+.01),tz=Math.floor(z-half+.5);
    const k=game.entities.kind(e.kind);
    findPath(game.world,sx,sy,sz,tx,ty,tz,{width:e.width,height:e.height,aquatic:!!k?.aquatic},s.path,result);
    searches++;budget--;
    s.planned=now();s.goalX=x;s.goalY=y;s.goalZ=z;s.index=0;s.stuck=0;s.best=Infinity;
    s.len=result.length;s.failed=result.length===0;
    return !s.failed;
  }
  function canSearch(){
    const t=now();if(t!==budgetTick){budgetTick=t;budget=SEARCHES_PER_TICK;}
    return budget>0;
  }
  /** Follows the cached path, then heads for the current goal (x, z); returns true when it is reached. */
  function follow(e:Entity,s:AIState,x:number,z:number,speed:number):boolean{
    const half=footprint(e.width)/2,maxDist=e.width>.75?e.width/2:.75-e.width/2;
    while(s.index<s.len){
      const i=s.index*3,wx=s.path[i]+half,wy=s.path[i+1],wz=s.path[i+2]+half;
      if(Math.abs(e.x-wx)<maxDist&&Math.abs(e.z-wz)<maxDist&&Math.abs(e.y-wy)<1){s.index++;s.best=Infinity;s.stuck=0;continue;}
      const d=Math.hypot(wx-e.x,wz-e.z);
      if(d<s.best-.05){s.best=d;s.stuck=0;}else if(++s.stuck>30){clearPath(s);s.planned=-1e9;return false;}
      steer(e,wx,wz,speed);
      // Waypoint above: jump when close (or blocked).
      if(wy>e.y+.5&&d<1.6&&(e.onGround||e.inWater))e.jump=true;
      return false;
    }
    return steer(e,x,z,speed);
  }
  function walkValue(e:Entity,x:number,y:number,z:number):number{
    if(e.category==='passive'){
      if(game.world.get(x,y-1,z)===GRASS)return 10;
      return game.world.brightnessAt(x,y,z)/15-.5;
    }
    if(e.category==='hostile')return .5-game.world.brightnessAt(x,y,z)/15;
    if(e.category==='water')return isWater(game.world.get(x,y,z))?1:-1;
    return 0;
  }
  /** A standable feet cell in the column near y (searching ±range), or NaN. */
  function columnSpot(e:Entity,x:number,y:number,z:number,range:number):number{
    const aquatic=!!game.entities.kind(e.kind)?.aquatic;
    for(let i=0;i<=range*2;i++){
      const cy=y+(i&1?-(i+1)/2:i/2);
      if(cy<1||cy>=127)continue;
      if(!standableCell(game.world,x,cy,z,e.width,e.height))continue;
      if(aquatic&&!isWater(game.world.get(x,cy,z)))continue;
      return cy;
    }
    return NaN;
  }
  const ai:EntityAIInternal={
    get searches(){return searches;},
    wander(e,speed,chance=1/120){
      const s=state(e);
      if(s.wandering){
        const arrived=Math.hypot(s.wx-e.x,s.wz-e.z)<.9&&Math.abs(s.wy-e.y)<1.5;
        if(arrived||++s.wanderTicks>400){s.wandering=false;ai.stop(e);return;}
        ai.navigate(e,s.wx,s.wy,s.wz,speed);
        return;
      }
      if(game.random()>=chance)return;
      let best=-Infinity,bx=0,by=0,bz=0;
      const fx=Math.floor(e.x),fy=Math.floor(e.y+.01),fz=Math.floor(e.z);
      for(let i=0;i<10;i++){
        const x=fx+Math.floor(game.random()*21)-10,z=fz+Math.floor(game.random()*21)-10,y=fy+Math.floor(game.random()*15)-7;
        const cy=columnSpot(e,x,y,z,3);if(Number.isNaN(cy))continue;
        const v=walkValue(e,x,cy,z);
        if(v>best){best=v;bx=x;by=cy;bz=z;}
      }
      if(best===-Infinity)return;
      s.wandering=true;s.wx=bx+.5;s.wy=by;s.wz=bz+.5;s.wanderTicks=0;
      ai.navigate(e,s.wx,s.wy,s.wz,speed);
    },
    lookAt(e,x,y,z){
      const dx=x-e.x,dz=z-e.z,dy=y-(e.y+e.height*.85),h=Math.hypot(dx,dz);
      if(h>1e-6)e.headYaw=rotateTowards(e.headYaw,Math.atan2(-dx,-dz),LOOK_YAW);
      e.pitch=rotateTowards(e.pitch,Math.atan2(dy,Math.max(h,1e-6)),LOOK_PITCH);
      const diff=wrapAngle(e.headYaw-e.yaw);
      if(diff>MAX_HEAD)e.yaw=e.headYaw-MAX_HEAD;else if(diff<-MAX_HEAD)e.yaw=e.headYaw+MAX_HEAD;
      state(e).lookTick=now();
    },
    moveToward(e,x,_y,z,speed){return steer(e,x,z,speed);},
    navigate(e,x,y,z,speed){
      const s=state(e);
      // NaN-safe: a cleared goal (NaN) always counts as moved.
      const moved=!(Math.hypot(x-s.goalX,y-s.goalY,z-s.goalZ)<=2);
      const exhausted=s.len>0&&s.index>=s.len&&Math.hypot(x-e.x,z-e.z)>1.5;
      if(s.len===0||moved||exhausted){
        if((moved||now()-s.planned>=REPLAN_TICKS)&&canSearch())plan(e,s,x,y,z);
        else if(moved){steer(e,x,z,speed);return true;}
      }
      if(s.len===0){steer(e,x,z,speed);return !s.failed;}
      if(follow(e,s,x,z,speed)){e.moveX=0;e.moveZ=0;}
      return true;
    },
    flee(e,fromX,fromZ,speed){
      const s=state(e);
      const d=Math.hypot(e.x-fromX,e.z-fromZ),targetD=Math.hypot(s.fx-fromX,s.fz-fromZ);
      const reached=Math.hypot(s.fx-e.x,s.fz-e.z)<1;
      if(!s.fleeing||reached||++s.fleeTicks>100||targetD<d||Math.hypot(fromX-s.threatX,fromZ-s.threatZ)>4){
        s.fleeing=false;s.threatX=fromX;s.threatZ=fromZ;s.fleeTicks=0;
        const away=d>1e-3?Math.atan2(e.x-fromX,e.z-fromZ):game.random()*Math.PI*2;
        let best=-1;
        const fy=Math.floor(e.y+.01);
        for(let i=0;i<10;i++){
          const a=away+(game.random()-.5)*Math.PI*2/3,r=5+game.random()*7;
          const x=Math.floor(e.x+Math.sin(a)*r),z=Math.floor(e.z+Math.cos(a)*r);
          const cy=columnSpot(e,x,fy,z,4);if(Number.isNaN(cy))continue;
          const dd=Math.hypot(x+.5-fromX,z+.5-fromZ);
          if(dd>best){best=dd;s.fx=x+.5;s.fy=cy;s.fz=z+.5;}
        }
        if(best>d)s.fleeing=true;
        else{
          const len=d>1e-3?d:1,ux=d>1e-3?(e.x-fromX)/len:Math.sin(away),uz=d>1e-3?(e.z-fromZ)/len:Math.cos(away);
          steer(e,e.x+ux*8,e.z+uz*8,speed);return;
        }
      }
      ai.navigate(e,s.fx,s.fy,s.fz,speed);
    },
    canSee(e,x,y,z){
      const ox=e.x,oy=e.y+e.height*.85,oz=e.z,dx=x-ox,dy=y-oy,dz=z-oz,d=Math.hypot(dx,dy,dz);
      if(d<1e-6)return true;
      return !raycast(game.world,ox,oy,oz,dx/d,dy/d,dz/d,d,seeThrough);
    },
    isSafe(x,y,z,width=.6,height=1.8){
      const half=footprint(width)/2;
      return standableCell(game.world,Math.floor(x-half+.5),Math.floor(y+.01),Math.floor(z-half+.5),width,height);
    },
    stop(e){
      e.moveX=0;e.moveZ=0;
      const s=states.get(e);if(s){clearPath(s);s.wandering=false;s.fleeing=false;s.failed=false;s.goalX=s.goalY=s.goalZ=NaN;}
    },
    lookedAt(e){return states.get(e)?.lookTick===now();},
    forget(e){states.delete(e);},
    reset(){budgetTick=-1;searches=0;}
  };
  return ai;
}
